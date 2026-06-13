import { SECTION_IDS } from "./content.js";

export function createInitialState({ reducedMotion = false } = {}) {
  return {
    mode: reducedMotion ? "orbit" : "intro",
    activeSectionId: null,
    hoveredSectionId: null,
    reducedMotion
  };
}

export function isKnownSection(id) {
  return SECTION_IDS.includes(id);
}

export function setHoveredSection(state, sectionId) {
  if (sectionId !== null && !isKnownSection(sectionId)) {
    throw new Error(`Cannot hover unknown section: ${sectionId}`);
  }

  return {
    ...state,
    hoveredSectionId: sectionId
  };
}

export function selectSection(state, sectionId) {
  if (!isKnownSection(sectionId)) {
    throw new Error(`Cannot select unknown section: ${sectionId}`);
  }

  return {
    ...state,
    mode: state.reducedMotion ? "focus" : "dive",
    activeSectionId: sectionId,
    hoveredSectionId: null
  };
}

export function completeDive(state) {
  if (state.mode !== "dive" || !state.activeSectionId) {
    return state;
  }

  return {
    ...state,
    mode: "focus"
  };
}

export function startReturn(state) {
  if (state.mode !== "focus" || !state.activeSectionId) {
    return state;
  }

  return {
    ...state,
    mode: state.reducedMotion ? "orbit" : "returning"
  };
}

export function completeReturn(state) {
  return {
    mode: "orbit",
    activeSectionId: null,
    hoveredSectionId: null,
    reducedMotion: state.reducedMotion
  };
}

export function getSectionIdFromHash(hash) {
  const normalized = hash.replace(/^#/, "").trim().toLowerCase();
  return isKnownSection(normalized) ? normalized : null;
}
