import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { gsap } from "gsap";
import {
  COLORS,
  NODE_LAYOUT,
  PARTICLE_BUDGETS,
  POST_PROCESSING,
  PERFORMANCE_LIMITS,
  TRANSITIONS
} from "./scene-config.js";

const TAU = Math.PI * 2;

const eventHorizonVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const eventHorizonFragmentShader = `
  uniform float uTime;
  uniform float uPhotonRing;
  uniform float uLensing;
  uniform float uInnerVoid;

  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float facing = abs(dot(normalize(vNormal), viewDir));
    float rim = 1.0 - facing;
    float photon = smoothstep(0.56, 0.98, rim) * uPhotonRing;
    float lensing = smoothstep(0.18, 0.88, rim) * uLensing;
    float pulse = 0.74 + sin(uTime * 2.15 + rim * 8.0) * 0.26;
    float innerVoid = smoothstep(0.44, 0.0, facing) * uInnerVoid;
    vec3 hotRing = vec3(1.0, 0.58, 0.20) * photon * pulse;
    vec3 coolLens = vec3(0.28, 0.58, 1.0) * lensing * 0.28;
    vec3 color = hotRing + coolLens;
    float alpha = max(photon * 0.88, lensing * 0.36) * (1.0 - innerVoid * 0.55);
    gl_FragColor = vec4(color, alpha);
  }
`;

const accretionDiskVertexShader = `
  varying vec2 vDiskUv;
  varying float vRadius;
  varying float vAngle;

  void main() {
    vDiskUv = uv;
    vRadius = length(position.xy);
    vAngle = atan(position.y, position.x);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const accretionDiskFragmentShader = `
  uniform float uTime;
  uniform float uDopplerBias;
  uniform float uTurbulence;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uOpacity;
  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;

  varying vec2 vDiskUv;
  varying float vRadius;
  varying float vAngle;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    float innerEdge = smoothstep(uInnerRadius, uInnerRadius + 0.08, vRadius);
    float outerEdge = 1.0 - smoothstep(uOuterRadius - 0.2, uOuterRadius, vRadius);
    float radialAlpha = innerEdge * outerEdge;
    float radialHot = 1.0 - smoothstep(uInnerRadius + 0.05, uOuterRadius, vRadius);
    float turbulence = noise(vec2(vAngle * 3.4 + uTime * 0.35, vRadius * 7.0 - uTime * 0.55));
    float filament = sin(vAngle * 16.0 + uTime * 2.8 + turbulence * 4.0) * 0.5 + 0.5;
    float doppler = smoothstep(-0.34, 1.0, cos(vAngle - 0.7)) * uDopplerBias;
    vec3 color = mix(uOuterColor, uInnerColor, clamp(radialHot + doppler * 0.34 + turbulence * 0.18, 0.0, 1.0));
    color += vec3(1.0, 0.9, 0.66) * pow(radialHot, 4.0) * 0.55;
    float alpha = radialAlpha * (0.24 + filament * 0.32 + radialHot * 0.56 + turbulence * uTurbulence) * uOpacity;
    gl_FragColor = vec4(color, alpha);
  }
`;

const particleVertexShader = `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uContactBoost;
  uniform float uFade;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;
    float twinkle = sin(uTime * (0.8 + aSeed * 0.32) + aSeed * 12.0) * 0.5 + 0.5;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float depthScale = 240.0 / max(4.0, -mvPosition.z);
    gl_PointSize = aSize * uPixelRatio * depthScale * (0.82 + twinkle * 0.34 + uContactBoost * 0.32);
    vAlpha = uFade * (0.58 + twinkle * 0.42);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    float core = smoothstep(0.5, 0.0, dist);
    float halo = smoothstep(0.5, 0.18, dist) * 0.34;
    float alpha = (core + halo) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const cinematicPostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAberration: { value: POST_PROCESSING.shaderPass.aberration },
    uVignette: { value: POST_PROCESSING.shaderPass.vignette },
    uGrain: { value: POST_PROCESSING.shaderPass.grain },
    uLens: { value: POST_PROCESSING.shaderPass.lensDistortion }
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uLens;

    varying vec2 vUv;

    float random(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec2 centered = vUv - vec2(0.5);
      float radius = dot(centered, centered);
      vec2 lensUv = vUv + centered * radius * uLens;
      vec2 direction = normalize(centered + vec2(0.0001)) * uAberration;
      float red = texture2D(tDiffuse, lensUv + direction).r;
      float green = texture2D(tDiffuse, lensUv).g;
      float blue = texture2D(tDiffuse, lensUv - direction).b;
      vec3 color = vec3(red, green, blue);
      float grain = (random(vUv * uResolution + uTime * 34.0) - 0.5) * uGrain;
      float vignette = smoothstep(0.84, 0.16, length(centered));
      color = color * mix(1.0, vignette, uVignette) + grain;
      gl_FragColor = vec4(color, 1.0);
    }
  `
};

export function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

export function computeNodePosition(layout, time, reducedMotion = false) {
  const speed = reducedMotion ? layout.speed * 0.18 : layout.speed;
  const angle = layout.phase + time * speed;
  return {
    x: Math.cos(angle) * layout.radius,
    y: layout.y + Math.sin(angle * 0.7) * 0.35,
    z: Math.sin(angle) * layout.radius
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function colorToArray(color) {
  const parsed = new THREE.Color(color);
  return [parsed.r, parsed.g, parsed.b];
}

function isMobileViewport() {
  return window.innerWidth <= PERFORMANCE_LIMITS.mobileBreakpoint;
}

function getBudget(kind, reducedMotion = false) {
  const profile = isMobileViewport() ? "mobile" : "desktop";
  const base = PARTICLE_BUDGETS[kind][profile];
  return Math.max(24, Math.floor(base * (reducedMotion ? PARTICLE_BUDGETS.reducedMotionMultiplier : 1)));
}

function createParticleMaterial({ opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uContactBoost: { value: 0 },
      uFade: { value: opacity }
    },
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending
  });
}

function createStarField({ count, spread }) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const radius = 12 + Math.random() * spread;
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    const index = i * 3;
    const tint = 0.64 + Math.random() * 0.36;
    const warm = Math.random() > 0.88 ? 0.14 : 0;

    positions[index] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index + 1] = radius * Math.cos(phi);
    positions[index + 2] = radius * Math.sin(phi) * Math.sin(theta);
    colors[index] = tint * (0.62 + warm);
    colors[index + 1] = tint * (0.82 + warm * 0.35);
    colors[index + 2] = tint;
    sizes[i] = 0.9 + Math.random() * 1.9;
    seeds[i] = Math.random() * 100;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  return new THREE.Points(geometry, createParticleMaterial({ opacity: 0.86 }));
}

function createAccretionDust(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const radii = new Float32Array(count);
  const speeds = new Float32Array(count);
  const layers = new Float32Array(count);
  const directions = new Float32Array(count);
  const warm = colorToArray(COLORS.accretionWarm);
  const cool = colorToArray(COLORS.accretionCool);

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    const mix = Math.random();
    seeds[i] = Math.random() * 100;
    radii[i] = 1.65 + Math.random() * 3.4;
    speeds[i] = 0.18 + Math.random() * 0.56;
    layers[i] = (Math.random() - 0.5) * 0.28;
    directions[i] = Math.random() > 0.45 ? 1 : -1;
    colors[index] = lerp(warm[0], cool[0], mix);
    colors[index + 1] = lerp(warm[1], cool[1], mix);
    colors[index + 2] = lerp(warm[2], cool[2], mix);
    sizes[i] = 0.65 + Math.random() * 1.55;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.userData = { radii, speeds, layers, directions };

  const points = new THREE.Points(geometry, createParticleMaterial({ opacity: 0.78 }));
  points.rotation.x = Math.PI * 0.1;
  return points;
}

function createBurstParticles(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    seeds[i] = Math.random() * 100;
    colors[index] = 0.55;
    colors[index + 1] = 0.82;
    colors[index + 2] = 1;
    sizes[i] = 1.4 + Math.random() * 2.4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  const burstParticles = new THREE.Points(geometry, createParticleMaterial({ opacity: 0 }));
  burstParticles.userData = {
    active: false,
    duration: 1.15,
    origin: new THREE.Vector3(),
    startedAt: -100
  };
  return burstParticles;
}

function createContactParticles(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const cyan = colorToArray(COLORS.accretionCool);
  const pink = colorToArray("#ff8fc7");

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    const mix = Math.random();
    seeds[i] = Math.random() * 100;
    colors[index] = lerp(cyan[0], pink[0], mix);
    colors[index + 1] = lerp(cyan[1], pink[1], mix);
    colors[index + 2] = lerp(cyan[2], pink[2], mix);
    sizes[i] = 1 + Math.random() * 2.1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  const particles = new THREE.Points(geometry, createParticleMaterial({ opacity: 0 }));
  particles.position.set(0, -1.1, 1.5);
  particles.userData.active = false;
  return particles;
}

function createEventHorizonShell() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1.34, 128, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPhotonRing: { value: 1 },
        uLensing: { value: 1 },
        uInnerVoid: { value: 0.9 }
      },
      vertexShader: eventHorizonVertexShader,
      fragmentShader: eventHorizonFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
}

function createAccretionDisk({ innerRadius, outerRadius, opacity, innerColor, outerColor, rotationZ = 0 }) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(innerRadius, outerRadius, 256, 16),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDopplerBias: { value: 0.72 },
        uTurbulence: { value: 0.36 },
        uInnerRadius: { value: innerRadius },
        uOuterRadius: { value: outerRadius },
        uOpacity: { value: opacity },
        uInnerColor: { value: new THREE.Color(innerColor) },
        uOuterColor: { value: new THREE.Color(outerColor) }
      },
      vertexShader: accretionDiskVertexShader,
      fragmentShader: accretionDiskFragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );

  mesh.rotation.x = Math.PI * 0.61;
  mesh.rotation.z = rotationZ;
  return mesh;
}

function createOrbitLine(radius, color, y = 0) {
  const points = [];
  const segments = 192;

  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * TAU;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending
  });

  const line = new THREE.LineLoop(geometry, material);
  line.rotation.x = Math.PI * 0.18;
  return line;
}

function createTrailArc(radius, color, phase) {
  const points = [];
  const segments = 48;

  for (let i = 0; i < segments; i += 1) {
    const angle = phase + (i / (segments - 1)) * Math.PI * 0.72;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending
  });

  const line = new THREE.Line(geometry, material);
  line.rotation.x = Math.PI * 0.18;
  return line;
}

function createNodeGroup(layout) {
  const group = new THREE.Group();
  group.userData.layout = layout;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 36, 18),
    new THREE.MeshBasicMaterial({
      color: layout.color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    })
  );
  core.userData.sectionId = layout.id;

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 36, 18),
    new THREE.MeshBasicMaterial({
      color: layout.color,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );

  group.add(core, halo);
  return { group, core, halo };
}

export function createSingularityScene({
  canvas,
  sections,
  onNodeSelect,
  reducedMotion = false,
  root = document.documentElement
}) {
  if (!canvas) {
    throw new Error("createSingularityScene requires a canvas");
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setClearColor(COLORS.void, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COLORS.void, 0.024);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 140);
  camera.position.set(0, 1.1, reducedMotion ? 12 : 18);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomProfile = reducedMotion
    ? POST_PROCESSING.bloom.reducedMotion
    : isMobileViewport()
      ? POST_PROCESSING.bloom.mobile
      : POST_PROCESSING.bloom.desktop;
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    bloomProfile.strength,
    bloomProfile.radius,
    bloomProfile.threshold
  );
  const cinematicPass = new ShaderPass(cinematicPostShader);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(cinematicPass);
  composer.addPass(outputPass);

  const timer = new THREE.Timer();
  timer.connect(document);
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const nodeMeshes = new Map();
  const nodeButtons = new Map();
  const pickMeshes = [];
  let hoveredId = null;
  let activeSectionId = null;
  let running = false;
  let rafId = 0;
  let lastElapsed = 0;

  sections.forEach((section) => {
    const button = root.querySelector?.(`[data-section-id="${section.id}"]`);
    if (button) {
      nodeButtons.set(section.id, button);
    }
  });

  const starField = createStarField({ count: getBudget("starfield", reducedMotion), spread: 64 });
  scene.add(starField);

  const ambient = new THREE.AmbientLight(0x6b7dff, 0.36);
  scene.add(ambient);

  const warmLight = new THREE.PointLight(0xffa75a, 4.4, 16);
  warmLight.position.set(-1.4, 0.4, 2.2);
  scene.add(warmLight);

  const coolLight = new THREE.PointLight(0x76d8ff, 1.8, 18);
  coolLight.position.set(2.4, 1.7, -1.2);
  scene.add(coolLight);

  const singularity = new THREE.Group();
  scene.add(singularity);

  const horizonCore = new THREE.Mesh(
    new THREE.SphereGeometry(1.12, 128, 64),
    new THREE.MeshBasicMaterial({ color: COLORS.eventHorizon })
  );
  singularity.add(horizonCore);

  const horizonShell = createEventHorizonShell();
  singularity.add(horizonShell);

  const innerDisk = createAccretionDisk({
    innerRadius: 1.18,
    outerRadius: 2.24,
    opacity: 0.96,
    innerColor: "#fff6cc",
    outerColor: COLORS.accretionWarm,
    rotationZ: 0.08
  });
  singularity.add(innerDisk);

  const outerDisk = createAccretionDisk({
    innerRadius: 2.18,
    outerRadius: 3.22,
    opacity: 0.62,
    innerColor: COLORS.accretionWarm,
    outerColor: "#7d7bff",
    rotationZ: -0.1
  });
  outerDisk.rotation.x = Math.PI * 0.58;
  singularity.add(outerDisk);

  const accretionDust = createAccretionDust(getBudget("accretionDust", reducedMotion));
  scene.add(accretionDust);

  NODE_LAYOUT.forEach((layout) => {
    const orbit = createOrbitLine(layout.radius, layout.color, layout.y * 0.18);
    scene.add(orbit);

    const trail = createTrailArc(layout.radius, layout.color, layout.phase - 0.4);
    trail.position.y = layout.y * 0.18;
    scene.add(trail);

    const { group, core } = createNodeGroup(layout);
    nodeMeshes.set(layout.id, group);
    pickMeshes.push(core);
    scene.add(group);
  });

  const burstParticles = createBurstParticles(getBudget("sectionBurst", reducedMotion));
  scene.add(burstParticles);

  const contactParticles = createContactParticles(getBudget("contact", reducedMotion));
  scene.add(contactParticles);

  function currentComposerScale() {
    if (reducedMotion) return POST_PROCESSING.composerScale.reducedMotion;
    return isMobileViewport() ? POST_PROCESSING.composerScale.mobile : POST_PROCESSING.composerScale.desktop;
  }

  function currentBloomProfile() {
    if (reducedMotion) return POST_PROCESSING.bloom.reducedMotion;
    return isMobileViewport() ? POST_PROCESSING.bloom.mobile : POST_PROCESSING.bloom.desktop;
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, PERFORMANCE_LIMITS.maxPixelRatio);
    const composerPixelRatio = pixelRatio * currentComposerScale();
    const activeBloom = currentBloomProfile();

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(composerPixelRatio);
    composer.setSize(width, height);
    bloomPass.strength = activeBloom.strength;
    bloomPass.radius = activeBloom.radius;
    bloomPass.threshold = activeBloom.threshold;
    cinematicPass.uniforms.uResolution.value.set(width * composerPixelRatio, height * composerPixelRatio);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    for (const points of [starField, accretionDust, burstParticles, contactParticles]) {
      points.material.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  function updateShaderUniforms(elapsed) {
    horizonShell.material.uniforms.uTime.value = elapsed;
    innerDisk.material.uniforms.uTime.value = elapsed;
    outerDisk.material.uniforms.uTime.value = elapsed * 0.86;
    starField.material.uniforms.uTime.value = elapsed;
    accretionDust.material.uniforms.uTime.value = elapsed;
    burstParticles.material.uniforms.uTime.value = elapsed;
    contactParticles.material.uniforms.uTime.value = elapsed;
    cinematicPass.uniforms.uTime.value = elapsed;
  }

  function updateNodeButtons(elapsed) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const projected = new THREE.Vector3();

    nodeMeshes.forEach((group, id) => {
      const button = nodeButtons.get(id);
      if (!button) return;

      projected.copy(group.position).project(camera);
      const layout = group.userData.layout;
      const projectedX = (projected.x * 0.5 + 0.5) * width;
      const projectedY = (-projected.y * 0.5 + 0.5) * height;
      const drift = reducedMotion || isMobileViewport() ? 0 : 14;
      const blend = reducedMotion || isMobileViewport() ? 0 : 0.34;
      const anchorX = layout.labelX * width + Math.sin(elapsed * 0.32 + layout.phase) * drift;
      const anchorY = layout.labelY * height + Math.cos(elapsed * 0.27 + layout.phase) * drift;
      const x = clamp(lerp(anchorX, projectedX, blend), 120, width - 120);
      const y = clamp(lerp(anchorY, projectedY, blend), 84, height - 72);
      const depthOpacity = projected.z > 1 ? 0.18 : 0.58 + Math.max(0, group.position.z / 13);

      button.style.setProperty("--node-x", `${x}px`);
      button.style.setProperty("--node-y", `${y}px`);
      button.style.setProperty("--connector-x", `${Math.round(projectedX - x)}px`);
      button.style.setProperty("--connector-y", `${Math.round(projectedY - y)}px`);
      button.style.opacity = activeSectionId && activeSectionId !== id ? "0.18" : `${clamp(depthOpacity, 0.46, 1)}`;
    });
  }

  function updateNodeMeshes(elapsed) {
    NODE_LAYOUT.forEach((layout) => {
      const group = nodeMeshes.get(layout.id);
      const position = computeNodePosition(layout, elapsed, reducedMotion || activeSectionId);
      const isHot = hoveredId === layout.id || activeSectionId === layout.id;
      const core = group.children[0];
      const halo = group.children[1];

      group.position.set(position.x, position.y, position.z);
      group.scale.setScalar(isHot ? 1.85 : 1);
      core.material.opacity = activeSectionId && activeSectionId !== layout.id ? 0.18 : isHot ? 1 : 0.82;
      halo.material.opacity = activeSectionId && activeSectionId !== layout.id ? 0.05 : isHot ? 0.36 : 0.16;
    });
  }

  function updateAccretionDust(elapsed) {
    const geometry = accretionDust.geometry;
    const positions = geometry.getAttribute("position");
    const { radii, speeds, layers, directions } = geometry.userData;
    const activeBoost = accretionDust.material.uniforms.uContactBoost.value;

    for (let i = 0; i < positions.count; i += 1) {
      const offset = i * 3;
      const spiral = (elapsed * speeds[i] * (0.35 + activeBoost * 0.4) + i * 0.013) % 1;
      const radius = radii[i] * (1 - spiral * (0.34 + activeBoost * 0.18));
      const angle = directions[i] * (elapsed * speeds[i] + spiral * 5.8) + i * 0.37;
      const vertical = layers[i] + Math.sin(angle * 1.8 + elapsed) * 0.035;
      positions.array[offset] = Math.cos(angle) * radius;
      positions.array[offset + 1] = vertical;
      positions.array[offset + 2] = Math.sin(angle) * radius * 0.68;
    }

    positions.needsUpdate = true;
  }

  function triggerBurst(sectionId) {
    const group = nodeMeshes.get(sectionId);
    if (!group) return;

    const color = colorToArray(group.userData.layout.color);
    const colors = burstParticles.geometry.getAttribute("aColor");
    for (let i = 0; i < colors.count; i += 1) {
      colors.setXYZ(i, color[0], color[1], color[2]);
    }
    colors.needsUpdate = true;
    burstParticles.userData.origin.copy(group.position);
    burstParticles.userData.startedAt = lastElapsed;
    burstParticles.userData.active = true;
    burstParticles.material.uniforms.uFade.value = 1;
  }

  function updateBurstParticles(elapsed) {
    const { active, duration, origin, startedAt } = burstParticles.userData;
    const positions = burstParticles.geometry.getAttribute("position");

    if (!active) {
      burstParticles.material.uniforms.uFade.value = 0;
      return;
    }

    const age = elapsed - startedAt;
    const progress = clamp(age / duration, 0, 1);
    const fade = 1 - progress;
    const seeds = burstParticles.geometry.getAttribute("aSeed");

    for (let i = 0; i < positions.count; i += 1) {
      const seed = seeds.getX(i);
      const angle = seed * TAU + progress * 5.8;
      const spread = 0.18 + progress * (1.8 + (i % 7) * 0.08);
      const lift = Math.sin(seed + progress * TAU) * 0.42 * fade;
      positions.setXYZ(
        i,
        origin.x + Math.cos(angle) * spread,
        origin.y + lift,
        origin.z + Math.sin(angle) * spread
      );
    }

    positions.needsUpdate = true;
    burstParticles.material.uniforms.uFade.value = fade;

    if (progress >= 1) {
      burstParticles.userData.active = false;
    }
  }

  function animateContactParticles(elapsed) {
    const geometry = contactParticles.geometry;
    const positions = geometry.getAttribute("position");
    const seeds = geometry.getAttribute("aSeed");
    const active = contactParticles.userData.active;
    const amplitude = active ? 1 : 0.12;

    for (let i = 0; i < positions.count; i += 1) {
      const seed = seeds.getX(i);
      const ring = 0.8 + (i % 11) * 0.14;
      const angle = seed + elapsed * (active ? 1.1 : 0.16) + i * 0.018;
      const layer = ((i % 17) - 8) * 0.045;
      positions.setXYZ(
        i,
        Math.cos(angle) * ring * amplitude,
        Math.sin(angle * 1.7) * 0.55 * amplitude + layer,
        Math.sin(angle) * ring * amplitude
      );
    }

    positions.needsUpdate = true;
    contactParticles.rotation.y = elapsed * 0.25;
  }

  function renderFrame(timestamp) {
    if (!running) return;
    rafId = window.requestAnimationFrame(renderFrame);

    timer.update(timestamp);
    const elapsed = timer.getElapsed();
    const delta = timer.getDelta();
    lastElapsed = elapsed;

    singularity.rotation.y = elapsed * (reducedMotion ? 0.035 : 0.12);
    horizonShell.rotation.y = elapsed * 0.05;
    innerDisk.rotation.z = elapsed * (reducedMotion ? 0.06 : 0.42) + 0.08;
    outerDisk.rotation.z = -elapsed * (reducedMotion ? 0.04 : 0.25) - 0.1;
    starField.rotation.y = elapsed * (reducedMotion ? 0.0015 : 0.009);
    starField.rotation.x = Math.sin(elapsed * 0.08) * 0.02;

    updateShaderUniforms(elapsed);
    updateNodeMeshes(elapsed);
    updateAccretionDust(elapsed);
    updateBurstParticles(elapsed);
    animateContactParticles(elapsed);
    updateNodeButtons(elapsed);
    composer.render(delta);
  }

  function setHoveredSection(id) {
    hoveredId = id;
  }

  function setContactParticles(active) {
    contactParticles.userData.active = active;
    root.classList?.toggle("contact-field-active", active);
    const targetBoost = active ? 1 : 0;
    const targetBloom = active && !reducedMotion ? currentBloomProfile().strength + 0.16 : currentBloomProfile().strength;
    const targetAberration = active
      ? POST_PROCESSING.shaderPass.contactAberration
      : POST_PROCESSING.shaderPass.aberration;

    gsap.to(contactParticles.material.uniforms.uFade, {
      value: active ? 0.92 : 0,
      duration: reducedMotion ? 0.01 : 0.55,
      ease: "power2.out"
    });
    gsap.to(contactParticles.material.uniforms.uContactBoost, {
      value: targetBoost,
      duration: reducedMotion ? 0.01 : 0.55,
      ease: "power2.out"
    });
    gsap.to(accretionDust.material.uniforms.uContactBoost, {
      value: targetBoost,
      duration: reducedMotion ? 0.01 : 0.7,
      ease: "power2.out"
    });
    gsap.to(starField.material.uniforms.uContactBoost, {
      value: active ? 0.32 : 0,
      duration: reducedMotion ? 0.01 : 0.7,
      ease: "power2.out"
    });
    gsap.to(bloomPass, {
      strength: targetBloom,
      duration: reducedMotion ? 0.01 : 0.5,
      ease: "power2.out"
    });
    gsap.to(cinematicPass.uniforms.uAberration, {
      value: reducedMotion ? 0 : targetAberration,
      duration: reducedMotion ? 0.01 : 0.45,
      ease: "power2.out"
    });
  }

  function selectSection(id) {
    activeSectionId = id;
    root.classList?.add("is-distorting");
    triggerBurst(id);
    const node = nodeMeshes.get(id);
    const target = node ? node.position : new THREE.Vector3();

    gsap.to(cinematicPass.uniforms.uAberration, {
      value: reducedMotion ? 0 : POST_PROCESSING.shaderPass.diveAberration,
      duration: reducedMotion ? 0.01 : 0.22,
      yoyo: true,
      repeat: 1,
      ease: "power2.inOut"
    });
    gsap.to(camera.position, {
      x: target.x * 0.18,
      y: target.y * 0.35 + 0.6,
      z: reducedMotion ? 10 : 5.4,
      duration: reducedMotion ? 0.01 : TRANSITIONS.diveMs / 1000,
      ease: "power3.inOut",
      onComplete: () => root.classList?.remove("is-distorting")
    });
  }

  function focusSection(id) {
    activeSectionId = id;
    setContactParticles(id === "contact");
  }

  function returnToOrbit() {
    activeSectionId = null;
    hoveredId = null;
    setContactParticles(false);
    root.classList?.remove("is-distorting", "contact-field-active");
    gsap.to(camera.position, {
      x: 0,
      y: 1.1,
      z: 11.5,
      duration: reducedMotion ? 0.01 : TRANSITIONS.returnMs / 1000,
      ease: "power3.out"
    });
  }

  function handlePointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickMeshes, false);
    hoveredId = hits[0]?.object?.userData?.sectionId ?? null;
    canvas.style.cursor = hoveredId ? "pointer" : "default";

    if (!reducedMotion && !activeSectionId) {
      gsap.to(camera.rotation, {
        x: pointer.y * 0.045,
        y: -pointer.x * 0.06,
        duration: 0.6,
        overwrite: true
      });
      gsap.to(singularity.rotation, {
        x: pointer.y * 0.035,
        duration: 0.8,
        overwrite: true
      });
    }
  }

  function handleClick() {
    if (hoveredId) {
      onNodeSelect?.(hoveredId);
    }
  }

  function start() {
    if (running) return;
    running = true;
    resize();
    cinematicPass.uniforms.uAberration.value = reducedMotion ? 0 : POST_PROCESSING.shaderPass.aberration;

    if (!reducedMotion) {
      gsap.fromTo(camera.position, { z: 18 }, { z: 11.5, duration: TRANSITIONS.introMs / 1000, ease: "power3.out" });
      gsap.fromTo(horizonShell.material.uniforms.uPhotonRing, { value: 0 }, { value: 1, duration: 1.2, ease: "power2.out" });
      gsap.fromTo(innerDisk.material.uniforms.uOpacity, { value: 0 }, { value: 0.96, duration: 1.35, ease: "power2.out" });
    } else {
      camera.position.z = 11.5;
      innerDisk.material.uniforms.uOpacity.value = 0.7;
      outerDisk.material.uniforms.uOpacity.value = 0.38;
    }

    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("click", handleClick);
    window.addEventListener("resize", resize);
    renderFrame();
  }

  function stop() {
    running = false;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function dispose() {
    stop();
    canvas.removeEventListener("pointermove", handlePointerMove);
    canvas.removeEventListener("click", handleClick);
    window.removeEventListener("resize", resize);
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(camera.rotation);
    gsap.killTweensOf(singularity.rotation);
    timer.dispose();
    composer.dispose();
    renderer.dispose();
    scene.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose?.());
      } else {
        object.material?.dispose?.();
      }
    });
  }

  return {
    start,
    stop,
    resize,
    setHoveredSection,
    selectSection,
    focusSection,
    returnToOrbit,
    dispose
  };
}
