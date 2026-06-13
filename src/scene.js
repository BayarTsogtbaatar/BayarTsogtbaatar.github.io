import * as THREE from "three";
import { gsap } from "gsap";
import { COLORS, NODE_LAYOUT, PERFORMANCE_LIMITS, TRANSITIONS } from "./scene-config.js";

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

function createStarField({ count, spread }) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const radius = 12 + Math.random() * spread;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const index = i * 3;

    positions[index] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index + 1] = radius * Math.cos(phi);
    positions[index + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const tint = 0.68 + Math.random() * 0.32;
    colors[index] = tint * 0.72;
    colors[index + 1] = tint * 0.88;
    colors[index + 2] = tint;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.035,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  });

  return new THREE.Points(geometry, material);
}

function createOrbitLine(radius, color) {
  const points = [];
  const segments = 160;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending
  });

  const line = new THREE.LineLoop(geometry, material);
  line.rotation.x = Math.PI * 0.18;
  return line;
}

function createContactParticles(count = 420) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    seeds[i] = Math.random() * Math.PI * 2;
    const index = i * 3;
    positions[index] = 0;
    positions[index + 1] = 0;
    positions[index + 2] = 0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.PointsMaterial({
    color: COLORS.accretionCool,
    size: 0.045,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const particles = new THREE.Points(geometry, material);
  particles.position.set(0, -1.1, 1.6);
  particles.userData.active = false;
  return particles;
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

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COLORS.void, 0.025);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  camera.position.set(0, 1.1, reducedMotion ? 12 : 18);

  const timer = new THREE.Timer();
  timer.connect(document);
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const nodeMeshes = new Map();
  const nodeButtons = new Map();
  let hoveredId = null;
  let activeSectionId = null;
  let running = false;
  let rafId = 0;

  sections.forEach((section) => {
    const button = root.querySelector?.(`[data-section-id="${section.id}"]`);
    if (button) {
      nodeButtons.set(section.id, button);
    }
  });

  const starCount = window.innerWidth <= PERFORMANCE_LIMITS.mobileBreakpoint
    ? PERFORMANCE_LIMITS.mobileStars
    : PERFORMANCE_LIMITS.desktopStars;
  const starField = createStarField({ count: starCount, spread: 58 });
  scene.add(starField);

  const ambient = new THREE.AmbientLight(0x6b7dff, 0.45);
  scene.add(ambient);

  const singularity = new THREE.Group();
  scene.add(singularity);

  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(1.16, 96, 48),
    new THREE.MeshBasicMaterial({ color: COLORS.eventHorizon })
  );
  singularity.add(horizon);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.38, 96, 48),
    new THREE.MeshBasicMaterial({
      color: COLORS.accretionWarm,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  singularity.add(glow);

  const accretionWarm = new THREE.Mesh(
    new THREE.TorusGeometry(1.9, 0.055, 12, 220),
    new THREE.MeshBasicMaterial({
      color: COLORS.accretionWarm,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    })
  );
  accretionWarm.rotation.x = Math.PI * 0.52;
  singularity.add(accretionWarm);

  const accretionCool = new THREE.Mesh(
    new THREE.TorusGeometry(2.35, 0.025, 10, 220),
    new THREE.MeshBasicMaterial({
      color: COLORS.accretionCool,
      transparent: true,
      opacity: 0.44,
      blending: THREE.AdditiveBlending
    })
  );
  accretionCool.rotation.x = Math.PI * 0.5;
  accretionCool.rotation.z = Math.PI * 0.08;
  singularity.add(accretionCool);

  NODE_LAYOUT.forEach((layout) => {
    const orbit = createOrbitLine(layout.radius, layout.color);
    orbit.position.y = layout.y * 0.2;
    scene.add(orbit);

    const node = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 32, 16),
      new THREE.MeshBasicMaterial({
        color: layout.color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending
      })
    );
    node.userData.sectionId = layout.id;
    node.userData.layout = layout;
    nodeMeshes.set(layout.id, node);
    scene.add(node);
  });

  const contactParticles = createContactParticles();
  scene.add(contactParticles);

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, PERFORMANCE_LIMITS.maxPixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function updateNodeButtons(elapsed) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const projected = new THREE.Vector3();

    nodeMeshes.forEach((mesh, id) => {
      const button = nodeButtons.get(id);
      if (!button) return;

      projected.copy(mesh.position).project(camera);
      const layout = mesh.userData.layout;
      const drift = reducedMotion || width <= PERFORMANCE_LIMITS.mobileBreakpoint ? 0 : 18;
      const x = clamp(layout.labelX * width + Math.sin(elapsed * 0.35 + layout.phase) * drift, 120, width - 120);
      const y = clamp(layout.labelY * height + Math.cos(elapsed * 0.28 + layout.phase) * drift, 96, height - 80);
      const depthOpacity = projected.z > 1 ? 0.18 : 0.52 + Math.max(0, mesh.position.z / 12);

      button.style.setProperty("--node-x", `${x}px`);
      button.style.setProperty("--node-y", `${y}px`);
      button.style.opacity = activeSectionId && activeSectionId !== id ? "0.2" : `${clamp(depthOpacity, 0.45, 1)}`;
    });
  }

  function updateNodeMeshes(elapsed) {
    NODE_LAYOUT.forEach((layout) => {
      const mesh = nodeMeshes.get(layout.id);
      const position = computeNodePosition(layout, elapsed, reducedMotion || activeSectionId);
      const isHot = hoveredId === layout.id || activeSectionId === layout.id;
      mesh.position.set(position.x, position.y, position.z);
      mesh.scale.setScalar(isHot ? 1.85 : 1);
      mesh.material.opacity = activeSectionId && activeSectionId !== layout.id ? 0.18 : isHot ? 1 : 0.76;
    });
  }

  function animateContactParticles(elapsed) {
    const geometry = contactParticles.geometry;
    const positions = geometry.getAttribute("position");
    const seeds = geometry.getAttribute("seed");
    const active = contactParticles.userData.active;
    const amplitude = active ? 1 : 0.12;

    for (let i = 0; i < positions.count; i += 1) {
      const seed = seeds.getX(i);
      const ring = 0.8 + (i % 9) * 0.14;
      const angle = seed + elapsed * (active ? 0.8 : 0.16) + i * 0.018;
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
    singularity.rotation.y = elapsed * (reducedMotion ? 0.04 : 0.11);
    accretionWarm.rotation.z = elapsed * (reducedMotion ? 0.06 : 0.45);
    accretionCool.rotation.z = -elapsed * (reducedMotion ? 0.04 : 0.28);
    starField.rotation.y = elapsed * (reducedMotion ? 0.002 : 0.01);
    starField.rotation.x = Math.sin(elapsed * 0.08) * 0.02;

    updateNodeMeshes(elapsed);
    animateContactParticles(elapsed);
    updateNodeButtons(elapsed);
    renderer.render(scene, camera);
  }

  function setHoveredSection(id) {
    hoveredId = id;
  }

  function setContactParticles(active) {
    contactParticles.userData.active = active;
    gsap.to(contactParticles.material, {
      opacity: active ? 0.78 : 0,
      duration: reducedMotion ? 0.01 : 0.55,
      ease: "power2.out"
    });
  }

  function selectSection(id) {
    activeSectionId = id;
    root.classList?.add("is-distorting");
    const node = nodeMeshes.get(id);
    const target = node ? node.position : new THREE.Vector3();

    gsap.to(camera.position, {
      x: target.x * 0.18,
      y: target.y * 0.35 + 0.6,
      z: reducedMotion ? 10 : 5.6,
      duration: reducedMotion ? 0.01 : TRANSITIONS.diveMs / 1000,
      ease: "power3.inOut",
      onComplete: () => root.classList?.remove("is-distorting")
    });
  }

  function focusSection(id) {
    activeSectionId = id;
    setContactParticles(id === "contact");
    root.classList?.toggle("contact-field-active", id === "contact");
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
    const hits = raycaster.intersectObjects(Array.from(nodeMeshes.values()), false);
    hoveredId = hits[0]?.object?.userData?.sectionId ?? null;
    canvas.style.cursor = hoveredId ? "pointer" : "default";

    if (!reducedMotion && !activeSectionId) {
      gsap.to(camera.rotation, {
        x: pointer.y * 0.04,
        y: -pointer.x * 0.05,
        duration: 0.6,
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
    if (!reducedMotion) {
      gsap.fromTo(camera.position, { z: 18 }, { z: 11.5, duration: TRANSITIONS.introMs / 1000, ease: "power3.out" });
      gsap.fromTo(glow.material, { opacity: 0 }, { opacity: 0.13, duration: 1.2, ease: "power2.out" });
    } else {
      camera.position.z = 11.5;
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
    timer.dispose();
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
