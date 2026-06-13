import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NODE_LAYOUT,
  PACKAGE_VERSIONS,
  PERFORMANCE_LIMITS,
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

test("performance limits cover low-end device tuning", () => {
  assert.equal(PERFORMANCE_LIMITS.maxPixelRatio, 2);
  assert.equal(PERFORMANCE_LIMITS.desktopStars, 1200);
  assert.equal(PERFORMANCE_LIMITS.mobileStars, 520);
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
