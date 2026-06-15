// ============================================================
// BiziNet · Tab & Sidebar Swipe System Engine
// dashboard/js/tab-system.js
// ============================================================

// SECTION 1 — STRUCTURAL REGISTRY
// Sidebar is NO LONGER treated as a real tab.
const tabsList = [
  "uploadTab",
  "storiesTab",
  "categoriesTab",
  "settingsTab"
];

// SECTION 2 — MODULE FLAGS
let _catLoaded = false;
let _storiesLoaded = false;
let _settingsLoaded = false;

// SECTION 3 — GESTURE RULES CONFIGURATION
const swipeConfig = {
  minDistance: 65,
  minVelocity: 0.15,
  directionRatio: 1.25,
  maxDuration: 750,
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
    "video",
    "audio",
    ".premium-bottom-nav",
    ".bottom-nav-item"
  ].join(",")
};

const swipeState = {
  tracking: false,
  startX: 0,
  startY: 0,
  startTime: 0
};

// SECTION 4 — OBJECT DOM ACCESSORS
const bizinetSidebar = document.getElementById("bizinetSidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const sidebarTrigger = document.getElementById("sidebarTrigger");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");

// SECTION 5 — SIDEBAR CONTROLLER
function openSidebarDrawer() {
  if (!bizinetSidebar) return;

  bizinetSidebar.classList.add("open");

  if (sidebarBackdrop) {
    sidebarBackdrop.classList.add("active");
  }
}

function closeSidebarDrawer() {
  if (!bizinetSidebar) return;

  bizinetSidebar.classList.remove("open");

  if (sidebarBackdrop) {
    sidebarBackdrop.classList.remove("active");
  }
}

// SECTION 6 — TAB HELPERS
function getActiveTabId() {
  return (
    document.querySelector(".tab-btn.active")?.dataset?.tab ||
    "uploadTab"
  );
}

function syncTabIndicators(tabId) {

  document.querySelectorAll(".tab-btn").forEach(btn => {

    // Ignore sidebar navigation trigger
    if (btn.dataset.tab) {
      btn.classList.toggle(
        "active",
        btn.dataset.tab === tabId
      );
    }

  });

  document.querySelectorAll(".bottom-nav-item").forEach(item => {
    item.classList.toggle(
      "active",
      item.dataset.navTarget === tabId
    );
  });
}

// SECTION 7 — TAB RENDER ENGINE
function switchTab(tabId) {

  if (!tabId) return;

  if (!tabsList.includes(tabId)) return;

  const targetSection =
    document.getElementById(tabId);

  if (!targetSection) return;

  syncTabIndicators(tabId);

  document.querySelectorAll(".admin-section").forEach(section => {

    const isActive =
      section.id === tabId;

    section.classList.toggle(
      "active",
      isActive
    );

    if ("inert" in section) {
      section.inert = !isActive;
    }

    section.setAttribute(
      "aria-hidden",
      isActive ? "false" : "true"
    );

    if (!isActive) {
      section
        .querySelectorAll("video, audio")
        .forEach(media => {
          try {
            media.pause();
          } catch (_) {}
        });
    }

  });

  const targetBtn =
    document.querySelector(
      `.tab-btn[data-tab="${tabId}"]`
    );

  if (targetBtn) {
    targetBtn.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest"
    });
  }

  triggerLazyLoad(tabId);
}

// SECTION 8 — LAZY LOAD ENGINE
async function triggerLazyLoad(tabId) {

  if (
    tabId === "categoriesTab" &&
    !_catLoaded
  ) {
    _catLoaded = true;

    if (typeof loadCategoriesTab === "function") {
      await loadCategoriesTab();
    }
  }

  if (
    tabId === "settingsTab" &&
    !_settingsLoaded
  ) {
    _settingsLoaded = true;

    if (window.loadSettings) {
      await window.loadSettings();
    }
  }

  if (
    tabId === "storiesTab" &&
    !_storiesLoaded
  ) {
    _storiesLoaded = true;

    if (window.loadStories) {
      await window.loadStories();
    }
  }
}

// SECTION 9 — INTERACTIVE MONITOR LISTENERS

document.querySelectorAll(".tab-btn").forEach(btn => {

  btn.addEventListener("click", () => {

    const tabId = btn.dataset.tab;

    // Sidebar trigger remains supported
    if (tabId === "sidebarTab") {
      openSidebarDrawer();
      return;
    }

    switchTab(tabId);

  });

});

document.querySelectorAll(".bottom-nav-item").forEach(item => {

  item.addEventListener("click", () => {

    switchTab(
      item.dataset.navTarget
    );

  });

});

if (sidebarTrigger) {
  sidebarTrigger.addEventListener(
    "click",
    openSidebarDrawer
  );
}

if (sidebarCloseBtn) {
  sidebarCloseBtn.addEventListener(
    "click",
    closeSidebarDrawer
  );
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener(
    "click",
    closeSidebarDrawer
  );
}

// SECTION 10 — SWIPE ENGINE

function resetSwipeState() {

  swipeState.tracking = false;
  swipeState.startX = 0;
  swipeState.startY = 0;
  swipeState.startTime = 0;

}

document.addEventListener(
  "touchstart",
  e => {

    if (e.touches.length !== 1) {
      resetSwipeState();
      return;
    }

    const target = e.target;

    if (
      bizinetSidebar?.classList.contains("open")
    ) {
      return;
    }

    if (
      target.closest(
        swipeConfig.ignoredSelector
      )
    ) {
      return;
    }

    let el =
      target instanceof Element
        ? target
        : null;

    while (
      el &&
      el !== document.body
    ) {

      const overflowX =
        window.getComputedStyle(el)
          .overflowX;

      if (
        (overflowX === "auto" ||
          overflowX === "scroll") &&
        el.scrollWidth >
          el.clientWidth + 8
      ) {
        return;
      }

      el = el.parentElement;
    }

    swipeState.tracking = true;
    swipeState.startX =
      e.touches[0].clientX;
    swipeState.startY =
      e.touches[0].clientY;
    swipeState.startTime =
      performance.now();

  },
  { passive: true }
);

document.addEventListener(
  "touchmove",
  e => {

    if (
      !swipeState.tracking ||
      e.touches.length !== 1
    ) {
      return;
    }

    const dx =
      e.touches[0].clientX -
      swipeState.startX;

    const dy =
      e.touches[0].clientY -
      swipeState.startY;

    if (
      Math.abs(dy) >
      Math.abs(dx) *
        swipeConfig.directionRatio
    ) {
      resetSwipeState();
    }

  },
  { passive: true }
);

document.addEventListener(
  "touchend",
  e => {

    if (!swipeState.tracking) {
      return;
    }

    const touch =
      e.changedTouches[0];

    if (!touch) {
      resetSwipeState();
      return;
    }

    const dx =
      touch.clientX -
      swipeState.startX;

    const dy =
      touch.clientY -
      swipeState.startY;

    const absX =
      Math.abs(dx);

    const absY =
      Math.abs(dy);

    const duration =
      performance.now() -
      swipeState.startTime;

    const velocity =
      absX /
      Math.max(duration, 1);

    resetSwipeState();

    if (
      absX <
      swipeConfig.minDistance
    ) {
      return;
    }

    if (
      absX <=
      absY *
        swipeConfig.directionRatio
    ) {
      return;
    }

    if (
      duration >
        swipeConfig.maxDuration &&
      absX <
        swipeConfig.minDistance *
          1.5
    ) {
      return;
    }

    if (
      velocity <
        swipeConfig.minVelocity &&
      absX < 120
    ) {
      return;
    }

    const currentTab =
      getActiveTabId();

    const currentIndex =
      tabsList.indexOf(
        currentTab
      );

    if (currentIndex === -1) {
      return;
    }

    // Swipe Left
    if (
      dx < 0 &&
      currentIndex <
        tabsList.length - 1
    ) {

      switchTab(
        tabsList[currentIndex + 1]
      );

      return;
    }

    // Swipe Right
    if (dx > 0) {

      // Upload → Sidebar Drawer
      if (
        currentTab ===
        "uploadTab"
      ) {
        openSidebarDrawer();
        return;
      }

      if (currentIndex > 0) {
        switchTab(
          tabsList[currentIndex - 1]
        );
      }

    }

  },
  { passive: true }
);

document.addEventListener(
  "touchcancel",
  resetSwipeState,
  { passive: true }
);

// SECTION 11 — INITIALIZATION
document.addEventListener(
  "DOMContentLoaded",
  () => {

    switchTab("uploadTab");

  }
);

