import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("GitHub Pages workflow builds Vite dist and deploys it", () => {
  const workflow = readFileSync(".github/workflows/pages.yml", "utf8");
  for (const fragment of [
    "npm ci",
    "npm run build",
    "actions/upload-pages-artifact",
    "path: dist",
    "actions/deploy-pages"
  ]) {
    assert.ok(workflow.includes(fragment), `Missing workflow fragment: ${fragment}`);
  }
});
