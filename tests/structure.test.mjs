import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NODE_LAYOUT,
  PACKAGE_VERSIONS,
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
  assert.ok(POST_PROCESSING.bloom.desktop.threshold >= 0.38);
  assert.ok(POST_PROCESSING.bloom.desktop.strength <= 0.62);
  assert.ok(POST_PROCESSING.bloom.mobile.threshold >= 0.42);
  assert.ok(POST_PROCESSING.bloom.mobile.strength <= 0.38);
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
  assert.ok(SHADER_SETTINGS.orbitalParticles.uniforms.includes("uContactBoost"));
  assert.ok(SHADER_SETTINGS.orbitalParticles.additive);
});

test("particle budgets scale down on mobile and reduced motion", () => {
  assert.ok(PARTICLE_BUDGETS.starfield.desktop > PARTICLE_BUDGETS.starfield.mobile);
  assert.ok(PARTICLE_BUDGETS.accretionDust.desktop > PARTICLE_BUDGETS.accretionDust.mobile);
  assert.ok(PARTICLE_BUDGETS.accretionDust.desktop <= 760);
  assert.ok(PARTICLE_BUDGETS.accretionDust.mobile <= 280);
  assert.ok(PARTICLE_BUDGETS.sectionBurst.desktop > PARTICLE_BUDGETS.sectionBurst.mobile);
  assert.ok(PARTICLE_BUDGETS.reducedMotionMultiplier < 1);
});

test("transition config includes Igloo-inspired effects", () => {
  assert.ok(TRANSITIONS.introMs > 0);
  assert.ok(TRANSITIONS.diveMs > 0);
  assert.deepEqual(TRANSITIONS.effects, ["chromatic-aberration", "tech-displacement", "gravitational-warp"]);
});

test("package json uses Vite, Three.js, and GSAP", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.dependencies.three, "0.184.0");
  assert.equal(pkg.dependencies.gsap, "3.15.0");
  assert.equal(pkg.devDependencies.vite, "8.0.16");
});

test("index contains the Vite app shell", () => {
  const html = readFileSync("index.html", "utf8");
  assert.ok(html.includes('<main id="app"'));
  assert.ok(html.includes('id="singularity-stage"'));
  assert.ok(html.includes('id="singularity-canvas"'));
  assert.ok(html.includes('id="orbit-controls"'));
  assert.ok(html.includes('id="section-panels"'));
  assert.ok(html.includes('type="module" src="/src/main.js"'));
  assert.ok(html.includes('rel="icon"'));
});

test("CSS contains required visual, fallback, and responsive selectors", () => {
  const css = readFileSync("src/styles.css", "utf8");
  for (const selector of [
    ".app-shell",
    ".singularity-stage",
    "#singularity-canvas",
    ".orbit-node-button",
    ".content-panel",
    ".contact-particle-field",
    ".webgl-fallback",
    "@media (prefers-reduced-motion: reduce)",
    "@media (max-width: 760px)"
  ]) {
    assert.ok(css.includes(selector), `Missing selector ${selector}`);
  }
});

test("orbit node cards stay visually lighter than the singularity", () => {
  const css = readFileSync("src/styles.css", "utf8");
  assert.ok(css.includes("background: rgba(3, 8, 20, 0.46);"));
  assert.ok(css.includes("backdrop-filter: blur(10px);"));
  assert.ok(css.includes("box-shadow: 0 0 1.6rem rgba(120, 215, 255, 0.08);"));
});

test("mobile orbit stack is placed below the hero copy with compact spacing", () => {
  const css = readFileSync("src/styles.css", "utf8");
  assert.ok(css.includes("top: calc(62% + (var(--node-index) - 2) * 6.2rem)"));
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

test("event horizon core renders as an unobscured black layer", () => {
  const source = readFileSync("src/scene.js", "utf8");
  assert.ok(source.includes("transparent: true,"));
  assert.ok(source.includes("horizonCore.renderOrder = 10"));
  assert.ok(source.includes("horizonCore.material.depthTest = false"));
  assert.ok(source.includes("horizonCore.material.depthWrite = false"));
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
    "voidCutout",
    "lensedStarSmear",
    "duplicatedLightArc",
    "tidalFilaments",
    "approachingBoost",
    "color = mix(color, vec3(0.0), hardVoid"
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
    "radii[i] = topFeedBias ? 1.28 + Math.random() * 2.85 : 1.62 + Math.random() * 3.65",
    "layers[i] = topFeedBias ? 0.18 + Math.random() * 0.46 : (Math.random() - 0.5) * 0.16",
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
    "layers[i] = topFeedBias ? 0.18 + Math.random() * 0.46 : (Math.random() - 0.5) * 0.16"
  ]) {
    assert.ok(source.includes(fragment), `Missing subtle plasma dust fragment ${fragment}`);
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

test("portfolio orbit guides stay subdued behind the cinematic singularity", () => {
  const source = readFileSync("src/scene.js", "utf8");
  assert.ok(source.includes("opacity: 0.055"));
  assert.ok(source.includes("opacity: 0.18"));
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
  assert.ok(source.includes("root: document.documentElement"));
  assert.equal(source.includes('from "./scene.js"'), false);
});
