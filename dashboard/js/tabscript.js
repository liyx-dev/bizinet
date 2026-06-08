// =============================================
// TAB SYSTEM & SMART SWIPE GESTURES
// =============================================
const tabsList = ["uploadTab", "storiesTab", "categoriesTab", "settingsTab"];

const swipeConfig = {
  minDistance: 72,              // must move this far
  minVelocity: 0.18,            // pixels per ms
  directionRatio: 1.35,         // horizontal must beat vertical by this factor
  maxDuration: 850,             // slow drags are ignored
  ignoredSelector: [
    "input",
    "textarea",
    "select",
    "option",
    "button",
    "a",
    "label",
    "[contenteditable='true']",
    ".ql-editor",
    ".tabs-container",
    ".tab-btn",
    ".sortable-ghost",
    ".sortable-fallback",
    ".sortable-handle",
    "[draggable='true']",
    "[data-no-swipe='true']",
    "video",
    "audio"
  ].join(",")
};

const swipeState = {
  tracking: false,
  startX: 0,
  startY: 0,
  startTime: 0
};

function getActiveTabId() {
  return document.querySelector(".tab-btn.active")?.dataset?.tab || tabsList[0];
}

function isModalOpen() {
  const modal = document.getElementById("storyPreviewModal");
  if (modal && modal.classList.contains("open")) return true;

  const anyOpenModal = document.querySelector('.modal.open, [role="dialog"][aria-hidden="false"]');
  return !!anyOpenModal;
}

function isIgnoredSwipeTarget(target) {
  if (!(target instanceof Element)) return true;

  if (target.closest(swipeConfig.ignoredSelector)) return true;
  if (target.closest(".tabs-container")) return true;
  if (target.closest("[data-swipe-lock='true']")) return true;

  return false;
}

function hasHorizontalScrollableAncestor(target) {
  let el = target instanceof Element ? target : null;

  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    const overflowX = style.overflowX;

    if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth + 8) {
      return true;
    }

    el = el.parentElement;
  }

  return false;
}

function pauseMediaInSection(section) {
  if (!section) return;

  section.querySelectorAll("video, audio").forEach(media => {
    try {
      media.pause();
    } catch (_) {}
  });

  // If you use iframe embeds (YouTube/Vimeo), they need provider-specific pause handling.
  // For a hard stop, you can reset src here, but that can restart the media later.
  // section.querySelectorAll("iframe").forEach(frame => {
  //   const src = frame.src;
  //   frame.src = src;
  // });
}

function lockSection(section, locked) {
  if (!section) return;

  if ("inert" in section) {
    section.inert = locked;
  }

  section.setAttribute("aria-hidden", locked ? "true" : "false");
}

function switchTab(tabId) {
  if (!tabId || !tabsList.includes(tabId)) return;

  const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const targetSection = document.getElementById(tabId);
  if (!targetBtn || !targetSection) return;

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn === targetBtn);
  });

  document.querySelectorAll(".admin-section").forEach(section => {
    const isActive = section.id === tabId;
    section.classList.toggle("active", isActive);
    lockSection(section, !isActive);

    if (!isActive) {
      pauseMediaInSection(section);
    }
  });

  // Keep the active tab button visible on small screens
  targetBtn.scrollIntoView({
    behavior: "smooth",
    inline: "center",
    block: "nearest"
  });
}

function resetSwipeState() {
  swipeState.tracking = false;
  swipeState.startX = 0;
  swipeState.startY = 0;
  swipeState.startTime = 0;
}

document.addEventListener("touchstart", e => {
  if (e.touches.length !== 1) {
    resetSwipeState();
    return;
  }

  const target = e.target;

  if (isModalOpen()) return;
  if (isIgnoredSwipeTarget(target)) return;
  if (hasHorizontalScrollableAncestor(target)) return;

  swipeState.tracking = true;
  swipeState.startX = e.touches[0].clientX;
  swipeState.startY = e.touches[0].clientY;
  swipeState.startTime = performance.now();
}, { passive: true });

document.addEventListener("touchmove", e => {
  if (!swipeState.tracking || e.touches.length !== 1) return;

  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;

  const dx = currentX - swipeState.startX;
  const dy = currentY - swipeState.startY;

  // If it becomes clearly vertical scrolling, stop tracking it as a swipe.
  if (Math.abs(dy) > Math.abs(dx) * swipeConfig.directionRatio) {
    resetSwipeState();
  }
}, { passive: true });

document.addEventListener("touchend", e => {
  if (!swipeState.tracking) return;

  const touch = e.changedTouches[0];
  if (!touch) {
    resetSwipeState();
    return;
  }

  const endX = touch.clientX;
  const endY = touch.clientY;

  const dx = endX - swipeState.startX;
  const dy = endY - swipeState.startY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const duration = performance.now() - swipeState.startTime;
  const velocity = absX / Math.max(duration, 1);

  resetSwipeState();

  if (isModalOpen()) return;
  if (document.querySelector(".ql-editor:focus")) return;
  if (document.querySelector("input:focus, textarea:focus, select:focus, [contenteditable='true']:focus")) return;

  // Must be a real horizontal swipe
  if (absX < swipeConfig.minDistance) return;
  if (absX <= absY * swipeConfig.directionRatio) return;
  if (duration > swipeConfig.maxDuration && absX < swipeConfig.minDistance * 1.5) return;
  if (velocity < swipeConfig.minVelocity && absX < 120) return;

  const activeTab = getActiveTabId();
  const currentIndex = tabsList.indexOf(activeTab);
  if (currentIndex === -1) return;

  // Swipe left -> next tab
  if (dx < 0 && currentIndex < tabsList.length - 1) {
    switchTab(tabsList[currentIndex + 1]);
  }

  // Swipe right -> previous tab
  if (dx > 0 && currentIndex > 0) {
    switchTab(tabsList[currentIndex - 1]);
  }
}, { passive: true });

document.addEventListener("touchcancel", resetSwipeState, { passive: true });

// Keep hidden tab media locked on first load too
document.addEventListener("DOMContentLoaded", () => {
  const initialTab = getActiveTabId();
  switchTab(initialTab);
});
    
