"use strict";

/**
 * PS3 XMB Inspired UI - Interactions & Background Particles
 * - Live clock in header
 * - Category switching (horizontal nav)
 * - Vertical list focus/keyboard navigation
 * - Ambient particle field with slow drift and twinkle
 */

(function () {
  // =========================
  // Live Clock (Top Right)
  // =========================
  const clockEl = document.getElementById("clock");

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }
  function formatClock(d) {
    // Format: "M/D H:MM AM/PM" (no leading zeros on M/D, 12-hour time)
    const month = d.getMonth() + 1;
    const day = d.getDate();
    let hours = d.getHours();
    const minutes = pad(d.getMinutes());
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${month}/${day} ${hours}:${minutes} ${ampm}`;
  }
  function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = formatClock(now);
  }
  updateClock();
  // Update every 30s to reduce churn
  setInterval(updateClock, 30 * 1000);

  // =========================
  // Category Navigation Logic
  // =========================
  const catButtons = Array.from(document.querySelectorAll(".cat-btn"));
  const verticalLists = Array.from(document.querySelectorAll(".vertical-list"));
  const horizontalNav = document.querySelector(".horizontal-nav");

  // Center label setup (moved earlier to avoid TDZ)
  const centerLabelEl = document.getElementById("center-label");
  const catIconMap = {
    video: "#icon-video",
    music: "#icon-music",
    game: "#icon-game",
    network: "#icon-network",
    store: "#icon-store",
    friends: "#icon-friends",
  };

  function setCenterLabel(title, category, desc) {
    if (!centerLabelEl) return;
    const iconHref = catIconMap[category] || "#icon-video";
    const safeTitle = (title || "").toString();
    const safeDesc = (desc || "").toString();
    centerLabelEl.innerHTML =
      `<svg class="icon" aria-hidden="true"><use href="${iconHref}"></use></svg>` +
      `<div class="wrap"><div class="title">${safeTitle}</div>` +
      (safeDesc ? `<div class="desc">${safeDesc}</div>` : "") +
      `</div>`;
  }

  // Hover/focus over vertical items should drive the center label
  verticalLists.forEach((list) => {
    const category = list.dataset.category;
    const isTimeline = list.hasAttribute("data-timeline");
    list.addEventListener("mouseover", (e) => {
      const item = e.target.closest(".vn-item");
      if (!item) return;
      const title = (isTimeline ? item.querySelector(".title .t") : item.querySelector(".title"))?.textContent?.trim();
      const desc = isTimeline ? "" : (item.querySelector(".sub")?.innerHTML?.trim() || "");
      if (title) setCenterLabel(title, category, desc);
    });
    list.addEventListener("focusin", (e) => {
      const item = e.target.closest(".vn-item");
      if (!item) return;
      const title = (isTimeline ? item.querySelector(".title .t") : item.querySelector(".title"))?.textContent?.trim();
      const desc = isTimeline ? "" : (item.querySelector(".sub")?.innerHTML?.trim() || "");
      if (title) setCenterLabel(title, category, desc);
    });
  });

  // Initialize label from currently active list/item
  (function initCenterLabel() {
    const activeBtn = catButtons.find((b) => b.classList.contains("active"));
    const category = activeBtn?.dataset.category;
    if (!category) return;
    const activeList = document.querySelector(`.vertical-list[data-category="${category}"]`);
    // Set layout mode for initial active list
    document.body.classList.toggle("timeline-mode", !!activeList?.hasAttribute("data-timeline"));
    document.body.classList.toggle("skills-mode", category === "network");

    const isTimelineInit = !!activeList?.hasAttribute("data-timeline");
    const firstTitle = (isTimelineInit ? activeList?.querySelector(".title .t") : activeList?.querySelector(".title"))?.textContent?.trim();
    const firstDesc = activeList?.querySelector(".sub")?.innerHTML?.trim() || "";
    const catLbl =
      activeBtn?.querySelector(".cat-label")?.textContent?.trim() ||
      (category ? category[0].toUpperCase() + category.slice(1) : "");
    setCenterLabel(firstTitle || catLbl, category, isTimelineInit ? "" : (firstTitle ? firstDesc : ""));
  })();

  function activateCategory(category) {
    // Update buttons (active + aria-selected)
    catButtons.forEach((btn) => {
      const isActive = btn.dataset.category === category;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    // Update vertical lists (show/hide)
    verticalLists.forEach((list) => {
      const isTarget = list.dataset.category === category;
      list.classList.toggle("active", isTarget);
      if (isTarget) {
        list.removeAttribute("hidden");
      } else {
        list.setAttribute("hidden", "");
      }
    });

    // Toggle timeline layout mode based on the active list
    const list = document.querySelector(`.vertical-list[data-category="${category}"]`);
    const isTimeline = !!list?.hasAttribute("data-timeline");
    document.body.classList.toggle("timeline-mode", isTimeline);
    document.body.classList.toggle("skills-mode", category === "network");

    // Update center label to reflect the first item of the active list (or category label fallback)
    const firstTitle = (isTimeline ? list?.querySelector(".title .t") : list?.querySelector(".title"))?.textContent?.trim();
    const firstDesc = list?.querySelector(".sub")?.innerHTML?.trim() || "";
    const catLbl =
      catButtons.find((b) => b.dataset.category === category)?.querySelector(".cat-label")?.textContent?.trim() ||
      (category ? category[0].toUpperCase() + category.slice(1) : "");
    setCenterLabel(firstTitle || catLbl, category, isTimeline ? "" : (firstTitle ? firstDesc : ""));
  }

  // Initialize with any pre-marked active
  const presetActive =
    catButtons.find((b) => b.classList.contains("active"))?.dataset.category ||
    (catButtons[0] && catButtons[0].dataset.category);
  if (presetActive) {
    activateCategory(presetActive);
  }

  // Click interactions
  catButtons.forEach((btn) => {
    btn.addEventListener("click", () => activateCategory(btn.dataset.category));
  });

  // Keyboard navigation for horizontal categories
  if (horizontalNav) {
    horizontalNav.addEventListener("keydown", (e) => {
      const currentIndex = catButtons.findIndex((b) =>
        b.classList.contains("active")
      );
      if (currentIndex === -1) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % catButtons.length;
        catButtons[nextIndex].focus();
        catButtons[nextIndex].click();
        smoothCenterButton(catButtons[nextIndex]);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prevIndex =
          (currentIndex - 1 + catButtons.length) % catButtons.length;
        catButtons[prevIndex].focus();
        catButtons[prevIndex].click();
        smoothCenterButton(catButtons[prevIndex]);
      } else if (e.key === "ArrowDown") {
        // Focus first item in active vertical list
        const activeList = document.querySelector(".vertical-list.active");
        const firstItem = activeList?.querySelector(".vn-item");
        if (firstItem) {
          e.preventDefault();
          firstItem.focus();
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        catButtons[0].focus();
        catButtons[0].click();
        smoothCenterButton(catButtons[0]);
      } else if (e.key === "End") {
        e.preventDefault();
        const last = catButtons[catButtons.length - 1];
        last.focus();
        last.click();
        smoothCenterButton(last);
      }
    });
  }

  function smoothCenterButton(btn) {
    // Ensure the active category is visible and roughly centered in scroll area
    if (!horizontalNav || !btn) return;
    const navRect = horizontalNav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const offset =
      btnRect.left - navRect.left - navRect.width / 2 + btnRect.width / 2;
    horizontalNav.scrollBy({ left: offset, behavior: "smooth" });
  }

  // =========================
  // Vertical List Keyboard Nav
  // =========================
  verticalLists.forEach((list) => {
    list.addEventListener("keydown", (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      const item = e.target.closest(".vn-item");
      if (!item) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = item.nextElementSibling;
        if (next && next.classList.contains("vn-item")) {
          next.focus();
          ensureVisibleInScroll(list, next);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = item.previousElementSibling;
        if (prev && prev.classList.contains("vn-item")) {
          prev.focus();
          ensureVisibleInScroll(list, prev);
        } else {
          // Move focus back to active category
          const activeBtn = catButtons.find((b) =>
            b.classList.contains("active")
          );
          if (activeBtn) activeBtn.focus();
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        const first = list.querySelector(".vn-item");
        if (first) {
          first.focus();
          ensureVisibleInScroll(list, first);
        }
      } else if (e.key === "End") {
        e.preventDefault();
        const items = list.querySelectorAll(".vn-item");
        const last = items[items.length - 1];
        if (last) {
          last.focus();
          ensureVisibleInScroll(list, last);
        }
      }
    });
  });

  // =========================
  // Timeline expand/collapse (Experience/Education)
  // =========================
  const timelineLists = Array.from(
    document.querySelectorAll('.vertical-list[data-timeline]')
  );

  function toggleTimelineItem(list, item) {
    const wasExpanded = item.classList.contains('expanded');
    // collapse others
    Array.from(list.querySelectorAll('.vn-item.expanded')).forEach((el) => {
      if (el !== item) el.classList.remove('expanded');
    });
    // toggle this one
    item.classList.toggle('expanded', !wasExpanded);

    // Update center label based on state
    const category = list.dataset.category;
    const title = (item.querySelector('.title .t') || item.querySelector('.title'))?.textContent?.trim();
    const desc = item.querySelector('.sub')?.innerHTML?.trim() || '';
    setCenterLabel(title || '', category, !wasExpanded ? desc : '');
  }

  timelineLists.forEach((list) => {
    // Click to expand/collapse
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.vn-item');
      if (!item || !list.contains(item)) return;
      toggleTimelineItem(list, item);
    });
    // Keyboard support (Enter/Space)
    list.addEventListener('keydown', (e) => {
      const item = e.target.closest('.vn-item');
      if (!item) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleTimelineItem(list, item);
      }
    });
  });

  function ensureVisibleInScroll(container, el) {
    const cTop = container.scrollTop;
    const cBottom = cTop + container.clientHeight;
    const eTop = el.offsetTop;
    const eBottom = eTop + el.offsetHeight;

    if (eTop < cTop) {
      container.scrollTo({ top: eTop - 8, behavior: "smooth" });
    } else if (eBottom > cBottom) {
      container.scrollTo({
        top: eBottom - container.clientHeight + 8,
        behavior: "smooth",
      });
    }
  }


  // =========================
  // Ambient Particles Canvas
  // =========================
  const canvas = document.getElementById("particles");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const rmQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduceMotion = !!rmQuery.matches;
  // Fallback for older browsers
  if (typeof rmQuery.addEventListener === "function") {
    rmQuery.addEventListener("change", (e) => {
      reduceMotion = !!e.matches;
      if (reduceMotion) stopParticles();
      else startParticles();
    });
  } else if (typeof rmQuery.addListener === "function") {
    rmQuery.addListener((e) => {
      reduceMotion = !!e.matches;
      if (reduceMotion) stopParticles();
      else startParticles();
    });
  }

  let dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  let width = 0;
  let height = 0;

  function resize() {
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    width = Math.floor(window.innerWidth);
    height = Math.floor(window.innerHeight);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    // draw in CSS pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Re-initialize stars density on resize
    initStars();
  }
  window.addEventListener("resize", () => {
    resize();
  });

  // Star field
  let stars = [];
  function randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }
  function initStars() {
    const area = width * height;
    // Density scales with area; cap for perf
    const count = Math.max(60, Math.min(220, Math.floor(area / 12000) + 60));
    stars = new Array(count).fill(0).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: randomRange(0.6, 1.8),
      vx: randomRange(4, 24) / 60, // px/sec drift to the right (slow)
      vy: randomRange(-6, 6) / 60, // slight vertical wander
      phase: Math.random() * Math.PI * 2,
      tw: randomRange(0.4, 1.0), // twinkle speed
      baseAlpha: randomRange(0.25, 0.65),
    }));
  }

  let rafId = 0;
  let lastTs = 0;
  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!width || !height) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000); // clamp dt
    lastTs = ts;

    ctx.clearRect(0, 0, width, height);

    // Faint overall glow overlay for depth
    // Draw stars
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.x += s.vx * (dt * 60); // convert to px/frame based on 60fps scale
      s.y += s.vy * (dt * 60);
      if (s.x > width + 10) s.x = -10;
      if (s.y > height + 10) s.y = -10;
      if (s.y < -10) s.y = height + 10;

      s.phase += s.tw * dt;
      const twinkle = 0.5 + 0.5 * Math.sin(s.phase);
      const alpha = Math.min(1, Math.max(0, s.baseAlpha + twinkle * 0.35));

      // Soft dot with glow
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#58C7FF";
      ctx.shadowColor = "#58C7FF";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function startParticles() {
    if (reduceMotion) return;
    if (rafId) cancelAnimationFrame(rafId);
    lastTs = 0;
    rafId = requestAnimationFrame(frame);
  }
  function stopParticles() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (width && height) ctx.clearRect(0, 0, width, height);
  }

  // Bootstrap
  resize();
  if (!reduceMotion) startParticles();
})();
