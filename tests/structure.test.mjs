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
  for (const uniform of ["uContactBoost", "uHorizonCenter", "uHorizonRadius", "uHorizonDepth", "uHorizonOccluderDepth"]) {
    assert.ok(SHADER_SETTINGS.orbitalParticles.uniforms.includes(uniform));
  }
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

test("index includes an accessible startup loader before the scene paints", () => {
  const html = readFileSync("index.html", "utf8");
  assert.ok(html.includes('class="app-shell is-loading-scene"'));
  assert.ok(html.includes('aria-busy="true"'));
  assert.ok(html.includes('id="app-loader"'));
  assert.ok(html.includes('class="app-loader"'));
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('class="loader-ring"'));
});

test("index includes a mobile opt-in phone tilt control", () => {
  const html = readFileSync("index.html", "utf8");
  assert.ok(html.includes('id="tilt-toggle"'));
  assert.ok(html.includes('class="tilt-toggle"'));
  assert.ok(html.includes('aria-pressed="false"'));
  assert.ok(html.includes('aria-label="Enable phone tilt motion"'));
  assert.ok(html.includes('class="tilt-state"'));
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
    ".loader-ring::before"
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
  assert.ok(css.includes("font-size: 7.25rem;"));
  assert.ok(css.includes("line-height: 0.95;"));
  assert.ok(normalizedCss.includes(".profile-headline {\n  margin-top: 0.95rem;"));
  assert.ok(css.includes("line-height: 1.18;"));
  assert.ok(css.includes("@media (max-width: 1100px)"));
  assert.ok(css.includes("font-size: 5.8rem;"));
  assert.ok(css.includes("font-size: 3.35rem;"));
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
    "vAlpha = uFade * (0.58 + twinkle * 0.42) * horizonVisibility;",
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
