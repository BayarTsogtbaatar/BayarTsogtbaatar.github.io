import assert from "node:assert/strict";
import test from "node:test";
import {
  completeDive,
  completeReturn,
  createInitialState,
  getSectionIdFromHash,
  setHoveredSection,
  selectSection,
  startReturn
} from "../src/state.js";

test("initial state starts in intro", () => {
  assert.deepEqual(createInitialState(), {
    mode: "intro",
    activeSectionId: null,
    hoveredSectionId: null,
    reducedMotion: false
  });
});

test("reduced motion can start directly in orbit", () => {
  assert.deepEqual(createInitialState({ reducedMotion: true }), {
    mode: "orbit",
    activeSectionId: null,
    hoveredSectionId: null,
    reducedMotion: true
  });
});

test("hovering known sections updates hover state", () => {
  assert.equal(setHoveredSection(createInitialState(), "projects").hoveredSectionId, "projects");
  assert.equal(setHoveredSection(createInitialState(), null).hoveredSectionId, null);
});

test("selecting a section enters dive state", () => {
  assert.deepEqual(selectSection(createInitialState(), "skills"), {
    mode: "dive",
    activeSectionId: "skills",
    hoveredSectionId: null,
    reducedMotion: false
  });
});

test("completing dive enters focus state", () => {
  assert.equal(completeDive(selectSection(createInitialState(), "contact")).mode, "focus");
});

test("return flow moves back to orbit", () => {
  const focused = completeDive(selectSection(createInitialState(), "experience"));
  assert.equal(startReturn(focused).mode, "returning");
  assert.deepEqual(completeReturn(startReturn(focused)), {
    mode: "orbit",
    activeSectionId: null,
    hoveredSectionId: null,
    reducedMotion: false
  });
});

test("hash parsing accepts approved sections", () => {
  assert.equal(getSectionIdFromHash("#projects"), "projects");
  assert.equal(getSectionIdFromHash("#not-real"), null);
  assert.equal(getSectionIdFromHash(""), null);
});
