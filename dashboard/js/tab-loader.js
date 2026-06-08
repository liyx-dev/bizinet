// ======================================================
// BIZINET DASHBOARD PARTIAL LOADER
// ======================================================

async function injectPartial(containerId, filePath) {

  const container = document.getElementById(containerId);

  if (!container) {
    console.error(`Container not found: ${containerId}`);
    return;
  }

  try {

    const response = await fetch(filePath);

    if (!response.ok) {
      throw new Error(
        `Failed to load ${filePath} (${response.status})`
      );
    }

    const html = await response.text();

    container.innerHTML = html;

  } catch (err) {

    console.error(err);

    container.innerHTML = `
      <div style="
        padding:20px;
        color:red;
        font-weight:600;
      ">
        Failed to load:
        ${filePath}
      </div>
    `;
  }
}


// ======================================================
// LOAD ALL TABS
// ======================================================

async function loadDashboardTabs() {

  try {

    await Promise.all([

      injectPartial(
        "productsContainer",
        "./partials/products.html"
      ),

      injectPartial(
        "storiesContainer",
        "./partials/stories.html"
      ),

      injectPartial(
        "categoriesContainer",
        "./partials/categories.html"
      ),

      injectPartial(
        "settingsContainer",
        "./partials/settings.html"
      )

    ]);

    initializeDashboard();

  } catch (err) {

    console.error(
      "Dashboard initialization failed:",
      err
    );

  }
}


// ======================================================
// AFTER HTML EXISTS
// ======================================================

function initializeDashboard() {

  // Products
  if (typeof loadProducts === "function") {
    loadProducts();
  }

  // Stories
  if (typeof loadStories === "function") {
    loadStories();
  }

  // Categories
  if (typeof loadCategoriesTab === "function") {
    loadCategoriesTab();
  }

  // Settings
  if (typeof loadSettings === "function") {
    loadSettings();
  }
// ── ADDED THIS LINE BELOW TO ACTIVATE YOUR TABS AND SWIPING ──
  if (typeof window.initTabNavigation === "function") {
    window.initTabNavigation();
  }
  console.log(
    "✅ Dashboard partials loaded successfully"
  );
}


// ======================================================
// START
// ======================================================

document.addEventListener(
  "DOMContentLoaded",
  loadDashboardTabs
);

