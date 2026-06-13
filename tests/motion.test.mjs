import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseDeviceTilt,
  createDeviceTiltController,
  normalizeDeviceTilt,
  requestDeviceTiltAccess
} from "../src/motion.js";

test("normalizeDeviceTilt maps phone pitch and roll into clamped scene input", () => {
  assert.deepEqual(normalizeDeviceTilt({ beta: 14, gamma: -12 }), { x: -0.5, y: 0.5 });
  assert.deepEqual(normalizeDeviceTilt({ beta: 99, gamma: -99 }), { x: -1, y: 1 });
  assert.deepEqual(normalizeDeviceTilt({ beta: null, gamma: undefined }), { x: 0, y: 0 });
});

test("device tilt support detects browser orientation APIs", () => {
  function DeviceOrientationEvent() {}
  assert.equal(canUseDeviceTilt({ DeviceOrientationEvent }), true);
  assert.equal(canUseDeviceTilt({}), false);
});

test("device tilt access handles iOS permission and standard browsers", async () => {
  function GrantedDeviceOrientationEvent() {}
  GrantedDeviceOrientationEvent.requestPermission = async () => "granted";

  function DeniedDeviceOrientationEvent() {}
  DeniedDeviceOrientationEvent.requestPermission = async () => "denied";

  assert.equal(await requestDeviceTiltAccess({ DeviceOrientationEvent: GrantedDeviceOrientationEvent }), true);
  assert.equal(await requestDeviceTiltAccess({ DeviceOrientationEvent: DeniedDeviceOrientationEvent }), false);
  assert.equal(await requestDeviceTiltAccess({ DeviceOrientationEvent: function DeviceOrientationEvent() {} }), true);
});

test("device tilt controller subscribes only after permission and emits normalized values", async () => {
  const listeners = new Map();
  function DeviceOrientationEvent() {}
  const values = [];
  const globalScope = {
    DeviceOrientationEvent,
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type, handler) => {
      if (listeners.get(type) === handler) listeners.delete(type);
    }
  };

  const controller = createDeviceTiltController({
    globalScope,
    onTilt: (tilt) => values.push(tilt)
  });

  assert.equal(await controller.start(), true);
  assert.equal(controller.active, true);
  listeners.get("deviceorientation")({ beta: -14, gamma: 12 });
  assert.deepEqual(values.at(-1), { x: 0.5, y: -0.5 });
  controller.stop();
  assert.equal(controller.active, false);
  assert.equal(listeners.has("deviceorientation"), false);
});
