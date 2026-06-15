import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NODE_LAYOUT,
  PACKAGE_VERSIONS,
  HOUSE_OF_CARDS,
  PARTICLE_BUDGETS,
  POST_PROCESSING,
  PERFORMANCE_LIMITS,
  SHADER_SETTINGS,
  TRANSITIONS
} from "../src/scene-config.js";

test("scene config records approved package versions", () => {
  assert.deepEqual(PACKAGE_VERSIONS, {
    vite: "8.0.16",
    three: "0.184.0",
    gsap: "3.15.0"
  });
});

test("node layout defines five stable orbit nodes", () => {
  assert.deepEqual(NODE_LAYOUT.map((node) => node.id), ["experience", "projects", "skills", "education", "contact"]);
  assert.ok(NODE_LAYOUT.every((node) => Number.isFinite(node.radius)));
  assert.ok(NODE_LAYOUT.every((node) => Number.isFinite(node.speed)));
});

test("node layout includes deliberate non-overlapping label anchors", () => {
  assert.ok(NODE_LAYOUT.every((node) => Number.isFinite(node.labelX)));
  assert.ok(NODE_LAYOUT.every((node) => Number.isFinite(node.labelY)));
  assert.ok(NODE_LAYOUT.every((node) => node.labelX >= 0.22 && node.labelX <= 0.86));
  assert.ok(NODE_LAYOUT.every((node) => node.labelY >= 0.42 && node.labelY <= 0.92));
  assert.ok(NODE_LAYOUT.every((node) => node.labelX < 0.38 || node.labelX > 0.66 || node.labelY > 0.78));
});

test("contact label anchor leaves the event horizon unobstructed", () => {
  const contact = NODE_LAYOUT.find((node) => node.id === "contact");
  assert.ok(contact.labelY >= 0.84);
});

test("performance limits cover low-end device tuning", () => {
  assert.equal(PERFORMANCE_LIMITS.maxPixelRatio, 2);
  assert.equal(PERFORMANCE_LIMITS.desktopStars, 1200);
  assert.equal(PERFORMANCE_LIMITS.mobileStars, 520);
});

test("post-processing config defines composer passes and responsive bloom", () => {
  assert.deepEqual(POST_PROCESSING.passes, [
    "EffectComposer",
    "RenderPass",
    "UnrealBloomPass",
    "ShaderPass",
    "SelectiveBloomComposite",
    "OutputPass"
  ]);
  assert.ok(POST_PROCESSING.bloom.desktop.strength > POST_PROCESSING.bloom.mobile.strength);
  assert.ok(POST_PROCESSING.bloom.desktop.radius > POST_PROCESSING.bloom.mobile.radius);
  assert.equal(POST_PROCESSING.bloom.reducedMotion.strength, 0);
  assert.ok(POST_PROCESSING.composerScale.mobile < POST_PROCESSING.composerScale.desktop);
});

test("post-processing shader preserves a dark event-horizon mask", () => {
  const source = readFileSync("src/scene.js", "utf8");
  assert.ok(source.includes("uHorizonCenter"));
  assert.ok(source.includes("uHorizonShadow"));
  assert.ok(source.includes("uHorizonRadius"));
  assert.ok(source.includes("horizonShadow"));
  assert.ok(source.includes("computeProjectedHorizonMask({"));
  assert.equal(source.includes("isMobileViewport() ? 0.55 : 0.58"), false);
});

test("post-processing bloom stays restrained for dark scene contrast", () => {
  assert.ok(POST_PROCESSING.bloom.desktop.threshold >= 0.64);
  assert.ok(POST_PROCESSING.bloom.desktop.strength <= 0.34);
  assert.ok(POST_PROCESSING.bloom.mobile.threshold >= 0.66);
  assert.ok(POST_PROCESSING.bloom.mobile.strength <= 0.22);
  const source = readFileSync("src/scene.js", "utf8");
  assert.ok(source.includes("bloom * 0.42"));
});

test("scene uses selective bloom so UI nodes do not feed global glow", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "const DEFAULT_LAYER = 0",
    "const BLOOM_LAYER = 1",
    "const selectiveBloomCompositeShader",
    "const bloomComposer = new EffectComposer(renderer)",
    "bloomComposer.renderToScreen = false",
    "const finalComposer = new EffectComposer(renderer)",
    "bloomTexture: { value: null }",
    "selectiveBloomPass.uniforms.bloomTexture.value = bloomComposer.renderTarget2.texture",
    "relativisticSingularity.layers.enable(BLOOM_LAYER)",
    "accretionDust.layers.enable(BLOOM_LAYER)",
    "camera.layers.set(BLOOM_LAYER)",
    "bloomComposer.render(delta)",
    "camera.layers.set(DEFAULT_LAYER)",
    "finalComposer.render(delta)"
  ]) {
    assert.ok(source.includes(fragment), `Missing selective bloom fragment ${fragment}`);
  }
  assert.equal(source.includes("composer.addPass(bloomPass)"), false);
  assert.equal(source.includes("composer.render(delta)"), false);
  assert.equal(source.includes("bloomTexture: { value: bloomComposer.renderTarget2.texture }"), false);
  assert.equal(source.includes("core.layers.enable(BLOOM_LAYER)"), false);
  assert.equal(source.includes("halo.layers.enable(BLOOM_LAYER)"), false);
});

test("post-processing grain stays cinematic instead of static-heavy", () => {
  assert.ok(POST_PROCESSING.shaderPass.grain <= 0.014);
  assert.ok(POST_PROCESSING.shaderPass.aberration <= 0.0014);
  assert.ok(POST_PROCESSING.shaderPass.lensDistortion <= 0.055);
  const source = readFileSync("src/scene.js", "utf8");
  assert.ok(source.includes("grainMask"));
});

test("shader settings cover singularity, accretion disk, and particles", () => {
  assert.ok(SHADER_SETTINGS.eventHorizon.uniforms.includes("uPhotonRing"));
  assert.ok(SHADER_SETTINGS.eventHorizon.uniforms.includes("uLensing"));
  assert.ok(SHADER_SETTINGS.accretionDisk.uniforms.includes("uDopplerBias"));
  assert.ok(SHADER_SETTINGS.accretionDisk.uniforms.includes("uTurbulence"));
  for (const uniform of ["uPlasmaFlow", "uPlasmaShear", "uPlasmaIntensity"]) {
    assert.ok(SHADER_SETTINGS.accretionDisk.uniforms.includes(uniform));
  }
  for (const uniform of ["uContactBoost", "uHorizonCenter", "uHorizonRadius", "uHorizonDepth", "uHorizonOccluderDepth"]) {
    assert.ok(SHADER_SETTINGS.orbitalParticles.uniforms.includes(uniform));
  }
  assert.ok(SHADER_SETTINGS.orbitalParticles.additive);
});

test("accretion disk shader uses lava-inspired advected plasma noise without lava assets", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "uniform float uPlasmaFlow",
    "uniform float uPlasmaShear",
    "uniform float uPlasmaIntensity",
    "float plasmaNoise(vec2 uv)",
    "vec2 plasmaUvA",
    "vec2 plasmaUvB",
    "float plasmaAdvection",
    "float plasmaCounterflow",
    "float hotPlasma",
    "uPlasmaFlow: { value: reducedMotion ? 0.08 : 0.42 }",
    "uPlasmaShear: { value: reducedMotion ? 0.16 : 0.48 }",
    "uPlasmaIntensity: { value: reducedMotion ? 0.24 : 0.56 }"
  ]) {
    assert.ok(source.includes(fragment), `Missing plasma shader fragment ${fragment}`);
  }
  assert.equal(source.includes("textures/lava"), false);
  assert.equal(source.includes("lavatile"), false);
  assert.equal(source.includes("cloudTexture"), false);
});

test("particle budgets scale down on mobile and reduced motion", () => {
  assert.ok(PARTICLE_BUDGETS.starfield.desktop > PARTICLE_BUDGETS.starfield.mobile);
  assert.ok(PARTICLE_BUDGETS.accretionDust.desktop > PARTICLE_BUDGETS.accretionDust.mobile);
  assert.ok(PARTICLE_BUDGETS.accretionDust.desktop <= 700);
  assert.ok(PARTICLE_BUDGETS.accretionDust.mobile <= 240);
  assert.ok(PARTICLE_BUDGETS.sectionBurst.desktop > PARTICLE_BUDGETS.sectionBurst.mobile);
  assert.ok(PARTICLE_BUDGETS.reducedMotionMultiplier < 1);
});

test("house-of-cards config defines a knockable six-bottom-row physics page", () => {
  assert.equal(HOUSE_OF_CARDS.bottomTriangles, 6);
  assert.equal(HOUSE_OF_CARDS.gravity, -9.8);
  assert.ok(HOUSE_OF_CARDS.sceneY < -4);
  assert.ok(HOUSE_OF_CARDS.cardHeight > HOUSE_OF_CARDS.cardWidth);
  assert.ok(HOUSE_OF_CARDS.cardThickness < HOUSE_OF_CARDS.cardWidth * 0.08);
  assert.ok(HOUSE_OF_CARDS.knockStrength > 0);
  assert.ok(HOUSE_OF_CARDS.knockRadius > HOUSE_OF_CARDS.triangleSpacing);
});

test("house-of-cards cards keep thin real-playing-card proportions", () => {
  assert.ok(HOUSE_OF_CARDS.cardThickness <= HOUSE_OF_CARDS.cardWidth * 0.035);
  assert.ok(HOUSE_OF_CARDS.cardVisualThickness <= HOUSE_OF_CARDS.cardWidth * 0.055);
  assert.ok(HOUSE_OF_CARDS.cardColliderThickness <= HOUSE_OF_CARDS.cardWidth * 0.12);
  assert.ok(HOUSE_OF_CARDS.cardColliderThickness > HOUSE_OF_CARDS.cardVisualThickness);
});

test("house-of-cards config defines a sunny picnic-table daylight page", () => {
  assert.ok(HOUSE_OF_CARDS.sunElevation >= 30);
  assert.ok(HOUSE_OF_CARDS.sunElevation <= 70);
  assert.ok(HOUSE_OF_CARDS.sunAzimuth > 0);
  assert.ok(HOUSE_OF_CARDS.skyTurbidity >= 2);
  assert.ok(HOUSE_OF_CARDS.skyRayleigh >= 1);
  assert.ok(HOUSE_OF_CARDS.cloudCoverage > 0);
  assert.ok(HOUSE_OF_CARDS.cloudCoverage < 1);
  assert.ok(HOUSE_OF_CARDS.cloudDensity > 0);
  assert.ok(HOUSE_OF_CARDS.cloudDensity < 1);
  assert.ok(HOUSE_OF_CARDS.cloudElevation > 0);
  assert.ok(HOUSE_OF_CARDS.cloudElevation < 1);
  assert.equal(HOUSE_OF_CARDS.showSunDisc, true);
  assert.ok(HOUSE_OF_CARDS.picnicTableSlatCount >= 5);
  assert.ok(HOUSE_OF_CARDS.picnicTableDepth > 2);
  assert.ok(HOUSE_OF_CARDS.grassBackdropHeight > 1);
  assert.ok(HOUSE_OF_CARDS.cardVisualThickness > HOUSE_OF_CARDS.cardThickness);
  assert.ok(HOUSE_OF_CARDS.cardColliderThickness > HOUSE_OF_CARDS.cardVisualThickness);
  assert.ok(HOUSE_OF_CARDS.cardCornerRadius > 0);
  assert.ok(HOUSE_OF_CARDS.pageScale < 1);
  assert.ok(HOUSE_OF_CARDS.pageScale > 0.5);
  assert.ok(Math.abs(HOUSE_OF_CARDS.cameraX) > 0.25);
  assert.ok(HOUSE_OF_CARDS.cameraLookAtYOffset > 0);
  assert.ok(Math.abs(HOUSE_OF_CARDS.pageYaw) > 0.04);
});

test("house-of-cards page borrows Three.js sky, hemisphere light, and shadow-map patterns", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "three/addons/objects/Sky.js",
    "webgpu_sky.html",
    "function createSunnyPicnicSky",
    "function createWebGpuInspiredCloudLayer",
    "new Sky()",
    "sky.scale.setScalar",
    "uniforms[\"turbidity\"].value",
    "HOUSE_OF_CARDS.cloudCoverage",
    "HOUSE_OF_CARDS.cloudDensity",
    "HOUSE_OF_CARDS.cloudElevation",
    "house-of-cards-webgpu-cloud-layer",
    "house-of-cards-sun-disc",
    "sun.setFromSphericalCoords",
    "new THREE.HemisphereLight",
    "new THREE.DirectionalLight",
    "sunLight.castShadow = true",
    "sunLight.shadow.mapSize.set(2048, 2048)",
    "renderer.shadowMap.enabled = true",
    "renderer.shadowMap.type = THREE.PCFShadowMap",
    "function createPicnicTable",
    "picnic-table-slat",
    "grass.receiveShadow = true",
    "mesh.castShadow = true",
    "mesh.receiveShadow = true"
  ]) {
    assert.ok(source.includes(fragment), `Missing sunny picnic card-page fragment ${fragment}`);
  }
  assert.equal(source.includes("house-of-cards-warm-backlight"), false);
  assert.equal(source.includes("new THREE.PointLight(0xffbf7a"), false);
});

test("house-of-cards page has stronger 3D card geometry and camera perspective", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "function createFlexiblePlayingCardGeometry",
    "new THREE.BoxGeometry",
    "new THREE.MeshPhysicalMaterial",
    "clearcoat",
    "createCardFaceDetails",
    "createWoodGrainLines",
    "page.scale.setScalar(HOUSE_OF_CARDS.pageScale)",
    "houseOfCardsPage.rotation.y = HOUSE_OF_CARDS.pageYaw",
    "const baseCameraQuaternion = camera.quaternion.clone()",
    "const cardsCameraTarget = new THREE.Vector3()",
    "const cardsCameraOrbitRadius",
    "camera.position.x = lerp(0, cardsCameraX",
    "cardsCameraRig.lookAt(cardsCameraTarget)",
    "camera.quaternion.slerpQuaternions"
  ]) {
    assert.ok(source.includes(fragment), `Missing 3D cards-page fragment ${fragment}`);
  }
});

test("house-of-cards page adapts the Three.js cameras rig as a rotating POV around the stack", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "const cardsCameraRig = new THREE.Group()",
    "const cardsCameraOrbitStart",
    "const cardsCameraOrbitRadius",
    "const cardsCameraOrbitAngle",
    "Math.sin(cardsCameraOrbitAngle)",
    "Math.cos(cardsCameraOrbitAngle)",
    "cardsCameraRig.position.copy(camera.position)",
    "cardsCameraRig.lookAt(cardsCameraTarget)",
    "const cardsCameraForwardCorrection",
    "cardsCameraRig.quaternion.multiply(cardsCameraForwardCorrection)",
    "camera.quaternion.slerpQuaternions(baseCameraQuaternion, cardsCameraRig.quaternion"
  ]) {
    assert.ok(source.includes(fragment), `Missing cards orbit-camera fragment ${fragment}`);
  }
  assert.equal(source.includes("new THREE.OrthographicCamera"), false);
  assert.equal(source.includes("activeCardsCameraMode"), false);
  assert.equal(source.includes("function handleCameraKeyDown"), false);
  assert.equal(source.includes("window.addEventListener(\"keydown\", handleCameraKeyDown)"), false);
  assert.equal(source.includes("setScissorTest"), false);
  assert.equal(source.includes("renderer.setViewport(0, 0, SCREEN_WIDTH / 2"), false);
});

test("house-of-cards camera orbit is manually controlled with A and D instead of auto-rotating", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "const cardsCameraInput = { left: false, right: false }",
    "let cardsCameraManualOrbit = 0",
    "function handleCardsCameraKeyDown",
    "function handleCardsCameraKeyUp",
    "cardsCameraInput.left",
    "cardsCameraInput.right",
    "cardsCameraManualOrbit += cardsCameraInputAxis * cardsCameraOrbitSpeed * delta",
    "const cardsCameraOrbitAngle = cardsCameraOrbitStart + cardsCameraManualOrbit * cardsOrbitBlend",
    "window.addEventListener(\"keydown\", handleCardsCameraKeyDown)",
    "window.addEventListener(\"keyup\", handleCardsCameraKeyUp)"
  ]) {
    assert.ok(source.includes(fragment), `Missing manual cards camera orbit fragment ${fragment}`);
  }

  assert.equal(source.includes("lastElapsed * cardsCameraOrbitSpeed"), false);
});

test("house-of-cards mobile camera rotates from horizontal touch drag on empty space", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "const cardsCameraTouchOrbit = { active: false",
    "const cardsCameraTouchOrbitSpeed",
    "function startCardsCameraTouchOrbit",
    "function updateCardsCameraTouchOrbit",
    "function endCardsCameraTouchOrbit",
    "event.pointerType !== \"touch\"",
    "cardsCameraManualOrbit += pointerDeltaX * cardsCameraTouchOrbitSpeed",
    "startCardsCameraTouchOrbit(event)",
    "updateCardsCameraTouchOrbit(event)",
    "endCardsCameraTouchOrbit(event)"
  ]) {
    assert.ok(source.includes(fragment), `Missing mobile cards touch camera fragment ${fragment}`);
  }
});

test("house-of-cards physics uses Cannon rigid bodies instead of hand-rolled falling", () => {
  const source = readFileSync("src/scene.js", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  assert.ok(pkg.dependencies["cannon-es"]);
  for (const fragment of [
    'import * as CANNON from "cannon-es"',
    "new CANNON.World",
    "new CANNON.Body",
    "new CANNON.Box",
    "new CANNON.ContactMaterial",
    "bodies.physicsWorld",
    "body.cannonBody",
    "physicsWorld.step",
    "mesh.quaternion.copy"
  ]) {
    assert.ok(source.includes(fragment), `Missing Cannon physics fragment ${fragment}`);
  }
});

test("house-of-cards uses Ammo soft-body patches for removed card physics", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "function loadAmmoScript",
    "ammo.wasm.js",
    "document.createElement(\"script\")",
    "window.Ammo",
    "function loadAmmoPhysicsRuntime",
    "btSoftBodyRigidBodyCollisionConfiguration",
    "btSoftRigidDynamicsWorld",
    "btDefaultSoftBodySolver",
    "btSoftBodyHelpers",
    "CreatePatch",
    "set_viterations(10)",
    "set_piterations(10)",
    "setTotalMass",
    "addSoftBody",
    "stepSimulation",
    "get_m_nodes",
    "computeVertexNormals()",
    "ammoSoftBody"
  ]) {
    assert.ok(source.includes(fragment), `Missing Ammo soft-body card fragment ${fragment}`);
  }
});

test("house-of-cards interaction drag-holds a picked card instead of removing it", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "function beginHouseCardDrag",
    "new CANNON.PointToPointConstraint",
    "type: CANNON.Body.KINEMATIC",
    "function updateHouseCardDrag",
    "function endHouseCardDrag",
    "function startHouseCardDragFromPointer",
    "function updateActiveHouseCardDrag",
    "function endActiveHouseCardDrag",
    "hit.object.userData.houseCardBody",
    "canvas.addEventListener(\"pointerdown\", handlePointerDown)",
    "canvas.addEventListener(\"pointerup\", handlePointerUp)"
  ]) {
    assert.ok(source.includes(fragment), `Missing card drag interaction fragment ${fragment}`);
  }
  assert.equal(source.includes("removeHouseCardFromStack(houseOfCardsPage.userData.bodies"), false);
  assert.equal(source.includes("knockHouseOfCardsFromPointer(hoveredHouseCardHit)"), false);
  assert.equal(source.includes("applyHouseOfCardsKnock(houseOfCardsPage.userData.bodies"), false);
});

test("public folder serves the Ammo wasm binary used by the card physics", () => {
  const source = readFileSync("src/scene.js", "utf8");
  const wasm = readFileSync("public/ammo.wasm.wasm");
  const script = readFileSync("public/ammo.wasm.js", "utf8");

  assert.ok(source.includes("ammo.wasm.wasm"));
  assert.ok(wasm.length > 500000);
  assert.ok(script.includes("btSoftBodyHelpers"));
});

test("house-of-cards cards use cloth-inspired segmented paper bend", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "function createFlexiblePlayingCardGeometry",
    "function applyPlayingCardBend",
    "clothInspiredSegments",
    "paperBasePositions",
    "positionAttribute.setUsage(THREE.DynamicDrawUsage)",
    "geometry.computeVertexNormals()",
    "body.paperBend",
    "body.paperTwist",
    "updateHouseCardPaperBend"
  ]) {
    assert.ok(source.includes(fragment), `Missing flexible playing-card fragment ${fragment}`);
  }
});

test("house-of-cards card faces include richer realistic playing-card details", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "card-face-corner-index",
    "card-face-suit-diamond",
    "card-face-center-suit",
    "card-face-paper-grain",
    "card-face-inner-rule"
  ]) {
    assert.ok(source.includes(fragment), `Missing realistic card face fragment ${fragment}`);
  }
});

test("transition config includes Igloo-inspired effects", () => {
  assert.ok(TRANSITIONS.introMs > 0);
  assert.ok(TRANSITIONS.diveMs > 0);
  assert.deepEqual(TRANSITIONS.effects, [
    "chromatic-aberration",
    "tech-displacement",
    "gravitational-warp",
    "frost-dissolve"
  ]);
  assert.ok(TRANSITIONS.scrollMs > 0);
  assert.ok(TRANSITIONS.scrollGestureThreshold >= 40);
  assert.ok(POST_PROCESSING.shaderPass.transitionDisplacement > 0);
  assert.ok(POST_PROCESSING.shaderPass.transitionDisplacement <= 0.02);
  assert.ok(POST_PROCESSING.shaderPass.scrollDisplacement > POST_PROCESSING.shaderPass.transitionDisplacement);
  assert.ok(POST_PROCESSING.shaderPass.scrollThreshold > 0);
  assert.ok(POST_PROCESSING.shaderPass.scrollThreshold < 0.5);
});

test("package json uses Vite, Three.js, and GSAP", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.dependencies.three, "0.184.0");
  assert.equal(pkg.dependencies.gsap, "3.15.0");
  assert.equal(pkg.devDependencies.vite, "8.0.16");
});

test("index contains the Vite app shell", () => {
  const html = readFileSync("index.html", "utf8");
  assert.ok(html.includes("<title>Bayar T. Portfolio</title>"));
  assert.equal(html.includes("<title>Bayar T. | Singularity Portfolio</title>"), false);
  assert.ok(html.includes('<main id="app"'));
  assert.ok(html.includes('id="singularity-stage"'));
  assert.ok(html.includes('id="singularity-canvas"'));
  assert.ok(html.includes('id="orbit-controls"'));
  assert.ok(html.includes('id="section-panels"'));
  assert.ok(html.includes('type="module" src="/src/main.js"'));
  assert.ok(html.includes('rel="icon"'));
});

test("index includes an accessible startup loader before the scene paints", () => {
  const html = readFileSync("index.html", "utf8");
  assert.ok(html.includes('class="app-shell is-loading-scene"'));
  assert.ok(html.includes('aria-busy="true"'));
  assert.ok(html.includes('id="app-loader"'));
  assert.ok(html.includes('class="app-loader"'));
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('class="loader-ring"'));
  assert.ok(html.includes('class="loader-stream"'));
  assert.ok(html.includes('<p class="loader-kicker">Initializing</p>'));
  assert.equal(html.includes("Initializing singularity"), false);
});

test("index includes a mobile opt-in phone tilt control", () => {
  const html = readFileSync("index.html", "utf8");
  assert.ok(html.includes('id="tilt-toggle"'));
  assert.ok(html.includes('class="tilt-toggle"'));
  assert.ok(html.includes('aria-pressed="false"'));
  assert.ok(html.includes('aria-label="Enable phone tilt motion"'));
  assert.ok(html.includes('class="tilt-state"'));
});

test("index includes a compact cards-page control hint", () => {
  const html = readFileSync("index.html", "utf8");
  for (const fragment of [
    "cards-control-hint",
    "cards-keyboard-hint",
    "cards-touch-hint",
    "House of cards controls",
    "<kbd>A</kbd>",
    "<kbd>D</kbd>",
    "Rotate camera",
    "Swipe empty space",
    "Click + drag",
    "Tap + drag",
    "Move cards"
  ]) {
    assert.ok(html.includes(fragment), `Missing cards controls hint fragment ${fragment}`);
  }
});

test("index ships critical loader CSS before body content", () => {
  const html = readFileSync("index.html", "utf8");
  const criticalCssIndex = html.indexOf('id="critical-loader-style"');
  assert.ok(criticalCssIndex > -1);
  assert.ok(criticalCssIndex < html.indexOf("<body>"));
  assert.ok(html.includes(".app-shell.is-loading-scene .app-loader"));
  assert.ok(html.includes(".app-loader[hidden]"));
});

test("CSS contains required visual, fallback, and responsive selectors", () => {
  const css = readFileSync("src/styles.css", "utf8");
  for (const selector of [
    ".app-shell",
    ".app-loader",
    ".tilt-toggle",
    ".singularity-stage",
    "#singularity-canvas",
    ".orbit-node-button",
    ".content-panel",
    ".webgl-fallback",
    "@media (prefers-reduced-motion: reduce)",
    "@media (max-width: 760px)"
  ]) {
    assert.ok(css.includes(selector), `Missing selector ${selector}`);
  }
});

test("phone tilt control is mobile-only and reduced-motion aware", () => {
  const css = readFileSync("src/styles.css", "utf8");
  for (const fragment of [
    ".tilt-toggle",
    ".tilt-toggle[aria-pressed=\"true\"]",
    ".tilt-glyph",
    ".tilt-state",
    "@media (max-width: 760px)",
    "@media (prefers-reduced-motion: reduce)"
  ]) {
    assert.ok(css.includes(fragment), `Missing phone tilt CSS fragment ${fragment}`);
  }
});

test("startup loader fades cleanly without fighting reduced motion", () => {
  const css = readFileSync("src/styles.css", "utf8");
  for (const fragment of [
    ".app-shell.is-scene-ready .app-loader",
    ".app-shell.is-scene-ready #singularity-canvas",
    "transition: opacity 700ms var(--ease), visibility 700ms var(--ease);",
    "@keyframes loader-ring-sweep",
    ".loader-ring::before",
    ".loader-stream",
    ".loader-stream span",
    "@keyframes loader-stream-shift"
  ]) {
    assert.ok(css.includes(fragment), `Missing startup loader CSS fragment ${fragment}`);
  }
});

test("orbit node cards stay visually lighter than the singularity", () => {
  const css = readFileSync("src/styles.css", "utf8");
  assert.ok(css.includes("background: rgba(2, 5, 13, 0.42);"));
  assert.ok(css.includes("backdrop-filter: blur(8px);"));
  assert.ok(css.includes("box-shadow: 0 0 1.3rem rgba(255, 158, 68, 0.07);"));
  assert.ok(css.includes("background: rgba(255, 185, 96, 0.84);"));
});

test("hero title stack keeps the name, headline, and tags separated", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const normalizedCss = css.replaceAll("\r\n", "\n");
  assert.ok(css.includes("font-size: 8.7rem;"));
  assert.ok(css.includes("line-height: 0.95;"));
  assert.ok(normalizedCss.includes(".profile-headline {\n  margin-top: 0.95rem;"));
  assert.ok(css.includes("line-height: 1.18;"));
  assert.ok(css.includes("@media (max-width: 1100px)"));
  assert.ok(css.includes("font-size: 6.7rem;"));
  assert.ok(css.includes("font-size: 3.85rem;"));
});

test("mobile orbit stack is placed below the hero copy with compact spacing", () => {
  const css = readFileSync("src/styles.css", "utf8");
  assert.ok(css.includes("top: calc(62% + (var(--node-index) - 2) * 6.2rem)"));
});

test("contact panel has no large decorative particle field", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const uiSource = readFileSync("src/ui.js", "utf8");
  assert.equal(css.includes(".contact-particle-field"), false);
  assert.equal(uiSource.includes("contact-particle-field"), false);
  assert.ok(css.includes(".contact-layout"));
  assert.ok(css.includes(".contact-links"));
});

test("scene helper computes deterministic reduced-motion node positions", async () => {
  const { computeNodePosition } = await import("../src/scene.js");
  const normal = computeNodePosition(NODE_LAYOUT[0], 10, false);
  const reduced = computeNodePosition(NODE_LAYOUT[0], 10, true);
  assert.notDeepEqual(normal, reduced);
  assert.ok(Number.isFinite(normal.x));
  assert.ok(Number.isFinite(normal.y));
  assert.ok(Number.isFinite(normal.z));
});

test("scene helper builds a complete six-bottom-row house of cards", async () => {
  const { buildHouseOfCardsLayout } = await import("../src/scene.js");
  assert.equal(typeof buildHouseOfCardsLayout, "function");

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  assert.deepEqual(layout.rows.map((row) => row.triangleCount), [6, 5, 4, 3, 2, 1]);
  assert.equal(layout.cards.filter((card) => card.kind === "leaning").length, 42);
  assert.equal(layout.cards.filter((card) => card.kind === "bridge").length, 15);
  assert.equal(layout.cards.length, 57);
  assert.ok(layout.cards.every((card) => Number.isFinite(card.position.x)));
  assert.ok(layout.cards.every((card) => Number.isFinite(card.position.y)));
  assert.ok(layout.cards.every((card) => Number.isFinite(card.rotation.z)));
  assert.ok(layout.rows.at(-1).baseY > layout.rows[0].baseY);
});

test("flexible playing-card geometry has many vertices and bends like paper", async () => {
  const {
    applyPlayingCardBend,
    createFlexiblePlayingCardGeometry
  } = await import("../src/scene.js");

  const geometry = createFlexiblePlayingCardGeometry({
    width: HOUSE_OF_CARDS.cardWidth,
    height: HOUSE_OF_CARDS.cardHeight,
    thickness: HOUSE_OF_CARDS.cardVisualThickness
  });
  const positions = geometry.attributes.position.array;
  const before = Array.from(positions);
  const positionVersion = geometry.attributes.position.version;
  const normalVersion = geometry.attributes.normal.version;

  assert.ok(geometry.attributes.position.count > 180);
  assert.ok(geometry.userData.paperBasePositions instanceof Float32Array);

  applyPlayingCardBend(geometry, 0.08, 0.035);
  const movedVertices = before.filter((value, index) => Math.abs(value - positions[index]) > 0.00001).length;
  assert.ok(movedVertices > 60);
  assert.ok(geometry.attributes.position.version > positionVersion);
  assert.ok(geometry.attributes.normal.version > normalVersion);
});

test("house-of-cards physics removes a picked card and releases supported cards above it", async () => {
  const THREE = await import("three");
  const {
    buildHouseOfCardsLayout,
    createHouseCardPhysicsBodies,
    removeHouseCardFromStack,
    stepHouseOfCardsPhysics
  } = await import("../src/scene.js");

  for (const helper of [buildHouseOfCardsLayout, createHouseCardPhysicsBodies, removeHouseCardFromStack, stepHouseOfCardsPhysics]) {
    assert.equal(typeof helper, "function");
  }

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  const bodies = createHouseCardPhysicsBodies(layout.cards);
  const target = bodies.find((body) => body.kind === "leaning" && body.rowIndex === 0 && body.side === "left") ?? bodies[0];
  const removed = removeHouseCardFromStack(bodies, target, new THREE.Vector3(1, 0.05, 0.16), {
    strength: HOUSE_OF_CARDS.knockStrength
  });

  assert.equal(removed, true);
  assert.equal(target.removing, true);
  assert.equal(target.cannonBody.collisionResponse, false);
  const releasedBodies = bodies.filter((body) => body !== target && body.propagated && !body.manualCollapse && !body.removed);
  assert.ok(releasedBodies.length >= 3);
  assert.ok(releasedBodies.length < bodies.length * 0.5);
  assert.ok(releasedBodies.every((body) => body.rowIndex >= target.rowIndex));
  assert.ok(releasedBodies.every((body) => body.cannonBody.collisionResponse));
  assert.ok(releasedBodies.every((body) => body.awake));

  for (let i = 0; i < 80; i += 1) {
    stepHouseOfCardsPhysics(bodies, 1 / 60);
  }

  assert.ok(target.removalAge > 0.5);
  assert.ok(target.position.distanceTo(target.initialPosition) > 0.45);
  assert.ok(releasedBodies.some((body) => body.position.distanceTo(body.initialPosition) > 0.06));
  assert.ok(releasedBodies.some((body) => (
    Math.abs(body.rotation.x - body.initialRotation.x) > 0.06
    || Math.abs(body.rotation.y - body.initialRotation.y) > 0.06
    || Math.abs(body.rotation.z - body.initialRotation.z) > 0.06
  )));
  assert.ok(bodies.filter((body) => !body.removed).every((body) => body.position.y > HOUSE_OF_CARDS.tableY - 1.1));
});

test("house-of-cards drag uses Cannon constraints and keeps the picked card visible", async () => {
  const THREE = await import("three");
  const CANNON = await import("cannon-es");
  const {
    beginHouseCardDrag,
    buildHouseOfCardsLayout,
    createHouseCardPhysicsBodies,
    endHouseCardDrag,
    stepHouseOfCardsPhysics,
    updateHouseCardDrag
  } = await import("../src/scene.js");

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  const bodies = createHouseCardPhysicsBodies(layout.cards);
  const target = bodies.find((body) => body.kind === "leaning" && body.rowIndex === 0 && body.side === "left") ?? bodies[0];
  const dragStart = target.position.clone();
  const drag = beginHouseCardDrag(bodies, target, dragStart, {
    maxForce: 42
  });

  assert.ok(drag);
  assert.equal(target.removing, false);
  assert.equal(target.removed, false);
  assert.equal(target.cannonBody.collisionResponse, true);
  assert.equal(target.cannonBody.type, CANNON.Body.DYNAMIC);
  assert.equal(drag.anchorBody.type, CANNON.Body.KINEMATIC);
  const dynamicBodies = bodies.filter((body) => body.cannonBody.type === CANNON.Body.DYNAMIC);
  assert.ok(dynamicBodies.includes(target));
  assert.ok(dynamicBodies.length > 3);
  assert.ok(dynamicBodies.length < bodies.length * 0.7);
  assert.ok(dynamicBodies.every((body) => body === target || body.rowIndex >= target.rowIndex));
  assert.ok(bodies.physicsWorld.constraints.includes(drag.constraint));
  assert.ok(drag.constraint.equations.length >= 3);

  updateHouseCardDrag(drag, dragStart.clone().add(new THREE.Vector3(0.36, 0.32, 0.16)), 1 / 30);
  for (let i = 0; i < 18; i += 1) {
    stepHouseOfCardsPhysics(bodies, 1 / 60);
  }

  assert.ok(target.position.distanceTo(dragStart) > 0.04);
  assert.equal(target.removing, false);
  assert.equal(target.removed, false);
  assert.equal(target.cannonBody.collisionResponse, true);

  const yBeforeRelease = target.position.y;
  assert.equal(endHouseCardDrag(drag), true);
  assert.equal(bodies.physicsWorld.constraints.includes(drag.constraint), false);
  assert.equal(target.cannonBody.type, CANNON.Body.DYNAMIC);

  for (let i = 0; i < 45; i += 1) {
    stepHouseOfCardsPhysics(bodies, 1 / 60);
  }

  assert.equal(target.removing, false);
  assert.equal(target.removed, false);
  assert.ok(target.position.y < yBeforeRelease + 0.08);
});

test("house-of-cards rigid bodies use a thicker invisible physics collider than the visible paper", async () => {
  const {
    buildHouseOfCardsLayout,
    createHouseCardPhysicsBodies
  } = await import("../src/scene.js");

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  const bodies = createHouseCardPhysicsBodies(layout.cards);
  const leaningBody = bodies.find((body) => body.kind === "leaning");
  const shape = leaningBody.cannonBody.shapes[0];

  assert.ok(shape.halfExtents.z * 2 > HOUSE_OF_CARDS.cardVisualThickness);
  assert.ok(Math.abs(shape.halfExtents.z * 2 - HOUSE_OF_CARDS.cardColliderThickness) < 0.00001);
});

test("house-of-cards bridge cards start as flat supports for stable rigid-body contact", async () => {
  const THREE = await import("three");
  const {
    buildHouseOfCardsLayout,
  } = await import("../src/scene.js");

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  const bridge = layout.cards.find((card) => card.kind === "bridge");
  const quaternion = new THREE.Quaternion().setFromEuler(bridge.rotation);
  const verticalThicknessAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
  const longCardAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const shortCardAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);

  assert.ok(Math.abs(Math.abs(verticalThicknessAxis.y) - 1) < 0.001);
  assert.ok(Math.abs(Math.abs(longCardAxis.x) - 1) < 0.001);
  assert.ok(Math.abs(Math.abs(shortCardAxis.z) - 1) < 0.001);
  assert.ok(bridge.position.y > layout.rows[bridge.rowIndex].apexY);
});

test("house-of-cards leaning card pairs face inward instead of billboard-facing the camera", async () => {
  const THREE = await import("three");
  const {
    buildHouseOfCardsLayout,
  } = await import("../src/scene.js");

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  const pairs = layout.cards
    .filter((card) => card.kind === "leaning" && card.side === "left")
    .map((left) => ({
      left,
      right: layout.cards.find((card) => (
        card.kind === "leaning"
        && card.side === "right"
        && card.rowIndex === left.rowIndex
        && card.columnIndex === left.columnIndex
      ))
    }));

  assert.equal(pairs.length, 21);
  for (const { left, right } of pairs) {
    assert.ok(right);
    const leftNormal = new THREE.Vector3(0, 0, 1).applyEuler(left.rotation).normalize();
    const rightNormal = new THREE.Vector3(0, 0, 1).applyEuler(right.rotation).normalize();
    const leftToRight = right.position.clone().sub(left.position).normalize();

    assert.ok(leftNormal.dot(leftToRight) > 0.82);
    assert.ok(rightNormal.dot(leftToRight.clone().negate()) > 0.82);
    assert.ok(Math.abs(leftNormal.z) < 0.001);
    assert.ok(Math.abs(rightNormal.z) < 0.001);
  }
});

test("house-of-cards leaning cards rotate the tent 90 degrees across the stack", async () => {
  const THREE = await import("three");
  const {
    buildHouseOfCardsLayout,
  } = await import("../src/scene.js");

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  const localTop = new THREE.Vector3(0, HOUSE_OF_CARDS.cardHeight * 0.5, 0);
  const localBottom = new THREE.Vector3(0, -HOUSE_OF_CARDS.cardHeight * 0.5, 0);
  const localHeightAxis = new THREE.Vector3(0, 1, 0);
  const localWidthAxis = new THREE.Vector3(1, 0, 0);
  const pairs = layout.cards
    .filter((card) => card.kind === "leaning" && card.side === "left")
    .map((left) => ({
      left,
      right: layout.cards.find((card) => (
        card.kind === "leaning"
        && card.side === "right"
        && card.rowIndex === left.rowIndex
        && card.columnIndex === left.columnIndex
      ))
    }));

  for (const { left, right } of pairs) {
    const leftHeightAxis = localHeightAxis.clone().applyEuler(left.rotation);
    const rightHeightAxis = localHeightAxis.clone().applyEuler(right.rotation);
    const leftWidthAxis = localWidthAxis.clone().applyEuler(left.rotation);
    const rightWidthAxis = localWidthAxis.clone().applyEuler(right.rotation);
    const leftTop = left.position.clone().add(localTop.clone().applyEuler(left.rotation));
    const rightTop = right.position.clone().add(localTop.clone().applyEuler(right.rotation));
    const leftBottom = left.position.clone().add(localBottom.clone().applyEuler(left.rotation));
    const rightBottom = right.position.clone().add(localBottom.clone().applyEuler(right.rotation));

    assert.ok(Math.abs(leftHeightAxis.z) < 0.001, `${left.id} height axis z ${leftHeightAxis.z}`);
    assert.ok(Math.abs(rightHeightAxis.z) < 0.001, `${right.id} height axis z ${rightHeightAxis.z}`);
    assert.ok(Math.abs(leftWidthAxis.z) > 0.99, `${left.id} width axis z ${leftWidthAxis.z}`);
    assert.ok(Math.abs(rightWidthAxis.z) > 0.99, `${right.id} width axis z ${rightWidthAxis.z}`);
    assert.ok(Math.abs(leftTop.z - leftBottom.z) < 0.001, `${left.id} top/bottom z shear`);
    assert.ok(Math.abs(rightTop.z - rightBottom.z) < 0.001, `${right.id} top/bottom z shear`);
    assert.ok(Math.abs(left.position.z - right.position.z) < 0.001, `${left.id}/${right.id} pair z mismatch`);
    assert.ok(Math.abs(leftBottom.x - rightBottom.x) > HOUSE_OF_CARDS.cardHeight * 0.3, `${left.id}/${right.id} x base gap`);
  }
});

test("house-of-cards leaning pairs close into stable A-frame triangles", async () => {
  const THREE = await import("three");
  const {
    buildHouseOfCardsLayout,
  } = await import("../src/scene.js");

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  const localTop = new THREE.Vector3(0, HOUSE_OF_CARDS.cardHeight * 0.5, 0);
  const localBottom = new THREE.Vector3(0, -HOUSE_OF_CARDS.cardHeight * 0.5, 0);
  const pairs = layout.cards
    .filter((card) => card.kind === "leaning" && card.side === "left")
    .map((left) => ({
      left,
      right: layout.cards.find((card) => (
        card.kind === "leaning"
        && card.side === "right"
        && card.rowIndex === left.rowIndex
        && card.columnIndex === left.columnIndex
      ))
    }));

  for (const { left, right } of pairs) {
    const leftTop = left.position.clone().add(localTop.clone().applyEuler(left.rotation));
    const rightTop = right.position.clone().add(localTop.clone().applyEuler(right.rotation));
    const leftBottom = left.position.clone().add(localBottom.clone().applyEuler(left.rotation));
    const rightBottom = right.position.clone().add(localBottom.clone().applyEuler(right.rotation));
    const topGap = leftTop.distanceTo(rightTop);
    const baseGap = leftBottom.distanceTo(rightBottom);
    const row = layout.rows[left.rowIndex];

    assert.ok(topGap <= HOUSE_OF_CARDS.cardColliderThickness * 0.9, `${left.id}/${right.id} top gap ${topGap}`);
    assert.ok(Math.abs(leftTop.z) < 0.001, `${left.id} apex z ${leftTop.z}`);
    assert.ok(Math.abs(rightTop.z) < 0.001, `${right.id} apex z ${rightTop.z}`);
    assert.ok(baseGap > topGap + HOUSE_OF_CARDS.cardWidth * 0.65, `${left.id}/${right.id} base gap ${baseGap}`);
    assert.ok(Math.abs(leftBottom.y - HOUSE_OF_CARDS.tableY - row.rowIndex * layout.rowRise) < 0.001);
    assert.ok(Math.abs(rightBottom.y - leftBottom.y) < 0.001);
  }
});

test("house-of-cards neighboring tents leave clearance at the lower card edges", async () => {
  const THREE = await import("three");
  const {
    buildHouseOfCardsLayout,
  } = await import("../src/scene.js");

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  const clearance = HOUSE_OF_CARDS.cardColliderThickness * 0.45;
  const halfWidth = HOUSE_OF_CARDS.cardWidth * 0.5;
  const halfHeight = HOUSE_OF_CARDS.cardHeight * 0.5;
  const halfThickness = HOUSE_OF_CARDS.cardVisualThickness * 0.5;
  const boundsForCard = (card) => {
    const bounds = { minX: Infinity, maxX: -Infinity };
    for (const x of [-halfWidth, halfWidth]) {
      for (const y of [-halfHeight, halfHeight]) {
        for (const z of [-halfThickness, halfThickness]) {
          const point = new THREE.Vector3(x, y, z).applyEuler(card.rotation).add(card.position);
          bounds.minX = Math.min(bounds.minX, point.x);
          bounds.maxX = Math.max(bounds.maxX, point.x);
        }
      }
    }
    return bounds;
  };

  for (const row of layout.rows) {
    for (let columnIndex = 0; columnIndex < row.triangleCount - 1; columnIndex += 1) {
      const leftTentOuter = layout.cards.find((card) => (
        card.kind === "leaning"
        && card.side === "left"
        && card.rowIndex === row.rowIndex
        && card.columnIndex === columnIndex
      ));
      const nextTentOuter = layout.cards.find((card) => (
        card.kind === "leaning"
        && card.side === "right"
        && card.rowIndex === row.rowIndex
        && card.columnIndex === columnIndex + 1
      ));
      const leftBounds = boundsForCard(leftTentOuter);
      const nextBounds = boundsForCard(nextTentOuter);

      assert.ok(
        leftBounds.maxX + clearance <= nextBounds.minX,
        `${leftTentOuter.id}/${nextTentOuter.id} overlap ${leftBounds.maxX - nextBounds.minX}`
      );
    }
  }
});

test("house-of-cards bridge cards sit directly over closed pair apexes", async () => {
  const THREE = await import("three");
  const {
    buildHouseOfCardsLayout,
  } = await import("../src/scene.js");

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  const localTop = new THREE.Vector3(0, HOUSE_OF_CARDS.cardHeight * 0.5, 0);
  const pairApexes = new Map();

  for (const left of layout.cards.filter((card) => card.kind === "leaning" && card.side === "left")) {
    const right = layout.cards.find((card) => (
      card.kind === "leaning"
      && card.side === "right"
      && card.rowIndex === left.rowIndex
      && card.columnIndex === left.columnIndex
    ));
    const leftTop = left.position.clone().add(localTop.clone().applyEuler(left.rotation));
    const rightTop = right.position.clone().add(localTop.clone().applyEuler(right.rotation));
    pairApexes.set(`${left.rowIndex}:${left.columnIndex}`, leftTop.clone().add(rightTop).multiplyScalar(0.5));
  }

  for (const bridge of layout.cards.filter((card) => card.kind === "bridge")) {
    const leftApex = pairApexes.get(`${bridge.rowIndex}:${bridge.columnIndex}`);
    const rightApex = pairApexes.get(`${bridge.rowIndex}:${bridge.columnIndex + 1}`);
    const expectedCenter = leftApex.clone().add(rightApex).multiplyScalar(0.5);

    assert.ok(Math.abs(bridge.position.x - expectedCenter.x) < 0.001, `${bridge.id} bridge x ${bridge.position.x}`);
    assert.ok(Math.abs(bridge.position.z - expectedCenter.z) <= HOUSE_OF_CARDS.cardVisualThickness, `${bridge.id} bridge z ${bridge.position.z} expected ${expectedCenter.z}`);
  }
});

test("house-of-cards removal collapses unsupported cards without explosive drift", async () => {
  const THREE = await import("three");
  const {
    buildHouseOfCardsLayout,
    createHouseCardPhysicsBodies,
    removeHouseCardFromStack,
    stepHouseOfCardsPhysics
  } = await import("../src/scene.js");

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  const bodies = createHouseCardPhysicsBodies(layout.cards);
  const target = bodies.find((body) => body.kind === "leaning" && body.rowIndex === 1 && body.columnIndex === 1) ?? bodies[0];
  removeHouseCardFromStack(bodies, target, new THREE.Vector3(-1, 0.08, 0.18), {
    strength: HOUSE_OF_CARDS.knockStrength
  });
  const releasedBodies = bodies.filter((body) => body !== target && body.propagated && !body.manualCollapse && !body.removed);
  assert.ok(releasedBodies.length > 0);

  for (let i = 0; i < 120; i += 1) {
    stepHouseOfCardsPhysics(bodies, 1 / 60);
  }

  const releasedDrift = releasedBodies.map((body) => body.position.distanceTo(body.initialPosition));
  const releasedHorizontalDrift = releasedBodies.map((body) => (
    Math.hypot(body.position.x - body.initialPosition.x, body.position.z - body.initialPosition.z)
  ));
  assert.ok(target.position.distanceTo(target.initialPosition) > 0.45);
  assert.ok(Math.abs(target.rotation.x - target.initialRotation.x) > 0.2);
  assert.ok(Math.max(...releasedDrift) > 0.18);
  assert.ok(Math.max(...releasedHorizontalDrift) < layout.width);
  assert.ok(releasedBodies.some((body) => Math.abs(body.rotation.z - body.initialRotation.z) > 0.06));
  assert.ok(bodies.filter((body) => !body.removed).every((body) => Number.isFinite(body.position.y)));
  assert.ok(bodies.filter((body) => !body.removed).every((body) => body.position.y > HOUSE_OF_CARDS.tableY - layout.height * 0.62));
});

test("house-of-cards cascade does not leave a static upper island after lower removal", async () => {
  const THREE = await import("three");
  const {
    buildHouseOfCardsLayout,
    createHouseCardPhysicsBodies,
    removeHouseCardFromStack,
    stepHouseOfCardsPhysics
  } = await import("../src/scene.js");

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  const bodies = createHouseCardPhysicsBodies(layout.cards);
  const target = bodies.find((body) => body.kind === "leaning" && body.rowIndex === 1 && body.columnIndex === 1) ?? bodies[0];
  removeHouseCardFromStack(bodies, target, new THREE.Vector3(-1, 0.08, 0.18), {
    strength: HOUSE_OF_CARDS.knockStrength
  });

  for (let i = 0; i < 180; i += 1) {
    stepHouseOfCardsPhysics(bodies, 1 / 60);
  }

  const sourceX = target.initialPosition.x;
  const upperIslandBodies = bodies.filter((body) => (
    !body.removed
    && body.rowIndex >= target.rowIndex + 3
    && Math.abs(body.initialPosition.x - sourceX) <= HOUSE_OF_CARDS.triangleSpacing * 2.2
  ));

  assert.ok(upperIslandBodies.length > 0);
  assert.ok(
    upperIslandBodies.every((body) => body.propagated && body.cannonBody.type !== 2),
    upperIslandBodies.filter((body) => !body.propagated || body.cannonBody.type === 2).map((body) => body.id).join(", ")
  );
  assert.ok(upperIslandBodies.some((body) => body.position.distanceTo(body.initialPosition) > 0.08));
  assert.ok(upperIslandBodies.some((body) => (
    Math.abs(body.rotation.x - body.initialRotation.x) > 0.025
    || Math.abs(body.rotation.z - body.initialRotation.z) > 0.025
  )));
});

test("scene helper projects the horizon mask from camera math", async () => {
  const THREE = await import("three");
  const { computeProjectedHorizonMask } = await import("../src/scene.js");
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(0, 1.1, 11.5);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const baseline = computeProjectedHorizonMask({
    camera,
    center: new THREE.Vector3(0, 0, 0),
    radius: 1.18,
    width: 1280,
    height: 720
  });
  assert.ok(baseline.center.x > 0.45 && baseline.center.x < 0.55);
  assert.ok(baseline.center.y > 0.3 && baseline.center.y < 0.5);
  assert.ok(baseline.radius > 0.04 && baseline.radius < 0.18);
  assert.ok(baseline.occluderDepth < baseline.depth);

  camera.position.y = 0;
  camera.updateMatrixWorld();
  const shifted = computeProjectedHorizonMask({
    camera,
    center: new THREE.Vector3(0, 0, 0),
    radius: 1.18,
    width: 1280,
    height: 720
  });
  assert.notEqual(shifted.center.y, baseline.center.y);
});

test("scene helper hides projected nodes only when they are behind the event horizon", async () => {
  const { computeNodeHorizonOcclusion } = await import("../src/scene.js");
  const horizonMask = {
    center: { x: 0.5, y: 0.5 },
    radius: 0.12,
    aspect: 16 / 9,
    depth: 0.5
  };

  const hidden = computeNodeHorizonOcclusion({
    projectedNode: { x: 0, y: 0, z: 0.58 },
    horizonMask
  });
  assert.ok(hidden.behindHorizon);
  assert.ok(hidden.insideHorizon);
  assert.ok(hidden.occlusion >= 0.98);
  assert.ok(hidden.visibility <= 0.02);

  const foregroundInside = computeNodeHorizonOcclusion({
    projectedNode: { x: 0, y: 0, z: 0.42 },
    horizonMask
  });
  assert.equal(foregroundInside.behindHorizon, false);
  assert.ok(foregroundInside.insideHorizon);
  assert.equal(foregroundInside.occlusion, 0);
  assert.equal(foregroundInside.visibility, 1);

  const foregroundOutside = computeNodeHorizonOcclusion({
    projectedNode: { x: 0.4, y: 0, z: 0.42 },
    horizonMask
  });
  assert.equal(foregroundOutside.behindHorizon, false);
  assert.equal(foregroundOutside.insideHorizon, false);
  assert.equal(foregroundOutside.visibility, 1);

  const offDisk = computeNodeHorizonOcclusion({
    projectedNode: { x: 0.82, y: 0, z: 0.72 },
    horizonMask
  });
  assert.equal(offDisk.insideHorizon, false);
  assert.equal(offDisk.visibility, 1);
});

test("scene helper uses shader UV y-space for off-center horizon occlusion", async () => {
  const { computeNodeHorizonOcclusion } = await import("../src/scene.js");
  const horizonMask = {
    center: { x: 0.5, y: 0.38 },
    radius: 0.1,
    aspect: 16 / 9,
    depth: 0.5
  };

  const hiddenAtShaderCenter = computeNodeHorizonOcclusion({
    projectedNode: { x: 0, y: -0.24, z: 0.58 },
    horizonMask
  });
  assert.ok(hiddenAtShaderCenter.insideHorizon);
  assert.ok(hiddenAtShaderCenter.visibility <= 0.02);

  const mirroredScreenPoint = computeNodeHorizonOcclusion({
    projectedNode: { x: 0, y: 0.24, z: 0.58 },
    horizonMask
  });
  assert.equal(mirroredScreenPoint.insideHorizon, false);
  assert.equal(mirroredScreenPoint.visibility, 1);
});

test("scene helper compares objects against the near horizon surface depth", async () => {
  const { computeNodeHorizonOcclusion } = await import("../src/scene.js");
  const horizonMask = {
    center: { x: 0.5, y: 0.5 },
    radius: 0.12,
    aspect: 16 / 9,
    depth: 0.5,
    occluderDepth: 0.36
  };

  const betweenNearSurfaceAndCenter = computeNodeHorizonOcclusion({
    projectedNode: { x: 0, y: 0, z: 0.42 },
    horizonMask
  });
  assert.ok(betweenNearSurfaceAndCenter.behindHorizon);
  assert.ok(betweenNearSurfaceAndCenter.visibility <= 0.02);

  const inFrontOfNearSurface = computeNodeHorizonOcclusion({
    projectedNode: { x: 0, y: 0, z: 0.32 },
    horizonMask
  });
  assert.equal(inFrontOfNearSurface.behindHorizon, false);
  assert.equal(inFrontOfNearSurface.visibility, 1);
});

test("scene helper occludes shallow disk-plane depth behind the near horizon", async () => {
  const { computeNodeHorizonOcclusion } = await import("../src/scene.js");
  const horizonMask = {
    center: { x: 0.5, y: 0.5 },
    radius: 0.12,
    aspect: 16 / 9,
    depth: 0.984,
    occluderDepth: 0.9812
  };

  const diskPlanePoint = computeNodeHorizonOcclusion({
    projectedNode: { x: 0, y: 0, z: 0.984 },
    horizonMask
  });
  assert.ok(diskPlanePoint.behindHorizon);
  assert.ok(diskPlanePoint.visibility <= 0.05);

  const frontSkimmingPoint = computeNodeHorizonOcclusion({
    projectedNode: { x: 0, y: 0, z: 0.9808 },
    horizonMask
  });
  assert.equal(frontSkimmingPoint.behindHorizon, false);
  assert.equal(frontSkimmingPoint.visibility, 1);
});

test("scene helper derives Schwarzschild black hole metrics", async () => {
  const { computeDopplerBeaming, computeKeplerianBeta, deriveBlackHoleMetrics } = await import("../src/scene.js");
  const metrics = deriveBlackHoleMetrics({ eventHorizonRadius: 0.46, diskOuterRadius: 3.25 });

  assert.equal(metrics.eventHorizonRadius, 0.46);
  assert.equal(metrics.photonSphereRadius, 0.69);
  assert.ok(Math.abs(metrics.shadowRadius - 1.195115) < 0.00001);
  assert.equal(metrics.diskInnerRadius, 1.38);
  assert.equal(metrics.diskOuterRadius, 3.25);

  const innerBeta = computeKeplerianBeta(metrics.diskInnerRadius, metrics.eventHorizonRadius);
  const outerBeta = computeKeplerianBeta(metrics.diskOuterRadius, metrics.eventHorizonRadius);
  assert.ok(innerBeta > outerBeta);
  assert.ok(innerBeta > 0.4 && innerBeta < 0.42);

  const approaching = computeDopplerBeaming({
    radius: metrics.diskInnerRadius,
    eventHorizonRadius: metrics.eventHorizonRadius,
    inclination: Math.PI * 0.42,
    azimuth: 0
  });
  const receding = computeDopplerBeaming({
    radius: metrics.diskInnerRadius,
    eventHorizonRadius: metrics.eventHorizonRadius,
    inclination: Math.PI * 0.42,
    azimuth: Math.PI
  });

  assert.ok(approaching > 1);
  assert.ok(receding < 1);
  assert.ok(approaching > receding);
});

test("scene constructs a larger cinematic reference-scale singularity", () => {
  const source = readFileSync("src/scene.js", "utf8");
  assert.ok(source.includes("eventHorizonRadius: 0.62"));
  assert.ok(source.includes("diskOuterRadius: 3.75"));
  assert.ok(source.includes("metrics.diskOuterRadius * 3.95"));
  assert.ok(source.includes("metrics.diskOuterRadius * 2.05"));
});

test("scene animation loop uses current Three.js timer API", () => {
  const source = readFileSync("src/scene.js", "utf8");
  assert.ok(source.includes("new THREE.Timer()"));
  assert.equal(source.includes("new THREE.Clock()"), false);
});

test("scene render loop self-heals viewport changes that miss resize events", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "let lastCanvasClientWidth = 0",
    "let lastCanvasClientHeight = 0",
    "let resizeObserver = null",
    "let resizePoller = 0",
    "function resizeIfCanvasBoundsChanged()",
    "new ResizeObserver",
    "resizeObserver.observe(canvas)",
    "window.setInterval(resizeIfCanvasBoundsChanged, 250)",
    "window.clearInterval(resizePoller)",
    "resizeObserver.disconnect()",
    "canvas.clientWidth",
    "canvas.clientHeight",
    "resizeIfCanvasBoundsChanged();"
  ]) {
    assert.ok(source.includes(fragment), `Missing resize self-heal fragment ${fragment}`);
  }
});

test("scene module imports post-processing passes and uses custom shader materials", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    'three/addons/postprocessing/EffectComposer.js',
    'three/addons/postprocessing/RenderPass.js',
    'three/addons/postprocessing/UnrealBloomPass.js',
    'three/addons/postprocessing/ShaderPass.js',
    'three/addons/postprocessing/OutputPass.js',
    "new THREE.ShaderMaterial",
    "lensedDisk",
    "photon",
    "doppler",
    "burstParticles"
  ]) {
    assert.ok(source.includes(fragment), `Missing scene fragment ${fragment}`);
  }
});

test("post-processing transition uses shader displacement instead of CSS overlays", () => {
  const source = readFileSync("src/scene.js", "utf8");
  const css = readFileSync("src/styles.css", "utf8");
  for (const fragment of [
    "uSceneTransition",
    "uTransitionCenter",
    "uTransitionSeed",
    "transitionRing",
    "techDisplacement",
    "frostNoise",
    "function pulseSceneTransition",
    "pulseSceneTransition({ origin: target })"
  ]) {
    assert.ok(source.includes(fragment), `Missing shader transition fragment ${fragment}`);
  }
  assert.equal(source.includes("pulseSceneTransition({ origin: horizonWorldCenter })"), false);
  assert.equal(css.includes(".scene-transition-overlay"), false);
});

test("scroll transition uses a dedicated shader uniform and scene API", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "uScrollTransition",
    "uScrollDirection",
    "uScrollDisplacement",
    "uScrollThreshold",
    "scrollTransitionNoise",
    "scrollTransitionMask",
    "scrollWarmStreak",
    "function setScrollTransition",
    "gsap.to(cinematicPass.uniforms.uScrollTransition",
    "const scrollOrbitEase",
    "const scrollParallax",
    "root.classList?.toggle(\"is-scroll-transitioning\"",
    "setScrollTransition,"
  ]) {
    assert.ok(source.includes(fragment), `Missing scroll transition scene fragment ${fragment}`);
  }
  assert.equal(source.includes("uSceneTransition: { value: 1 }"), false);
});

test("scroll transition lands on a separate house-of-cards page", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "const cardsPageProgress",
    "houseOfCardsPage.localToWorld(cardsCameraTarget)",
    "cardsCameraTarget.y + cardsCameraVerticalOffset",
    "const cardsCameraOrbitAngle",
    "camera.position.y = lerp(1.1, cardsCameraY",
    "camera.position.z = lerp(11.5, cardsCameraZ",
    "houseOfCardsPage.visible = cardsPageProgress > 0.02",
    "houseOfCardsPage.traverse",
    "updateHouseOfCardsPhysics(delta)",
    "function startHouseCardDragFromPointer"
  ]) {
    assert.ok(source.includes(fragment), `Missing card-page scroll fragment ${fragment}`);
  }
  assert.equal(source.includes("camera.position.z = 11.5 - scrollParallax"), false);
});

test("cards page hides and pauses the singularity page after the scroll transition", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "const singularityPageObjects =",
    "heroParticleText,",
    "function clearBloomComposerTargets",
    "function updatePageVisibility",
    "const singularityPageRunning = cardsPageProgress < 0.62",
    "singularityPageObjects.forEach",
    "object.visible = singularityPageRunning",
    "root.classList?.toggle(\"is-cards-page\"",
    "root.classList?.remove(\"is-scroll-transitioning\")",
    "if (singularityPageRunning) {",
    "updateSingularityPage(elapsed, delta)",
    "bloomComposer.render(delta)",
    "clearBloomComposerTargets()"
  ]) {
    assert.ok(source.includes(fragment), `Missing singularity page pause fragment ${fragment}`);
  }
});

test("main app maps wheel and touch gestures to reversible scene scroll transition", () => {
  const source = readFileSync("src/main.js", "utf8");
  for (const fragment of [
    "let scrollTransitioned = false",
    "let scrollGestureAccumulator = 0",
    "function isCardsPageTouchEvent(event)",
    "scrollTransitioned && event?.type?.startsWith(\"touch\")",
    "function setScrollTransitionState(nextTransitioned",
    "app.classList.toggle(\"is-scroll-transitioned\", scrollTransitioned)",
    "app.classList.toggle(\"is-cards-page\", scrollTransitioned)",
    "document.documentElement.classList.toggle(\"is-cards-page\", scrollTransitioned)",
    "document.documentElement.classList.remove(\"is-scroll-transitioning\")",
    "if (scrollTransitioned) {",
    "stopDeviceTilt()",
    "sceneController?.setScrollTransition(targetProgress",
    "function handleScrollTransitionWheel(event)",
    "event.deltaY",
    "event.preventDefault()",
    "function handleScrollTransitionTouchStart(event)",
    "function handleScrollTransitionTouchMove(event)",
    "window.addEventListener(\"wheel\", handleScrollTransitionWheel, { passive: false })",
    "window.addEventListener(\"touchstart\", handleScrollTransitionTouchStart, { passive: true })",
    "window.addEventListener(\"touchmove\", handleScrollTransitionTouchMove, { passive: false })",
    "TRANSITIONS.scrollGestureThreshold",
    "motionQuery.matches"
  ]) {
    assert.ok(source.includes(fragment), `Missing scroll transition main.js fragment ${fragment}`);
  }
});

test("CSS has scroll-transition states without adding a full page overlay", () => {
  const css = readFileSync("src/styles.css", "utf8");
  for (const fragment of [
    "overscroll-behavior: none;",
    ".app-shell.is-scroll-transitioned .orbit-node-button",
    ".app-shell.is-scroll-transitioned .hero-copy",
    ".app-shell.is-cards-page .orbit-node-button",
    ".cards-control-hint",
    ".app-shell.is-cards-page .cards-control-hint",
    ".cards-control-hint kbd",
    ".cards-touch-hint",
    ".cards-keyboard-hint",
    ".app-shell.is-cards-page .tilt-toggle",
    "pointer-events: none;",
    ".app-shell.is-scroll-transitioning #singularity-canvas",
    "@media (prefers-reduced-motion: reduce)"
  ]) {
    assert.ok(css.includes(fragment), `Missing scroll transition CSS fragment ${fragment}`);
  }
  assert.equal(css.includes(".scroll-transition-overlay"), false);
});

test("event horizon visibility comes from the shader, not a top-level black overlay", () => {
  const source = readFileSync("src/scene.js", "utf8");
  const css = readFileSync("src/styles.css", "utf8");
  assert.equal(source.includes("const horizonCore"), false);
  assert.equal(source.includes("horizonCore.renderOrder"), false);
  assert.equal(source.includes("horizonCoreVisualRadius"), false);
  assert.equal(css.includes(".singularity-stage::after"), false);
  assert.ok(source.includes("singularity.getWorldPosition(horizonWorldCenter)"));
  assert.ok(source.includes("radius: blackHoleMetrics.shadowRadius"));
});

test("scene uses an invisible depth-only horizon occluder for transparent sprites", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "function createDepthOnlyHorizonOccluder(radius)",
    "colorWrite: false",
    "depthWrite: true",
    "depthTest: true",
    "createDepthOnlyHorizonOccluder(blackHoleMetrics.shadowRadius * 0.92)",
    "horizonDepthOccluder.renderOrder = 4",
    "singularity.add(horizonDepthOccluder)"
  ]) {
    assert.ok(source.includes(fragment), `Missing depth-only occluder fragment ${fragment}`);
  }
});

test("scene applies projected horizon occlusion to orbit nodes and connector dots", () => {
  const source = readFileSync("src/scene.js", "utf8");
  const css = readFileSync("src/styles.css", "utf8");
  for (const fragment of [
    "computeNodeHorizonOcclusion({",
    "projectedHorizonDepth",
    "group.userData.horizonVisibility",
    "button.style.setProperty(\"--connector-opacity\"",
    "burstParticles.userData.horizonVisibility"
  ]) {
    assert.ok(source.includes(fragment), `Missing node occlusion fragment ${fragment}`);
  }
  assert.ok(css.includes("opacity: var(--connector-opacity, 1);"));
});

test("particle shader masks point sprites against the projected event horizon", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "uniform vec2 uHorizonCenter;",
    "uniform float uHorizonDepth;",
    "uniform float uHorizonOccluderDepth;",
    "vec2 particleUv = ndcPosition.xy * 0.5 + 0.5;",
    "ndcPosition.z - uHorizonOccluderDepth",
    "float hardHorizon = (1.0 - smoothstep(0.56, 0.72, normalizedHorizonDistance)) * behindHorizon;",
    "float horizonOcclusion = clamp(max(hardHorizon, softHorizon), 0.0, 1.0);",
    "vAlpha = uFade * (0.58 + twinkle * 0.42) * mix(1.0, 0.72 + wakeWave * 0.52, uWakeStrength) * horizonVisibility;",
    "points.material.uniforms.uHorizonCenter.value.copy(mask.center)",
    "points.material.uniforms.uHorizonOccluderDepth.value = mask.occluderDepth",
    "uHorizonDepth: { value: 0 }",
    "uHorizonOccluderDepth: { value: 0 }",
    "for (const points of [starField, accretionDust, burstParticles, contactParticles])"
  ]) {
    assert.ok(source.includes(fragment), `Missing particle horizon mask fragment ${fragment}`);
  }
});

test("scene avoids CSS horizon masks so the underlying black-hole shader remains visible", () => {
  const source = readFileSync("src/scene.js", "utf8");
  const css = readFileSync("src/styles.css", "utf8");
  assert.equal(source.includes("--horizon-x"), false);
  assert.equal(source.includes("--horizon-shadow-radius"), false);
  assert.equal(source.includes("--horizon-void-radius"), false);
  assert.equal(css.includes("width: calc(var(--horizon-radius"), false);
  assert.equal(css.includes("width: calc(var(--horizon-void-radius"), false);
});

test("singularity shader uses physics-derived lensing and disk math", () => {
  const source = readFileSync("src/scene.js", "utf8");
  assert.ok(source.includes("relativisticBlackHoleFragmentShader"));
  assert.ok(source.includes("createRelativisticSingularity"));
  assert.ok(source.includes("uEventHorizonRadius"));
  assert.ok(source.includes("uPhotonSphereRadius"));
  assert.ok(source.includes("uShadowRadius"));
  assert.ok(source.includes("uDiskInnerRadius"));
  assert.ok(source.includes("uInclination"));
  assert.ok(source.includes("keplerianBeta"));
  assert.ok(source.includes("dopplerFactor"));
  assert.ok(source.includes("lensedDisk"));
  assert.equal(source.includes("createForegroundLightBridge"), false);
  assert.equal(source.includes("createForegroundAccretionBand"), false);
});

test("singularity shader matches the reference-style black hole features", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "equatorialBeam",
    "upperLensingArc",
    "rimChroma",
    "plasmaTail",
    "shadowCutout",
    "metrics.diskOuterRadius * 3.95"
  ]) {
    assert.ok(source.includes(fragment), `Missing reference-style shader fragment ${fragment}`);
  }
});

test("scene tilts the black hole view so the accretion disk reads as a ring", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "const SINGULARITY_VIEW_TILT",
    "const DISK_VIEW_INCLINATION",
    "const DISK_PLANE_TILT",
    "singularity.rotation.set(SINGULARITY_VIEW_TILT.x, SINGULARITY_VIEW_TILT.y, SINGULARITY_VIEW_TILT.z)",
    "relativisticSingularity.rotation.x = DISK_PLANE_TILT",
    "accretionDust.rotation.x = DISK_PLANE_TILT",
    "SINGULARITY_VIEW_TILT.x + pointer.y * 0.018"
  ]) {
    assert.ok(source.includes(fragment), `Missing tilted disk view fragment ${fragment}`);
  }
});

test("singularity shader thickens and tilts the left-to-right accretion beam itself", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "float diskBeamAxis = p.y + p.x * 0.115",
    "float diskBeamThickness = uEventHorizonRadius * 0.46",
    "float equatorialBeam = exp(-pow(diskBeamAxis / diskBeamThickness, 2.0))",
    "float beamCore = exp(-pow(diskBeamAxis / (uEventHorizonRadius * 0.18), 2.0))",
    "float broadDiskGlow = exp(-pow(diskBeamAxis / (uEventHorizonRadius * 0.82), 2.0))",
    "broadDiskGlow * 0.72",
    "max(equatorialBeam * shadowCutout, broadDiskGlow * 0.46)"
  ]) {
    assert.ok(source.includes(fragment), `Missing thick tilted beam fragment ${fragment}`);
  }
});

test("singularity shader renders an absent center with lensed background light and tidal stretching", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "hardVoid",
    "deadCenterMask",
    "voidCutout",
    "lensedStarSmear",
    "duplicatedLightArc",
    "tidalFilaments",
    "approachingBoost",
    "color = mix(color, vec3(0.0), max(hardVoid, deadCenterMask))"
  ]) {
    assert.ok(source.includes(fragment), `Missing spacetime-wound shader fragment ${fragment}`);
  }
});

test("singularity shader and dust make the upper arc feed heavier plasma into the horizon", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "topFeedStream",
    "feedStreamMask",
    "upperFeedColor",
    "denseHorizonDust",
    "topFeedBias",
    "radii[i] = topFeedBias",
    "layers[i] = topFeedBias ? 0.18 + bandProgress * 0.38 + Math.random() * 0.1 : bandCenter * 0.18 + (Math.random() - 0.5) * 0.045",
    "createParticleMaterial({ opacity: 0.26 })"
  ]) {
    assert.ok(source.includes(fragment), `Missing heavier upper-feed fragment ${fragment}`);
  }
});

test("accretion dust stays warm and controlled instead of confetti-like", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "const ember = colorToArray(\"#ffad4a\")",
    "const smoke = colorToArray(\"#6d1f19\")",
    "sizes[i] = 0.16 + Math.random() * 0.42",
    "createParticleMaterial({ opacity: 0.26 })",
    "layers[i] = topFeedBias ? 0.18 + bandProgress * 0.38 + Math.random() * 0.1 : bandCenter * 0.18 + (Math.random() - 0.5) * 0.045"
  ]) {
    assert.ok(source.includes(fragment), `Missing subtle plasma dust fragment ${fragment}`);
  }
});

test("accretion dust uses structured point-field wake animation", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "const ACCRETION_WAKE_BAND_COUNT",
    "attribute float aWakeBand",
    "attribute float aWakePhase",
    "uniform float uWakeStrength",
    "geometry.setAttribute(\"aWakeBand\"",
    "geometry.setAttribute(\"aWakePhase\"",
    "const baseSizes = new Float32Array(count)",
    "const wakeBands = new Float32Array(count)",
    "const wakePhases = new Float32Array(count)",
    "const wakeWeights = new Float32Array(count)",
    "positionAttribute.setUsage(THREE.DynamicDrawUsage)",
    "sizeAttribute.setUsage(THREE.DynamicDrawUsage)",
    "wakeBand = wakeBands[i]",
    "wakeWave",
    "wakeLaneOffset",
    "sizes.array[i]",
    "sizes.needsUpdate = true"
  ]) {
    assert.ok(source.includes(fragment), `Missing structured dust field fragment ${fragment}`);
  }
});

test("particle shader clamps point size to avoid starfield washout", () => {
  const source = readFileSync("src/scene.js", "utf8");
  assert.ok(source.includes("gl_PointSize = clamp("));
  assert.ok(source.includes("sizes[i] = 0.16 + Math.random() * 0.5"));
});

test("scene keeps HTML labels on stable anchors and tracks nodes with connector pings", () => {
  const source = readFileSync("src/scene.js", "utf8");
  assert.ok(source.includes("const x = clamp(anchorX"));
  assert.ok(source.includes("const y = clamp(anchorY"));
  assert.ok(source.includes("activeSectionId ? 0 : 14"));
  assert.ok(source.includes("--connector-x"));
  assert.ok(source.includes("--connector-y"));
});

test("scene exposes a smoothed device tilt hook without replacing pointer raycasting", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "const deviceTilt = {",
    "function setDeviceTilt",
    "function updateDeviceTiltParallax",
    "deviceTilt.active",
    "setDeviceTilt,",
    "raycaster.setFromCamera(pointer, camera)"
  ]) {
    assert.ok(source.includes(fragment), `Missing device tilt scene fragment ${fragment}`);
  }
});

test("portfolio orbit guides stay subdued behind the cinematic singularity", () => {
  const source = readFileSync("src/scene.js", "utf8");
  assert.ok(source.includes("opacity: 0.055"));
  assert.ok(source.includes("opacity: 0.18"));
});

test("scene renders the top-left profile as hover-reactive particle text", () => {
  const source = readFileSync("src/scene.js", "utf8");
  for (const fragment of [
    "const heroParticleVertexShader",
    "uniform float amplitude",
    "attribute vec3 displacement",
    "attribute vec3 customColor",
    "vec3 newPosition = position + amplitude * displacement",
    "const heroParticleFragmentShader",
    "vColor * color",
    "function createHeroParticleText",
    "document.createElement(\"canvas\")",
    "context.getImageData",
    "profile.name",
    "profile.headline",
    "const maxParticles = reducedMotion ? 4200 : 14500",
    "const sampleStep = reducedMotion ? 2 : 1",
    "new THREE.Float32BufferAttribute",
    "geometry.setAttribute(\"displacement\"",
    "geometry.setAttribute(\"customColor\"",
    "displacementAttribute.setUsage(THREE.DynamicDrawUsage)",
    "new THREE.Points(geometry, material)",
    "blending: THREE.AdditiveBlending",
    "depthTest: false",
    "function updateHeroParticleTextLayout",
    "root.querySelector?.(\".hero-copy\")",
    "Math.min(heroRect.width * 0.98, width * 0.94)",
    "function updateHeroParticleText",
    "function updateHeroParticleDiffusionFromPointer",
    "heroParticleText.userData.targetPointerX",
    "heroParticleText.userData.targetPointerY",
    "heroParticleText.userData.pointerStrength",
    "const heroDiffusionEnvelope = heroParticleText.userData.pointerStrength",
    "const diffusionAmplitude = reducedMotion ? 0.02 : 0.14",
    "const localRippleDistance",
    "const rippleFalloff",
    "const waterRipple",
    "heroParticleText.material.uniforms.amplitude.value = heroDiffusionEnvelope * diffusionAmplitude",
    "attributes.displacement.needsUpdate = true",
    "camera.add(heroParticleText)",
    "canvas.addEventListener(\"pointerleave\", handlePointerLeave)"
  ]) {
    assert.ok(source.includes(fragment), `Missing particle hero text fragment ${fragment}`);
  }
  assert.equal(source.includes("FontLoader"), false);
  assert.equal(source.includes("TextGeometry"), false);
  assert.equal(source.includes("function pulseHeroParticleDiffusion"), false);
});

test("CSS hides the DOM hero copy when WebGL particle text is ready", () => {
  const css = readFileSync("src/styles.css", "utf8");
  assert.ok(css.includes(".app-shell.is-scene-ready .hero-copy"));
  assert.ok(css.includes("opacity: 0;"));
  assert.ok(css.includes(".app-shell.webgl-fallback .hero-copy"));
});

test("main app imports styles, content, state, and UI modules", () => {
  const source = readFileSync("src/main.js", "utf8");
  for (const fragment of [
    'import "./styles.css"',
    'from "./content.js"',
    'from "./state.js"',
    'from "./ui.js"'
  ]) {
    assert.ok(source.includes(fragment), `Missing import fragment ${fragment}`);
  }
});

test("main app lazy-loads the heavy Three.js scene module", () => {
  const source = readFileSync("src/main.js", "utf8");
  assert.ok(source.includes('import("./scene.js")'));
  assert.ok(source.includes("profile: PROFILE"));
  assert.ok(source.includes("root: document.documentElement"));
  assert.equal(source.includes('from "./scene.js"'), false);
});

test("main app wires phone tilt behind a mobile permission toggle", () => {
  const source = readFileSync("src/main.js", "utf8");
  for (const fragment of [
    'import { createDeviceTiltController } from "./motion.js"',
    'const tiltToggle = document.getElementById("tilt-toggle")',
    "function syncTiltToggle()",
    "async function toggleDeviceTilt()",
    "function bindTiltControl()",
    'tiltToggle.addEventListener("click", toggleDeviceTilt)',
    "sceneController?.setDeviceTilt"
  ]) {
    assert.ok(source.includes(fragment), `Missing phone tilt main.js fragment ${fragment}`);
  }
});

test("main app keeps the startup loader until scene startup or fallback completes", () => {
  const source = readFileSync("src/main.js", "utf8");
  for (const fragment of [
    'const appLoader = document.getElementById("app-loader")',
    "const LOADER_EXIT_MS",
    "function finishStartupLoader()",
    'app.classList.remove("is-loading-scene")',
    'app.classList.add("is-scene-ready")',
    'app.setAttribute("aria-busy", "false")',
    "window.requestAnimationFrame(() => finishStartupLoader())",
    "window.setTimeout(() => finishStartupLoader(), 180)",
    "finishStartupLoader();"
  ]) {
    assert.ok(source.includes(fragment), `Missing startup loader main.js fragment ${fragment}`);
  }
});
