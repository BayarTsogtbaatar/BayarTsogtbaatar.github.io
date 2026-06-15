export const PACKAGE_VERSIONS = {
  vite: "8.0.16",
  three: "0.184.0",
  gsap: "3.15.0"
};

export const NODE_LAYOUT = [
  { id: "experience", radius: 5.8, speed: 0.18, phase: 0.1, y: 0.35, labelX: 0.84, labelY: 0.48, color: "#78d7ff" },
  { id: "projects", radius: 6.7, speed: 0.13, phase: 1.4, y: -0.2, labelX: 0.76, labelY: 0.72, color: "#b6a3ff" },
  { id: "skills", radius: 5.1, speed: 0.22, phase: 2.55, y: 0.7, labelX: 0.25, labelY: 0.48, color: "#ffcc73" },
  { id: "education", radius: 7.3, speed: 0.11, phase: 3.8, y: -0.55, labelX: 0.30, labelY: 0.76, color: "#8fffe0" },
  { id: "contact", radius: 6.1, speed: 0.16, phase: 5.05, y: 0.05, labelX: 0.56, labelY: 0.89, color: "#ff8fc7" }
];

export const COLORS = {
  void: "#010107",
  eventHorizon: "#000000",
  accretionWarm: "#ff9e44",
  accretionCool: "#7fb7ff",
  orbitLine: "#9a7cff",
  text: "#f7fbff"
};

export const PERFORMANCE_LIMITS = {
  maxPixelRatio: 2,
  desktopStars: 1200,
  mobileStars: 520,
  mobileBreakpoint: 760
};

export const HOUSE_OF_CARDS = {
  bottomTriangles: 6,
  sceneY: -8.8,
  cameraYOffset: 3.75,
  cameraX: -1.35,
  cameraZ: 10.4,
  cameraLookAtYOffset: 2.05,
  cameraLookAtZ: 0.06,
  pageScale: 0.72,
  pageYaw: 0.16,
  tableY: -0.08,
  cardWidth: 0.52,
  cardHeight: 1.42,
  cardThickness: 0.014,
  cardVisualThickness: 0.024,
  cardColliderThickness: 0.06,
  cardCornerRadius: 0.026,
  cardDepth: 0.78,
  leanAngle: Math.PI * 0.115,
  faceInwardAngle: Math.PI * 0.34,
  triangleSpacing: 1.08,
  gravity: -9.8,
  damping: 0.985,
  angularDamping: 0.976,
  knockStrength: 5.8,
  knockRadius: 2.65,
  skyTurbidity: 10,
  skyRayleigh: 3,
  skyMieCoefficient: 0.005,
  skyMieDirectionalG: 0.7,
  sunElevation: 36,
  sunAzimuth: 136,
  cloudCoverage: 0.4,
  cloudDensity: 0.4,
  cloudElevation: 0.5,
  showSunDisc: true,
  picnicTableSlatCount: 6,
  picnicTableDepth: 2.42,
  picnicTableTopThickness: 0.08,
  grassBackdropHeight: 2.6
};

export const POST_PROCESSING = {
  passes: ["EffectComposer", "RenderPass", "UnrealBloomPass", "ShaderPass", "SelectiveBloomComposite", "OutputPass"],
  composerScale: {
    desktop: 1,
    mobile: 0.72,
    reducedMotion: 0.62
  },
  bloom: {
    desktop: {
      strength: 0.3,
      radius: 0.16,
      threshold: 0.68
    },
    mobile: {
      strength: 0.18,
      radius: 0.12,
      threshold: 0.7
    },
    reducedMotion: {
      strength: 0,
      radius: 0,
      threshold: 1
    }
  },
  shaderPass: {
    aberration: 0.0009,
    diveAberration: 0.007,
    contactAberration: 0.0034,
    transitionDisplacement: 0.012,
    scrollDisplacement: 0.022,
    scrollThreshold: 0.18,
    lensDistortion: 0.048,
    vignette: 0.72,
    grain: 0.01
  }
};

export const SHADER_SETTINGS = {
  eventHorizon: {
    uniforms: ["uTime", "uPhotonRing", "uLensing", "uInnerVoid"]
  },
  accretionDisk: {
    uniforms: ["uTime", "uDopplerBias", "uTurbulence", "uPlasmaFlow", "uPlasmaShear", "uPlasmaIntensity", "uInnerColor", "uOuterColor"]
  },
  orbitalParticles: {
    uniforms: ["uTime", "uPixelRatio", "uContactBoost", "uFade", "uHorizonCenter", "uHorizonRadius", "uHorizonAspect", "uHorizonDepth", "uHorizonOccluderDepth"],
    additive: true
  }
};

export const PARTICLE_BUDGETS = {
  starfield: {
    desktop: PERFORMANCE_LIMITS.desktopStars,
    mobile: PERFORMANCE_LIMITS.mobileStars
  },
  accretionDust: {
    desktop: 680,
    mobile: 230
  },
  sectionBurst: {
    desktop: 360,
    mobile: 140
  },
  contact: {
    desktop: 680,
    mobile: 240
  },
  reducedMotionMultiplier: 0.34
};

export const TRANSITIONS = {
  introMs: 2200,
  diveMs: 1400,
  returnMs: 900,
  scrollMs: 1050,
  scrollGestureThreshold: 72,
  effects: ["chromatic-aberration", "tech-displacement", "gravitational-warp", "frost-dissolve"]
};
