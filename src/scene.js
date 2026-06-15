import * as THREE from "three";
import * as CANNON from "cannon-es";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { Sky } from "three/addons/objects/Sky.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { gsap } from "gsap";
import {
  COLORS,
  HOUSE_OF_CARDS,
  NODE_LAYOUT,
  PARTICLE_BUDGETS,
  POST_PROCESSING,
  PERFORMANCE_LIMITS,
  TRANSITIONS
} from "./scene-config.js";

const TAU = Math.PI * 2;
const DEFAULT_LAYER = 0;
const BLOOM_LAYER = 1;
const ACCRETION_WAKE_BAND_COUNT = 16;

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
  uniform float uPlasmaFlow;
  uniform float uPlasmaShear;
  uniform float uPlasmaIntensity;
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

  float plasmaNoise(vec2 uv) {
    float value = 0.0;
    float amplitude = 0.5;
    vec2 shift = vec2(13.7, 5.1);

    for (int octave = 0; octave < 4; octave++) {
      value += noise2(uv) * amplitude;
      uv = uv * 2.04 + shift;
      amplitude *= 0.5;
    }

    return value;
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
    vec2 orbitalUv = vec2(azimuth * 0.159154943 + 0.5, radius / max(uDiskOuterRadius, 0.001));
    vec2 plasmaUvA = orbitalUv * vec2(7.4, 4.2) + vec2(uTime * uPlasmaFlow * (0.34 + orbitSpeed), -uTime * uPlasmaFlow * 0.18);
    vec2 plasmaUvB = orbitalUv * vec2(12.6, 2.8) + vec2(-uTime * uPlasmaFlow * 0.15, uTime * uPlasmaFlow * (0.24 + orbitSpeed * 0.55));
    float plasmaAdvection = plasmaNoise(plasmaUvA + vec2(noise2(plasmaUvB), noise2(plasmaUvB.yx)) * uPlasmaShear);
    float plasmaCounterflow = plasmaNoise(plasmaUvB + vec2(plasmaAdvection, 1.0 - plasmaAdvection) * uPlasmaShear * 0.72);
    float hotPlasma = smoothstep(0.56, 1.0, plasmaAdvection * 0.7 + plasmaCounterflow * 0.44) * uPlasmaIntensity * (0.34 + temperature * 0.84);
    float turbulence = mix(
      noise2(vec2(azimuth * 3.2 + uTime * 0.25, radius * 5.2 - uTime * 0.42)),
      plasmaAdvection,
      0.58
    );
    float filament = sin(azimuth * 28.0 + uTime * (2.0 + orbitSpeed * 4.0) + radius * 6.0 + plasmaAdvection * 2.8) * 0.5 + 0.5;
    float tightFilament = smoothstep(0.52, 1.0, sin(azimuth * 58.0 - uTime * 0.75 + radius * 15.0 + plasmaCounterflow * 3.2) * 0.5 + 0.5);
    vec3 color = mix(uOuterColor, uInnerColor, clamp(temperature * 1.18 + turbulence * 0.22 + underside * 0.12 + hotPlasma * 0.18, 0.0, 1.0));
    color += mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.86, 0.36), temperature) * hotPlasma * 0.42;
    color += vec3(1.0, 0.86, 0.42) * pow(temperature, 2.85) * (0.72 + doppler * 0.32);
    float alpha = diskWindow(radius) * lensWeight * (0.2 + temperature * 0.74 + filament * 0.22 + tightFilament * 0.2 + turbulence * 0.08 + hotPlasma * 0.16);
    return vec4(color * gravitationalRedshift * doppler, alpha);
  }

  void main() {
    vec2 p = vLocalPosition;
    float screenRadius = length(p);
    float cosInclination = max(0.18, cos(uInclination));
    vec2 directDiskPoint = vec2(p.x, p.y / cosInclination);
    vec4 directDisk = diskEmission(directDiskPoint, 1.0, 0.0);
    float diskPlaneProfile = exp(-pow(p.y / (uEventHorizonRadius * 0.46), 2.0));
    directDisk.a *= 0.14 + diskPlaneProfile * 0.98;
    directDisk.rgb *= mix(vec3(1.0, 0.35, 0.09), vec3(1.0, 0.94, 0.72), diskPlaneProfile);

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
    float upperLensingArc = max(radialUpperArc * 0.72, archedUpperArc * 1.18);
    upperLensingArc *= 0.72 + 0.28 * smoothstep(0.34, 1.0, sin(azimuth * 54.0 + screenRadius * 8.0 - uTime * 0.7) * 0.5 + 0.5);

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

    float lensWarp = 1.0 + 0.025 * sin(azimuth * 2.0 - 0.35) + 0.014 * sin(azimuth * 5.0 + uTime * 0.08);
    float warpedShadowRadius = uShadowRadius * lensWarp;
    float photonWidth = max(0.018, uEventHorizonRadius * 0.045);
    float photon = exp(-pow((screenRadius - warpedShadowRadius) / photonWidth, 2.0));
    float sphereGlow = exp(-pow((screenRadius - uPhotonSphereRadius) / (uEventHorizonRadius * 0.5), 2.0)) * 0.1;
    float shadow = 1.0 - smoothstep(warpedShadowRadius * 0.94, warpedShadowRadius * 1.035, screenRadius);
    float shadowCutout = smoothstep(warpedShadowRadius * 0.56, warpedShadowRadius * 0.76, screenRadius);
    float hardVoid = 1.0 - smoothstep(warpedShadowRadius * 0.58, warpedShadowRadius * 0.66, screenRadius);
    float deadCenterMask = 1.0 - smoothstep(warpedShadowRadius * 0.72, warpedShadowRadius * 0.94, screenRadius);
    float voidCutout = 1.0 - smoothstep(warpedShadowRadius * 0.62, warpedShadowRadius * 0.94, screenRadius);
    float nearEdgeSkim = exp(-pow((screenRadius - warpedShadowRadius * 0.72) / (uEventHorizonRadius * 0.09), 2.0));
    nearEdgeSkim *= equatorialBeam * (0.55 + approachingBoost * 0.74);
    nearEdgeSkim *= smoothstep(warpedShadowRadius * 0.58, warpedShadowRadius * 0.68, screenRadius);

    vec3 photonColor = vec3(1.0, 0.78, 0.36) * photon * (1.42 + sin(uTime * 2.0) * 0.06);
    vec3 lensColor = lensedDisk.rgb * lensedDisk.a * 1.02;
    vec3 diskColor = directDisk.rgb * directDisk.a * (1.0 - shadow * 0.9) * 1.06;
    vec3 beamColor = vec3(1.0, 0.88, 0.34) * (equatorialBeam * 1.45 + beamCore * 0.78 + broadDiskGlow * 0.72) * beamFilaments * shadowCutout;
    beamColor *= 0.68 + beamDoppler * 0.16 + approachingBoost * 0.42;
    vec3 upperArcColor = vec3(1.0, 0.66, 0.28) * upperLensingArc * 2.32;
    vec3 starSmearColor = mix(vec3(1.0, 0.82, 0.5), vec3(1.0, 0.42, 0.18), smoothstep(-0.4, 0.8, sin(azimuth * 3.0))) * lensedStarSmear * 0.48;
    vec3 rimColor = mix(vec3(1.0, 0.7, 0.3), vec3(1.0, 0.36, 0.12), smoothstep(-0.45, 0.7, sin(azimuth * 2.0 - uTime * 0.35))) * rimChroma * 0.9;
    vec3 tailColor = vec3(1.0, 0.12, 0.03) * plasmaTail * 1.35 + vec3(1.0, 0.5, 0.12) * plasmaTail * equatorialBeam * 1.7;
    vec3 tidalColor = vec3(1.0, 0.78, 0.36) * tidalFilaments * (0.58 + approachingBoost * 0.56);
    vec3 upperFeedColor = (vec3(1.0, 0.7, 0.28) * topFeedStream * 3.25 + vec3(1.0, 0.22, 0.06) * topFeedStream * denseHorizonDust * 2.1) * shadowCutout;
    vec3 nearEdgeSkimColor = vec3(1.0, 0.62, 0.18) * nearEdgeSkim * 1.7;
    vec3 color = tailColor + diskColor + lensColor + beamColor + upperArcColor + upperFeedColor + starSmearColor + photonColor + rimColor + tidalColor + nearEdgeSkimColor + vec3(1.0, 0.58, 0.22) * sphereGlow;
    float shadowObscuration = clamp(shadow * 0.9 * (1.0 - lensedDisk.a * 0.48 - equatorialBeam * 0.34 - rimChroma * 0.2 - nearEdgeSkim * 0.62), 0.0, 1.0);
    color = mix(color, vec3(0.0), shadowObscuration);
    color = mix(color, vec3(0.0), max(hardVoid, deadCenterMask));
    float alpha = max(max(directDisk.a, lensedDisk.a), max(photon * 0.9, shadow * 0.98));
    alpha = max(alpha, max(voidCutout, max(max(equatorialBeam * shadowCutout, broadDiskGlow * 0.46), max(upperLensingArc * 0.92, max(topFeedStream * 0.94, max(denseHorizonDust * 0.36, max(plasmaTail * 0.62, max(lensedStarSmear * 0.42, max(tidalFilaments * 0.48, nearEdgeSkim * 0.72)))))))));
    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`;

const particleVertexShader = `
  attribute float aSize;
  attribute float aSeed;
  attribute float aWakeBand;
  attribute float aWakePhase;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uContactBoost;
  uniform float uFade;
  uniform float uWakeStrength;
  uniform vec2 uHorizonCenter;
  uniform float uHorizonRadius;
  uniform float uHorizonAspect;
  uniform float uHorizonDepth;
  uniform float uHorizonOccluderDepth;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;
    float twinkle = sin(uTime * (0.8 + aSeed * 0.32) + aSeed * 12.0) * 0.5 + 0.5;
    float wakeWave = sin(uTime * 1.35 + aWakePhase + aWakeBand * 6.28318530718) * 0.5 + 0.5;
    float wakeScale = mix(1.0, 0.82 + wakeWave * 0.46, uWakeStrength);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 clipPosition = projectionMatrix * mvPosition;
    vec3 ndcPosition = clipPosition.xyz / clipPosition.w;
    vec2 particleUv = ndcPosition.xy * 0.5 + 0.5;
    vec2 horizonDelta = (particleUv - uHorizonCenter) * vec2(uHorizonAspect, 1.0);
    float normalizedHorizonDistance = length(horizonDelta) / max(0.001, uHorizonRadius);
    float behindHorizon = smoothstep(0.00012, 0.0024, ndcPosition.z - uHorizonOccluderDepth);
    float hardHorizon = (1.0 - smoothstep(0.56, 0.72, normalizedHorizonDistance)) * behindHorizon;
    float softHorizon = (1.0 - smoothstep(0.72, 1.08, normalizedHorizonDistance)) * behindHorizon;
    float horizonOcclusion = clamp(max(hardHorizon, softHorizon), 0.0, 1.0);
    float horizonVisibility = 1.0 - horizonOcclusion;
    float depthScale = 92.0 / max(14.0, -mvPosition.z);
    gl_PointSize = clamp(aSize * uPixelRatio * depthScale * (0.82 + twinkle * 0.28 + uContactBoost * 0.28) * wakeScale, 0.7, 9.0);
    vAlpha = uFade * (0.58 + twinkle * 0.42) * mix(1.0, 0.72 + wakeWave * 0.52, uWakeStrength) * horizonVisibility;
    gl_Position = clipPosition;
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

const heroParticleVertexShader = `
  uniform float amplitude;
  uniform float opacity;
  uniform float uPixelRatio;
  uniform float uTime;

  attribute vec3 displacement;
  attribute vec3 customColor;
  attribute float aSize;
  attribute float aSeed;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 newPosition = position + amplitude * displacement;

    vColor = customColor;
    vAlpha = opacity * (0.92 + sin(uTime * 1.8 + aSeed) * 0.04 + amplitude * 0.1);

    vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
    float depthScale = 112.0 / max(18.0, -mvPosition.z);
    gl_PointSize = clamp(aSize * uPixelRatio * depthScale * (1.0 + amplitude * 0.56), 0.9, 3.65);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const heroParticleFragmentShader = `
  uniform vec3 color;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    float core = smoothstep(0.48, 0.18, dist);
    float halo = smoothstep(0.52, 0.08, dist) * 0.055;
    gl_FragColor = vec4(vColor * color, (core + halo) * vAlpha);
  }
`;

const selectiveBloomCompositeShader = {
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;

    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(baseTexture, vUv);
      vec3 bloom = texture2D(bloomTexture, vUv).rgb;
      gl_FragColor = vec4(base.rgb + bloom * 0.42, base.a);
    }
  `
};

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
    uHorizonShadow: { value: 0.24 },
    uSceneTransition: { value: 0 },
    uScrollTransition: { value: 0 },
    uScrollDirection: { value: 1 },
    uTransitionCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uTransitionSeed: { value: 1 },
    uTransitionDisplacement: { value: POST_PROCESSING.shaderPass.transitionDisplacement },
    uScrollDisplacement: { value: POST_PROCESSING.shaderPass.scrollDisplacement },
    uScrollThreshold: { value: POST_PROCESSING.shaderPass.scrollThreshold },
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
    uniform float uSceneTransition;
    uniform float uScrollTransition;
    uniform float uScrollDirection;
    uniform vec2 uTransitionCenter;
    uniform float uTransitionSeed;
    uniform float uTransitionDisplacement;
    uniform float uScrollDisplacement;
    uniform float uScrollThreshold;
    uniform float uAspect;

    varying vec2 vUv;

    float random(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec2 centered = vUv - vec2(0.5);
      float radius = dot(centered, centered);
      float transitionProgress = clamp(uSceneTransition, 0.0, 1.35);
      float transitionActive = smoothstep(0.001, 0.04, transitionProgress) * (1.0 - smoothstep(1.18, 1.35, transitionProgress));
      vec2 transitionDelta = (vUv - uTransitionCenter) * vec2(uAspect, 1.0);
      float transitionDistance = length(transitionDelta);
      float transitionWidth = 0.035 + transitionProgress * 0.045;
      float transitionRing = exp(-pow((transitionDistance - transitionProgress * 0.96) / transitionWidth, 2.0)) * transitionActive;
      float frostNoise = random(floor(vUv * uResolution.xy * 0.035 + uTransitionSeed));
      float scrollProgress = smoothstep(0.0, 1.0, clamp(uScrollTransition, 0.0, 1.0));
      float scrollTransitionActive = smoothstep(0.02, 0.18, scrollProgress) * (1.0 - smoothstep(0.82, 0.98, scrollProgress));
      float scrollSettledField = scrollProgress * (1.0 - scrollTransitionActive * 0.55);
      float scrollTransitionNoise = random(floor((vUv + vec2(uTime * 0.013, -uTime * 0.009)) * uResolution.xy * 0.018 + uTransitionSeed * 0.37));
      float scrollThresholdEdge = scrollProgress - scrollTransitionNoise * 0.32 - (0.48 - vUv.y) * 0.2 * uScrollDirection;
      float scrollTransitionMask = smoothstep(-uScrollThreshold, uScrollThreshold, scrollThresholdEdge) * scrollTransitionActive;
      float scrollWarmStreak = exp(-pow((vUv.y - (0.51 + centered.x * 0.06)) / (0.055 + scrollProgress * 0.05), 2.0)) * max(scrollTransitionMask, scrollSettledField * 0.24);
      vec2 transitionDirection = normalize(transitionDelta + vec2(0.0001));
      float techDisplacement = transitionRing * uTransitionDisplacement * (0.62 + frostNoise * 0.76);
      vec2 scrollDirection = normalize(centered * vec2(uAspect, 0.72) + vec2(0.0001));
      vec2 scrollWarp = scrollDirection * uScrollDisplacement * (scrollTransitionMask * (0.36 + scrollTransitionNoise * 0.72) + scrollSettledField * 0.08);
      vec2 lensUv = vUv + centered * radius * uLens + transitionDirection * techDisplacement + scrollWarp;
      vec2 direction = normalize(centered + vec2(0.0001)) * (uAberration + transitionRing * 0.0036);
      float red = texture2D(tDiffuse, lensUv + direction).r;
      float green = texture2D(tDiffuse, lensUv).g;
      float blue = texture2D(tDiffuse, lensUv - direction).b;
      vec3 color = vec3(red, green, blue);
      float grainNoise = (random(vUv * uResolution + uTime * 34.0) - 0.5) * uGrain;
      float vignette = smoothstep(0.84, 0.16, length(centered));
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float grainMask = smoothstep(0.06, 0.78, luminance);
      color = color * mix(1.0, vignette, uVignette) + grainNoise * grainMask;
      vec3 transitionTint = mix(vec3(1.0, 0.68, 0.32), vec3(0.72, 0.86, 1.0), frostNoise);
      color = mix(color, transitionTint, transitionRing * (0.12 + frostNoise * 0.08));
      vec3 scrollTint = vec3(1.0, 0.48, 0.16) * scrollWarmStreak * (0.13 + scrollTransitionNoise * 0.06);
      color = mix(color, color * (0.96 + scrollWarmStreak * 0.12) + scrollTint, clamp(scrollTransitionMask * 0.48 + scrollSettledField * 0.1, 0.0, 0.5));
      vec2 horizonDelta = (vUv - uHorizonCenter) * vec2(uAspect, 1.0);
      float horizonDistance = length(horizonDelta);
      float horizonInner = uHorizonRadius * 0.24;
      float horizonOuter = uHorizonRadius * 0.5;
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
  const cameraForward = new THREE.Vector3();
  camera.getWorldDirection(cameraForward);
  const projectedEdge = center.clone().addScaledVector(cameraRight, radius).project(camera);
  const projectedOccluder = center.clone().addScaledVector(cameraForward, -radius).project(camera);

  return {
    center: new THREE.Vector2(projectedCenter.x * 0.5 + 0.5, projectedCenter.y * 0.5 + 0.5),
    radius: Math.max(0.012, Math.abs(projectedEdge.x - projectedCenter.x) * 0.5 * aspect),
    aspect,
    depth: projectedCenter.z,
    occluderDepth: Math.min(projectedCenter.z, projectedOccluder.z)
  };
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(0.000001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function computeNodeHorizonOcclusion({
  projectedNode,
  horizonMask,
  projectedHorizonDepth = horizonMask?.occluderDepth ?? horizonMask?.depth ?? 0,
  depthBias = 0.00012,
  depthFeather = 0.00228,
  innerRadius = 0.72,
  outerRadius = 1.08
}) {
  const center = horizonMask?.center ?? { x: 0.5, y: 0.5 };
  const safeRadius = Math.max(0.001, horizonMask?.radius ?? 0.001);
  const aspect = horizonMask?.aspect ?? 1;
  const nodeUvX = projectedNode.x * 0.5 + 0.5;
  const nodeUvY = projectedNode.y * 0.5 + 0.5;
  const dx = (nodeUvX - center.x) * aspect;
  const dy = nodeUvY - center.y;
  const normalizedDistance = Math.sqrt(dx * dx + dy * dy) / safeRadius;
  const depthDelta = projectedNode.z - projectedHorizonDepth;
  const behindFactor = smoothstep(depthBias, depthBias + depthFeather, depthDelta);
  const horizonCoverage = 1 - smoothstep(innerRadius, outerRadius, normalizedDistance);
  const hardHorizonCoverage = 1 - smoothstep(0.58, innerRadius, normalizedDistance);
  const occlusion = clamp(Math.max(hardHorizonCoverage, horizonCoverage) * behindFactor, 0, 1);

  return {
    behindHorizon: depthDelta > depthBias,
    insideHorizon: normalizedDistance <= outerRadius,
    normalizedDistance,
    occlusion,
    visibility: clamp(1 - occlusion, 0, 1)
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

export function buildHouseOfCardsLayout({
  bottomTriangles = HOUSE_OF_CARDS.bottomTriangles,
  cardHeight = HOUSE_OF_CARDS.cardHeight,
  cardThickness = HOUSE_OF_CARDS.cardThickness,
  cardColliderThickness = HOUSE_OF_CARDS.cardColliderThickness,
  cardVisualThickness = HOUSE_OF_CARDS.cardVisualThickness,
  faceInwardAngle = HOUSE_OF_CARDS.faceInwardAngle,
  leanAngle = HOUSE_OF_CARDS.leanAngle,
  tableY = HOUSE_OF_CARDS.tableY,
  triangleSpacing = HOUSE_OF_CARDS.triangleSpacing
} = {}) {
  const safeBottomTriangles = Math.max(1, Math.floor(bottomTriangles));
  const rows = [];
  const cards = [];
  const leftRotation = createHouseCardTentRotation(1, leanAngle);
  const rightRotation = createHouseCardTentRotation(-1, leanAngle);
  const localTopCenter = new THREE.Vector3(0, cardHeight * 0.5, 0);
  const localBottomCenter = new THREE.Vector3(0, -cardHeight * 0.5, 0);
  const leftTopOffset = localTopCenter.clone().applyEuler(leftRotation);
  const rightTopOffset = localTopCenter.clone().applyEuler(rightRotation);
  const leftBottomOffset = localBottomCenter.clone().applyEuler(leftRotation);
  const rightBottomOffset = localBottomCenter.clone().applyEuler(rightRotation);
  const uprightHeight = Math.max(
    leftTopOffset.y - leftBottomOffset.y,
    rightTopOffset.y - rightBottomOffset.y
  );
  const contactThickness = Math.max(cardThickness, cardVisualThickness, cardColliderThickness);
  const rowRise = uprightHeight + contactThickness * 1.05;

  for (let rowIndex = 0; rowIndex < safeBottomTriangles; rowIndex += 1) {
    const triangleCount = safeBottomTriangles - rowIndex;
    const baseY = tableY + rowIndex * rowRise;
    const apexY = baseY + uprightHeight;
    const rowStartX = -((triangleCount - 1) * triangleSpacing) * 0.5;
    rows.push({ rowIndex, triangleCount, baseY, apexY });

    for (let columnIndex = 0; columnIndex < triangleCount; columnIndex += 1) {
      const centerX = rowStartX + columnIndex * triangleSpacing;
      const apex = new THREE.Vector3(centerX, apexY, 0);
      const common = { rowIndex, columnIndex };
      cards.push({
        ...common,
        id: `r${rowIndex}-c${columnIndex}-left`,
        kind: "leaning",
        side: "left",
        position: apex.clone().sub(leftTopOffset),
        rotation: cloneEuler(leftRotation)
      });
      cards.push({
        ...common,
        id: `r${rowIndex}-c${columnIndex}-right`,
        kind: "leaning",
        side: "right",
        position: apex.clone().sub(rightTopOffset),
        rotation: cloneEuler(rightRotation)
      });
    }

    for (let bridgeIndex = 0; bridgeIndex < triangleCount - 1; bridgeIndex += 1) {
      cards.push({
        id: `r${rowIndex}-b${bridgeIndex}`,
        kind: "bridge",
        rowIndex,
        columnIndex: bridgeIndex,
        position: new THREE.Vector3(rowStartX + (bridgeIndex + 0.5) * triangleSpacing, apexY + contactThickness * 0.52, 0),
        rotation: new THREE.Euler(Math.PI * 0.5, 0, Math.PI * 0.5)
      });
    }
  }

  const bounds = computeHouseCardLayoutBounds(cards, {
    cardWidth: HOUSE_OF_CARDS.cardWidth,
    cardHeight,
    cardVisualThickness
  });

  return {
    rows,
    cards,
    rowRise,
    width: bounds.width,
    height: bounds.maxY - tableY + contactThickness,
    depth: bounds.depth
  };
}

function cloneEuler(euler) {
  return new THREE.Euler(euler.x, euler.y, euler.z, euler.order);
}

function createHouseCardTentRotation(depthSign, leanAngle) {
  const tentYaw = Math.PI * 0.5;
  const yawAxis = new THREE.Vector3(0, 1, 0);
  const widthAxis = new THREE.Vector3(-depthSign, 0, 0).applyAxisAngle(yawAxis, tentYaw);
  const heightAxis = new THREE.Vector3(
    0,
    Math.cos(leanAngle),
    -depthSign * Math.sin(leanAngle)
  ).applyAxisAngle(yawAxis, tentYaw);
  const normalAxis = new THREE.Vector3().crossVectors(widthAxis, heightAxis).normalize();
  const rotationMatrix = new THREE.Matrix4().makeBasis(widthAxis, heightAxis, normalAxis);
  return new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromRotationMatrix(rotationMatrix)
  );
}

function computeHouseCardLayoutBounds(cards, {
  cardWidth,
  cardHeight,
  cardVisualThickness
}) {
  const halfWidth = cardWidth * 0.5;
  const halfHeight = cardHeight * 0.5;
  const halfThickness = cardVisualThickness * 0.5;
  const corner = new THREE.Vector3();
  const rotatedCorner = new THREE.Vector3();
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };

  for (const card of cards) {
    for (const x of [-halfWidth, halfWidth]) {
      for (const y of [-halfHeight, halfHeight]) {
        for (const z of [-halfThickness, halfThickness]) {
          corner.set(x, y, z);
          rotatedCorner.copy(corner).applyEuler(card.rotation).add(card.position);
          bounds.minX = Math.min(bounds.minX, rotatedCorner.x);
          bounds.maxX = Math.max(bounds.maxX, rotatedCorner.x);
          bounds.minY = Math.min(bounds.minY, rotatedCorner.y);
          bounds.maxY = Math.max(bounds.maxY, rotatedCorner.y);
          bounds.minZ = Math.min(bounds.minZ, rotatedCorner.z);
          bounds.maxZ = Math.max(bounds.maxZ, rotatedCorner.z);
        }
      }
    }
  }

  return {
    ...bounds,
    width: bounds.maxX - bounds.minX,
    depth: bounds.maxZ - bounds.minZ
  };
}

export function applyPlayingCardBend(geometry, bend = 0.018, twist = 0) {
  const paperBasePositions = geometry.userData.paperBasePositions;
  const positionAttribute = geometry.attributes.position;
  if (!paperBasePositions || !positionAttribute) return geometry;

  const width = geometry.userData.paperWidth ?? HOUSE_OF_CARDS.cardWidth;
  const height = geometry.userData.paperHeight ?? HOUSE_OF_CARDS.cardHeight;
  const positions = positionAttribute.array;
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;

  for (let i = 0; i < positions.length; i += 3) {
    const baseX = paperBasePositions[i];
    const baseY = paperBasePositions[i + 1];
    const baseZ = paperBasePositions[i + 2];
    const xRatio = clamp(baseX / halfWidth, -1, 1);
    const yRatio = clamp(baseY / halfHeight, -1, 1);
    const centerLift = 1 - yRatio * yRatio;
    const crossCurl = xRatio * xRatio - 0.38;
    const cornerMemory = Math.abs(xRatio * yRatio);

    positions[i] = baseX + xRatio * Math.abs(bend) * 0.012 * centerLift;
    positions[i + 1] = baseY + yRatio * Math.abs(twist) * 0.01 * (1 - Math.abs(xRatio));
    positions[i + 2] = baseZ
      + centerLift * bend
      + crossCurl * bend * 0.26
      + xRatio * yRatio * twist
      + cornerMemory * bend * 0.08;
  }

  geometry.computeVertexNormals();
  positionAttribute.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
  return geometry;
}

export function createFlexiblePlayingCardGeometry({
  width = HOUSE_OF_CARDS.cardWidth,
  height = HOUSE_OF_CARDS.cardHeight,
  thickness = HOUSE_OF_CARDS.cardVisualThickness,
  bend = 0.018,
  twist = 0,
  clothInspiredSegments = { width: 8, height: 24, thickness: 2 }
} = {}) {
  const geometry = new THREE.BoxGeometry(
    width,
    height,
    thickness,
    clothInspiredSegments.width,
    clothInspiredSegments.height,
    clothInspiredSegments.thickness
  );
  const positionAttribute = geometry.attributes.position;
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  geometry.userData.paperWidth = width;
  geometry.userData.paperHeight = height;
  geometry.userData.paperThickness = thickness;
  geometry.userData.clothInspiredSegments = clothInspiredSegments;
  geometry.userData.paperBasePositions = new Float32Array(positionAttribute.array);
  applyPlayingCardBend(geometry, bend, twist);
  geometry.computeBoundingBox();
  return geometry;
}

let ammoPhysicsRuntimePromise = null;

function ammoWasmUrl() {
  if (typeof window === "undefined") return "ammo.wasm.wasm";
  return new URL("ammo.wasm.wasm", window.location.href).href;
}

function ammoScriptUrl() {
  if (typeof window === "undefined") return "ammo.wasm.js";
  return new URL("ammo.wasm.js", window.location.href).href;
}

function loadAmmoScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Ammo soft-card physics requires a browser runtime"));
  }
  if (typeof window.Ammo === "function") {
    return Promise.resolve(window.Ammo);
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-ammo-soft-card-runtime="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.Ammo), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load ammo.wasm.js")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = ammoScriptUrl();
    script.async = true;
    script.dataset.ammoSoftCardRuntime = "true";
    script.onload = () => resolve(window.Ammo);
    script.onerror = () => reject(new Error("Failed to load ammo.wasm.js"));
    document.head.appendChild(script);
  });
}

export async function loadAmmoPhysicsRuntime() {
  if (ammoPhysicsRuntimePromise) return ammoPhysicsRuntimePromise;

  ammoPhysicsRuntimePromise = loadAmmoScript().then((AmmoFactory) => AmmoFactory({
    locateFile(path) {
      return path === "ammo.wasm.wasm" ? ammoWasmUrl() : path;
    }
  })).then((Ammo) => {
    const gravityConstant = HOUSE_OF_CARDS.gravity;
    const margin = 0.05;
    const collisionConfiguration = new Ammo.btSoftBodyRigidBodyCollisionConfiguration();
    const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
    const broadphase = new Ammo.btDbvtBroadphase();
    const solver = new Ammo.btSequentialImpulseConstraintSolver();
    const softBodySolver = new Ammo.btDefaultSoftBodySolver();
    const physicsWorld = new Ammo.btSoftRigidDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration, softBodySolver);
    physicsWorld.setGravity(new Ammo.btVector3(0, gravityConstant, 0));
    physicsWorld.getWorldInfo().set_m_gravity(new Ammo.btVector3(0, gravityConstant, 0));

    return {
      Ammo,
      physicsWorld,
      softBodyHelpers: new Ammo.btSoftBodyHelpers(),
      transformAux1: new Ammo.btTransform(),
      margin,
      softBodies: new Set()
    };
  });

  return ammoPhysicsRuntimePromise;
}

function createAmmoSoftCardGeometry() {
  const geometry = new THREE.PlaneGeometry(
    HOUSE_OF_CARDS.cardWidth,
    HOUSE_OF_CARDS.cardHeight,
    8,
    24
  );
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  return geometry;
}

function createAmmoSoftCardPatch(body, runtime) {
  if (body.ammoSoftBody || !body.mesh) return body.ammoSoftBody;

  const { Ammo, physicsWorld, softBodyHelpers, margin, softBodies } = runtime;
  const clothWidth = HOUSE_OF_CARDS.cardWidth;
  const clothHeight = HOUSE_OF_CARDS.cardHeight;
  const clothNumSegmentsZ = 8;
  const clothNumSegmentsY = 24;
  const halfWidth = clothWidth * 0.5;
  const halfHeight = clothHeight * 0.5;
  const clothCorner00 = new Ammo.btVector3(-halfWidth, halfHeight, 0);
  const clothCorner01 = new Ammo.btVector3(halfWidth, halfHeight, 0);
  const clothCorner10 = new Ammo.btVector3(-halfWidth, -halfHeight, 0);
  const clothCorner11 = new Ammo.btVector3(halfWidth, -halfHeight, 0);
  const ammoSoftBody = softBodyHelpers.CreatePatch(
    physicsWorld.getWorldInfo(),
    clothCorner00,
    clothCorner01,
    clothCorner10,
    clothCorner11,
    clothNumSegmentsZ + 1,
    clothNumSegmentsY + 1,
    0,
    true
  );
  const sbConfig = ammoSoftBody.get_m_cfg();
  sbConfig.set_viterations(10);
  sbConfig.set_piterations(10);

  ammoSoftBody.setTotalMass(body.kind === "bridge" ? 0.28 : 0.34, false);
  Ammo.castObject(ammoSoftBody, Ammo.btCollisionObject).getCollisionShape().setMargin(margin * 3);
  physicsWorld.addSoftBody(ammoSoftBody, 1, -1);
  ammoSoftBody.setActivationState(4);

  const previousGeometry = body.mesh.geometry;
  body.mesh.geometry = createAmmoSoftCardGeometry();
  previousGeometry?.dispose?.();
  body.ammoSoftBody = ammoSoftBody;
  body.ammoRuntime = runtime;
  softBodies.add(body);
  return ammoSoftBody;
}

function requestAmmoSoftCardPatch(body) {
  if (typeof window === "undefined" || body.ammoSoftBody || body.ammoRuntimePending) return;

  body.ammoRuntimePending = true;
  loadAmmoPhysicsRuntime()
    .then((runtime) => {
      body.ammoRuntimePending = false;
      if (!body.removing || !body.mesh) return;
      createAmmoSoftCardPatch(body, runtime);
    })
    .catch((error) => {
      body.ammoRuntimePending = false;
      console.warn("Ammo soft-card physics failed to initialize", error);
    });
}

function updateAmmoSoftCardGeometry(body) {
  const ammoSoftBody = body.ammoSoftBody;
  const geometry = body.mesh?.geometry;
  if (!ammoSoftBody || !geometry?.attributes?.position) return;

  const clothPositions = geometry.attributes.position.array;
  const numVerts = clothPositions.length / 3;
  const nodes = ammoSoftBody.get_m_nodes();
  let indexFloat = 0;

  for (let i = 0; i < numVerts; i += 1) {
    const node = nodes.at(i);
    const nodePos = node.get_m_x();
    clothPositions[indexFloat++] = nodePos.x();
    clothPositions[indexFloat++] = nodePos.y();
    clothPositions[indexFloat++] = nodePos.z();
  }

  geometry.computeVertexNormals();
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
}

function stepAmmoSoftCardPhysics(body, delta) {
  if (!body.ammoRuntime || !body.ammoSoftBody) return false;

  body.ammoRuntime.physicsWorld.stepSimulation(delta, 10);
  updateAmmoSoftCardGeometry(body);
  return true;
}

function disposeAmmoSoftCardPatch(body) {
  if (!body.ammoRuntime || !body.ammoSoftBody) return;

  body.ammoRuntime.physicsWorld.removeSoftBody(body.ammoSoftBody);
  body.ammoRuntime.softBodies.delete(body);
  body.ammoSoftBody = null;
  body.ammoRuntime = null;
}

function copyThreeVectorToCannon(source, target) {
  target.set(source.x, source.y, source.z);
}

function copyCannonVectorToThree(source, target) {
  target.set(source.x, source.y, source.z);
}

function setCannonQuaternionFromEuler(target, euler) {
  const quaternion = new THREE.Quaternion().setFromEuler(euler);
  target.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
}

function copyCannonQuaternionToThree(source, target) {
  target.set(source.x, source.y, source.z, source.w);
}

function createHouseCardsPhysicsWorld(cards, {
  gravity = HOUSE_OF_CARDS.gravity,
  tableY = HOUSE_OF_CARDS.tableY
} = {}) {
  const physicsWorld = new CANNON.World({
    gravity: new CANNON.Vec3(0, gravity, 0)
  });
  physicsWorld.allowSleep = true;
  physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
  physicsWorld.solver.iterations = 18;
  physicsWorld.solver.tolerance = 0.0008;

  const cardPhysicsMaterial = new CANNON.Material("house-card");
  const tablePhysicsMaterial = new CANNON.Material("picnic-table");
  physicsWorld.defaultContactMaterial.friction = 0.42;
  physicsWorld.defaultContactMaterial.restitution = 0.04;
  physicsWorld.addContactMaterial(new CANNON.ContactMaterial(cardPhysicsMaterial, tablePhysicsMaterial, {
    friction: 0.86,
    restitution: 0.035,
    contactEquationStiffness: 1e7,
    contactEquationRelaxation: 4
  }));
  physicsWorld.addContactMaterial(new CANNON.ContactMaterial(cardPhysicsMaterial, cardPhysicsMaterial, {
    friction: 0.58,
    restitution: 0.025,
    contactEquationStiffness: 1e7,
    contactEquationRelaxation: 5
  }));

  const minX = Math.min(...cards.map((card) => card.position.x)) - HOUSE_OF_CARDS.cardHeight * 0.65;
  const maxX = Math.max(...cards.map((card) => card.position.x)) + HOUSE_OF_CARDS.cardHeight * 0.65;
  const tableBody = new CANNON.Body({
    mass: 0,
    material: tablePhysicsMaterial,
    shape: new CANNON.Box(new CANNON.Vec3(
      Math.max(2, (maxX - minX) * 0.5 + 0.55),
      HOUSE_OF_CARDS.picnicTableTopThickness * 0.5,
      HOUSE_OF_CARDS.picnicTableDepth * 0.5
    ))
  });
  tableBody.position.set(0, tableY - HOUSE_OF_CARDS.picnicTableTopThickness * 0.5, 0);
  physicsWorld.addBody(tableBody);

  return {
    physicsWorld,
    cardPhysicsMaterial,
    tableBody
  };
}

export function createHouseCardPhysicsBodies(cards, {
  gravity = HOUSE_OF_CARDS.gravity,
  tableY = HOUSE_OF_CARDS.tableY,
  cardThickness = HOUSE_OF_CARDS.cardThickness,
  cardColliderThickness = HOUSE_OF_CARDS.cardColliderThickness
} = {}) {
  const { physicsWorld, cardPhysicsMaterial, tableBody } = createHouseCardsPhysicsWorld(cards, {
    gravity,
    tableY
  });
  const halfExtents = new CANNON.Vec3(
    HOUSE_OF_CARDS.cardWidth * 0.5,
    HOUSE_OF_CARDS.cardHeight * 0.5,
    cardColliderThickness * 0.5
  );
  const cardShape = new CANNON.Box(halfExtents);
  const bodies = cards.map((card, index) => {
    const mass = card.kind === "bridge" ? 0.44 : 0.56;
    const cannonBody = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      material: cardPhysicsMaterial,
      linearDamping: 0.035,
      angularDamping: 0.055,
      allowSleep: true
    });
    cannonBody.addShape(cardShape);
    copyThreeVectorToCannon(card.position, cannonBody.position);
    setCannonQuaternionFromEuler(cannonBody.quaternion, card.rotation);
    cannonBody.sleepSpeedLimit = 0.06;
    cannonBody.sleepTimeLimit = 0.18;
    physicsWorld.addBody(cannonBody);
    cannonBody.sleep();

    return {
      id: card.id,
      kind: card.kind,
      side: card.side,
      rowIndex: card.rowIndex,
      columnIndex: card.columnIndex,
      mesh: null,
      mass,
      awake: false,
      propagated: false,
      manualCollapse: false,
      dragging: false,
      removing: false,
      removed: false,
      ammoRuntimePending: false,
      ammoRuntime: null,
      ammoSoftBody: null,
      removalAge: 0,
      removalDuration: 0.95,
      collapseAge: 0,
      collapseDelay: 0,
      initialPaperBend: card.kind === "bridge" ? 0.01 : 0.017 + (index % 5) * 0.0014,
      paperBend: card.kind === "bridge" ? 0.01 : 0.017 + (index % 5) * 0.0014,
      paperTwist: 0,
      gravity,
      groundY: tableY + Math.max(cardThickness, cardColliderThickness) * 0.5,
      initialPosition: card.position.clone(),
      initialRotation: cloneEuler(card.rotation),
      initialQuaternion: new THREE.Quaternion().setFromEuler(card.rotation),
      position: card.position.clone(),
      rotation: cloneEuler(card.rotation),
      quaternion: new THREE.Quaternion().setFromEuler(card.rotation),
      velocity: new THREE.Vector3(0, 0, 0),
      angularVelocity: new THREE.Vector3(0, 0, 0),
      cannonBody,
      seed: index * 0.61803398875
    };
  });
  bodies.physicsWorld = physicsWorld;
  bodies.tableBody = tableBody;
  bodies.cardPhysicsMaterial = cardPhysicsMaterial;
  return bodies;
}

function syncHouseCardBody(body) {
  if (body.cannonBody) {
    copyCannonVectorToThree(body.cannonBody.position, body.position);
    copyCannonQuaternionToThree(body.cannonBody.quaternion, body.quaternion);
    copyCannonVectorToThree(body.cannonBody.velocity, body.velocity);
    copyCannonVectorToThree(body.cannonBody.angularVelocity, body.angularVelocity);
    body.rotation.setFromQuaternion(body.quaternion);
    body.awake = body.cannonBody.sleepState !== CANNON.Body.SLEEPING;
    if (body.mesh) {
      body.mesh.position.copy(body.position);
      body.mesh.quaternion.copy(body.quaternion);
    }
    return;
  }

  body.mesh?.position.copy(body.position);
  body.mesh?.rotation.copy(body.rotation);
}

function resetHouseCardBody(body) {
  body.awake = false;
  body.propagated = false;
  body.manualCollapse = false;
  body.dragging = false;
  body.removing = false;
  body.removed = false;
  body.ammoRuntimePending = false;
  body.removalAge = 0;
  body.collapseAge = 0;
  body.collapseDelay = 0;
  body.position.copy(body.initialPosition);
  body.rotation.copy(body.initialRotation);
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  if (body.quaternion) {
    body.quaternion.copy(body.initialQuaternion);
  }
  if (body.cannonBody) {
    copyThreeVectorToCannon(body.initialPosition, body.cannonBody.position);
    setCannonQuaternionFromEuler(body.cannonBody.quaternion, body.initialRotation);
    freezeCannonHouseCardBody(body);
  }
  if (body.mesh) {
    body.mesh.visible = true;
    body.mesh.userData.removingHouseCard = false;
    if (body.ammoSoftBody) {
      body.mesh.geometry?.dispose?.();
      body.mesh.geometry = createFlexiblePlayingCardGeometry({
        width: HOUSE_OF_CARDS.cardWidth,
        height: HOUSE_OF_CARDS.cardHeight,
        thickness: HOUSE_OF_CARDS.cardVisualThickness,
        bend: body.initialPaperBend,
        twist: 0
      });
    }
    setHouseCardBodyOpacity(body, 1);
    updateHouseCardPaperBend(body, 0);
  }
  disposeAmmoSoftCardPatch(body);
  syncHouseCardBody(body);
}

function setHouseCardBodyOpacity(body, multiplier) {
  body.mesh?.traverse((object) => {
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    materials.forEach((material) => {
      if (typeof material.userData.baseOpacity === "number") {
        material.opacity = material.userData.baseOpacity * multiplier;
        material.needsUpdate = true;
      }
    });
  });
}

function freezeCannonHouseCardBody(body) {
  if (!body.cannonBody) return;

  body.cannonBody.type = CANNON.Body.STATIC;
  body.cannonBody.mass = 0;
  body.cannonBody.updateMassProperties();
  body.cannonBody.collisionResponse = true;
  body.cannonBody.velocity.set(0, 0, 0);
  body.cannonBody.angularVelocity.set(0, 0, 0);
  body.cannonBody.force.set(0, 0, 0);
  body.cannonBody.torque.set(0, 0, 0);
  body.cannonBody.sleep();
  body.awake = false;
}

function activateCannonHouseCardBody(body) {
  if (!body.cannonBody || body.removed) return;

  body.cannonBody.type = CANNON.Body.DYNAMIC;
  body.cannonBody.mass = body.mass;
  body.cannonBody.updateMassProperties();
  body.cannonBody.collisionResponse = true;
  body.cannonBody.wakeUp();
  body.awake = true;
}

function applyCannonImpulse(body, impulse, contactOffset) {
  activateCannonHouseCardBody(body);
  const contactPoint = new CANNON.Vec3(
    body.cannonBody.position.x + contactOffset.x,
    body.cannonBody.position.y + contactOffset.y,
    body.cannonBody.position.z + contactOffset.z
  );
  body.cannonBody.wakeUp();
  body.cannonBody.applyImpulse(impulse, contactPoint);
  body.awake = true;
}

function activateHouseOfCardsPhysicsBodies(bodies, sourceBody = null) {
  bodies.forEach((body) => {
    if (!body.cannonBody || body.removed) return;
    if (sourceBody && body !== sourceBody && !shouldReleaseHouseCardAfterRemoval(body, sourceBody)) return;

    body.manualCollapse = false;
    body.removing = false;
    body.dragging = body.dragging ?? false;
    body.propagated = true;
    body.mesh && (body.mesh.visible = true);
    setHouseCardBodyOpacity(body, 1);
    activateCannonHouseCardBody(body);
    body.cannonBody.force.set(0, 0, 0);
    body.cannonBody.torque.set(0, 0, 0);
  });
}

export function beginHouseCardDrag(
  bodies,
  targetBody,
  localPoint = targetBody?.position,
  {
    maxForce = 42
  } = {}
) {
  if (!bodies?.physicsWorld || !targetBody?.cannonBody || targetBody.removed || targetBody.removing) {
    return null;
  }

  activateHouseOfCardsPhysicsBodies(bodies, targetBody);
  const physicsWorld = bodies.physicsWorld;
  const anchorPoint = localPoint?.clone?.() ?? targetBody.position.clone();
  const anchorBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.KINEMATIC,
    collisionResponse: false
  });
  copyThreeVectorToCannon(anchorPoint, anchorBody.position);
  physicsWorld.addBody(anchorBody);

  const cannonAnchorPoint = new CANNON.Vec3(anchorPoint.x, anchorPoint.y, anchorPoint.z);
  const pivotA = targetBody.cannonBody.pointToLocalFrame(cannonAnchorPoint, new CANNON.Vec3());
  const pivotB = new CANNON.Vec3(0, 0, 0);
  const constraint = new CANNON.PointToPointConstraint(targetBody.cannonBody, pivotA, anchorBody, pivotB, maxForce);
  physicsWorld.addConstraint(constraint);

  targetBody.dragging = true;
  targetBody.awake = true;
  targetBody.removing = false;
  targetBody.removed = false;
  targetBody.cannonBody.collisionResponse = true;
  targetBody.cannonBody.wakeUp();

  const dragState = {
    bodies,
    targetBody,
    anchorBody,
    constraint,
    active: true,
    lastPoint: anchorPoint.clone(),
    targetPoint: anchorPoint.clone(),
    velocity: new THREE.Vector3()
  };
  bodies.activeDrag = dragState;
  return dragState;
}

export function updateHouseCardDrag(dragState, localPoint, deltaTime = 1 / 60) {
  if (!dragState?.active || !dragState.anchorBody || !localPoint) return false;

  const delta = clamp(deltaTime, 1 / 240, 1 / 20);
  dragState.targetPoint.copy(localPoint);
  dragState.velocity.copy(dragState.targetPoint).sub(dragState.lastPoint).multiplyScalar(1 / delta);
  dragState.anchorBody.position.set(
    dragState.targetPoint.x,
    dragState.targetPoint.y,
    dragState.targetPoint.z
  );
  dragState.anchorBody.velocity.set(
    dragState.velocity.x,
    dragState.velocity.y,
    dragState.velocity.z
  );
  dragState.anchorBody.wakeUp();
  dragState.targetBody?.cannonBody?.wakeUp();
  dragState.targetBody && (dragState.targetBody.awake = true);
  dragState.lastPoint.copy(dragState.targetPoint);
  return true;
}

export function endHouseCardDrag(dragState) {
  if (!dragState?.active) return false;

  const { bodies, targetBody, anchorBody, constraint } = dragState;
  const physicsWorld = bodies?.physicsWorld;
  if (physicsWorld && constraint) {
    physicsWorld.removeConstraint(constraint);
  }
  if (physicsWorld && anchorBody) {
    physicsWorld.removeBody(anchorBody);
  }
  if (targetBody?.cannonBody) {
    targetBody.cannonBody.velocity.y = Math.min(targetBody.cannonBody.velocity.y, 0.18);
    targetBody.cannonBody.angularVelocity.x *= 0.82;
    targetBody.cannonBody.angularVelocity.z *= 0.82;
    targetBody.cannonBody.wakeUp();
    targetBody.awake = true;
    targetBody.dragging = false;
    copyCannonVectorToThree(targetBody.cannonBody.velocity, targetBody.velocity);
    copyCannonVectorToThree(targetBody.cannonBody.angularVelocity, targetBody.angularVelocity);
    targetBody.cannonBody.collisionResponse = true;
  }
  if (bodies?.activeDrag === dragState) {
    bodies.activeDrag = null;
  }
  dragState.active = false;
  return true;
}

function shouldReleaseHouseCardAfterRemoval(body, sourceBody) {
  if (body === sourceBody || body.removed || body.removing) return false;
  if (body.rowIndex < sourceBody.rowIndex) return false;

  const rowDelta = body.rowIndex - sourceBody.rowIndex;
  const sourceX = sourceBody.initialPosition.x;
  const horizontalDistance = Math.abs(body.initialPosition.x - sourceX);
  const supportConeReach = HOUSE_OF_CARDS.triangleSpacing * (0.72 + rowDelta * 0.52);
  const sameTriangle = rowDelta === 0 && body.columnIndex === sourceBody.columnIndex;
  const nearbyBridge = rowDelta === 0
    && body.kind === "bridge"
    && Math.abs((body.columnIndex ?? 0) - (sourceBody.columnIndex ?? 0)) <= 1;

  return sameTriangle || nearbyBridge || horizontalDistance <= supportConeReach;
}

function releaseUnsupportedHouseCards(bodies, sourceBody, pullDirection, strength) {
  const pullSign = Math.sign(pullDirection.x || sourceBody.position.x || 1);
  const depthSign = Math.sign(pullDirection.z || Math.sin(sourceBody.seed * 7.1) || 1);
  const sourceX = sourceBody.initialPosition.x;

  bodies.forEach((body) => {
    if (!shouldReleaseHouseCardAfterRemoval(body, sourceBody)) return;

    const rowDelta = Math.max(0, body.rowIndex - sourceBody.rowIndex);
    const sideSign = Math.sign(body.initialPosition.x - sourceX || pullSign);
    const horizontalDistance = Math.abs(body.initialPosition.x - sourceX);
    const rowWeight = 1 + rowDelta * 0.025;
    const stagger = clamp(rowDelta * 0.045 + horizontalDistance * 0.018, 0, 0.22);
    const upperCascadeFalloff = rowDelta <= 2 ? 1 : 1 / (1 + (rowDelta - 2) * 2.8);
    const collapseScale = strength * (body.kind === "bridge" ? 0.008 : 0.011) * rowWeight * upperCascadeFalloff;

    body.manualCollapse = false;
    body.awake = true;
    body.propagated = true;
    body.collapseAge = 0;
    body.collapseDelay = stagger;
    body.velocity.set(
      pullDirection.x * collapseScale * 0.48 + sideSign * collapseScale * 0.12,
      0.015 - rowDelta * 0.006,
      depthSign * collapseScale * 0.22 + Math.sin(body.seed * 6.7) * 0.01
    );
    body.angularVelocity.set(
      depthSign * (0.18 + rowDelta * 0.026 + Math.abs(pullDirection.z) * 0.12),
      -sideSign * (0.018 + rowDelta * 0.006),
      -sideSign * (0.14 + rowDelta * 0.025) - pullSign * 0.03
    );

    if (body.cannonBody) {
      activateCannonHouseCardBody(body);
      copyThreeVectorToCannon(body.position, body.cannonBody.position);
      copyThreeVectorToCannon(body.velocity, body.cannonBody.velocity);
      copyThreeVectorToCannon(body.angularVelocity, body.cannonBody.angularVelocity);
      body.cannonBody.force.set(0, 0, 0);
      body.cannonBody.torque.set(0, 0, 0);
      body.cannonBody.wakeUp();
      const impulseScale = strength * (body.kind === "bridge" ? 0.006 : 0.009) * rowWeight * upperCascadeFalloff;
      const impulse = new CANNON.Vec3(
        pullDirection.x * impulseScale + sideSign * impulseScale * 0.18,
        Math.max(0.015, pullDirection.y + 0.01) * impulseScale,
        depthSign * impulseScale * (0.18 + Math.abs(pullDirection.z) * 0.22)
      );
      const contactOffset = new CANNON.Vec3(
        -sideSign * HOUSE_OF_CARDS.cardWidth * 0.32,
        HOUSE_OF_CARDS.cardHeight * (body.kind === "bridge" ? 0.08 : 0.28),
        depthSign * HOUSE_OF_CARDS.cardColliderThickness * 0.85
      );
      applyCannonImpulse(body, impulse, contactOffset);
      syncHouseCardBody(body);
    }
  });
}

export function removeHouseCardFromStack(
  bodies,
  targetBody,
  direction = new THREE.Vector3(1, 0.04, 0.12),
  {
    strength = HOUSE_OF_CARDS.knockStrength
  } = {}
) {
  if (!targetBody || targetBody.removing || targetBody.removed) return false;

  const pullDirection = direction.clone();
  if (pullDirection.lengthSq() < 0.0001) {
    pullDirection.set(targetBody.position.x >= 0 ? 1 : -1, 0.04, 0.14);
  }
  pullDirection.normalize();

  targetBody.removing = true;
  targetBody.removed = true;
  targetBody.removalAge = 0;
  targetBody.awake = true;
  targetBody.propagated = true;
  targetBody.mesh?.userData && (targetBody.mesh.userData.removingHouseCard = true);
  requestAmmoSoftCardPatch(targetBody);

  if (targetBody.cannonBody) {
    targetBody.cannonBody.collisionResponse = false;
    targetBody.cannonBody.sleep();
    const pullScale = strength * (targetBody.kind === "bridge" ? 0.12 : 0.16);
    targetBody.velocity.set(
      pullDirection.x * pullScale,
      0.12 + Math.max(0, pullDirection.y) * pullScale * 0.1,
      pullDirection.z * pullScale * 0.68
    );
    targetBody.angularVelocity.set(
      Math.sign(pullDirection.z || 1) * strength * 0.46,
      -Math.sign(pullDirection.x || 1) * strength * 0.16,
      -Math.sign(pullDirection.x || 1) * strength * 0.28
    );
    copyThreeVectorToCannon(targetBody.velocity, targetBody.cannonBody.velocity);
    copyThreeVectorToCannon(targetBody.angularVelocity, targetBody.cannonBody.angularVelocity);
  } else {
    targetBody.velocity.addScaledVector(pullDirection, strength * 0.18 / targetBody.mass);
    targetBody.angularVelocity.x += Math.sign(pullDirection.z || 1) * strength * 0.34;
  }

  releaseUnsupportedHouseCards(bodies, targetBody, pullDirection, strength);
  syncHouseCardBody(targetBody);
  return true;
}

function updateHouseCardRemovalState(body, delta) {
  if (!body.removing) return;

  const removalDelta = clamp(delta, 0, 1 / 30);
  const removalProgress = clamp(body.removalAge / body.removalDuration, 0, 1);
  body.velocity.y += body.gravity * 0.34 * removalDelta;
  body.position.addScaledVector(body.velocity, removalDelta);
  body.rotation.x += body.angularVelocity.x * removalDelta;
  body.rotation.y += body.angularVelocity.y * removalDelta;
  body.rotation.z += body.angularVelocity.z * removalDelta;
  body.velocity.multiplyScalar(0.992);
  body.angularVelocity.multiplyScalar(0.988);
  if (body.quaternion) {
    body.quaternion.setFromEuler(body.rotation);
  }
  if (body.cannonBody) {
    copyThreeVectorToCannon(body.position, body.cannonBody.position);
    setCannonQuaternionFromEuler(body.cannonBody.quaternion, body.rotation);
    copyThreeVectorToCannon(body.velocity, body.cannonBody.velocity);
    copyThreeVectorToCannon(body.angularVelocity, body.cannonBody.angularVelocity);
  }
  if (body.mesh) {
    body.mesh.position.copy(body.position);
    body.mesh.quaternion.copy(body.quaternion ?? new THREE.Quaternion().setFromEuler(body.rotation));
  }
  if (!stepAmmoSoftCardPhysics(body, removalDelta)) {
    updateHouseCardPaperBend(body, removalProgress);
  }

  body.removalAge += delta;
  const fade = 1 - smoothstep(body.removalDuration * 0.38, body.removalDuration, body.removalAge);
  setHouseCardBodyOpacity(body, fade);
  if (body.removalAge >= body.removalDuration) {
    body.removing = false;
    body.awake = false;
    body.mesh && (body.mesh.visible = false);
    if (body.cannonBody) {
      body.cannonBody.velocity.set(0, 0, 0);
      body.cannonBody.angularVelocity.set(0, 0, 0);
      body.cannonBody.sleep();
    }
    disposeAmmoSoftCardPatch(body);
  }
}

function updateManualHouseCardCollapse(body, delta) {
  if (!body.manualCollapse || body.removed || body.removing) return false;

  body.collapseAge += delta;
  if (body.collapseAge < body.collapseDelay) {
    return true;
  }

  const collapseDelta = clamp(delta, 0, 1 / 30);
  const activeAge = body.collapseAge - body.collapseDelay;
  const gravityScale = body.kind === "bridge" ? 0.58 : 0.72;
  const flutter = Math.sin(activeAge * 5.2 + body.seed * 3.7);
  const depthFlutter = Math.cos(activeAge * 4.6 + body.seed * 4.1);

  body.velocity.y += body.gravity * gravityScale * collapseDelta;
  body.velocity.x += flutter * 0.018 * collapseDelta;
  body.velocity.z += depthFlutter * 0.014 * collapseDelta;
  body.position.addScaledVector(body.velocity, collapseDelta);
  body.rotation.x += body.angularVelocity.x * collapseDelta;
  body.rotation.y += body.angularVelocity.y * collapseDelta;
  body.rotation.z += body.angularVelocity.z * collapseDelta;
  body.velocity.multiplyScalar(body.kind === "bridge" ? 0.991 : 0.989);
  body.angularVelocity.multiplyScalar(body.kind === "bridge" ? 0.987 : 0.984);

  if (body.position.y < body.groundY) {
    const impactSpeed = Math.abs(Math.min(0, body.velocity.y));
    const sideSign = Math.sign(body.velocity.x || body.position.x - body.initialPosition.x || Math.sin(body.seed) || 1);
    const depthSign = Math.sign(body.velocity.z || Math.cos(body.seed) || 1);
    body.position.y = body.groundY;
    if (body.velocity.y < 0) {
      body.velocity.y *= -0.08;
    }
    body.velocity.x *= 0.74;
    body.velocity.z *= 0.76;
    body.angularVelocity.x += depthSign * Math.min(1.9, impactSpeed * 0.18 + Math.abs(body.velocity.z) * 0.16);
    body.angularVelocity.y += -sideSign * Math.min(0.42, impactSpeed * 0.035);
    body.angularVelocity.z *= 0.82;
  }

  if (body.quaternion) {
    body.quaternion.setFromEuler(body.rotation);
  }
  if (body.cannonBody) {
    copyThreeVectorToCannon(body.position, body.cannonBody.position);
    setCannonQuaternionFromEuler(body.cannonBody.quaternion, body.rotation);
    copyThreeVectorToCannon(body.velocity, body.cannonBody.velocity);
    copyThreeVectorToCannon(body.angularVelocity, body.cannonBody.angularVelocity);
    body.cannonBody.sleep();
  }
  if (body.mesh) {
    body.mesh.position.copy(body.position);
    body.mesh.quaternion.copy(body.quaternion ?? new THREE.Quaternion().setFromEuler(body.rotation));
  }

  updateHouseCardPaperBend(body, clamp(activeAge / 1.6, 0, 1));

  if (
    activeAge > 3.2
    && body.position.y <= body.groundY + 0.001
    && body.velocity.lengthSq() < 0.004
    && body.angularVelocity.lengthSq() < 0.02
  ) {
    body.manualCollapse = false;
    body.awake = false;
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.cannonBody?.sleep();
  }

  return true;
}

function updateHouseCardPaperBend(body, removalProgress = 0) {
  if (!body.mesh?.geometry?.userData?.paperBasePositions) return;

  const flexEnvelope = Math.sin(clamp(removalProgress, 0, 1) * Math.PI);
  body.paperBend = body.initialPaperBend + flexEnvelope * (body.kind === "bridge" ? 0.035 : 0.07);
  body.paperTwist = flexEnvelope * Math.sign(body.velocity?.x || body.seed || 1) * (body.kind === "bridge" ? 0.018 : 0.042);
  applyPlayingCardBend(body.mesh.geometry, body.paperBend, body.paperTwist);
}

function applyCannonHouseOfCardsKnock(bodies, origin, impulseDirection, radius, strength) {
  let triggered = false;
  bodies.forEach((body) => {
    const distance = body.position.distanceTo(origin);
    if (distance > radius) return;

    const falloff = (1 - distance / radius) ** 1.45;
    const rowBias = 1 + (HOUSE_OF_CARDS.bottomTriangles - body.rowIndex) * 0.035;
    const depthSign = Math.sign(impulseDirection.z || Math.sin(body.seed * 5.1) || 1);
    const impulseScale = strength * falloff * rowBias * (body.kind === "bridge" ? 0.1 : 0.14);
    const sideSign = body.position.x >= origin.x ? 1 : -1;
    const impulse = new CANNON.Vec3(
      impulseDirection.x * impulseScale * 0.9,
      Math.max(0.05, impulseDirection.y) * impulseScale * 0.28,
      depthSign * impulseScale * (0.26 + Math.abs(impulseDirection.z) * 0.36)
    );
    const contactOffset = new CANNON.Vec3(
      -sideSign * HOUSE_OF_CARDS.cardWidth * 0.24,
      HOUSE_OF_CARDS.cardHeight * (body.kind === "bridge" ? 0.12 : 0.28),
      depthSign * HOUSE_OF_CARDS.cardVisualThickness * 2.1
    );

    triggered = true;
    applyCannonImpulse(body, impulse, contactOffset);
    body.cannonBody.angularVelocity.x += depthSign * strength * falloff * (body.kind === "bridge" ? 0.48 : 0.76);
    body.cannonBody.angularVelocity.y += -sideSign * depthSign * strength * falloff * 0.1;
    body.cannonBody.angularVelocity.z += -Math.sign(impulseDirection.x || sideSign) * strength * falloff * 0.22;
    syncHouseCardBody(body);
  });

  if (!triggered) return;

  const highestRow = Math.max(1, ...bodies.map((body) => body.rowIndex));
  bodies.forEach((body) => {
    if (body.awake) return;

    const rowProgress = body.rowIndex / highestRow;
    const horizontalDistance = Math.abs(body.position.x - origin.x);
    const supportFalloff = clamp(1 - horizontalDistance / (radius * 1.35), 0.18, 1);
    const cascade = supportFalloff * (0.2 + rowProgress * 0.32);
    const sideSign = body.position.x >= origin.x ? 1 : -1;
    const depthSign = Math.sign(impulseDirection.z || Math.sin(body.seed * 4.7) || 1);
    const impulseScale = strength * cascade * (body.kind === "bridge" ? 0.022 : 0.032);
    const impulse = new CANNON.Vec3(
      impulseDirection.x * impulseScale + sideSign * impulseScale * 0.2,
      impulseScale * (0.12 + rowProgress * 0.08),
      depthSign * impulseScale * 0.42
    );
    const contactOffset = new CANNON.Vec3(
      -sideSign * HOUSE_OF_CARDS.cardWidth * 0.18,
      HOUSE_OF_CARDS.cardHeight * 0.22,
      depthSign * HOUSE_OF_CARDS.cardVisualThickness * 1.8
    );

    applyCannonImpulse(body, impulse, contactOffset);
    body.cannonBody.angularVelocity.x += depthSign * strength * cascade * (body.kind === "bridge" ? 0.14 : 0.24);
    body.cannonBody.angularVelocity.y += -sideSign * depthSign * strength * cascade * 0.045;
    body.cannonBody.angularVelocity.z += -sideSign * strength * cascade * (body.kind === "bridge" ? 0.05 : 0.08);
    syncHouseCardBody(body);
  });
}

export function applyHouseOfCardsKnock(
  bodies,
  origin = new THREE.Vector3(),
  direction = new THREE.Vector3(1, 0.12, 0),
  {
    radius = HOUSE_OF_CARDS.knockRadius,
    strength = HOUSE_OF_CARDS.knockStrength
  } = {}
) {
  const impulseDirection = direction.clone();
  if (impulseDirection.lengthSq() < 0.0001) {
    impulseDirection.set(1, 0.16, 0);
  }
  impulseDirection.normalize();

  if (bodies.physicsWorld) {
    applyCannonHouseOfCardsKnock(bodies, origin, impulseDirection, radius, strength);
    return;
  }

  let triggered = false;
  bodies.forEach((body) => {
    const distance = body.position.distanceTo(origin);
    if (distance > radius) return;

    const falloff = (1 - distance / radius) ** 1.55;
    const rowBias = 1 + (HOUSE_OF_CARDS.bottomTriangles - body.rowIndex) * 0.035;
    const depthSign = Math.sign(impulseDirection.z || Math.sin(body.seed * 5.1) || 1);
    const depthImpulse = depthSign * (Math.abs(impulseDirection.z) + 0.34);
    triggered = true;
    body.awake = true;
    body.velocity.addScaledVector(impulseDirection, strength * falloff * rowBias / body.mass);
    body.velocity.z += depthImpulse * strength * falloff * (body.kind === "bridge" ? 0.18 : 0.28) / body.mass;
    body.velocity.y += strength * falloff * 0.13;
    body.angularVelocity.z += (impulseDirection.x >= 0 ? -1 : 1) * strength * falloff * (body.kind === "bridge" ? 0.34 : 0.58);
    body.angularVelocity.x += depthImpulse * strength * falloff * (body.kind === "bridge" ? 0.42 : 0.68);
    body.angularVelocity.y += (Math.cos(body.seed * 4.2) - impulseDirection.x * depthSign) * strength * falloff * 0.13;
  });

  if (!triggered) return;

  const highestRow = Math.max(1, ...bodies.map((body) => body.rowIndex));
  bodies.forEach((body) => {
    if (body.awake) return;

    const rowProgress = body.rowIndex / highestRow;
    const horizontalDistance = Math.abs(body.position.x - origin.x);
    const supportFalloff = clamp(1 - horizontalDistance / (radius * 1.34), 0.18, 1);
    const cascade = supportFalloff * (0.3 + rowProgress * 0.34);
    const sideSign = body.position.x >= origin.x ? 1 : -1;
    const depthSign = Math.sign(impulseDirection.z || Math.sin(body.seed * 4.7) || 1);
    const depthImpulse = depthSign * (0.24 + Math.abs(impulseDirection.z) * 0.7);

    body.awake = true;
    body.velocity.addScaledVector(impulseDirection, strength * cascade * 0.16 / body.mass);
    body.velocity.y += strength * cascade * (0.035 + rowProgress * 0.045);
    body.velocity.x += sideSign * strength * cascade * 0.045;
    body.velocity.z += depthImpulse * strength * cascade * 0.2 / body.mass;
    body.angularVelocity.z += -sideSign * strength * cascade * (body.kind === "bridge" ? 0.12 : 0.2);
    body.angularVelocity.x += depthImpulse * strength * cascade * (body.kind === "bridge" ? 0.22 : 0.34);
    body.angularVelocity.y += -sideSign * depthSign * strength * cascade * 0.08;
  });
}

function propagateHouseCardImpulse(bodies, sourceBody) {
  if (bodies.physicsWorld) return;

  const sourceTilt = Math.abs(sourceBody.rotation.z - sourceBody.initialRotation.z);
  if (sourceBody.propagated || sourceTilt < 0.2) return;

  sourceBody.propagated = true;
  bodies.forEach((body) => {
    if (body === sourceBody || body.awake) return;
    const rowDistance = Math.abs(body.rowIndex - sourceBody.rowIndex);
    const distance = body.position.distanceTo(sourceBody.position);
    if (rowDistance > 1 || distance > HOUSE_OF_CARDS.triangleSpacing * 1.38) return;

    const direction = body.position.clone().sub(sourceBody.position);
    if (direction.lengthSq() < 0.0001) {
      direction.set(sourceBody.position.x <= body.position.x ? 1 : -1, 0.22, 0);
    }
    direction.normalize();
    body.awake = true;
    body.velocity.addScaledVector(direction, 0.85 / body.mass);
    body.velocity.z += (sourceBody.velocity.z * 0.18 + direction.z * 0.42) / body.mass;
    body.velocity.y += 0.18;
    body.angularVelocity.z += (sourceBody.angularVelocity.z || -0.6) * 0.52;
    body.angularVelocity.x += (sourceBody.angularVelocity.x || Math.sign(sourceBody.velocity.z || 1) * 0.7) * 0.46;
    body.angularVelocity.y += (sourceBody.angularVelocity.y || direction.x * 0.35) * 0.26;
  });
}

export function stepHouseOfCardsPhysics(bodies, deltaTime, {
  gravity = HOUSE_OF_CARDS.gravity,
  damping = HOUSE_OF_CARDS.damping,
  angularDamping = HOUSE_OF_CARDS.angularDamping
} = {}) {
  const delta = clamp(deltaTime, 0, 1 / 30);

  if (bodies.physicsWorld) {
    const physicsWorld = bodies.physicsWorld;
    const hasAwakeBodies = bodies.activeDrag?.active || bodies.some((body) => (
      !body.removed
      && !body.manualCollapse
      && body.cannonBody
      && body.cannonBody.type === CANNON.Body.DYNAMIC
      && (body.awake || body.cannonBody.sleepState !== CANNON.Body.SLEEPING)
    ));
    if (hasAwakeBodies) {
      physicsWorld.step(1 / 60, delta, 8);
    }
    bodies.forEach((body) => {
      if (body.removing) {
        updateHouseCardRemovalState(body, delta);
      } else if (body.manualCollapse) {
        updateManualHouseCardCollapse(body, delta);
      } else if (!body.removed) {
        syncHouseCardBody(body);
      }
    });
    return;
  }

  bodies.forEach((body) => {
    if (body.manualCollapse) {
      updateManualHouseCardCollapse(body, delta);
      return;
    }
    if (!body.awake) return;

    body.velocity.y += gravity * delta;
    body.position.addScaledVector(body.velocity, delta);
    body.rotation.x += body.angularVelocity.x * delta;
    body.rotation.y += body.angularVelocity.y * delta;
    body.rotation.z += body.angularVelocity.z * delta;

    body.velocity.multiplyScalar(damping);
    body.angularVelocity.multiplyScalar(angularDamping);

    if (body.position.y < body.groundY) {
      const impactSpeed = Math.abs(Math.min(0, body.velocity.y));
      const depthSign = Math.sign(body.velocity.z || body.position.z - body.initialPosition.z || Math.sin(body.seed) || 1);
      body.position.y = body.groundY;
      if (body.velocity.y < 0) {
        body.velocity.y *= -0.16;
      }
      body.velocity.x *= 0.82;
      body.velocity.z *= 0.82;
      body.angularVelocity.x += depthSign * Math.min(2.4, impactSpeed * 0.42 + Math.abs(body.velocity.z) * 0.22);
      body.angularVelocity.x *= 0.9;
      body.angularVelocity.y += -Math.sign(body.velocity.x || Math.sin(body.seed) || 1) * impactSpeed * 0.08;
      body.angularVelocity.z *= 0.9;
    }

    syncHouseCardBody(body);
    updateHouseCardRemovalState(body, delta);
  });

  bodies.forEach((body) => propagateHouseCardImpulse(bodies, body));
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

function addNeutralWakeAttributes(geometry, count) {
  const wakeBands = new Float32Array(count);
  const wakePhases = new Float32Array(count);
  geometry.setAttribute("aWakeBand", new THREE.BufferAttribute(wakeBands, 1));
  geometry.setAttribute("aWakePhase", new THREE.BufferAttribute(wakePhases, 1));
}

function createParticleMaterial({ opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uContactBoost: { value: 0 },
      uFade: { value: opacity },
      uWakeStrength: { value: 0 },
      uHorizonCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uHorizonRadius: { value: 0.1 },
      uHorizonAspect: { value: 1 },
      uHorizonDepth: { value: 0 },
      uHorizonOccluderDepth: { value: 0 }
    },
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending
  });
}

function createDepthOnlyHorizonOccluder(radius) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 96, 48),
    new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true
    })
  );
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
  addNeutralWakeAttributes(geometry, count);

  return new THREE.Points(geometry, createParticleMaterial({ opacity: 0.72 }));
}

function createAccretionDust(count, reducedMotion = false) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const baseSizes = new Float32Array(count);
  const wakeBands = new Float32Array(count);
  const wakePhases = new Float32Array(count);
  const wakeWeights = new Float32Array(count);
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
    const bandIndex = i % ACCRETION_WAKE_BAND_COUNT;
    const bandProgress = bandIndex / Math.max(1, ACCRETION_WAKE_BAND_COUNT - 1);
    const bandCenter = bandProgress - 0.5;
    const bandWave = Math.sin(bandProgress * Math.PI);
    const topFeedBias = bandProgress > 0.58 || Math.random() < 0.18;
    seeds[i] = Math.random() * 100;
    wakeBands[i] = bandProgress;
    wakePhases[i] = Math.floor(i / ACCRETION_WAKE_BAND_COUNT) * 0.41 + bandIndex * 0.73;
    wakeWeights[i] = topFeedBias ? 0.92 + bandWave * 0.36 : 0.56 + bandWave * 0.32;
    radii[i] = topFeedBias
      ? 1.22 + bandWave * 2.42 + Math.random() * 0.5
      : 1.58 + bandWave * 3.22 + Math.random() * 0.66;
    speeds[i] = topFeedBias ? 0.2 + bandWave * 0.34 + Math.random() * 0.12 : 0.12 + bandWave * 0.26 + Math.random() * 0.1;
    layers[i] = topFeedBias ? 0.18 + bandProgress * 0.38 + Math.random() * 0.1 : bandCenter * 0.18 + (Math.random() - 0.5) * 0.045;
    directions[i] = topFeedBias ? 1 : bandIndex % 2 === 0 ? 1 : -1;
    topFeeds[i] = topFeedBias ? 1 : 0;
    const emberMix = Math.min(1, mix * 1.28);
    const colorA = mix < 0.72 ? hotCore : ember;
    const colorB = mix < 0.72 ? ember : smoke;
    colors[index] = lerp(colorA[0], colorB[0], emberMix);
    colors[index + 1] = lerp(colorA[1], colorB[1], emberMix);
    colors[index + 2] = lerp(colorA[2], colorB[2], emberMix);
    sizes[i] = 0.16 + Math.random() * 0.42;
    if (topFeedBias) sizes[i] += 0.2 + Math.random() * 0.34;
    baseSizes[i] = sizes[i];
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  const sizeAttribute = new THREE.BufferAttribute(sizes, 1);
  sizeAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", sizeAttribute);
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aWakeBand", new THREE.BufferAttribute(wakeBands, 1));
  geometry.setAttribute("aWakePhase", new THREE.BufferAttribute(wakePhases, 1));
  geometry.userData = { radii, speeds, layers, directions, topFeeds, baseSizes, wakeBands, wakePhases, wakeWeights };

  const points = new THREE.Points(geometry, createParticleMaterial({ opacity: 0.26 }));
  points.material.uniforms.uWakeStrength.value = reducedMotion ? 0.18 : 0.58;
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
  addNeutralWakeAttributes(geometry, count);

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
  addNeutralWakeAttributes(geometry, count);

  const particles = new THREE.Points(geometry, createParticleMaterial({ opacity: 0 }));
  particles.position.set(0, -1.1, 1.5);
  particles.userData.active = false;
  return particles;
}

function drawTrackedText(context, text, x, y, tracking = 0) {
  let offsetX = x;
  for (const character of text) {
    context.fillText(character, offsetX, y);
    offsetX += context.measureText(character).width + tracking;
  }
}

function createHeroParticleText(profile, { reducedMotion = false } = {}) {
  const textCanvas = document.createElement("canvas");
  const context = textCanvas.getContext("2d", { willReadFrequently: true });
  const canvasWidth = 1320;
  const canvasHeight = 430;
  const maxParticles = reducedMotion ? 4200 : 14500;
  const rawPoints = [];
  const color = new THREE.Color();

  textCanvas.width = canvasWidth;
  textCanvas.height = canvasHeight;
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";

  context.font = "800 30px Inter, Arial, sans-serif";
  drawTrackedText(context, profile.location.toUpperCase(), 5, 56, 5.2);
  context.font = "900 204px Inter, Arial, sans-serif";
  context.fillText(profile.name, 0, 230);
  context.font = "800 48px Inter, Arial, sans-serif";
  context.fillText(profile.headline, 3, 310);

  const image = context.getImageData(0, 0, canvasWidth, canvasHeight);
  const alpha = image.data;
  const sampleStep = reducedMotion ? 2 : 1;

  for (let y = 0; y < canvasHeight; y += sampleStep) {
    for (let x = 0; x < canvasWidth; x += sampleStep) {
      const alphaIndex = (y * canvasWidth + x) * 4 + 3;
      if (alpha[alphaIndex] > 46) {
        rawPoints.push({ x, y, alpha: alpha[alphaIndex] / 255 });
      }
    }
  }

  const stride = Math.max(1, Math.ceil(rawPoints.length / maxParticles));
  const points = rawPoints.filter((_, index) => index % stride === 0).slice(0, maxParticles);
  const count = points.length;
  const positions = new Float32Array(count * 3);
  const displacements = new Float32Array(count * 3);
  const baseDisplacements = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const customColors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const canvasAspect = canvasHeight / canvasWidth;

  points.forEach((point, index) => {
    const offset = index * 3;
    const normalizedX = point.x / canvasWidth - 0.5;
    const normalizedY = (0.5 - point.y / canvasHeight) * canvasAspect;
    const radial = Math.max(0.1, Math.hypot(normalizedX, normalizedY));
    const angle = Math.atan2(normalizedY, normalizedX) + (Math.random() - 0.5) * 0.9;
    const scatter = 0.032 + Math.random() * 0.052 + radial * 0.14;
    const displacementX = Math.cos(angle) * scatter + (Math.random() - 0.5) * 0.018;
    const displacementY = Math.sin(angle) * scatter + (Math.random() - 0.5) * 0.018;
    const displacementZ = (Math.random() - 0.5) * 0.046;
    const warmMix = point.y > 260 ? 0.34 : point.y > 80 ? 0.12 : 0;
    const coolAccent = point.y < 72 && index % 7 === 0;

    positions[offset] = normalizedX;
    positions[offset + 1] = normalizedY;
    positions[offset + 2] = (Math.random() - 0.5) * 0.012;
    displacements[offset] = displacementX;
    displacements[offset + 1] = displacementY;
    displacements[offset + 2] = displacementZ;
    baseDisplacements[offset] = displacementX;
    baseDisplacements[offset + 1] = displacementY;
    baseDisplacements[offset + 2] = displacementZ;
    phases[index] = Math.random() * TAU;
    sizes[index] = 0.52 + point.alpha * 0.88 + Math.random() * 0.12;
    seeds[index] = Math.random() * 100;

    if (coolAccent) {
      color.setRGB(0.62, 0.84, 1);
    } else {
      color.setRGB(1, 0.94 - warmMix * 0.12, 0.88 - warmMix * 0.28);
    }

    color.toArray(customColors, offset);
  });

  const geometry = new THREE.BufferGeometry();
  const displacementAttribute = new THREE.Float32BufferAttribute(displacements, 3);
  displacementAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("displacement", displacementAttribute);
  geometry.setAttribute("customColor", new THREE.Float32BufferAttribute(customColors, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.userData = { baseDisplacements, phases, canvasAspect };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      amplitude: { value: 0 },
      opacity: { value: reducedMotion ? 0.86 : 0.98 },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      color: { value: new THREE.Color(0xfff0d0) }
    },
    vertexShader: heroParticleVertexShader,
    fragmentShader: heroParticleFragmentShader,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true
  });

  const particles = new THREE.Points(geometry, material);
  particles.frustumCulled = false;
  particles.renderOrder = 2;
  particles.userData = {
    reducedMotion,
    hoveringHero: false,
    pointerActive: false,
    pointerStrength: 0,
    pointerX: 0,
    pointerY: 0,
    targetPointerX: 0,
    targetPointerY: 0
  };
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
        uPlasmaFlow: { value: reducedMotion ? 0.08 : 0.42 },
        uPlasmaShear: { value: reducedMotion ? 0.16 : 0.48 },
        uPlasmaIntensity: { value: reducedMotion ? 0.24 : 0.56 },
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

  mesh.renderOrder = 6;
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
    new THREE.SphereGeometry(0.095, 36, 18),
    new THREE.MeshBasicMaterial({
      color: layout.color,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    })
  );
  core.userData.sectionId = layout.id;
  core.renderOrder = 8;

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 36, 18),
    new THREE.MeshBasicMaterial({
      color: layout.color,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    })
  );
  halo.renderOrder = 7;

  group.add(core, halo);
  return { group, core, halo };
}

function applyPageFade(material, baseOpacity) {
  material.transparent = true;
  material.opacity = baseOpacity;
  material.userData.baseOpacity = baseOpacity;
  return material;
}

function createHouseCardMaterial(rowIndex, kind) {
  const color = kind === "bridge"
    ? new THREE.Color("#fff2d2").lerp(new THREE.Color("#e5c990"), rowIndex * 0.035)
    : new THREE.Color("#fff8e8").lerp(new THREE.Color("#dfd0b7"), rowIndex * 0.04);
  const material = new THREE.MeshPhysicalMaterial({
    color,
    emissive: new THREE.Color("#fff1d1"),
    emissiveIntensity: kind === "bridge" ? 0.008 : 0.004,
    roughness: 0.52,
    metalness: 0.02,
    clearcoat: 0.28,
    clearcoatRoughness: 0.62,
    side: THREE.DoubleSide
  });
  return applyPageFade(material, kind === "bridge" ? 0.9 : 0.96);
}

function createCardFaceDetails(body) {
  const group = new THREE.Group();
  group.name = `house-card-face-details-${body.id}`;
  const accent = body.kind === "bridge"
    ? new THREE.Color("#bf4f2f")
    : new THREE.Color(body.columnIndex % 2 === 0 ? "#2f65b9" : "#c84b38");
  const ruleColor = accent.clone().lerp(new THREE.Color("#1a2330"), 0.18);
  const borderMaterial = applyPageFade(
    new THREE.MeshBasicMaterial({
      color: accent,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    }),
    0.9
  );
  const pipMaterial = applyPageFade(
    new THREE.MeshBasicMaterial({
      color: accent.clone().lerp(new THREE.Color("#ffffff"), 0.12),
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    }),
    0.96
  );
  const grainMaterial = applyPageFade(
    new THREE.MeshBasicMaterial({
      color: "#d2bc8f",
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    }),
    0.26
  );
  const ruleMaterial = applyPageFade(
    new THREE.MeshBasicMaterial({
      color: ruleColor,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    }),
    0.78
  );
  const faceZ = HOUSE_OF_CARDS.cardVisualThickness * 0.5 + 0.045;
  const borderInsetX = HOUSE_OF_CARDS.cardWidth * 0.39;
  const borderInsetY = HOUSE_OF_CARDS.cardHeight * 0.4;
  const topBottomGeometry = new THREE.PlaneGeometry(HOUSE_OF_CARDS.cardWidth * 0.74, 0.012);
  const sideGeometry = new THREE.PlaneGeometry(0.012, HOUSE_OF_CARDS.cardHeight * 0.68);
  const innerRuleGeometry = new THREE.PlaneGeometry(HOUSE_OF_CARDS.cardWidth * 0.55, 0.008);
  const innerRuleSideGeometry = new THREE.PlaneGeometry(0.008, HOUSE_OF_CARDS.cardHeight * 0.5);
  const cornerIndexGeometry = new THREE.PlaneGeometry(0.058, 0.014);
  const cornerIndexStemGeometry = new THREE.PlaneGeometry(0.014, 0.052);
  const grainGeometry = new THREE.PlaneGeometry(HOUSE_OF_CARDS.cardWidth * 0.42, 0.004);
  const diamondShape = new THREE.Shape();
  diamondShape.moveTo(0, 0.038);
  diamondShape.lineTo(0.028, 0);
  diamondShape.lineTo(0, -0.038);
  diamondShape.lineTo(-0.028, 0);
  diamondShape.lineTo(0, 0.038);
  const pipGeometry = new THREE.ShapeGeometry(diamondShape);
  pipGeometry.name = "card-face-suit-diamond-geometry";
  const centerDiamondShape = new THREE.Shape();
  centerDiamondShape.moveTo(0, 0.068);
  centerDiamondShape.lineTo(0.052, 0);
  centerDiamondShape.lineTo(0, -0.068);
  centerDiamondShape.lineTo(-0.052, 0);
  centerDiamondShape.lineTo(0, 0.068);
  const centerSuitGeometry = new THREE.ShapeGeometry(centerDiamondShape);

  const addFacePart = (geometry, material, x, y, z, name) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 10;
    group.add(mesh);
    return mesh;
  };

  for (const z of [faceZ, -faceZ]) {
    const backSide = z < 0;
    const sideRotation = backSide ? Math.PI : 0;
    const grainOffset = body.kind === "bridge" ? 0.012 : 0;
    const parts = [
      addFacePart(topBottomGeometry, borderMaterial, 0, borderInsetY, z, "card-face-top-border"),
      addFacePart(topBottomGeometry, borderMaterial, 0, -borderInsetY, z, "card-face-bottom-border"),
      addFacePart(sideGeometry, borderMaterial, -borderInsetX, 0, z, "card-face-left-border"),
      addFacePart(sideGeometry, borderMaterial, borderInsetX, 0, z, "card-face-right-border"),
      addFacePart(innerRuleGeometry, ruleMaterial, 0, HOUSE_OF_CARDS.cardHeight * 0.31, z, "card-face-inner-rule-top"),
      addFacePart(innerRuleGeometry, ruleMaterial, 0, -HOUSE_OF_CARDS.cardHeight * 0.31, z, "card-face-inner-rule-bottom"),
      addFacePart(innerRuleSideGeometry, ruleMaterial, -HOUSE_OF_CARDS.cardWidth * 0.31, 0, z, "card-face-inner-rule-left"),
      addFacePart(innerRuleSideGeometry, ruleMaterial, HOUSE_OF_CARDS.cardWidth * 0.31, 0, z, "card-face-inner-rule-right"),
      addFacePart(cornerIndexGeometry, pipMaterial, -HOUSE_OF_CARDS.cardWidth * 0.31, HOUSE_OF_CARDS.cardHeight * 0.35, z, "card-face-corner-index-top"),
      addFacePart(cornerIndexStemGeometry, pipMaterial, -HOUSE_OF_CARDS.cardWidth * 0.35, HOUSE_OF_CARDS.cardHeight * 0.315, z, "card-face-corner-index-stem-top"),
      addFacePart(cornerIndexGeometry, pipMaterial, HOUSE_OF_CARDS.cardWidth * 0.31, -HOUSE_OF_CARDS.cardHeight * 0.35, z, "card-face-corner-index-bottom"),
      addFacePart(cornerIndexStemGeometry, pipMaterial, HOUSE_OF_CARDS.cardWidth * 0.35, -HOUSE_OF_CARDS.cardHeight * 0.315, z, "card-face-corner-index-stem-bottom"),
      addFacePart(pipGeometry, pipMaterial, -HOUSE_OF_CARDS.cardWidth * 0.18, HOUSE_OF_CARDS.cardHeight * 0.18, z, "card-face-suit-diamond-upper"),
      addFacePart(pipGeometry, pipMaterial, HOUSE_OF_CARDS.cardWidth * 0.18, -HOUSE_OF_CARDS.cardHeight * 0.18, z, "card-face-suit-diamond-lower"),
      addFacePart(centerSuitGeometry, pipMaterial, 0, 0, z, "card-face-center-suit"),
      addFacePart(grainGeometry, grainMaterial, -HOUSE_OF_CARDS.cardWidth * 0.03, HOUSE_OF_CARDS.cardHeight * 0.06 + grainOffset, z, "card-face-paper-grain-a"),
      addFacePart(grainGeometry, grainMaterial, HOUSE_OF_CARDS.cardWidth * 0.04, -HOUSE_OF_CARDS.cardHeight * 0.08 - grainOffset, z, "card-face-paper-grain-b")
    ];
    parts.forEach((part) => {
      part.rotation.y = sideRotation;
    });
    parts
      .filter((part) => part.name.includes("corner-index-bottom"))
      .forEach((part) => {
        part.rotation.z = Math.PI;
      });
    parts
      .filter((part) => part.name.includes("paper-grain"))
      .forEach((part, index) => {
        part.rotation.z = (index % 2 === 0 ? 0.018 : -0.026) + (backSide ? Math.PI : 0);
      });
  }

  return group;
}

function createSunnyPicnicSky() {
  // Adapted from three.js examples/webgpu_sky.html controls while keeping the portfolio's WebGL renderer.
  const sky = new Sky();
  sky.name = "house-of-cards-sunny-sky";
  sky.scale.setScalar(100);
  sky.renderOrder = -30;
  sky.material.depthTest = true;
  sky.material.depthWrite = false;

  const uniforms = sky.material.uniforms;
  uniforms["turbidity"].value = HOUSE_OF_CARDS.skyTurbidity;
  uniforms["rayleigh"].value = HOUSE_OF_CARDS.skyRayleigh;
  uniforms["mieCoefficient"].value = HOUSE_OF_CARDS.skyMieCoefficient;
  uniforms["mieDirectionalG"].value = HOUSE_OF_CARDS.skyMieDirectionalG;

  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(90 - HOUSE_OF_CARDS.sunElevation);
  const theta = THREE.MathUtils.degToRad(HOUSE_OF_CARDS.sunAzimuth);
  sun.setFromSphericalCoords(1, phi, theta);
  uniforms["sunPosition"].value.copy(sun);

  return { sky, sun };
}

function createCloudTexture({ coverage, density }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const softness = 0.24 + density * 0.24;
  const cloudAlpha = 0.12 + density * 0.22;
  const cloudCount = Math.round(18 + coverage * 34);

  context.clearRect(0, 0, canvas.width, canvas.height);
  const horizonGradient = context.createLinearGradient(0, canvas.height * 0.1, 0, canvas.height);
  horizonGradient.addColorStop(0, "rgba(255,255,255,0)");
  horizonGradient.addColorStop(0.58, `rgba(255,255,255,${cloudAlpha * 0.18})`);
  horizonGradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = horizonGradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < cloudCount; i += 1) {
    const u = ((i * 0.61803398875) % 1);
    const wave = Math.sin(i * 1.73) * 0.5 + 0.5;
    const x = u * canvas.width;
    const y = canvas.height * (0.18 + wave * 0.44);
    const radiusX = canvas.width * (0.055 + ((i % 5) * 0.012) + coverage * 0.02);
    const radiusY = canvas.height * (0.026 + ((i % 4) * 0.008) + density * 0.014);
    const gradient = context.createRadialGradient(x, y, radiusY * 0.15, x, y, radiusX);
    gradient.addColorStop(0, `rgba(255,255,255,${cloudAlpha})`);
    gradient.addColorStop(softness, `rgba(250,253,255,${cloudAlpha * 0.62})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.save();
    context.translate(x, y);
    context.scale(1, radiusY / radiusX);
    context.beginPath();
    context.arc(0, 0, radiusX, 0, TAU);
    context.fill();
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "house-of-cards-webgpu-cloud-texture";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(2, 1);
  texture.needsUpdate = true;
  return texture;
}

function createWebGpuInspiredCloudLayer(layout) {
  const texture = createCloudTexture({
    coverage: HOUSE_OF_CARDS.cloudCoverage,
    density: HOUSE_OF_CARDS.cloudDensity
  });
  const material = applyPageFade(
    new THREE.MeshBasicMaterial({
      map: texture,
      color: "#ffffff",
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide
    }),
    0.52
  );
  const cloudLayer = new THREE.Mesh(new THREE.SphereGeometry(92, 48, 24), material);
  cloudLayer.name = "house-of-cards-webgpu-cloud-layer";
  cloudLayer.position.y = layout.height * (0.26 + HOUSE_OF_CARDS.cloudElevation * 0.18);
  cloudLayer.renderOrder = -29;
  return cloudLayer;
}

function createCardsSunDisc(sun, layout) {
  const material = applyPageFade(
    new THREE.SpriteMaterial({
      color: "#fff6d3",
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    }),
    HOUSE_OF_CARDS.showSunDisc ? 0.42 : 0
  );
  const disc = new THREE.Sprite(material);
  disc.name = "house-of-cards-sun-disc";
  disc.position.copy(sun).multiplyScalar(42);
  disc.position.y += layout.height * 0.34;
  disc.scale.setScalar(3.6);
  disc.renderOrder = -28;
  return disc;
}

function createWoodGrainLines(tableWidth, slatDepth, slatIndex) {
  const group = new THREE.Group();
  group.name = `picnic-table-wood-grain-${slatIndex + 1}`;
  const material = applyPageFade(
    new THREE.MeshBasicMaterial({
      color: "#5f351f",
      depthWrite: false
    }),
    0.22
  );
  const lineCount = 3;

  for (let i = 0; i < lineCount; i += 1) {
    const width = tableWidth * (0.52 + ((slatIndex + i) % 3) * 0.12);
    const geometry = new THREE.BoxGeometry(width, 0.006, 0.012);
    const line = new THREE.Mesh(geometry, material);
    line.name = `picnic-table-grain-line-${slatIndex + 1}-${i + 1}`;
    line.position.set(
      tableWidth * (((i + 1) / (lineCount + 1)) - 0.5) * 0.14,
      HOUSE_OF_CARDS.picnicTableTopThickness * 0.5 + 0.004,
      -slatDepth * 0.3 + (slatDepth * 0.3 * i)
    );
    line.renderOrder = 6;
    group.add(line);
  }

  return group;
}

function createPicnicTable(layout) {
  const group = new THREE.Group();
  group.name = "house-of-cards-picnic-table";

  const tableWidth = layout.width + 1.45;
  const tableDepth = HOUSE_OF_CARDS.picnicTableDepth;
  const slatCount = HOUSE_OF_CARDS.picnicTableSlatCount;
  const slatStep = tableDepth / slatCount;
  const slatDepth = slatStep * 0.78;
  const slatGeometry = new THREE.BoxGeometry(tableWidth, HOUSE_OF_CARDS.picnicTableTopThickness, slatDepth);
  const woodColors = ["#b9783e", "#cc8f4a", "#a96534", "#d39a57"];

  for (let i = 0; i < slatCount; i += 1) {
    const material = applyPageFade(
      new THREE.MeshStandardMaterial({
        color: woodColors[i % woodColors.length],
        roughness: 0.74,
        metalness: 0.02
      }),
      0.96
    );
    const slat = new THREE.Mesh(slatGeometry, material);
    slat.name = `picnic-table-slat-${i + 1}`;
    slat.position.set(0, HOUSE_OF_CARDS.tableY - 0.105, -tableDepth * 0.5 + slatStep * (i + 0.5));
    slat.castShadow = true;
    slat.receiveShadow = true;
    slat.renderOrder = 5;
    slat.add(createWoodGrainLines(tableWidth, slatDepth, i));
    group.add(slat);
  }

  const supportMaterial = applyPageFade(
    new THREE.MeshStandardMaterial({
      color: "#80502d",
      roughness: 0.82,
      metalness: 0.01
    }),
    0.92
  );
  const beamGeometry = new THREE.BoxGeometry(tableWidth * 0.86, 0.08, 0.16);
  const frontBeam = new THREE.Mesh(beamGeometry, supportMaterial);
  frontBeam.name = "picnic-table-front-support";
  frontBeam.position.set(0, HOUSE_OF_CARDS.tableY - 0.29, tableDepth * 0.41);
  frontBeam.castShadow = true;
  frontBeam.receiveShadow = true;
  group.add(frontBeam);

  const backBeam = frontBeam.clone();
  backBeam.name = "picnic-table-back-support";
  backBeam.position.z = -tableDepth * 0.41;
  group.add(backBeam);

  const legGeometry = new THREE.BoxGeometry(0.16, 0.72, 0.14);
  const legPositions = [
    [-tableWidth * 0.4, HOUSE_OF_CARDS.tableY - 0.48, tableDepth * 0.34],
    [tableWidth * 0.4, HOUSE_OF_CARDS.tableY - 0.48, tableDepth * 0.34],
    [-tableWidth * 0.4, HOUSE_OF_CARDS.tableY - 0.48, -tableDepth * 0.34],
    [tableWidth * 0.4, HOUSE_OF_CARDS.tableY - 0.48, -tableDepth * 0.34]
  ];
  legPositions.forEach((position, index) => {
    const leg = new THREE.Mesh(legGeometry, supportMaterial);
    leg.name = `picnic-table-leg-${index + 1}`;
    leg.position.set(position[0], position[1], position[2]);
    leg.rotation.z = index % 2 === 0 ? 0.11 : -0.11;
    leg.castShadow = true;
    leg.receiveShadow = true;
    group.add(leg);
  });

  return group;
}

function createSunnyPicnicBackdrop(layout) {
  const group = new THREE.Group();
  group.name = "house-of-cards-sunny-picnic-backdrop";

  const skyPanelMaterial = applyPageFade(
    new THREE.MeshBasicMaterial({
      color: "#86c9f2",
      depthWrite: false
    }),
    0.06
  );
  const skyPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.width + 20, layout.height + 8),
    skyPanelMaterial
  );
  skyPanel.name = "picnic-sky-soft-panel";
  skyPanel.position.set(0, layout.height * 0.55, -1.6);
  skyPanel.renderOrder = -20;
  group.add(skyPanel);

  const grassMaterial = applyPageFade(
    new THREE.MeshBasicMaterial({
      color: "#5caf57",
      depthWrite: false
    }),
    0.88
  );
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    grassMaterial
  );
  grass.name = "picnic-lawn-grass";
  grass.rotation.x = -Math.PI * 0.5;
  grass.position.set(0, HOUSE_OF_CARDS.tableY - 0.58, -1.4);
  grass.receiveShadow = true;
  grass.renderOrder = -10;
  group.add(grass);

  const shadeMaterial = applyPageFade(
    new THREE.MeshBasicMaterial({
      color: "#2b5f2e",
      transparent: true,
      depthWrite: false
    }),
    0.12
  );
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(layout.width + 4.4, 1.2), shadeMaterial);
  shade.name = "picnic-table-soft-shade";
  shade.rotation.x = -Math.PI * 0.5;
  shade.position.set(0.25, HOUSE_OF_CARDS.tableY - 0.55, 0.06);
  shade.renderOrder = -8;
  group.add(shade);

  return group;
}

function createHouseOfCardsPage({ reducedMotion = false } = {}) {
  const page = new THREE.Group();
  page.name = "house-of-cards-page";
  page.position.y = HOUSE_OF_CARDS.sceneY;
  page.rotation.y = HOUSE_OF_CARDS.pageYaw;
  page.scale.setScalar(HOUSE_OF_CARDS.pageScale);
  page.visible = false;

  const layout = buildHouseOfCardsLayout({ bottomTriangles: HOUSE_OF_CARDS.bottomTriangles });
  const bodies = createHouseCardPhysicsBodies(layout.cards);
  const pickMeshes = [];

  bodies.forEach((body) => {
    const cardGeometry = createFlexiblePlayingCardGeometry({
      width: HOUSE_OF_CARDS.cardWidth,
      height: HOUSE_OF_CARDS.cardHeight,
      thickness: HOUSE_OF_CARDS.cardVisualThickness,
      bend: body.paperBend,
      twist: body.paperTwist
    });
    const mesh = new THREE.Mesh(cardGeometry, createHouseCardMaterial(body.rowIndex, body.kind));
    mesh.name = `house-card-${body.id}`;
    mesh.position.copy(body.position);
    mesh.rotation.copy(body.rotation);
    mesh.userData.houseCardBody = body;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 8;
    mesh.add(createCardFaceDetails(body));
    body.mesh = mesh;
    page.add(mesh);
    pickMeshes.push(mesh);
  });

  const { sky, sun } = createSunnyPicnicSky();
  page.add(sky);
  page.add(createWebGpuInspiredCloudLayer(layout));
  page.add(createCardsSunDisc(sun, layout));
  page.add(createSunnyPicnicBackdrop(layout));
  page.add(createPicnicTable(layout));

  const knockPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.width + 1.7, layout.height + 1.2),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false
    })
  );
  knockPlane.name = "house-of-cards-knock-plane";
  knockPlane.position.set(0, layout.height * 0.48, 0.12);
  knockPlane.userData.isHouseOfCardsKnockPlane = true;
  knockPlane.renderOrder = 20;
  page.add(knockPlane);
  pickMeshes.push(knockPlane);

  const hemiLight = new THREE.HemisphereLight(0xb9e5ff, 0x77a85f, reducedMotion ? 1.8 : 2.25);
  hemiLight.name = "house-of-cards-hemisphere-daylight";
  hemiLight.position.set(0, 7, 0);
  page.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff1bf, reducedMotion ? 2.2 : 2.75);
  sunLight.name = "house-of-cards-sun";
  sunLight.position.copy(sun).multiplyScalar(7.5);
  sunLight.position.y += layout.height + 1.8;
  sunLight.target.position.set(0, layout.height * 0.32, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 0.2;
  sunLight.shadow.camera.far = 18;
  sunLight.shadow.camera.left = -6;
  sunLight.shadow.camera.right = 6;
  sunLight.shadow.camera.top = 6;
  sunLight.shadow.camera.bottom = -4;
  sunLight.shadow.bias = -0.00018;
  page.add(sunLight);
  page.add(sunLight.target);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.12);
  ambientLight.name = "house-of-cards-soft-day-ambient";
  page.add(ambientLight);

  page.userData.layout = layout;
  page.userData.bodies = bodies;
  page.userData.pickMeshes = pickMeshes;
  page.userData.knockPlane = knockPlane;
  page.userData.progress = 0;
  page.userData.lastDragAt = -10;
  page.userData.reset = () => {
    bodies.forEach(resetHouseCardBody);
  };

  return page;
}

export function createSingularityScene({
  canvas,
  profile = {
    location: "",
    name: "",
    headline: ""
  },
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COLORS.void, 0.024);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 140);
  camera.position.set(0, 1.1, reducedMotion ? 12 : 18);
  scene.add(camera);
  const baseCameraQuaternion = camera.quaternion.clone();
  const cardsCameraTarget = new THREE.Vector3();
  const cardsCameraRig = new THREE.Group();
  cardsCameraRig.name = "house-of-cards-camera-rig";
  scene.add(cardsCameraRig);
  const cardsStackTargetLocal = new THREE.Vector3();
  const cardsCameraForwardCorrection = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI
  );
  const cardsCameraOrbitRadius = Math.hypot(
    HOUSE_OF_CARDS.cameraX,
    HOUSE_OF_CARDS.cameraZ - HOUSE_OF_CARDS.cameraLookAtZ
  );
  const cardsCameraOrbitStart = Math.atan2(
    HOUSE_OF_CARDS.cameraX,
    HOUSE_OF_CARDS.cameraZ - HOUSE_OF_CARDS.cameraLookAtZ
  );
  const cardsCameraVerticalOffset = HOUSE_OF_CARDS.cameraYOffset - HOUSE_OF_CARDS.cameraLookAtYOffset;
  const cardsCameraOrbitSpeed = reducedMotion ? 0.45 : 0.9;
  const cardsCameraInput = { left: false, right: false };
  let cardsCameraManualOrbit = 0;

  const heroParticleText = createHeroParticleText(profile, { reducedMotion });
  camera.add(heroParticleText);

  const bloomRenderPass = new RenderPass(scene, camera);
  const finalRenderPass = new RenderPass(scene, camera);
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
  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(bloomRenderPass);
  bloomComposer.addPass(bloomPass);

  const selectiveBloomPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: null }
      },
      vertexShader: selectiveBloomCompositeShader.vertexShader,
      fragmentShader: selectiveBloomCompositeShader.fragmentShader,
      depthTest: false,
      depthWrite: false
    }),
    "baseTexture"
  );
  selectiveBloomPass.uniforms.bloomTexture.value = bloomComposer.renderTarget2.texture;
  const cinematicPass = new ShaderPass(cinematicPostShader);
  const outputPass = new OutputPass();
  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(finalRenderPass);
  finalComposer.addPass(selectiveBloomPass);
  finalComposer.addPass(cinematicPass);
  finalComposer.addPass(outputPass);

  function clearBloomComposerTargets() {
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(bloomComposer.renderTarget1);
    renderer.clear(true, true, true);
    renderer.setRenderTarget(bloomComposer.renderTarget2);
    renderer.clear(true, true, true);
    renderer.setRenderTarget(previousTarget);
  }

  const timer = new THREE.Timer();
  timer.connect(document);
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const houseCardDragPlane = new THREE.Plane();
  const houseCardDragPlaneNormal = new THREE.Vector3();
  const houseCardDragWorldPoint = new THREE.Vector3();
  const houseCardDragLocalPoint = new THREE.Vector3();
  const nodeMeshes = new Map();
  const nodeButtons = new Map();
  const pickMeshes = [];
  let hoveredId = null;
  let activeHouseCardDrag = null;
  let lastHouseCardDragEventAt = 0;
  let activeSectionId = null;
  let running = false;
  let rafId = 0;
  let lastElapsed = 0;
  let lastCanvasClientWidth = 0;
  let lastCanvasClientHeight = 0;
  let resizeObserver = null;
  let resizePoller = 0;
  let scrollTransitionTarget = 0;
  const horizonWorldCenter = new THREE.Vector3();
  const transitionProjection = new THREE.Vector3();
  let currentHorizonMask = null;
  const deviceTilt = {
    active: false,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0
  };

  sections.forEach((section) => {
    const button = root.querySelector?.(`[data-section-id="${section.id}"]`);
    if (button) {
      nodeButtons.set(section.id, button);
    }
  });

  const starField = createStarField({ count: getBudget("starfield", reducedMotion), spread: 64 });
  scene.add(starField);

  const ambient = new THREE.AmbientLight(0x5b4868, 0.24);
  scene.add(ambient);

  const warmLight = new THREE.PointLight(0xffa75a, 5.2, 16);
  warmLight.position.set(-1.4, 0.4, 2.2);
  scene.add(warmLight);

  const coolLight = new THREE.PointLight(0x7c8cff, 0.65, 18);
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

  const horizonDepthOccluder = createDepthOnlyHorizonOccluder(blackHoleMetrics.shadowRadius * 0.92);
  horizonDepthOccluder.renderOrder = 4;
  horizonDepthOccluder.raycast = () => {};
  singularity.add(horizonDepthOccluder);

  const relativisticSingularity = createRelativisticSingularity({
    metrics: blackHoleMetrics,
    inclination: diskInclination,
    reducedMotion
  });
  relativisticSingularity.rotation.x = DISK_PLANE_TILT;
  relativisticSingularity.layers.enable(BLOOM_LAYER);
  singularity.add(relativisticSingularity);

  const accretionDust = createAccretionDust(getBudget("accretionDust", reducedMotion), reducedMotion);
  accretionDust.rotation.x = DISK_PLANE_TILT;
  accretionDust.layers.enable(BLOOM_LAYER);
  scene.add(accretionDust);

  const orbitGuideMeshes = [];
  NODE_LAYOUT.forEach((layout) => {
    const orbit = createOrbitLine(layout.radius, layout.color, layout.y * 0.18);
    scene.add(orbit);
    orbitGuideMeshes.push(orbit);

    const trail = createTrailArc(layout.radius, layout.color, layout.phase - 0.4);
    trail.position.y = layout.y * 0.18;
    scene.add(trail);
    orbitGuideMeshes.push(trail);

    const { group, core } = createNodeGroup(layout);
    nodeMeshes.set(layout.id, group);
    pickMeshes.push(core);
    scene.add(group);
  });

  const burstParticles = createBurstParticles(getBudget("sectionBurst", reducedMotion));
  scene.add(burstParticles);

  const contactParticles = createContactParticles(getBudget("contact", reducedMotion));
  scene.add(contactParticles);

  const singularityPageObjects = [
    heroParticleText,
    starField,
    warmLight,
    coolLight,
    singularity,
    accretionDust,
    burstParticles,
    contactParticles,
    ...orbitGuideMeshes,
    ...nodeMeshes.values()
  ];

  const houseOfCardsPage = createHouseOfCardsPage({ reducedMotion });
  houseOfCardsPage.rotation.y = HOUSE_OF_CARDS.pageYaw;
  scene.add(houseOfCardsPage);
  const houseCardPickMeshes = houseOfCardsPage.userData.pickMeshes;
  cardsStackTargetLocal.set(
    0,
    HOUSE_OF_CARDS.tableY + houseOfCardsPage.userData.layout.height * 0.52,
    0.02
  );
  let hoveredHouseCardHit = null;

  function syncCardsCameraRig() {
    cardsCameraRig.position.copy(camera.position);
    cardsCameraRig.lookAt(cardsCameraTarget);
    cardsCameraRig.quaternion.multiply(cardsCameraForwardCorrection);
  }

  function currentComposerScale() {
    if (reducedMotion) return POST_PROCESSING.composerScale.reducedMotion;
    return isMobileViewport() ? POST_PROCESSING.composerScale.mobile : POST_PROCESSING.composerScale.desktop;
  }

  function currentBloomProfile() {
    if (reducedMotion) return POST_PROCESSING.bloom.reducedMotion;
    return isMobileViewport() ? POST_PROCESSING.bloom.mobile : POST_PROCESSING.bloom.desktop;
  }

  function updateParticleHorizonUniforms(mask) {
    for (const points of [starField, accretionDust, burstParticles, contactParticles]) {
      points.material.uniforms.uHorizonCenter.value.copy(mask.center);
      points.material.uniforms.uHorizonRadius.value = mask.radius;
      points.material.uniforms.uHorizonAspect.value = mask.aspect;
      points.material.uniforms.uHorizonDepth.value = mask.depth;
      points.material.uniforms.uHorizonOccluderDepth.value = mask.occluderDepth;
    }
  }

  function updateHorizonMaskUniforms(width = window.innerWidth, height = window.innerHeight) {
    singularity.getWorldPosition(horizonWorldCenter);
    camera.updateMatrixWorld();
    const mask = computeProjectedHorizonMask({
      camera,
      center: horizonWorldCenter,
      radius: blackHoleMetrics.shadowRadius,
      width,
      height
    });
    currentHorizonMask = mask;

    cinematicPass.uniforms.uHorizonCenter.value.copy(mask.center);
    cinematicPass.uniforms.uHorizonRadius.value = mask.radius;
    cinematicPass.uniforms.uAspect.value = mask.aspect;
    updateParticleHorizonUniforms(mask);
  }

  function updateHeroParticleTextLayout(width = window.innerWidth, height = window.innerHeight) {
    const heroRect = root.querySelector?.(".hero-copy")?.getBoundingClientRect();
    const depth = 9.25;
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * depth;
    const viewWidth = viewHeight * camera.aspect;
    const fallbackWidth = isMobileViewport() ? Math.min(width - 28, 370) : Math.min(width * 0.5, 680);
    const fieldWidth = heroRect
      ? isMobileViewport()
        ? Math.min(heroRect.width * 0.98, width * 0.94)
        : Math.min(heroRect.width * 1.08, width * 0.58)
      : fallbackWidth;
    const centerX = heroRect ? heroRect.left + heroRect.width * 0.5 : width * 0.22;
    const centerY = heroRect ? heroRect.top + heroRect.height * 0.48 : height * 0.18;

    heroParticleText.position.set(
      (centerX / width - 0.5) * viewWidth,
      (0.5 - centerY / height) * viewHeight,
      -depth
    );
    heroParticleText.scale.set(
      (fieldWidth / width) * viewWidth,
      (fieldWidth / width) * viewWidth,
      1
    );
    heroParticleText.userData.screenRect = heroRect
      ? {
        left: heroRect.left,
        right: heroRect.right,
        top: heroRect.top,
        bottom: heroRect.bottom
      }
      : {
        left: 0,
        right: fallbackWidth,
        top: 0,
        bottom: height * 0.34
      };
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, PERFORMANCE_LIMITS.maxPixelRatio);
    const composerPixelRatio = pixelRatio * currentComposerScale();
    const activeBloom = currentBloomProfile();
    lastCanvasClientWidth = canvas.clientWidth || width;
    lastCanvasClientHeight = canvas.clientHeight || height;

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    bloomComposer.setPixelRatio(composerPixelRatio);
    bloomComposer.setSize(width, height);
    finalComposer.setPixelRatio(composerPixelRatio);
    finalComposer.setSize(width, height);
    bloomPass.strength = activeBloom.strength;
    bloomPass.radius = activeBloom.radius;
    bloomPass.threshold = activeBloom.threshold;
    cinematicPass.uniforms.uResolution.value.set(width * composerPixelRatio, height * composerPixelRatio);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    syncCardsCameraRig();
    updateHeroParticleTextLayout(width, height);
    updateHorizonMaskUniforms(width, height);
    heroParticleText.material.uniforms.uPixelRatio.value = pixelRatio;

    for (const points of [starField, accretionDust, burstParticles, contactParticles]) {
      points.material.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  function resizeIfCanvasBoundsChanged() {
    const clientWidth = canvas.clientWidth || window.innerWidth;
    const clientHeight = canvas.clientHeight || window.innerHeight;

    if (Math.abs(clientWidth - lastCanvasClientWidth) > 1 || Math.abs(clientHeight - lastCanvasClientHeight) > 1) {
      resize();
    }
  }

  function observeCanvasResize() {
    if (resizeObserver || typeof ResizeObserver === "undefined") return;

    resizeObserver = new ResizeObserver(() => {
      resize();
    });
    resizeObserver.observe(canvas);
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

  function updateHeroParticleText(elapsed) {
    const attributes = heroParticleText.geometry.attributes;
    const positions = attributes.position.array;
    const array = attributes.displacement.array;
    const { baseDisplacements, phases } = heroParticleText.geometry.userData;
    const pointerTargetStrength = heroParticleText.userData.pointerActive && !activeSectionId ? 1 : 0;
    heroParticleText.userData.pointerStrength += (pointerTargetStrength - heroParticleText.userData.pointerStrength) * (pointerTargetStrength ? 0.18 : 0.1);
    heroParticleText.userData.pointerX += (heroParticleText.userData.targetPointerX - heroParticleText.userData.pointerX) * 0.26;
    heroParticleText.userData.pointerY += (heroParticleText.userData.targetPointerY - heroParticleText.userData.pointerY) * 0.26;
    const heroDiffusionEnvelope = heroParticleText.userData.pointerStrength;
    const diffusionAmplitude = reducedMotion ? 0.02 : 0.14;
    const scrollTitleFade = 1 - cinematicPass.uniforms.uScrollTransition.value * (isMobileViewport() ? 0.78 : 0.18);
    const targetOpacity = (activeSectionId ? 0.32 : isMobileViewport() ? 0.86 : 0.94) * scrollTitleFade;

    heroParticleText.material.uniforms.opacity.value += (targetOpacity - heroParticleText.material.uniforms.opacity.value) * 0.18;
    heroParticleText.material.uniforms.amplitude.value = heroDiffusionEnvelope * diffusionAmplitude;
    heroParticleText.material.uniforms.uTime.value = elapsed;
    heroParticleText.material.uniforms.color.value.offsetHSL(heroDiffusionEnvelope * 0.00018, 0, 0);

    for (let i = 0; i < phases.length; i += 1) {
      const offset = i * 3;
      const pointerDeltaX = positions[offset] - heroParticleText.userData.pointerX;
      const pointerDeltaY = positions[offset + 1] - heroParticleText.userData.pointerY;
      const localRippleDistance = Math.hypot(pointerDeltaX, pointerDeltaY);
      const rippleFalloff = Math.exp(-Math.pow(localRippleDistance / 0.095, 2));
      const rippleDirectionX = pointerDeltaX / Math.max(0.001, localRippleDistance);
      const rippleDirectionY = pointerDeltaY / Math.max(0.001, localRippleDistance);
      const waterRipple = Math.sin(localRippleDistance * 52 - elapsed * 12 + phases[i] * 0.35) * rippleFalloff;
      const drift = Math.sin(elapsed * 2.6 + phases[i]) * 0.5 + 0.5;
      const ripplePush = waterRipple * (0.036 + drift * 0.018);
      array[offset] = baseDisplacements[offset] * (0.06 + rippleFalloff * (0.22 + drift * 0.12)) + rippleDirectionX * ripplePush;
      array[offset + 1] = baseDisplacements[offset + 1] * (0.06 + rippleFalloff * (0.24 + drift * 0.13)) + rippleDirectionY * ripplePush * 0.72;
      array[offset + 2] = baseDisplacements[offset + 2] * (0.04 + rippleFalloff * (0.18 + drift * 0.08)) + waterRipple * 0.018;
    }

    attributes.displacement.needsUpdate = true;
  }

  function updateHeroParticleDiffusionFromPointer(event) {
    const heroRect = heroParticleText.userData.screenRect ?? root.querySelector?.(".hero-copy")?.getBoundingClientRect();
    const isInsideHero = Boolean(
      heroRect &&
        event.clientX >= heroRect.left &&
        event.clientX <= heroRect.right &&
        event.clientY >= heroRect.top &&
        event.clientY <= heroRect.bottom
    );

    if (isInsideHero && !reducedMotion) {
      const pointerLocalX = (event.clientX - heroRect.left) / Math.max(1, heroRect.right - heroRect.left);
      const pointerLocalY = (event.clientY - heroRect.top) / Math.max(1, heroRect.bottom - heroRect.top);
      const canvasAspect = heroParticleText.geometry.userData.canvasAspect;
      heroParticleText.userData.targetPointerX = clamp(pointerLocalX, 0, 1) - 0.5;
      heroParticleText.userData.targetPointerY = (0.5 - clamp(pointerLocalY, 0, 1)) * canvasAspect;
    }

    heroParticleText.userData.pointerActive = isInsideHero && !reducedMotion;
    heroParticleText.userData.hoveringHero = isInsideHero;
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
      const horizonVisibility = group.userData.horizonVisibility ?? 1;
      const cardsPageFade = 1 - smoothstep(0.32, 0.82, cinematicPass.uniforms.uScrollTransition.value);
      const connectorVisibility = Math.pow(horizonVisibility, 1.8) * cardsPageFade;
      const scrollLabelBoost = 1 + cinematicPass.uniforms.uScrollTransition.value * 0.16;
      const labelVisibility = activeSectionId && activeSectionId !== id
        ? 0.16
        : clamp(depthOpacity * (0.58 + horizonVisibility * 0.42) * scrollLabelBoost * cardsPageFade, 0, 0.96);

      button.style.setProperty("--node-x", `${x}px`);
      button.style.setProperty("--node-y", `${y}px`);
      button.style.setProperty("--connector-x", `${Math.round(projectedX - x)}px`);
      button.style.setProperty("--connector-y", `${Math.round(projectedY - y)}px`);
      button.style.setProperty("--connector-opacity", `${connectorVisibility}`);
      button.style.opacity = `${labelVisibility}`;
    });
  }

  function updateNodeMeshes(elapsed) {
    if (!currentHorizonMask) {
      updateHorizonMaskUniforms();
    }
    const projectedNode = new THREE.Vector3();

    NODE_LAYOUT.forEach((layout) => {
      const group = nodeMeshes.get(layout.id);
      const position = computeNodePosition(layout, elapsed, reducedMotion || activeSectionId);
      const isHot = hoveredId === layout.id || activeSectionId === layout.id;
      const core = group.children[0];
      const halo = group.children[1];

      group.position.set(position.x, position.y, position.z);
      projectedNode.copy(group.position).project(camera);
      const occlusion = computeNodeHorizonOcclusion({
        projectedNode,
        horizonMask: currentHorizonMask,
        projectedHorizonDepth: currentHorizonMask.occluderDepth
      });
      const horizonVisibility = occlusion.visibility;
      group.userData.horizonVisibility = horizonVisibility;
      group.userData.horizonOcclusion = occlusion.occlusion;
      group.scale.setScalar(isHot ? 1.58 : 0.88);
      core.material.opacity = (activeSectionId && activeSectionId !== layout.id ? 0.12 : isHot ? 0.92 : 0.48) * horizonVisibility;
      halo.material.opacity = (activeSectionId && activeSectionId !== layout.id ? 0.025 : isHot ? 0.2 : 0.07) * Math.pow(horizonVisibility, 1.35);
    });
  }

  function updateAccretionDust(elapsed) {
    const geometry = accretionDust.geometry;
    const positions = geometry.getAttribute("position");
    const sizes = geometry.getAttribute("aSize");
    const { radii, speeds, layers, directions, topFeeds, baseSizes, wakeBands, wakePhases, wakeWeights } = geometry.userData;
    const activeBoost = accretionDust.material.uniforms.uContactBoost.value;

    for (let i = 0; i < positions.count; i += 1) {
      const offset = i * 3;
      const feed = topFeeds[i];
      const wakeBand = wakeBands[i];
      const wakeWave = Math.sin(elapsed * (0.62 + speeds[i] * 2.4) + wakePhases[i] + wakeBand * TAU * 2.4) * 0.5 + 0.5;
      const wakeCrossWave = Math.sin(elapsed * 0.38 - wakePhases[i] * 0.74 + wakeBand * TAU * 5.0) * 0.5 + 0.5;
      const wakeLaneOffset = (wakeBand - 0.5) * (feed ? 0.24 : 0.09) + (wakeWave - 0.5) * (feed ? 0.13 : 0.055) * wakeWeights[i];
      const spiral = (elapsed * speeds[i] * (0.35 + activeBoost * 0.4) + i * 0.013) % 1;
      const radius = radii[i]
        * (1 - spiral * (0.34 + activeBoost * 0.18 + feed * 0.22))
        * (1 + (wakeWave - 0.5) * 0.07 * wakeWeights[i]);
      const angle = directions[i] * (elapsed * speeds[i] + spiral * (5.8 + feed * 2.2) + (wakeCrossWave - 0.5) * 0.32 * wakeWeights[i]) + i * 0.37;
      const vertical = feed
        ? layers[i] * (1 - spiral * 0.74) + wakeLaneOffset + Math.sin(angle * 2.1 + elapsed * 1.2) * 0.038
        : layers[i] + wakeLaneOffset + Math.sin(angle * 1.8 + elapsed) * 0.022;
      positions.array[offset] = Math.cos(angle) * radius;
      positions.array[offset + 1] = vertical;
      positions.array[offset + 2] = Math.sin(angle) * radius * (feed ? 0.52 : 0.68);
      sizes.array[i] = baseSizes[i] * (0.78 + wakeWave * 0.44 + wakeCrossWave * 0.16 + activeBoost * 0.18);
    }

    positions.needsUpdate = true;
    sizes.needsUpdate = true;
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
    burstParticles.userData.horizonVisibility = group.userData.horizonVisibility ?? 1;
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
    burstParticles.material.uniforms.uFade.value = fade * (burstParticles.userData.horizonVisibility ?? 1);

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

  function updatePageVisibility(cardsPageProgress) {
    const singularityPageRunning = cardsPageProgress < 0.62;
    singularityPageObjects.forEach((object) => {
      object.visible = singularityPageRunning;
    });
    houseOfCardsPage.visible = cardsPageProgress > 0.02;
    root.classList?.toggle("is-cards-page", !singularityPageRunning);
    if (cardsPageProgress <= 0.015 || cardsPageProgress >= 0.62) {
      root.classList?.remove("is-scroll-transitioning");
    }
    return singularityPageRunning;
  }

  function updateScrollCinematicTargets(delta = 0) {
    const progress = clamp(cinematicPass.uniforms.uScrollTransition.value, 0, 1);
    const scrollOrbitEase = smoothstep(0, 1, progress);
    const scrollParallax = reducedMotion ? 0 : scrollOrbitEase;
    const mobile = isMobileViewport();
    const cardsPageProgress = scrollOrbitEase;
    const cardsPageOpacity = smoothstep(0.04, 0.52, cardsPageProgress);
    houseOfCardsPage.updateWorldMatrix(true, false);
    cardsCameraTarget.copy(cardsStackTargetLocal);
    houseOfCardsPage.localToWorld(cardsCameraTarget);
    const cardsOrbitBlend = smoothstep(0.56, 0.92, cardsPageProgress);
    const cardsCameraInputAxis = Number(cardsCameraInput.right) - Number(cardsCameraInput.left);
    if (cardsOrbitBlend > 0.01 && cardsCameraInputAxis !== 0) {
      cardsCameraManualOrbit += cardsCameraInputAxis * cardsCameraOrbitSpeed * delta;
    }
    const cardsCameraOrbitAngle = cardsCameraOrbitStart + cardsCameraManualOrbit * cardsOrbitBlend;
    const cardsOrbitX = cardsCameraTarget.x + Math.sin(cardsCameraOrbitAngle) * cardsCameraOrbitRadius;
    const cardsOrbitZ = cardsCameraTarget.z + Math.cos(cardsCameraOrbitAngle) * cardsCameraOrbitRadius;
    const cardsOrbitY = cardsCameraTarget.y
      + cardsCameraVerticalOffset
      + Math.sin(cardsCameraOrbitAngle * 0.7) * (mobile ? 0.08 : 0.18) * cardsOrbitBlend;
    const cardsCameraX = lerp(cardsCameraTarget.x + HOUSE_OF_CARDS.cameraX, cardsOrbitX, cardsOrbitBlend);
    const cardsCameraY = lerp(cardsCameraTarget.y + cardsCameraVerticalOffset, cardsOrbitY, cardsOrbitBlend);
    const cardsCameraZ = lerp(cardsCameraTarget.z + HOUSE_OF_CARDS.cameraZ, cardsOrbitZ, cardsOrbitBlend);
    const shouldApplyScrollCamera = !activeSectionId
      && (
        scrollParallax > 0.001 ||
        scrollTransitionTarget > 0 ||
        Math.abs(camera.position.x) > 0.001 ||
        Math.abs(camera.position.y - 1.1) > 0.001 ||
        Math.abs(camera.position.z - 11.5) > 0.001
      );

    if (shouldApplyScrollCamera) {
      camera.position.x = lerp(0, cardsCameraX, cardsPageProgress);
      camera.position.y = lerp(1.1, cardsCameraY, cardsPageProgress);
      camera.position.z = lerp(11.5, cardsCameraZ, cardsPageProgress);
    }

    if (!activeSectionId && (cardsPageProgress > 0.001 || scrollTransitionTarget > 0 || Math.abs(camera.position.x) > 0.001)) {
      syncCardsCameraRig();
      camera.quaternion.slerpQuaternions(baseCameraQuaternion, cardsCameraRig.quaternion, cardsPageProgress);
    }
    syncCardsCameraRig();

    singularity.position.y = -cardsPageProgress * (mobile ? 0.36 : 0.7);
    singularity.scale.setScalar(1 + scrollParallax * (mobile ? 0.008 : 0.014));
    accretionDust.position.y = singularity.position.y * 0.72;
    accretionDust.scale.setScalar(1 + scrollParallax * 0.012);
    accretionDust.material.uniforms.uWakeStrength.value = (reducedMotion ? 0.18 : 0.58) + scrollParallax * 0.18;
    renderer.toneMappingExposure = lerp(0.96, 0.76, cardsPageProgress);
    updatePageVisibility(cardsPageProgress);
    houseOfCardsPage.userData.progress = cardsPageProgress;
    houseOfCardsPage.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach((material) => {
        if (typeof material.userData.baseOpacity === "number") {
          material.opacity = material.userData.baseOpacity * cardsPageOpacity;
          material.needsUpdate = true;
        }
      });
    });

    if (!activeSectionId) {
      const bloomProfile = currentBloomProfile();
      bloomPass.strength = bloomProfile.strength + scrollParallax * (mobile ? 0.025 : 0.055);
    }
  }

  function isEditableKeyboardTarget(target) {
    return target instanceof HTMLElement && Boolean(
      target.closest("input, textarea, select, [contenteditable=\"true\"]")
    );
  }

  function resetCardsCameraInput() {
    cardsCameraInput.left = false;
    cardsCameraInput.right = false;
  }

  function handleCardsCameraKeyDown(event) {
    if (isEditableKeyboardTarget(event.target)) return;

    const key = event.key.toLowerCase();
    if (key !== "a" && key !== "d") return;

    if (key === "a") {
      cardsCameraInput.left = true;
    } else {
      cardsCameraInput.right = true;
    }

    if (cinematicPass.uniforms.uScrollTransition.value > 0.55) {
      event.preventDefault();
    }
  }

  function handleCardsCameraKeyUp(event) {
    const key = event.key.toLowerCase();
    if (key === "a") {
      cardsCameraInput.left = false;
    } else if (key === "d") {
      cardsCameraInput.right = false;
    }
  }

  function isHouseOfCardsPageInteractive() {
    return !activeSectionId && cinematicPass.uniforms.uScrollTransition.value > 0.58;
  }

  function pickHouseOfCards() {
    const hits = raycaster.intersectObjects(houseCardPickMeshes, false);
    return hits.find((hit) => {
      const body = hit.object.userData.houseCardBody;
      return body && !body.removed && hit.object.visible !== false;
    }) ?? null;
  }

  function startHouseCardDragFromPointer(event, hit = hoveredHouseCardHit) {
    if (!hit || !isHouseOfCardsPageInteractive()) return false;

    const targetBody = hit.object.userData.houseCardBody;
    if (!targetBody || targetBody.removed) return false;

    camera.getWorldDirection(houseCardDragPlaneNormal).normalize();
    houseCardDragPlane.setFromNormalAndCoplanarPoint(houseCardDragPlaneNormal, hit.point);
    houseCardDragLocalPoint.copy(hit.point);
    houseOfCardsPage.worldToLocal(houseCardDragLocalPoint);

    activeHouseCardDrag = beginHouseCardDrag(houseOfCardsPage.userData.bodies, targetBody, houseCardDragLocalPoint, {
      maxForce: reducedMotion ? 34 : 42
    });
    if (!activeHouseCardDrag) return false;

    event?.target?.setPointerCapture?.(event.pointerId);
    houseOfCardsPage.userData.lastDragAt = lastElapsed;
    lastHouseCardDragEventAt = event?.timeStamp ?? 0;
    canvas.style.cursor = "grabbing";
    return true;
  }

  function updateActiveHouseCardDrag(delta = 1 / 60) {
    if (!activeHouseCardDrag?.active) return false;
    if (!raycaster.ray.intersectPlane(houseCardDragPlane, houseCardDragWorldPoint)) return false;

    houseCardDragLocalPoint.copy(houseCardDragWorldPoint);
    houseOfCardsPage.worldToLocal(houseCardDragLocalPoint);
    const layout = houseOfCardsPage.userData.layout;
    houseCardDragLocalPoint.x = clamp(houseCardDragLocalPoint.x, -layout.width * 0.64, layout.width * 0.64);
    houseCardDragLocalPoint.y = clamp(houseCardDragLocalPoint.y, HOUSE_OF_CARDS.tableY + 0.12, layout.height + 1.45);
    houseCardDragLocalPoint.z = clamp(
      houseCardDragLocalPoint.z,
      -HOUSE_OF_CARDS.picnicTableDepth * 0.72,
      HOUSE_OF_CARDS.picnicTableDepth * 0.72
    );

    return updateHouseCardDrag(activeHouseCardDrag, houseCardDragLocalPoint, delta);
  }

  function endActiveHouseCardDrag(event) {
    if (!activeHouseCardDrag) return false;

    event?.target?.releasePointerCapture?.(event.pointerId);
    const ended = endHouseCardDrag(activeHouseCardDrag);
    activeHouseCardDrag = null;
    hoveredHouseCardHit = pickHouseOfCards();
    canvas.style.cursor = hoveredHouseCardHit ? "grab" : "default";
    return ended;
  }

  function updateHouseOfCardsPhysics(delta) {
    if (houseOfCardsPage.userData.progress < 0.5) return;

    stepHouseOfCardsPhysics(
      houseOfCardsPage.userData.bodies,
      reducedMotion ? Math.min(delta, 1 / 90) : delta
    );
  }

  function setDeviceTilt({
    x = deviceTilt.targetX,
    y = deviceTilt.targetY,
    active = deviceTilt.active
  } = {}) {
    const wasActive = deviceTilt.active;
    deviceTilt.active = Boolean(active);

    if (Number.isFinite(x)) {
      deviceTilt.targetX = clamp(x, -1, 1);
    }

    if (Number.isFinite(y)) {
      deviceTilt.targetY = clamp(y, -1, 1);
    }

    if (!deviceTilt.active) {
      deviceTilt.targetX = 0;
      deviceTilt.targetY = 0;
    }

    if (deviceTilt.active && !wasActive) {
      gsap.killTweensOf(camera.rotation);
      gsap.killTweensOf(singularity.rotation);
    }
  }

  function updateDeviceTiltParallax() {
    if (reducedMotion) return;

    const targetX = deviceTilt.active && !activeSectionId ? deviceTilt.targetX : 0;
    const targetY = deviceTilt.active && !activeSectionId ? deviceTilt.targetY : 0;
    deviceTilt.x += (targetX - deviceTilt.x) * 0.08;
    deviceTilt.y += (targetY - deviceTilt.y) * 0.08;

    if (!deviceTilt.active && Math.abs(deviceTilt.x) < 0.001 && Math.abs(deviceTilt.y) < 0.001) {
      deviceTilt.x = 0;
      deviceTilt.y = 0;
      return;
    }

    camera.rotation.x = deviceTilt.y * 0.038;
    camera.rotation.y = -deviceTilt.x * 0.052;
    singularity.rotation.x = SINGULARITY_VIEW_TILT.x + deviceTilt.y * 0.018;
    singularity.rotation.z = SINGULARITY_VIEW_TILT.z - deviceTilt.x * 0.01;
  }

  function setSceneTransitionOrigin(origin) {
    if (!origin) {
      cinematicPass.uniforms.uTransitionCenter.value.set(0.5, 0.5);
      return;
    }

    camera.updateMatrixWorld();
    transitionProjection.copy(origin).project(camera);
    cinematicPass.uniforms.uTransitionCenter.value.set(
      clamp(transitionProjection.x * 0.5 + 0.5, 0.08, 0.92),
      clamp(transitionProjection.y * 0.5 + 0.5, 0.08, 0.92)
    );
  }

  function pulseSceneTransition({ origin = horizonWorldCenter } = {}) {
    cinematicPass.uniforms.uSceneTransition.value = 0;

    if (reducedMotion) return;

    setSceneTransitionOrigin(origin);
    cinematicPass.uniforms.uTransitionSeed.value = Math.random() * 1000;
    gsap.killTweensOf(cinematicPass.uniforms.uSceneTransition);
    cinematicPass.uniforms.uSceneTransition.value = 0.001;
    gsap.to(cinematicPass.uniforms.uSceneTransition, {
      value: 1.34,
      duration: 0.86,
      ease: "power2.out",
      onComplete: () => {
        cinematicPass.uniforms.uSceneTransition.value = 0;
      }
    });
  }

  function setScrollTransition(targetProgress = 0, { immediate = false, direction = targetProgress >= scrollTransitionTarget ? 1 : -1 } = {}) {
    const progress = clamp(targetProgress, 0, 1);
    scrollTransitionTarget = progress;
    cinematicPass.uniforms.uScrollDirection.value = direction < 0 ? -1 : 1;
    gsap.killTweensOf(cinematicPass.uniforms.uScrollTransition);
    root.classList?.toggle("is-scroll-transitioning", !immediate && !reducedMotion);
    cinematicPass.uniforms.uTransitionSeed.value = Math.random() * 1000;

    if (immediate || reducedMotion) {
      cinematicPass.uniforms.uScrollTransition.value = progress;
      updateScrollCinematicTargets();
      root.classList?.remove("is-scroll-transitioning");
      return;
    }

    gsap.to(cinematicPass.uniforms.uScrollTransition, {
      value: progress,
      duration: TRANSITIONS.scrollMs / 1000,
      ease: "power3.inOut",
      onUpdate: updateScrollCinematicTargets,
      onComplete: () => {
        cinematicPass.uniforms.uScrollTransition.value = progress;
        updateScrollCinematicTargets();
        root.classList?.remove("is-scroll-transitioning");
      }
    });
  }

  function updateSingularityPage(elapsed, delta) {
    singularity.rotation.y = SINGULARITY_VIEW_TILT.y + Math.sin(elapsed * 0.2) * (reducedMotion ? 0.006 : 0.018);
    starField.rotation.y = elapsed * (reducedMotion ? 0.0015 : 0.009);
    starField.rotation.x = Math.sin(elapsed * 0.08) * 0.02;

    updateDeviceTiltParallax();
    updateHorizonMaskUniforms();
    updateShaderUniforms(elapsed);
    updateHeroParticleText(elapsed);
    updateNodeMeshes(elapsed);
    updateAccretionDust(elapsed);
    updateBurstParticles(elapsed);
    animateContactParticles(elapsed);
    updateNodeButtons(elapsed);
    return delta;
  }

  function renderFrame(timestamp) {
    if (!running) return;
    rafId = window.requestAnimationFrame(renderFrame);

    timer.update(timestamp);
    const elapsed = timer.getElapsed();
    const delta = timer.getDelta();
    lastElapsed = elapsed;

    resizeIfCanvasBoundsChanged();
    updateScrollCinematicTargets(delta);
    const cardsPageProgress = clamp(cinematicPass.uniforms.uScrollTransition.value, 0, 1);
    const singularityPageRunning = cardsPageProgress < 0.62;
    cinematicPass.uniforms.uTime.value = elapsed;
    if (singularityPageRunning) {
      updateSingularityPage(elapsed, delta);
    }
    updateHouseOfCardsPhysics(delta);
    if (singularityPageRunning) {
      camera.layers.set(BLOOM_LAYER);
      bloomComposer.render(delta);
    } else {
      clearBloomComposerTargets();
    }
    camera.layers.set(DEFAULT_LAYER);
    finalComposer.render(delta);
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
    pulseSceneTransition({ origin: target });

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

  function updatePointerRayFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }

  function handlePointerMove(event) {
    updateHeroParticleDiffusionFromPointer(event);
    updatePointerRayFromEvent(event);

    if (activeHouseCardDrag?.active) {
      const eventTime = event.timeStamp ?? lastHouseCardDragEventAt;
      const dragDelta = lastHouseCardDragEventAt
        ? clamp((eventTime - lastHouseCardDragEventAt) / 1000, 1 / 120, 1 / 20)
        : 1 / 60;
      lastHouseCardDragEventAt = eventTime;
      updateActiveHouseCardDrag(dragDelta);
      canvas.style.cursor = "grabbing";
      return;
    }

    if (isHouseOfCardsPageInteractive()) {
      hoveredHouseCardHit = pickHouseOfCards();
      hoveredId = null;
      canvas.style.cursor = hoveredHouseCardHit ? "grab" : "default";
      return;
    }

    hoveredHouseCardHit = null;
    const hits = raycaster.intersectObjects(pickMeshes, false);
    const visibleHit = hits.find((hit) => (hit.object.parent?.userData?.horizonVisibility ?? 1) > 0.12);
    hoveredId = visibleHit?.object?.userData?.sectionId ?? null;
    canvas.style.cursor = hoveredId ? "pointer" : "default";

    if (!deviceTilt.active && !reducedMotion && !activeSectionId) {
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

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    updatePointerRayFromEvent(event);

    if (!isHouseOfCardsPageInteractive()) return;

    hoveredHouseCardHit = pickHouseOfCards();
    hoveredId = null;
    if (startHouseCardDragFromPointer(event, hoveredHouseCardHit)) {
      event.preventDefault();
    }
  }

  function handlePointerUp(event) {
    if (!activeHouseCardDrag) return;

    updatePointerRayFromEvent(event);
    const eventTime = event.timeStamp ?? lastHouseCardDragEventAt;
    const dragDelta = lastHouseCardDragEventAt
      ? clamp((eventTime - lastHouseCardDragEventAt) / 1000, 1 / 120, 1 / 20)
      : 1 / 60;
    lastHouseCardDragEventAt = 0;
    updateActiveHouseCardDrag(dragDelta);
    endActiveHouseCardDrag(event);
    event.preventDefault();
  }

  function handleClick(event) {
    if (event) {
      updatePointerRayFromEvent(event);
    }

    if (isHouseOfCardsPageInteractive()) {
      hoveredHouseCardHit = pickHouseOfCards();
      hoveredId = null;
      return;
    }

    if (hoveredId) {
      onNodeSelect?.(hoveredId);
    }
  }

  function handlePointerLeave() {
    heroParticleText.userData.hoveringHero = false;
    heroParticleText.userData.pointerActive = false;
    if (activeHouseCardDrag?.active) return;
    hoveredId = null;
    hoveredHouseCardHit = null;
    canvas.style.cursor = "default";
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

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleCardsCameraKeyDown);
    window.addEventListener("keyup", handleCardsCameraKeyUp);
    window.addEventListener("blur", resetCardsCameraInput);
    window.addEventListener("resize", resize);
    observeCanvasResize();
    resizePoller = window.setInterval(resizeIfCanvasBoundsChanged, 250);
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
    canvas.removeEventListener("pointerdown", handlePointerDown);
    canvas.removeEventListener("pointermove", handlePointerMove);
    canvas.removeEventListener("pointerup", handlePointerUp);
    canvas.removeEventListener("pointercancel", handlePointerUp);
    canvas.removeEventListener("pointerleave", handlePointerLeave);
    canvas.removeEventListener("click", handleClick);
    window.removeEventListener("keydown", handleCardsCameraKeyDown);
    window.removeEventListener("keyup", handleCardsCameraKeyUp);
    window.removeEventListener("blur", resetCardsCameraInput);
    window.removeEventListener("resize", resize);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (resizePoller) {
      window.clearInterval(resizePoller);
      resizePoller = 0;
    }
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(camera.rotation);
    gsap.killTweensOf(singularity.rotation);
    gsap.killTweensOf(cinematicPass.uniforms.uSceneTransition);
    gsap.killTweensOf(cinematicPass.uniforms.uScrollTransition);
    timer.dispose();
    bloomComposer.dispose();
    finalComposer.dispose();
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
    setDeviceTilt,
    setScrollTransition,
    selectSection,
    focusSection,
    returnToOrbit,
    dispose
  };
}
