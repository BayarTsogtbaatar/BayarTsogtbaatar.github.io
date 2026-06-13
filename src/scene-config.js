export const PACKAGE_VERSIONS = {
  vite: "8.0.16",
  three: "0.184.0",
  gsap: "3.15.0"
};

export const NODE_LAYOUT = [
  { id: "experience", radius: 5.8, speed: 0.18, phase: 0.1, y: 0.35, labelX: 0.78, labelY: 0.48, color: "#78d7ff" },
  { id: "projects", radius: 6.7, speed: 0.13, phase: 1.4, y: -0.2, labelX: 0.68, labelY: 0.72, color: "#b6a3ff" },
  { id: "skills", radius: 5.1, speed: 0.22, phase: 2.55, y: 0.7, labelX: 0.31, labelY: 0.48, color: "#ffcc73" },
  { id: "education", radius: 7.3, speed: 0.11, phase: 3.8, y: -0.55, labelX: 0.40, labelY: 0.72, color: "#8fffe0" },
  { id: "contact", radius: 6.1, speed: 0.16, phase: 5.05, y: 0.05, labelX: 0.56, labelY: 0.56, color: "#ff8fc7" }
];

export const COLORS = {
  void: "#03050d",
  eventHorizon: "#000000",
  accretionWarm: "#ff9e44",
  accretionCool: "#7ed7ff",
  orbitLine: "#6fb7ff",
  text: "#f7fbff"
};

export const PERFORMANCE_LIMITS = {
  maxPixelRatio: 2,
  desktopStars: 1200,
  mobileStars: 520,
  mobileBreakpoint: 760
};

export const TRANSITIONS = {
  introMs: 2200,
  diveMs: 1400,
  returnMs: 900,
  effects: ["chromatic-aberration", "tech-displacement", "gravitational-warp"]
};
