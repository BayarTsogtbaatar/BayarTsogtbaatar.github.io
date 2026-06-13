import "./styles.css";
import { PROFILE, getSectionById, sections } from "./content.js";
import {
  completeDive,
  completeReturn,
  createInitialState,
  getSectionIdFromHash,
  selectSection,
  setHoveredSection,
  startReturn
} from "./state.js";
import { renderOrbitControls, renderProfile, renderSectionPanel } from "./ui.js";
import { TRANSITIONS } from "./scene-config.js";

const profileRoot = document.getElementById("profile-root");
const orbitControls = document.getElementById("orbit-controls");
const sectionPanels = document.getElementById("section-panels");
const app = document.getElementById("app");
const canvas = document.getElementById("singularity-canvas");
const webglStatus = document.getElementById("webgl-status");

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let state = createInitialState({ reducedMotion: motionQuery.matches });
let sceneController = null;
let sceneModulePromise = null;
let transitionTimer = 0;

function canUseWebGL() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(
      probe.getContext("webgl2") ||
        probe.getContext("webgl") ||
        probe.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

function loadSceneModule() {
  if (!sceneModulePromise) {
    sceneModulePromise = import("./scene.js");
  }
  return sceneModulePromise;
}

function clearTransitionTimer() {
  if (transitionTimer) {
    window.clearTimeout(transitionTimer);
    transitionTimer = 0;
  }
}

function getNodeButton(sectionId) {
  return orbitControls.querySelector(`[data-section-id="${sectionId}"]`);
}

function getPanel(sectionId) {
  return sectionPanels.querySelector(`[data-section-panel="${sectionId}"]`);
}

function syncUi() {
  app.dataset.mode = state.mode;

  sections.forEach((section) => {
    const selected = state.activeSectionId === section.id;
    const button = getNodeButton(section.id);
    const panel = getPanel(section.id);

    if (button) {
      button.setAttribute("aria-selected", selected ? "true" : "false");
      button.classList.toggle("is-hovered", state.hoveredSectionId === section.id);
    }

    if (panel) {
      const visible = state.mode === "focus" && selected;
      panel.hidden = !visible;
      panel.setAttribute("aria-hidden", visible ? "false" : "true");
    }
  });
}

function syncSceneToState() {
  if (!sceneController) return;

  sceneController.setHoveredSection(state.hoveredSectionId);

  if (state.activeSectionId) {
    sceneController.selectSection(state.activeSectionId);
    if (state.mode === "focus") {
      sceneController.focusSection(state.activeSectionId);
    }
  }
}

function focusActivePanel() {
  const panel = state.activeSectionId ? getPanel(state.activeSectionId) : null;
  const heading = panel?.querySelector("h2");
  heading?.setAttribute("tabindex", "-1");
  heading?.focus({ preventScroll: true });
}

function updateHash(sectionId) {
  if (sectionId) {
    history.replaceState(null, "", `#${sectionId}`);
  } else {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
}

function completeFocusTransition() {
  state = completeDive(state);
  sceneController?.focusSection(state.activeSectionId);
  syncUi();
  updateHash(state.activeSectionId);
  focusActivePanel();
}

function openSection(sectionId, { updateUrl = true } = {}) {
  getSectionById(sectionId);
  clearTransitionTimer();
  state = selectSection(state, sectionId);
  sceneController?.selectSection(sectionId);
  syncUi();

  if (state.mode === "focus") {
    sceneController?.focusSection(sectionId);
    if (updateUrl) updateHash(sectionId);
    syncUi();
    focusActivePanel();
    return;
  }

  transitionTimer = window.setTimeout(() => {
    completeFocusTransition();
    if (!updateUrl) updateHash(sectionId);
  }, TRANSITIONS.diveMs);
}

function returnToOrbit() {
  clearTransitionTimer();
  state = startReturn(state);
  sceneController?.returnToOrbit();
  syncUi();
  updateHash(null);

  if (state.mode === "orbit") {
    syncUi();
    getNodeButton("experience")?.focus({ preventScroll: true });
    return;
  }

  transitionTimer = window.setTimeout(() => {
    state = completeReturn(state);
    syncUi();
    getNodeButton("experience")?.focus({ preventScroll: true });
  }, TRANSITIONS.returnMs);
}

function setHoverFromButton(button, value) {
  const sectionId = button?.dataset?.sectionId ?? null;
  if (!sectionId) return;
  state = setHoveredSection(state, value ? sectionId : null);
  sceneController?.setHoveredSection(value ? sectionId : null);
  syncUi();
}

function bindControls() {
  orbitControls.addEventListener("click", (event) => {
    const button = event.target.closest("[data-section-id]");
    if (!button) return;
    openSection(button.dataset.sectionId);
  });

  orbitControls.addEventListener("mouseover", (event) => {
    setHoverFromButton(event.target.closest("[data-section-id]"), true);
  });

  orbitControls.addEventListener("mouseout", (event) => {
    setHoverFromButton(event.target.closest("[data-section-id]"), false);
  });

  orbitControls.addEventListener("focusin", (event) => {
    setHoverFromButton(event.target.closest("[data-section-id]"), true);
  });

  orbitControls.addEventListener("focusout", (event) => {
    setHoverFromButton(event.target.closest("[data-section-id]"), false);
  });

  orbitControls.addEventListener("keydown", (event) => {
    const button = event.target.closest("[data-section-id]");
    if (!button) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openSection(button.dataset.sectionId);
    }
  });

  sectionPanels.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="back-to-orbit"]');
    if (button) {
      returnToOrbit();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.mode === "focus") {
      returnToOrbit();
    }
  });
}

function renderApp() {
  profileRoot.innerHTML = renderProfile(PROFILE);
  orbitControls.innerHTML = renderOrbitControls(sections);
  sectionPanels.innerHTML = sections.map(renderSectionPanel).join("");
}

async function startScene() {
  if (!canUseWebGL()) {
    app.classList.add("webgl-fallback");
    webglStatus.textContent = "WebGL is unavailable; showing accessible orbit navigation.";
    return;
  }

  webglStatus.textContent = "Loading real-time singularity scene.";

  try {
    const { createSingularityScene } = await loadSceneModule();
    sceneController = createSingularityScene({
      canvas,
      sections,
      reducedMotion: state.reducedMotion,
      root: document.documentElement,
      onNodeSelect: (sectionId) => openSection(sectionId)
    });
    sceneController.start();
    syncSceneToState();
    webglStatus.textContent = "";
  } catch (error) {
    app.classList.add("webgl-fallback");
    webglStatus.textContent = "The 3D scene could not start; showing accessible orbit navigation.";
    console.error(error);
  }
}

function openInitialHash() {
  const sectionId = getSectionIdFromHash(window.location.hash);
  if (sectionId) {
    openSection(sectionId, { updateUrl: false });
  } else if (state.mode === "intro") {
    window.setTimeout(() => {
      if (state.mode === "intro") {
        state = { ...state, mode: "orbit" };
        syncUi();
      }
    }, TRANSITIONS.introMs);
  }
}

function initApp() {
  renderApp();
  bindControls();
  syncUi();
  startScene();
  openInitialHash();
}

initApp();
