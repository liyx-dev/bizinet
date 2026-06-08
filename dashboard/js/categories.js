
// ================================================================
//  SHARED HELPER — tiny toast alias (uses the one already in scope)
// ================================================================
// (toast() already exists in the outer DOMContentLoaded scope — no redeclaration)

// ================================================================
// CATEGORIES TAB — JavaScript v2  |  LIYOG ADMIN DASHBOARD
// Friendly language · Global CSS tokens · Search · Premium UX
// All RPC calls unchanged — only UI layer upgraded
// ================================================================
// ================================================================
//  BiziNet Tab Engine · Categories
//  dashboard/js/categories.js
// ================================================================

let runtimeState = null;
let currentSessionToken = null;
const supabaseClient = window.APP_CLIENT;

async function loadCategoriesTab() {
  await window.APP_RUNTIME_READY;
  
  runtimeState = window.APP_RUNTIME.runtimeState;
  currentSessionToken = window.APP_RUNTIME.currentSessionToken;
  if (!runtimeState) return;

const EMOJI_SHORTCUTS = [
  "👟","📱","🍔","👗","💄","🎮","📸","🏠","🌿","⌚",
  "🎒","🏋️","🍕","💻","🧴","🎁","👒","🛍️","🌸","🎵"
];

// Module state
let _catLoaded = false;
let catEditingId   = null;
let activeStoreCategoriesCache = []; // raw DB data, never mutated
let _catSortable   = null;
let _catSearchTerm = "";

// ── Render emoji picker inside modal
function renderEmojiPicker() {
  const picker = document.getElementById("emojiPicker");
  if (!picker) return;
  picker.innerHTML = "";

  EMOJI_SHORTCUTS.forEach(em => {
    const btn = document.createElement("button");
    btn.type      = "button";
    btn.textContent = em;
    btn.title     = `Use ${em} as icon`;
    btn.style.cssText = `
      font-size:20px;
      cursor:pointer;
      padding:4px;
      border-radius:7px;
      border:none;
      background:transparent;
      transition:all .15s;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      font-family:var(--font-body);
    `;
    btn.onmouseenter = () => {
      btn.style.transform  = "scale(1.2) translateY(-1px)";
      btn.style.background = "rgba(40,164,40,.1)";
    };
    btn.onmouseleave = () => {
      btn.style.transform  = "scale(1)";
      btn.style.background = "transparent";
    };
    btn.onclick = () => {
      const emojiEl = document.getElementById("catIconEmoji");
      const preview = document.getElementById("catIconPreview");
      emojiEl.textContent = em;
      
      // Visual feedback — pulse the preview
      preview.style.transform = "scale(1.08)";
      setTimeout(() => preview.style.transform = "scale(1)", 180);
    };
    picker.appendChild(btn);
  });
}

// ── Open modal
window.openCatModal = function (id = null) {
  catEditingId = id;

  const nameInput  = document.getElementById("catNameInput");
  const modalTitle = document.getElementById("catModalTitle");
  const modalIcon  = document.getElementById("catModalIcon");
  const emojiEl    = document.getElementById("catIconEmoji");
  const auditBox   = document.getElementById("catAuditTrailBox");
  const saveBtn    = document.getElementById("catSaveBtn");

  // Reset Form
  nameInput.value = "";
  nameInput.classList.remove("input-error", "animate-shake");
  emojiEl.textContent   = "🏷️";
  saveBtn.textContent   = "Save Category";
  saveBtn.disabled      = false;

  if (id) {
    const cat = activeStoreCategoriesCache.find(c => c.id === id);
    if (cat) {
      nameInput.value        = cat.name;
      modalTitle.textContent = "Edit Category";
      modalIcon.textContent  = "✏️";

      // If it contains an icon, render it straight as text safely
      if (cat.icon && !cat.icon.startsWith("http")) {
        emojiEl.textContent = cat.icon;
      } else {
        emojiEl.textContent = "🏷️";
      }

      document.getElementById("catAuditCreator").textContent = cat.creator_name || "—";
      document.getElementById("catAuditUpdater").textContent = cat.updater_name  || "—";
      auditBox.style.display = "block";
    }
  } else {
    modalTitle.textContent = "New Category";
    modalIcon.textContent  = "➕";
    auditBox.style.display = "none";
  }

  renderEmojiPicker();
  document.getElementById("catModal").classList.add("open");
  document.body.style.overflow = "hidden";
  setTimeout(() => nameInput.focus(), 220);
};

// ── Close modal
window.closeCatModal = function () {
  document.getElementById("catModal").classList.remove("open");
  document.body.style.overflow = "";
};

// Backdrop click closes modal
document.getElementById("catModal").addEventListener("click", function (e) {
  if (e.target === this) window.closeCatModal();
});

// ── Save / update category
window.saveCategory = async function () {
  const nameInput = document.getElementById("catNameInput");
  const name      = nameInput.value.trim();

  if (!name) {
    nameInput.classList.add("input-error", "animate-shake");
    setTimeout(() => nameInput.classList.remove("animate-shake"), 400);
    toast("Please enter a category name.", "error");
    return;
  }

  const saveBtn = document.getElementById("catSaveBtn");
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<span style="display:flex;align-items:center;gap:8px;justify-content:center;">
    <span style="display:inline-block;animation:cat-spin .7s linear infinite;">⏳</span> Saving…
  </span>`;

  try {
    let finalIconValue = document.getElementById("catIconEmoji").textContent;

    // Security Fallback validation: Ensure we don't send broken values or plain placeholder text
    if (!finalIconValue || finalIconValue === "🏷️") {
      // Extract the absolute first character typed into the name input box (safely checks for emojis via string splitting iterator)
      const segments = [...name];
      finalIconValue = segments[0] || "📦"; 
    }

    if (catEditingId) {
      const { error } = await supabaseClient.rpc("update_category", {
        p_id:   catEditingId,
        p_name: name,
        p_icon: finalIconValue
      });
      if (error) throw error;
      toast("Category updated successfully ✓", "success");
    } else {
      const { error } = await supabaseClient.rpc("create_category", {
        p_name: name,
        p_icon: finalIconValue
      });
      if (error) throw error;
      toast("Category created! ✓", "success");
    }

    window.closeCatModal();
    await loadCategoriesTab();
    if (typeof loadCategories === "function") await loadCategories();

  } catch (err) {
    console.error("Category save error:", err);
    toast(err.message || "Couldn't save category. Please try again.", "error");
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = "Save Category";
  }
};

// ── Delete category
window.deleteCategory = async function (id, name) {
  if (!confirm(`Delete "${name}"?\n\nProducts in this category will become uncategorised.`)) return;
  try {
    const { error } = await supabaseClient.rpc("delete_category_secure", { p_id: id });
    if (error) throw error;
    toast("Category deleted ✓", "success");
    await loadCategoriesTab();
    if (typeof loadCategories === "function") await loadCategories();
  } catch (err) {
    console.error("Category delete error:", err);
    toast(err.message || "Couldn't delete category. Try again.", "error");
  }
};

// ── Client-side search / filter
window.filterCatGrid = function (term) {
  _catSearchTerm = term.toLowerCase().trim();
  _renderCatGrid();
};

// ── Build a single pill element
function _buildCatPill(cat) {
  const pill = document.createElement("div");
  pill.className    = "cat-pill";
  pill.dataset.id   = cat.id;

  // Render text emoji safely, fall back instantly if old data has a URL asset lingering
  const displayIcon = (cat.icon && !cat.icon.startsWith("http")) ? cat.icon : "📦";
  const iconMarkup = `<div class="cat-pill-icon">${displayIcon}</div>`;
  const safeName = (cat.name || "").replace(/'/g, "\\'");

  pill.innerHTML = `
    ${iconMarkup}
    <div class="cat-pill-name">${cat.name || "Untitled"}</div>
    <div class="cat-pill-actions">
      <button class="cat-pill-btn cat-edit-btn"
        onclick="window.openCatModal('${cat.id}')"
        title="Edit">✏️</button>
      <button class="cat-pill-btn cat-delete-btn"
        onclick="window.deleteCategory('${cat.id}','${safeName}')"
        title="Delete">🗑️</button>
    </div>`;

  return pill;
}

// ── Render grid from cache (applies search filter)
function _renderCatGrid() {
  const grid = document.getElementById("catGrid");
  if (!grid) return;

  if (_catSortable) { _catSortable.destroy(); _catSortable = null; }
  grid.innerHTML = "";

  const visible = _catSearchTerm
    ? activeStoreCategoriesCache.filter(c =>
        (c.name || "").toLowerCase().includes(_catSearchTerm))
    : activeStoreCategoriesCache;

  if (activeStoreCategoriesCache.length === 0) {
    grid.innerHTML = `
      <div class="cat-empty-state">
        <div class="cat-empty-icon">🗂️</div>
        <div class="cat-empty-title">No categories yet</div>
        <div class="cat-empty-sub">Tap "New Category" to get started</div>
      </div>`;
    return;
  }

  if (visible.length === 0) {
    grid.innerHTML = `
      <div class="cat-no-results">
        No categories match "<strong>${_catSearchTerm}</strong>"
      </div>`;
    return;
  }

  visible.forEach(cat => grid.appendChild(_buildCatPill(cat)));

  if (!_catSearchTerm) {
    _catSortable = Sortable.create(grid, {
      animation: 200,
      ghostClass:   "sortable-ghost",
      chosenClass:  "sortable-chosen",
      delay:           120,
      delayOnTouchOnly: true,
      onEnd: async () => {
        const updatedIds = Array.from(grid.querySelectorAll(".cat-pill"))
          .map(el => el.dataset.id)
          .filter(Boolean);

        toast("Saving order…", "info", 1000);

        const { error } = await supabaseClient.rpc("reorder_categories", {
          p_ids: updatedIds
        });

        if (error) {
          console.error("Reorder error:", error);
          toast("Couldn't save new order. Please try again.", "error");
          await loadCategoriesTab();
        } else {
          toast("Order saved ✓", "success");
          const idOrder = updatedIds;
          activeStoreCategoriesCache.sort((a, b) =>
            idOrder.indexOf(a.id) - idOrder.indexOf(b.id)
          );
        }
      }
    });
  }
}

// ── Load + render categories from DB
async function loadCategoriesTab() {
  const grid       = document.getElementById("catGrid");
  const reloadBtn  = document.getElementById("catReloadBtn");
  if (!grid) return;

  if (reloadBtn)  reloadBtn.classList.add("spinning");

  grid.innerHTML = [1, 2, 3, 4].map(() => `
    <div class="cat-pill" style="pointer-events:none;opacity:.7;">
      <div class="cat-skel-icon"></div>
      <div class="cat-skel-text" style="width:65%;margin-top:4px;"></div>
    </div>`).join("");

  try {
    const { data, error } = await supabaseClient.rpc("get_store_categories_v2");
    if (error) throw error;

    activeStoreCategoriesCache = data || [];

    const badge = document.getElementById("catCountBadge");
    if (badge) {
      const n = activeStoreCategoriesCache.length;
      badge.textContent = `${n} categor${n === 1 ? "y" : "ies"}`;
    }

    const searchInput = document.getElementById("catSearchInput");
    if (searchInput) { searchInput.value = ""; _catSearchTerm = ""; }

    _renderCatGrid();

  } catch (err) {
    console.error("Categories load error:", err);
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px 20px;background:var(--surface-card);border-radius:var(--radius-md);border:1px solid rgba(255,59,48,.2);">
        <div style="font-size:36px;margin-bottom:10px;">😕</div>
        <p style="font-weight:700;color:var(--text-primary);margin-bottom:6px;">Couldn't load categories</p>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Check your connection and try again</p>
        <button onclick="loadCategoriesTab()" style="background:linear-gradient(135deg,var(--liyog-green),var(--liyog-green-dark));color:#fff;border:none;border-radius:var(--radius-sm);padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-body);">🔄 Retry</button>
      </div>`;
    toast("Couldn't load categories. Please try again.", "error");
  } finally {
    if (reloadBtn) reloadBtn.classList.remove("spinning");
  }
}

window.loadCategoriesTab = loadCategoriesTab;
