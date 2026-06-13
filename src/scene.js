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

const SCHWARZSCHILD_SHADOW_FACTOR = (3 * Math.sqrt(3)) / 2;
const SINGULARITY_VIEW_TILT = Object.freeze({
  x: -Math.PI * 0.055,
  y: 0,
  z: Math.PI * 0.014
});
const DISK_VIEW_INCLINATION = Math.PI * 0.36;
const DISK_PLANE_TILT = -Math.PI * 0.035;

const relativisticBlackHoleVertexShader = `
  varying vec2 vLocalPosition;

  void main() {
    vLocalPosition = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const relativisticBlackHoleFragmentShader = `
  uniform float uTime;
  uniform float uEventHorizonRadius;
  uniform float uPhotonSphereRadius;
  uniform float uShadowRadius;
  uniform float uDiskInnerRadius;
  uniform float uDiskOuterRadius;
  uniform float uInclination;
  uniform float uSpinPhase;
  uniform float uOpacity;
  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;

  varying vec2 vLocalPosition;

  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash2(i + vec2(0.0, 0.0)), hash2(i + vec2(1.0, 0.0)), u.x),
      mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float keplerianBeta(float radius) {
    return clamp(sqrt(uEventHorizonRadius / (2.0 * max(radius, uDiskInnerRadius))), 0.0, 0.82);
  }

  float dopplerFactor(float radius, float azimuth) {
    float beta = keplerianBeta(radius);
    float gamma = inversesqrt(max(0.001, 1.0 - beta * beta));
    float lineOfSight = sin(uInclination) * cos(azimuth + uSpinPhase);
    float doppler = 1.0 / max(0.16, gamma * (1.0 - beta * lineOfSight));
    return pow(doppler, 3.0);
  }

  float diskWindow(float radius) {
    float innerEdge = smoothstep(uDiskInnerRadius, uDiskInnerRadius + uEventHorizonRadius * 0.14, radius);
    float outerEdge = 1.0 - smoothstep(uDiskOuterRadius - uEventHorizonRadius * 0.36, uDiskOuterRadius, radius);
    return innerEdge * outerEdge;
  }

  vec4 diskEmission(vec2 diskPoint, float lensWeight, float underside) {
    float radius = length(diskPoint);
    float azimuth = atan(diskPoint.y, diskPoint.x);
    float orbitSpeed = keplerianBeta(radius);
    float doppler = dopplerFactor(radius, azimuth);
    float gravitationalRedshift = sqrt(max(0.08, 1.0 - uEventHorizonRadius / max(radius, uEventHorizonRadius * 1.04)));
    float temperature = pow(uDiskInnerRadius / max(radius, uDiskInnerRadius), 0.75);
    float turbulence = noise2(vec2(azimuth * 3.2 + uTime * 0.25, radius * 5.2 - uTime * 0.42));
    float filament = sin(azimuth * 28.0 + uTime * (2.0 + orbitSpeed * 4.0) + radius * 6.0) * 0.5 + 0.5;
    float tightFilament = smoothstep(0.52, 1.0, sin(azimuth * 58.0 - uTime * 0.75 + radius * 15.0) * 0.5 + 0.5);
    vec3 color = mix(uOuterColor, uInnerColor, clamp(temperature * 1.18 + turbulence * 0.22 + underside * 0.12, 0.0, 1.0));
    color += vec3(1.0, 0.78, 0.28) * pow(temperature, 2.6) * (0.64 + doppler * 0.24);
    float alpha = diskWindow(radius) * lensWeight * (0.24 + temperature * 0.66 + filament * 0.22 + tightFilament * 0.18 + turbulence * 0.1);
    return vec4(color * gravitationalRedshift * doppler, alpha);
  }

  void main() {
    vec2 p = vLocalPosition;
    float screenRadius = length(p);
    float cosInclination = max(0.18, cos(uInclination));
    vec2 directDiskPoint = vec2(p.x, p.y / cosInclination);
    vec4 directDisk = diskEmission(directDiskPoint, 1.0, 0.0);
    float diskPlaneProfile = exp(-pow(p.y / (uEventHorizonRadius * 0.46), 2.0));
    directDisk.a *= 0.16 + diskPlaneProfile * 0.84;
    directDisk.rgb *= mix(vec3(1.0, 0.42, 0.14), vec3(1.0, 0.92, 0.68), diskPlaneProfile);

    float lensRing = exp(-pow((screenRadius - uShadowRadius * 1.06) / (uEventHorizonRadius * 0.32), 2.0));
    float farSideHump = exp(-pow((abs(p.y) - uShadowRadius * 0.62) / (uEventHorizonRadius * 0.52), 2.0));
    float radialLens = exp(-pow((screenRadius - uShadowRadius * 1.14) / (uEventHorizonRadius * 0.7), 2.0));
    float foldedY = abs(abs(p.y) - uShadowRadius * 0.58) + uDiskInnerRadius * 0.26;
    vec2 lensedDiskPoint = vec2(p.x, foldedY / cosInclination);
    vec4 lensedDisk = diskEmission(lensedDiskPoint, max(lensRing, farSideHump * radialLens * 0.9), 1.0);

    float azimuth = atan(p.y, p.x);
    float beamDoppler = dopplerFactor(max(length(vec2(p.x, uDiskInnerRadius * 0.35)), uDiskInnerRadius), azimuth);
    float approachingBoost = smoothstep(0.06, 1.0, cos(azimuth + uSpinPhase));
    float diskBeamAxis = p.y + p.x * 0.115;
    float diskBeamThickness = uEventHorizonRadius * 0.46;
    float broadDiskGlow = exp(-pow(diskBeamAxis / (uEventHorizonRadius * 0.82), 2.0));
    float equatorialBeam = exp(-pow(diskBeamAxis / diskBeamThickness, 2.0));
    equatorialBeam *= smoothstep(uShadowRadius * 0.45, uShadowRadius * 0.88, abs(p.x));
    equatorialBeam *= 1.0 - smoothstep(uDiskOuterRadius * 1.78, uDiskOuterRadius * 2.0, abs(p.x));
    broadDiskGlow *= smoothstep(uShadowRadius * 0.38, uShadowRadius * 0.76, abs(p.x));
    broadDiskGlow *= 1.0 - smoothstep(uDiskOuterRadius * 1.72, uDiskOuterRadius * 2.05, abs(p.x));
    float beamCore = exp(-pow(diskBeamAxis / (uEventHorizonRadius * 0.18), 2.0));
    float beamFilaments = 0.58 + 0.42 * smoothstep(0.48, 1.0, sin(p.x * 22.0 - uTime * 2.3 + noise2(vec2(p.x * 2.2, uTime * 0.18)) * 3.0) * 0.5 + 0.5);

    float radialUpperArc = exp(-pow((screenRadius - uShadowRadius * 1.18) / (uEventHorizonRadius * 0.2), 2.0));
    radialUpperArc *= smoothstep(-uEventHorizonRadius * 0.18, uShadowRadius * 0.42, p.y);
    float upperArcSpan = abs(p.x) / (uDiskOuterRadius * 0.78);
    float upperArcHeight = uShadowRadius * (0.48 + 0.92 * sqrt(max(0.0, 1.0 - upperArcSpan * upperArcSpan)));
    float archedUpperArc = exp(-pow((p.y - upperArcHeight) / (uEventHorizonRadius * 0.13), 2.0));
    archedUpperArc *= 1.0 - smoothstep(0.96, 1.08, upperArcSpan);
    archedUpperArc *= smoothstep(-uEventHorizonRadius * 0.1, uShadowRadius * 0.45, p.y);
    float upperLensingArc = max(radialUpperArc * 0.64, archedUpperArc);
    upperLensingArc *= 0.66 + 0.34 * smoothstep(0.34, 1.0, sin(azimuth * 54.0 + screenRadius * 8.0 - uTime * 0.7) * 0.5 + 0.5);

    float feedStreamMask = smoothstep(uEventHorizonRadius * 0.12, uShadowRadius * 1.5, p.y);
    feedStreamMask *= 1.0 - smoothstep(uDiskOuterRadius * 0.88, uDiskOuterRadius * 1.58, abs(p.x));
    float feedCurve = p.y - (uShadowRadius * 0.82 + sin(p.x * 1.65 + uTime * 0.22) * uEventHorizonRadius * 0.22 - abs(p.x) * 0.08);
    float topFeedStream = exp(-pow(feedCurve / (uEventHorizonRadius * 0.26), 2.0)) * feedStreamMask;
    float feedCurtain = smoothstep(uEventHorizonRadius * 0.08, uShadowRadius * 1.24, p.y);
    feedCurtain *= 1.0 - smoothstep(uDiskOuterRadius * 0.68, uDiskOuterRadius * 1.4, abs(p.x));
    feedCurtain *= exp(-pow((screenRadius - uShadowRadius * 1.1) / (uEventHorizonRadius * 0.58), 2.0));
    feedCurtain *= 0.42 + 0.58 * smoothstep(0.32, 1.0, sin(p.x * 16.0 + p.y * 4.2 - uTime * 1.1) * 0.5 + 0.5);
    topFeedStream += feedCurtain * 1.24;
    topFeedStream += upperLensingArc * smoothstep(uShadowRadius * 0.36, uShadowRadius * 1.56, p.y) * 1.08;
    topFeedStream *= 0.62 + 0.38 * smoothstep(0.34, 1.0, sin(azimuth * 36.0 + screenRadius * 13.0 - uTime * 1.4) * 0.5 + 0.5);

    float duplicatedLightArc = exp(-pow((screenRadius - uShadowRadius * 1.46) / (uEventHorizonRadius * 0.055), 2.0));
    duplicatedLightArc *= smoothstep(-uEventHorizonRadius * 0.34, uShadowRadius * 0.34, p.y);
    duplicatedLightArc *= 0.52 + 0.48 * smoothstep(0.36, 1.0, sin(azimuth * 42.0 + screenRadius * 10.0 - uTime * 0.18) * 0.5 + 0.5);
    float lensedStarSmear = duplicatedLightArc * (0.36 + 0.64 * smoothstep(0.68, 1.0, noise2(vec2(azimuth * 18.0, screenRadius * 12.0 + uTime * 0.04))));

    float rimChroma = exp(-pow((screenRadius - uShadowRadius * 0.98) / (uEventHorizonRadius * 0.16), 2.0));
    rimChroma *= 0.72 + 0.28 * sin(azimuth * 8.0 + uTime * 1.1);

    float tailAxis = p.y - p.x * 0.1;
    float tailSpread = mix(uEventHorizonRadius * 0.22, uEventHorizonRadius * 0.88, smoothstep(uDiskOuterRadius * 0.55, uDiskOuterRadius * 1.72, abs(p.x)));
    float plasmaTail = exp(-pow(tailAxis / tailSpread, 2.0));
    plasmaTail *= smoothstep(uDiskOuterRadius * 0.52, uDiskOuterRadius * 1.18, abs(p.x));
    plasmaTail *= 1.0 - smoothstep(uDiskOuterRadius * 1.7, uDiskOuterRadius * 2.0, abs(p.x));
    plasmaTail *= 0.44 + 0.56 * noise2(vec2(p.x * 1.55 - uTime * 0.28, p.y * 4.4 + uTime * 0.16));

    float tidalFilaments = exp(-pow(p.y / (uEventHorizonRadius * 0.09), 2.0));
    tidalFilaments *= smoothstep(uShadowRadius * 0.76, uDiskOuterRadius * 0.98, abs(p.x));
    tidalFilaments *= 1.0 - smoothstep(uDiskOuterRadius * 1.66, uDiskOuterRadius * 1.98, abs(p.x));
    tidalFilaments *= 0.38 + 0.62 * smoothstep(0.42, 1.0, sin(abs(p.x) * 44.0 - uTime * 1.55 + noise2(vec2(p.x * 4.0, p.y * 12.0)) * 2.2) * 0.5 + 0.5);

    float denseHorizonDust = exp(-pow((screenRadius - uShadowRadius * 1.08) / (uEventHorizonRadius * 0.38), 2.0));
    denseHorizonDust *= 0.54 + 0.46 * noise2(vec2(azimuth * 22.0 - uTime * 0.6, screenRadius * 8.0));

    float photonWidth = max(0.025, uEventHorizonRadius * 0.08);
    float photon = exp(-pow((screenRadius - uShadowRadius) / photonWidth, 2.0));
    float sphereGlow = exp(-pow((screenRadius - uPhotonSphereRadius) / (uEventHorizonRadius * 0.5), 2.0)) * 0.16;
    float shadow = 1.0 - smoothstep(uShadowRadius * 0.965, uShadowRadius * 1.035, screenRadius);
    float shadowCutout = smoothstep(uShadowRadius * 0.42, uShadowRadius * 0.72, screenRadius);
    float hardVoid = 1.0 - smoothstep(uShadowRadius * 0.48, uShadowRadius * 0.72, screenRadius);
    float voidCutout = 1.0 - smoothstep(uShadowRadius * 0.72, uShadowRadius * 1.02, screenRadius);

    vec3 photonColor = vec3(1.0, 0.62, 0.24) * photon * (1.0 + sin(uTime * 2.0) * 0.1);
    vec3 lensColor = lensedDisk.rgb * lensedDisk.a * 0.92;
    vec3 diskColor = directDisk.rgb * directDisk.a * (1.0 - shadow * 0.82) * 0.9;
    vec3 beamColor = vec3(1.0, 0.88, 0.34) * (equatorialBeam * 1.45 + beamCore * 0.78 + broadDiskGlow * 0.72) * beamFilaments * shadowCutout;
    beamColor *= 0.68 + beamDoppler * 0.16 + approachingBoost * 0.42;
    vec3 upperArcColor = vec3(1.0, 0.62, 0.3) * upperLensingArc * 1.9;
    vec3 starSmearColor = mix(vec3(0.38, 0.7, 1.0), vec3(1.0, 0.66, 0.92), smoothstep(-0.4, 0.8, sin(azimuth * 3.0))) * lensedStarSmear * 0.72;
    vec3 rimColor = mix(vec3(0.14, 0.5, 1.0), vec3(1.0, 0.28, 0.78), smoothstep(-0.45, 0.7, sin(azimuth * 2.0 - uTime * 0.35))) * rimChroma * 1.02;
    vec3 tailColor = vec3(1.0, 0.12, 0.03) * plasmaTail * 1.35 + vec3(1.0, 0.5, 0.12) * plasmaTail * equatorialBeam * 1.7;
    vec3 tidalColor = vec3(1.0, 0.78, 0.36) * tidalFilaments * (0.58 + approachingBoost * 0.56);
    vec3 upperFeedColor = (vec3(1.0, 0.7, 0.28) * topFeedStream * 3.25 + vec3(1.0, 0.22, 0.06) * topFeedStream * denseHorizonDust * 2.1) * shadowCutout;
    vec3 color = tailColor + diskColor + lensColor + beamColor + upperArcColor + upperFeedColor + starSmearColor + photonColor + rimColor + tidalColor + vec3(0.36, 0.62, 1.0) * sphereGlow;
    float shadowObscuration = clamp(shadow * 0.98 * (1.0 - lensedDisk.a * 0.62 - equatorialBeam * 0.38 - rimChroma * 0.24), 0.0, 1.0);
    color = mix(color, vec3(0.0), shadowObscuration);
    color = mix(color, vec3(0.0), hardVoid);
    float alpha = max(max(directDisk.a, lensedDisk.a), max(photon * 0.9, shadow * 0.98));
    alpha = max(alpha, max(voidCutout * 0.98, max(max(equatorialBeam * shadowCutout, broadDiskGlow * 0.46), max(upperLensingArc * 0.86, max(topFeedStream * 0.94, max(denseHorizonDust * 0.36, max(plasmaTail * 0.62, max(lensedStarSmear * 0.54, tidalFilaments * 0.48))))))));
    gl_FragColor = vec4(color, alpha * uOpacity);
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
    float depthScale = 92.0 / max(14.0, -mvPosition.z);
    gl_PointSize = clamp(aSize * uPixelRatio * depthScale * (0.82 + twinkle * 0.28 + uContactBoost * 0.28), 0.7, 9.0);
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
    uLens: { value: POST_PROCESSING.shaderPass.lensDistortion },
    uHorizonCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uHorizonRadius: { value: 0.1 },
    uHorizonShadow: { value: 0.88 },
    uAspect: { value: 1 }
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
    uniform vec2 uHorizonCenter;
    uniform float uHorizonRadius;
    uniform float uHorizonShadow;
    uniform float uAspect;

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
      float grainNoise = (random(vUv * uResolution + uTime * 34.0) - 0.5) * uGrain;
      float vignette = smoothstep(0.84, 0.16, length(centered));
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float grainMask = smoothstep(0.06, 0.78, luminance);
      color = color * mix(1.0, vignette, uVignette) + grainNoise * grainMask;
      vec2 horizonDelta = (vUv - uHorizonCenter) * vec2(uAspect, 1.0);
      float horizonDistance = length(horizonDelta);
      float horizonInner = uHorizonRadius * 0.55;
      float horizonOuter = uHorizonRadius * 1.18;
      float horizonShadow = (1.0 - smoothstep(horizonInner, horizonOuter, horizonDistance)) * uHorizonShadow;
      color *= 1.0 - horizonShadow;
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

export function computeProjectedHorizonMask({ camera, center, radius, width, height }) {
  const safeWidth = Math.max(1, width || 1);
  const safeHeight = Math.max(1, height || 1);
  const aspect = safeWidth / safeHeight;
  const projectedCenter = center.clone().project(camera);
  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const projectedEdge = center.clone().addScaledVector(cameraRight, radius).project(camera);

  return {
    center: new THREE.Vector2(projectedCenter.x * 0.5 + 0.5, projectedCenter.y * 0.5 + 0.5),
    radius: Math.max(0.012, Math.abs(projectedEdge.x - projectedCenter.x) * 0.5 * aspect),
    aspect
  };
}

function roundMetric(value) {
  return Number(value.toFixed(6));
}

export function deriveBlackHoleMetrics({ eventHorizonRadius, diskOuterRadius }) {
  const safeEventHorizonRadius = Math.max(0.01, eventHorizonRadius);
  return {
    eventHorizonRadius: roundMetric(safeEventHorizonRadius),
    photonSphereRadius: roundMetric(safeEventHorizonRadius * 1.5),
    shadowRadius: roundMetric(safeEventHorizonRadius * SCHWARZSCHILD_SHADOW_FACTOR),
    diskInnerRadius: roundMetric(safeEventHorizonRadius * 3),
    diskOuterRadius: roundMetric(Math.max(diskOuterRadius, safeEventHorizonRadius * 3.4))
  };
}

export function computeKeplerianBeta(radius, eventHorizonRadius) {
  const safeRadius = Math.max(radius, eventHorizonRadius * 1.01);
  return Math.min(0.82, Math.sqrt(eventHorizonRadius / (2 * safeRadius)));
}

export function computeDopplerBeaming({ radius, eventHorizonRadius, inclination, azimuth, exponent = 3 }) {
  const beta = computeKeplerianBeta(radius, eventHorizonRadius);
  const gamma = 1 / Math.sqrt(Math.max(0.001, 1 - beta ** 2));
  const lineOfSight = Math.sin(inclination) * Math.cos(azimuth);
  const doppler = 1 / Math.max(0.16, gamma * (1 - beta * lineOfSight));
  return doppler ** exponent;
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
    sizes[i] = 0.16 + Math.random() * 0.5;
    seeds[i] = Math.random() * 100;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  return new THREE.Points(geometry, createParticleMaterial({ opacity: 0.72 }));
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
  const topFeeds = new Float32Array(count);
  const hotCore = colorToArray("#fff0a8");
  const ember = colorToArray("#ffad4a");
  const smoke = colorToArray("#6d1f19");

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    const mix = Math.random();
    const topFeedBias = Math.random() < 0.38;
    seeds[i] = Math.random() * 100;
    radii[i] = topFeedBias ? 1.28 + Math.random() * 2.85 : 1.62 + Math.random() * 3.65;
    speeds[i] = topFeedBias ? 0.2 + Math.random() * 0.42 : 0.12 + Math.random() * 0.34;
    layers[i] = topFeedBias ? 0.18 + Math.random() * 0.46 : (Math.random() - 0.5) * 0.16;
    directions[i] = topFeedBias ? 1 : Math.random() > 0.45 ? 1 : -1;
    topFeeds[i] = topFeedBias ? 1 : 0;
    const emberMix = Math.min(1, mix * 1.28);
    const colorA = mix < 0.72 ? hotCore : ember;
    const colorB = mix < 0.72 ? ember : smoke;
    colors[index] = lerp(colorA[0], colorB[0], emberMix);
    colors[index + 1] = lerp(colorA[1], colorB[1], emberMix);
    colors[index + 2] = lerp(colorA[2], colorB[2], emberMix);
    sizes[i] = 0.16 + Math.random() * 0.42;
    if (topFeedBias) sizes[i] += 0.2 + Math.random() * 0.34;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.userData = { radii, speeds, layers, directions, topFeeds };

  const points = new THREE.Points(geometry, createParticleMaterial({ opacity: 0.26 }));
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

function createRelativisticSingularity({ metrics, inclination, reducedMotion }) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(metrics.diskOuterRadius * 3.95, metrics.diskOuterRadius * 2.05, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEventHorizonRadius: { value: metrics.eventHorizonRadius },
        uPhotonSphereRadius: { value: metrics.photonSphereRadius },
        uShadowRadius: { value: metrics.shadowRadius },
        uDiskInnerRadius: { value: metrics.diskInnerRadius },
        uDiskOuterRadius: { value: metrics.diskOuterRadius },
        uInclination: { value: inclination },
        uSpinPhase: { value: 0 },
        uOpacity: { value: reducedMotion ? 0.78 : 1 },
        uInnerColor: { value: new THREE.Color("#fff4bd") },
        uOuterColor: { value: new THREE.Color(reducedMotion ? COLORS.accretionWarm : "#ff7436") }
      },
      vertexShader: relativisticBlackHoleVertexShader,
      fragmentShader: relativisticBlackHoleFragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      depthTest: false
    })
  );

  mesh.renderOrder = 12;
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
    opacity: 0.055,
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
    opacity: 0.18,
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
  const horizonWorldCenter = new THREE.Vector3();

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
  singularity.rotation.set(SINGULARITY_VIEW_TILT.x, SINGULARITY_VIEW_TILT.y, SINGULARITY_VIEW_TILT.z);
  scene.add(singularity);

  const blackHoleMetrics = deriveBlackHoleMetrics({
    eventHorizonRadius: 0.62,
    diskOuterRadius: 3.75
  });
  const diskInclination = DISK_VIEW_INCLINATION;

  const horizonCore = new THREE.Mesh(
    new THREE.SphereGeometry(blackHoleMetrics.shadowRadius, 128, 64),
    new THREE.MeshBasicMaterial({
      color: COLORS.eventHorizon,
      transparent: true,
      opacity: 1
    })
  );
  horizonCore.renderOrder = 10;
  horizonCore.material.depthTest = false;
  horizonCore.material.depthWrite = false;
  singularity.add(horizonCore);

  const relativisticSingularity = createRelativisticSingularity({
    metrics: blackHoleMetrics,
    inclination: diskInclination,
    reducedMotion
  });
  relativisticSingularity.rotation.x = DISK_PLANE_TILT;
  singularity.add(relativisticSingularity);

  const accretionDust = createAccretionDust(getBudget("accretionDust", reducedMotion));
  accretionDust.rotation.x = DISK_PLANE_TILT;
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

  function updateHorizonMaskUniforms(width = window.innerWidth, height = window.innerHeight) {
    horizonCore.getWorldPosition(horizonWorldCenter);
    camera.updateMatrixWorld();
    const mask = computeProjectedHorizonMask({
      camera,
      center: horizonWorldCenter,
      radius: horizonCore.geometry.parameters.radius ?? 1.18,
      width,
      height
    });

    cinematicPass.uniforms.uHorizonCenter.value.copy(mask.center);
    cinematicPass.uniforms.uHorizonRadius.value = mask.radius;
    cinematicPass.uniforms.uAspect.value = mask.aspect;
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
    updateHorizonMaskUniforms(width, height);

    for (const points of [starField, accretionDust, burstParticles, contactParticles]) {
      points.material.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  function updateShaderUniforms(elapsed) {
    relativisticSingularity.material.uniforms.uTime.value = elapsed;
    relativisticSingularity.material.uniforms.uSpinPhase.value = elapsed * (reducedMotion ? 0.08 : 0.34);
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
      const drift = reducedMotion || isMobileViewport() ? 0 : activeSectionId ? 0 : 14;
      const anchorX = layout.labelX * width + Math.sin(elapsed * 0.32 + layout.phase) * drift;
      const anchorY = layout.labelY * height + Math.cos(elapsed * 0.27 + layout.phase) * drift;
      const x = clamp(anchorX, 120, width - 120);
      const y = clamp(anchorY, 84, height - 72);
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
    const { radii, speeds, layers, directions, topFeeds } = geometry.userData;
    const activeBoost = accretionDust.material.uniforms.uContactBoost.value;

    for (let i = 0; i < positions.count; i += 1) {
      const offset = i * 3;
      const feed = topFeeds[i];
      const spiral = (elapsed * speeds[i] * (0.35 + activeBoost * 0.4) + i * 0.013) % 1;
      const radius = radii[i] * (1 - spiral * (0.34 + activeBoost * 0.18 + feed * 0.22));
      const angle = directions[i] * (elapsed * speeds[i] + spiral * (5.8 + feed * 2.2)) + i * 0.37;
      const vertical = feed
        ? layers[i] * (1 - spiral * 0.74) + Math.sin(angle * 2.1 + elapsed * 1.2) * 0.055
        : layers[i] + Math.sin(angle * 1.8 + elapsed) * 0.035;
      positions.array[offset] = Math.cos(angle) * radius;
      positions.array[offset + 1] = vertical;
      positions.array[offset + 2] = Math.sin(angle) * radius * (feed ? 0.52 : 0.68);
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

    singularity.rotation.y = SINGULARITY_VIEW_TILT.y + Math.sin(elapsed * 0.2) * (reducedMotion ? 0.006 : 0.018);
    starField.rotation.y = elapsed * (reducedMotion ? 0.0015 : 0.009);
    starField.rotation.x = Math.sin(elapsed * 0.08) * 0.02;

    updateShaderUniforms(elapsed);
    updateNodeMeshes(elapsed);
    updateAccretionDust(elapsed);
    updateBurstParticles(elapsed);
    animateContactParticles(elapsed);
    updateNodeButtons(elapsed);
    updateHorizonMaskUniforms();
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
        x: SINGULARITY_VIEW_TILT.x + pointer.y * 0.018,
        z: SINGULARITY_VIEW_TILT.z - pointer.x * 0.008,
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
      gsap.fromTo(
        relativisticSingularity.material.uniforms.uOpacity,
        { value: 0 },
        { value: 1, duration: 1.35, ease: "power2.out" }
      );
    } else {
      camera.position.z = 11.5;
      relativisticSingularity.material.uniforms.uOpacity.value = 0.78;
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
