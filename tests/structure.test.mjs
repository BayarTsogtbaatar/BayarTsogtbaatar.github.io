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
  assert.ok(NODE_LAYOUT.every((node) => node.labelX >= 0.25 && node.labelX <= 0.82));
  assert.ok(NODE_LAYOUT.every((node) => node.labelY >= 0.42 && node.labelY <= 0.75));
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

test("scene helper computes deterministic reduced-motion node positions", async () => {
  const { computeNodePosition } = await import("../src/scene.js");
  const normal = computeNodePosition(NODE_LAYOUT[0], 10, false);
  const reduced = computeNodePosition(NODE_LAYOUT[0], 10, true);
  assert.notDeepEqual(normal, reduced);
  assert.ok(Number.isFinite(normal.x));
  assert.ok(Number.isFinite(normal.y));
  assert.ok(Number.isFinite(normal.z));
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
    "lensing",
    "photon",
    "doppler",
    "burstParticles"
  ]) {
    assert.ok(source.includes(fragment), `Missing scene fragment ${fragment}`);
  }
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
