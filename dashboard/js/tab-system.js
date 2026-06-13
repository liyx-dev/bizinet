// ============================================================
// BiziNet · Tab System — Unified File
// dashboard/js/tab-system.js
//
// WHAT THIS FILE OWNS:
//   1. Lazy-load flags for every tab (_catLoaded, _storiesLoaded, _settingsLoaded)
//   2. Tab click handler (shows/hides sections + triggers first-load of each tab)
//   3. Smart swipe gesture system (touchstart / touchmove / touchend)
//   4. switchTab() — the shared UI function used by both click & swipe
//   5. Helper guards: isModalOpen, isIgnoredSwipeTarget,
//                     hasHorizontalScrollableAncestor,
//                     pauseMediaInSection, lockSection
//
// HOW TO ADD A NEW TAB IN THE FUTURE:
//   Step 1 — Add its ID to tabsList array below.
//   Step 2 — Add a flag:  let _myNewTabLoaded = false;
//   Step 3 — Add a block in the click handler:
//              if (tab === "myNewTab" && !_myNewTabLoaded) {
//                _myNewTabLoaded = true;
//                await loadMyNewTab();
//              }
//   That's it. Swipe picks it up automatically from tabsList.
//
// WHERE TO LOAD THIS FILE:
//   Bottom of <body>, AFTER tabscript.js and tab-loader.js:
//
//   <script src="js/tabscript.js"></script>
//   <script src="js/tab-loader.js"></script>
//   <script src="js/tab-system.js"></script>   ← this file
//
// ============================================================


// ============================================================
// SECTION 1 — TAB REGISTRY
// Add every tab ID here. The swipe system reads this list
// automatically, so new tabs get swipe support for free.
// ============================================================
const tabsList = [
  "uploadTab",
  "storiesTab",
  "categoriesTab",
  "settingsTab"
  // "myNewTab"  ← just uncomment / add a new line for future tabs
];


// ============================================================
// SECTION 2 — LAZY-LOAD FLAGS
// All flags live here in one place.
// When you add a new tab, add its flag here too.
// ============================================================
let _catLoaded      = false;
let _storiesLoaded  = false;
let _settingsLoaded = false;
// let _myNewTabLoaded = false;  ← future tab flag goes here


// ============================================================
// SECTION 3 — SWIPE CONFIGURATION
// Tune these numbers if swipe feels too sensitive or sluggish.
// ============================================================
const swipeConfig = {
  minDistance:     72,    // finger must travel at least this many px horizontally
  minVelocity:     0.18,  // px per ms — filters out slow deliberate drags
  directionRatio:  1.35,  // horizontal movement must beat vertical by this factor
  maxDuration:     850,   // gestures slower than this ms are ignored (unless long enough)
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

// Internal swipe tracking state — do not modify directly
const swipeState = {
  tracking:  false,
  startX:    0,
  startY:    0,
  startTime: 0
};


// ============================================================
// SECTION 4 — HELPER FUNCTIONS
// ============================================================

/** Returns the data-tab value of the currently active tab button */
function getActiveTabId() {
  return document.querySelector(".tab-btn.active")?.dataset?.tab || tabsList[0];
}

/** Returns true if any modal/dialog is currently open */
function isModalOpen() {
  const storyModal = document.getElementById("storyPreviewModal");
  if (storyModal && storyModal.classList.contains("open")) return true;

  const anyModal = document.querySelector('.modal.open, [role="dialog"][aria-hidden="false"]');
  return !!anyModal;
}

/**
 * Returns true if the touched element (or any ancestor) is on the
 * ignored list — inputs, buttons, sortable handles, etc.
 * Swipe will NOT fire when the finger lands on these.
 */
function isIgnoredSwipeTarget(target) {
  if (!(target instanceof Element)) return true;
  if (target.closest(swipeConfig.ignoredSelector)) return true;
  if (target.closest(".tabs-container")) return true;
  if (target.closest("[data-swipe-lock='true']")) return true;
  return false;
}

/**
 * Walks up the DOM from the touch target.
 * If any ancestor is horizontally scrollable, swipe is blocked
 * so the user can scroll that element normally instead.
 */
function hasHorizontalScrollableAncestor(target) {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    const overflowX = window.getComputedStyle(el).overflowX;
    if (
      (overflowX === "auto" || overflowX === "scroll") &&
      el.scrollWidth > el.clientWidth + 8
    ) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** Pauses all video/audio elements inside a tab section */
function pauseMediaInSection(section) {
  if (!section) return;
  section.querySelectorAll("video, audio").forEach(media => {
    try { media.pause(); } catch (_) {}
  });
}

/**
 * Locks or unlocks a section for accessibility.
 * Locked sections are inert (no keyboard/pointer interaction)
 * and marked aria-hidden so screen readers skip them.
 */
function lockSection(section, locked) {
  if (!section) return;
  if ("inert" in section) {
    section.inert = locked;
  }
  section.setAttribute("aria-hidden", locked ? "true" : "false");
}


// ============================================================
// SECTION 5 — switchTab()
// The single function that controls ALL show/hide logic.
// Called by both the click handler AND the swipe system.
// ============================================================
function switchTab(tabId) {
  if (!tabId || !tabsList.includes(tabId)) return;

  const targetBtn     = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const targetSection = document.getElementById(tabId);
  if (!targetBtn || !targetSection) return;

  // Update active state on all tab buttons
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn === targetBtn);
  });

  // Show active section, hide + lock all others
  document.querySelectorAll(".admin-section").forEach(section => {
    const isActive = section.id === tabId;
    section.classList.toggle("active", isActive);
    lockSection(section, !isActive);
    if (!isActive) pauseMediaInSection(section);
  });

  // Scroll the active tab button into view on small screens
  targetBtn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}


// ============================================================
// SECTION 6 — TAB CLICK HANDLER
// Wires up every .tab-btn to switchTab() + lazy data loaders.
// ============================================================
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", async () => {

    // Use switchTab for all show/hide + lock/unlock work
    const tabId = btn.dataset.tab;
    switchTab(tabId);

    // Lazy-load: each tab's data is fetched only on first visit
    if (tabId === "categoriesTab" && !_catLoaded) {
      _catLoaded = true;
      await loadCategoriesTab();
    }

    if (tabId === "settingsTab" && !_settingsLoaded) {
      _settingsLoaded = true;
      await window.loadSettings();
    }

    if (tabId === "storiesTab" && !_storiesLoaded) {
      _storiesLoaded = true;
      await window.loadStories();
    }

    // Future tab example — uncomment and rename when ready:
    // if (tabId === "myNewTab" && !_myNewTabLoaded) {
    //   _myNewTabLoaded = true;
    //   await loadMyNewTab();
    // }

  });
});


// ============================================================
// SECTION 7 — SMART SWIPE GESTURE SYSTEM
// Three touch events work as a team:
//   touchstart  → decide whether to track this gesture
//   touchmove   → cancel tracking if it becomes a vertical scroll
//   touchend    → validate and fire switchTab if all gates pass
// ============================================================

function resetSwipeState() {
  swipeState.tracking  = false;
  swipeState.startX    = 0;
  swipeState.startY    = 0;
  swipeState.startTime = 0;
}

// TOUCHSTART — begin tracking only if the gesture is eligible
document.addEventListener("touchstart", e => {
  if (e.touches.length !== 1) { resetSwipeState(); return; } // multi-touch: ignore

  const target = e.target;
  if (isModalOpen())                            return; // modal open: ignore
  if (isIgnoredSwipeTarget(target))             return; // input/button/etc: ignore
  if (hasHorizontalScrollableAncestor(target))  return; // inside h-scroll: ignore

  swipeState.tracking  = true;
  swipeState.startX    = e.touches[0].clientX;
  swipeState.startY    = e.touches[0].clientY;
  swipeState.startTime = performance.now();
}, { passive: true });

// TOUCHMOVE — if movement goes more vertical than horizontal, cancel
document.addEventListener("touchmove", e => {
  if (!swipeState.tracking || e.touches.length !== 1) return;

  const dx = e.touches[0].clientX - swipeState.startX;
  const dy = e.touches[0].clientY - swipeState.startY;

  if (Math.abs(dy) > Math.abs(dx) * swipeConfig.directionRatio) {
    resetSwipeState(); // it's a scroll, not a swipe
  }
}, { passive: true });

// TOUCHEND — run all validation gates, then navigate if everything passes
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

  // Post-end guards (double-check nothing changed mid-swipe)
  if (isModalOpen()) return;
  if (document.querySelector(".ql-editor:focus")) return;
  if (document.querySelector("input:focus, textarea:focus, select:focus, [contenteditable='true']:focus")) return;

  // Validation gates — ALL must pass for a swipe to register
  if (absX < swipeConfig.minDistance)                                      return; // too short
  if (absX <= absY * swipeConfig.directionRatio)                           return; // too vertical
  if (duration > swipeConfig.maxDuration && absX < swipeConfig.minDistance * 1.5) return; // too slow & short
  if (velocity < swipeConfig.minVelocity && absX < 120)                    return; // too slow

  // All gates passed — navigate
  const currentIndex = tabsList.indexOf(getActiveTabId());
  if (currentIndex === -1) return;

  if (dx < 0 && currentIndex < tabsList.length - 1) {
    switchTab(tabsList[currentIndex + 1]); // swipe left  → next tab
  }
  if (dx > 0 && currentIndex > 0) {
    switchTab(tabsList[currentIndex - 1]); // swipe right → previous tab
  }
}, { passive: true });

// TOUCHCANCEL — finger lifted by system (call/notification): clean up
document.addEventListener("touchcancel", resetSwipeState, { passive: true });


// ============================================================
// SECTION 8 — INITIAL LOAD
// Lock all hidden tabs on first page load so screen readers
// and keyboard users can't accidentally reach hidden content.
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const initialTab = getActiveTabId();
  switchTab(initialTab);
});
