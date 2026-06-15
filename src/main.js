import "./styles.css";
import { PROFILE, getSectionById, sections } from "./content.js";
import { createDeviceTiltController } from "./motion.js";
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
const appLoader = document.getElementById("app-loader");
const canvas = document.getElementById("singularity-canvas");
const tiltToggle = document.getElementById("tilt-toggle");
const webglStatus = document.getElementById("webgl-status");

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const LOADER_MIN_VISIBLE_MS = motionQuery.matches ? 120 : 620;
const LOADER_EXIT_MS = motionQuery.matches ? 0 : 700;
const loaderStartedAt = window.performance.now();
let state = createInitialState({ reducedMotion: motionQuery.matches });
let sceneController = null;
let sceneModulePromise = null;
let tiltController = null;
let tiltUnavailable = false;
let transitionTimer = 0;
let scrollTransitionTimer = 0;
let scrollTransitioned = false;
let scrollGestureAccumulator = 0;
let scrollTouchStartY = null;
let loaderFinishing = false;

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

function clearScrollTransitionTimer() {
  if (scrollTransitionTimer) {
    window.clearTimeout(scrollTransitionTimer);
    scrollTransitionTimer = 0;
  }
}

function syncTiltToggle() {
  if (!tiltToggle) return;

  const active = Boolean(tiltController?.active);
  const stateLabel = tiltUnavailable ? "N/A" : active ? "On" : "Off";
  const state = tiltToggle.querySelector(".tilt-state");

  tiltToggle.hidden = motionQuery.matches;
  tiltToggle.disabled = tiltUnavailable || motionQuery.matches;
  tiltToggle.classList.toggle("is-active", active);
  tiltToggle.setAttribute("aria-pressed", active ? "true" : "false");
  tiltToggle.setAttribute(
    "aria-label",
    active ? "Disable phone tilt motion" : "Enable phone tilt motion"
  );

  if (state) {
    state.textContent = stateLabel;
  }
}

function ensureTiltController() {
  if (!tiltController) {
    tiltController = createDeviceTiltController({
      globalScope: window,
      onTilt: (tilt) => {
        sceneController?.setDeviceTilt({ ...tilt, active: true });
      }
    });
  }

  return tiltController;
}

function stopDeviceTilt() {
  tiltController?.stop();
  sceneController?.setDeviceTilt({ x: 0, y: 0, active: false });
  syncTiltToggle();
}

async function toggleDeviceTilt() {
  if (!tiltToggle || tiltUnavailable || motionQuery.matches) return;

  const controller = ensureTiltController();

  if (controller.active) {
    stopDeviceTilt();
    return;
  }

  const enabled = await controller.start();

  if (enabled) {
    sceneController?.setDeviceTilt({ active: true });
  } else {
    tiltUnavailable = true;
    sceneController?.setDeviceTilt({ x: 0, y: 0, active: false });
  }

  syncTiltToggle();
}

function bindTiltControl() {
  if (!tiltToggle) return;

  tiltUnavailable = !createDeviceTiltController.isSupported(window);
  syncTiltToggle();
  tiltToggle.addEventListener("click", toggleDeviceTilt);

  motionQuery.addEventListener?.("change", () => {
    if (motionQuery.matches) {
      stopDeviceTilt();
    } else {
      syncTiltToggle();
    }
  });
}

function finishStartupLoader() {
  if (!appLoader || loaderFinishing || app.classList.contains("is-scene-ready")) return;

  loaderFinishing = true;
  const elapsed = window.performance.now() - loaderStartedAt;
  const remainingVisibleTime = Math.max(0, LOADER_MIN_VISIBLE_MS - elapsed);

  window.setTimeout(() => {
    app.classList.remove("is-loading-scene");
    app.classList.add("is-scene-ready");
    app.setAttribute("aria-busy", "false");

    window.setTimeout(() => {
      appLoader.hidden = true;
    }, LOADER_EXIT_MS);
  }, remainingVisibleTime);
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

function canUseScrollTransition(event) {
  const target = event?.target instanceof Element ? event.target : null;
  if (target?.closest(".content-panel")) return false;
  if (app.classList.contains("webgl-fallback")) return false;

  return state.mode === "intro" || state.mode === "orbit";
}

function setScrollTransitionState(nextTransitioned, { immediate = motionQuery.matches } = {}) {
  if (scrollTransitioned === nextTransitioned && !immediate) return;

  const targetProgress = nextTransitioned ? 1 : 0;
  scrollTransitioned = nextTransitioned;
  scrollGestureAccumulator = 0;
  app.classList.toggle("is-scroll-transitioned", scrollTransitioned);
  app.classList.toggle("is-cards-page", scrollTransitioned);
  document.documentElement.classList.toggle("is-cards-page", scrollTransitioned);
  app.classList.add("is-scroll-transitioning");
  sceneController?.setScrollTransition(targetProgress, {
    immediate,
    direction: scrollTransitioned ? 1 : -1
  });

  clearScrollTransitionTimer();
  if (immediate || motionQuery.matches) {
    app.classList.remove("is-scroll-transitioning");
    document.documentElement.classList.remove("is-scroll-transitioning");
    return;
  }

  scrollTransitionTimer = window.setTimeout(() => {
    app.classList.remove("is-scroll-transitioning");
    document.documentElement.classList.remove("is-scroll-transitioning");
    scrollTransitionTimer = 0;
  }, TRANSITIONS.scrollMs);
}

function updateScrollGestureFromDelta(deltaY) {
  if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 1) return;

  scrollGestureAccumulator += deltaY;

  if (!scrollTransitioned && scrollGestureAccumulator >= TRANSITIONS.scrollGestureThreshold) {
    setScrollTransitionState(true);
  } else if (scrollTransitioned && scrollGestureAccumulator <= -TRANSITIONS.scrollGestureThreshold) {
    setScrollTransitionState(false);
  }
}

function handleScrollTransitionWheel(event) {
  if (!canUseScrollTransition(event)) return;

  event.preventDefault();
  updateScrollGestureFromDelta(event.deltaY);
}

function handleScrollTransitionTouchStart(event) {
  if (!canUseScrollTransition(event)) return;

  scrollTouchStartY = event.touches?.[0]?.clientY ?? null;
  scrollGestureAccumulator = 0;
}

function handleScrollTransitionTouchMove(event) {
  if (!canUseScrollTransition(event) || scrollTouchStartY === null) return;

  const touchY = event.touches?.[0]?.clientY;
  if (!Number.isFinite(touchY)) return;

  const deltaY = scrollTouchStartY - touchY;
  if (Math.abs(deltaY) < 2) return;

  event.preventDefault();
  scrollGestureAccumulator = 0;
  updateScrollGestureFromDelta(deltaY);
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

function bindScrollTransition() {
  window.addEventListener("wheel", handleScrollTransitionWheel, { passive: false });
  window.addEventListener("touchstart", handleScrollTransitionTouchStart, { passive: true });
  window.addEventListener("touchmove", handleScrollTransitionTouchMove, { passive: false });

  motionQuery.addEventListener?.("change", () => {
    setScrollTransitionState(scrollTransitioned, { immediate: true });
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
    finishStartupLoader();
    return;
  }

  webglStatus.textContent = "Loading real-time singularity scene.";

  try {
    const { createSingularityScene } = await loadSceneModule();
    sceneController = createSingularityScene({
      canvas,
      profile: PROFILE,
      sections,
      reducedMotion: state.reducedMotion,
      root: document.documentElement,
      onNodeSelect: (sectionId) => openSection(sectionId)
    });
    sceneController.start();
    syncSceneToState();
    sceneController.setScrollTransition(scrollTransitioned ? 1 : 0, {
      immediate: true,
      direction: scrollTransitioned ? 1 : -1
    });
    if (tiltController?.active) {
      sceneController.setDeviceTilt({ active: true });
    }
    webglStatus.textContent = "";
    window.requestAnimationFrame(() => finishStartupLoader());
    window.setTimeout(() => finishStartupLoader(), 180);
  } catch (error) {
    app.classList.add("webgl-fallback");
    webglStatus.textContent = "The 3D scene could not start; showing accessible orbit navigation.";
    finishStartupLoader();
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
  bindTiltControl();
  bindScrollTransition();
  syncUi();
  startScene();
  openInitialHash();
}

initApp();
