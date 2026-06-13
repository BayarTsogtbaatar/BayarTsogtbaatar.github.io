function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizeDeviceTilt(event = {}, { maxBeta = 28, maxGamma = 24 } = {}) {
  return {
    x: clamp(finiteOrZero(event.gamma) / maxGamma, -1, 1),
    y: clamp(finiteOrZero(event.beta) / maxBeta, -1, 1)
  };
}

export function canUseDeviceTilt(globalScope = globalThis) {
  return Boolean(globalScope?.DeviceOrientationEvent);
}

export async function requestDeviceTiltAccess(globalScope = globalThis) {
  const DeviceOrientation = globalScope?.DeviceOrientationEvent;

  if (!DeviceOrientation) return false;

  if (typeof DeviceOrientation.requestPermission === "function") {
    try {
      return (await DeviceOrientation.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }

  return true;
}

export function createDeviceTiltController({ globalScope = globalThis, onTilt = () => {} } = {}) {
  let active = false;

  function handleOrientation(event) {
    if (!active) return;
    onTilt(normalizeDeviceTilt(event));
  }

  async function start() {
    if (active) return true;
    const granted = await requestDeviceTiltAccess(globalScope);
    if (!granted) return false;

    active = true;
    globalScope.addEventListener?.("deviceorientation", handleOrientation, { passive: true });
    return true;
  }

  function stop() {
    if (!active) return;
    active = false;
    globalScope.removeEventListener?.("deviceorientation", handleOrientation);
  }

  return {
    get active() {
      return active;
    },
    start,
    stop,
    dispose: stop
  };
}

createDeviceTiltController.isSupported = canUseDeviceTilt;
