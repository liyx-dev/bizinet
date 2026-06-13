// ============================================================
// BiziNet · Tab System — Unified File
// dashboard/js/tab-system.js
// ============================================================

// SECTION 1 — TAB REGISTRY (Added sidebarTab systematically at array index position 0)
const tabsList = [
  "sidebarTab", // Left-most bounds layout position element
  "uploadTab",  // Default entry selection element
  "storiesTab",
  "categoriesTab",
  "settingsTab"
];

// SECTION 2 — LAZY-LOAD FLAGS
let _catLoaded      = false;
let _storiesLoaded  = false;
let _settingsLoaded = false;

// SECTION 3 — SWIPE CONFIGURATION
const swipeConfig = {
  minDistance:     72,    
  minVelocity:     0.18,  
  directionRatio:  1.35,  
  maxDuration:     850,   
  ignoredSelector: [
    "input", "textarea", "select", "option", "button", "a", "label",
    "[contenteditable='true']", ".ql-editor", ".tabs-container", ".tab-btn",
    ".sortable-ghost", ".sortable-fallback", ".sortable-handle", "[draggable='true']",
    "[data-no-swipe='true']", "video", "audio", ".premium-bottom-nav", ".bottom-nav-item"
  ].join(",")
};

const swipeState = {
  tracking:  false,
  startX:    0,
  startY:    0,
  startTime: 0
};

// SECTION 4 — HELPER FUNCTIONS
function getActiveTabId() {
  return document.querySelector(".tab-btn.active")?.dataset?.tab || "uploadTab";
}

function isModalOpen() {
  const storyModal = document.getElementById("storyPreviewModal");
  if (storyModal && storyModal.classList.contains("open")) return true;
  return !!document.querySelector('.modal.open, [role="dialog"][aria-hidden="false"]');
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
    const overflowX = window.getComputedStyle(el).overflowX;
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
    try { media.pause(); } catch (_) {}
  });
}

function lockSection(section, locked) {
  if (!section) return;
  if ("inert" in section) section.inert = locked;
  section.setAttribute("aria-hidden", locked ? "true" : "false");
}

// SECTION 5 — switchTab() (Unified core layout render function interface)
function switchTab(tabId) {
  if (!tabId || !tabsList.includes(tabId)) return;

  const targetBtn     = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const targetSection = document.getElementById(tabId);
  if (!targetSection) return;

  // Toggle visual active selectors on standard navigation elements safely
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  // Toggle active styling layers across bottom items
  document.querySelectorAll(".bottom-nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.navTarget === tabId);
  });

  // Toggle active views across sectional layout views safely
  document.querySelectorAll(".admin-section").forEach(section => {
    const isActive = section.id === tabId;
    section.classList.toggle("active", isActive);
    lockSection(section, !isActive);
    if (!isActive) pauseMediaInSection(section);
  });

  if (targetBtn) {
    targetBtn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  // Trigger cross-functional lazy loader hooks based on module selections
  triggerLazyLoad(tabId);
}

async function triggerLazyLoad(tabId) {
  if (tabId === "categoriesTab" && !_catLoaded) {
    _catLoaded = true;
    if (typeof loadCategoriesTab === "function") await loadCategoriesTab();
  }
  if (tabId === "settingsTab" && !_settingsLoaded) {
    _settingsLoaded = true;
    if (window.loadSettings) await window.loadSettings();
  }
  if (tabId === "storiesTab" && !_storiesLoaded) {
    _storiesLoaded = true;
    if (window.loadStories) await window.loadStories();
  }
}

// SECTION 6 — CLICK INTERACTIVE MONITOR HANDLERS
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// Bottom Bar navigation clicks mapping seamlessly
document.querySelectorAll(".bottom-nav-item").forEach(item => {
  item.addEventListener("click", () => {
    const target = item.dataset.navTarget;
    switchTab(target);
  });
});

// SECTION 7 — SMART GESTURE ENGINES
function resetSwipeState() {
  swipeState.tracking  = false;
  swipeState.startX    = 0;
  swipeState.startY    = 0;
  swipeState.startTime = 0;
}

document.addEventListener("touchstart", e => {
  if (e.touches.length !== 1) { resetSwipeState(); return; }
  const target = e.target;
  if (isModalOpen() || isIgnoredSwipeTarget(target) || hasHorizontalScrollableAncestor(target)) return;

  swipeState.tracking  = true;
  swipeState.startX    = e.touches[0].clientX;
  swipeState.startY    = e.touches[0].clientY;
  swipeState.startTime = performance.now();
}, { passive: true });

document.addEventListener("touchmove", e => {
  if (!swipeState.tracking || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - swipeState.startX;
  const dy = e.touches[0].clientY - swipeState.startY;

  if (Math.abs(dy) > Math.abs(dx) * swipeConfig.directionRatio) {
    resetSwipeState();
  }
}, { passive: true });

document.addEventListener("touchend", e => {
  if (!swipeState.tracking) return;
  const touch = e.changedTouches[0];
  if (!touch) { resetSwipeState(); return; }

  const dx       = touch.clientX - swipeState.startX;
  const dy       = touch.clientY - swipeState.startY;
  const absX     = Math.abs(dx);
  const absY     = Math.abs(dy);
  const duration = performance.now() - swipeState.startTime;
  const velocity = absX / Math.max(duration, 1);

  resetSwipeState();

  if (isModalOpen() || document.querySelector("input:focus, textarea:focus, select:focus, [contenteditable='true']:focus")) return;

  if (absX < swipeConfig.minDistance) return;
  if (absX <= absY * swipeConfig.directionRatio) return;
  if (duration > swipeConfig.maxDuration && absX < swipeConfig.minDistance * 1.5) return;
  if (velocity < swipeConfig.minVelocity && absX < 120) return;

  const currentIndex = tabsList.indexOf(getActiveTabId());
  if (currentIndex === -1) return;

  // Swipe Left -> Advance Forward to rightwards tabs
  if (dx < 0 && currentIndex < tabsList.length - 1) {
    switchTab(tabsList[currentIndex + 1]);
  }
  // Swipe Right -> Step Backward to leftwards tabs (Allows transition into sidebarTab seamless boundary mapping)
  if (dx > 0 && currentIndex > 0) {
    switchTab(tabsList[currentIndex - 1]);
  }
}, { passive: true });

document.addEventListener("touchcancel", resetSwipeState, { passive: true });

// SECTION 8 — INITIAL LOAD
document.addEventListener("DOMContentLoaded", () => {
  // Keeps uploadTab as default view context at initial layout bootstrap sequence
  switchTab("uploadTab");
});
