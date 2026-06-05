// ================================================================
//  SETTINGS TAB — COMPLETE FIXED JS (PERFECTED MULTI-TENANT SAAS)
//  Fixes:
//  1. loadSettings exposed to window scope (reload button)
//  2. CORS / fetch fix for local editor (R2 upload via supabaseUrl)
//  3. Quill link popup z-index fix via CSS injection
//  4. Currencies & countries fetched from Supabase DB
//  5. Immediate R2 sync on logo/photo/doc remove (no orphans)
//  6. Listeners bound once after DOM ready
//  7. Resolved RPC 404 & Edge 400 by adhering to existing API signatures
// ================================================================

// ── STATE ────────────────────────────────────────────────────────
let settingsProfileId = null;
let selectedCurrency  = "₦";
let catBadges         = [];
let storePhotos       = [];  // {url, isNew, file?, isSaved}
let storeDocs         = [];  // {url, isNew, file?, isPdf, name, isSaved}
let _pendingLogoFile  = null;
let _existingLogoUrl  = null;
let bioEditor         = null;
let _listenersBound   = false;
let _settingsLoaded   = false; // track first load

const R2_PUBLIC_BASE  = "https://pub-0fc5736899f3449d987d356eafdca873.r2.dev";

// ── QUILL LINK POPUP FIX (z-index) ───────────────────────────────
// Inject CSS to fix Quill tooltip showing below the editor box
(function fixQuillTooltip() {
  const style = document.createElement("style");
  style.textContent = `
    .ql-tooltip {
      z-index: 9999 !important;
    }

    /* Ensure editor container doesn't clip tooltip */
    .ql-container {
      overflow: visible !important;
    }

    .ql-editor {
      overflow: visible !important;
    }

    /* Optional: prevent parent clipping */
    #st_bio_editor {
      overflow: visible !important;
    }
  `;
  document.head.appendChild(style);
})();

// ── HELPERS ──────────────────────────────────────────────────────
function r2KeyFromUrl(url) {
  if (!url) return null;
  return url.replace(R2_PUBLIC_BASE + "/", "");
}

/** Upload to R2 via presigned PUT 
 * Matches your secure multi-tenant Edge Function parameters exactly
 */
async function settingsUploadFile(file, folder) {
  // Step 1: Get presigned PUT URL using session token and exact payload match
  const res = await fetch(`${supabaseUrl}/functions/v1/generate-r2-upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${currentSessionToken}` // Authenticates your secure edge functions
    },
    body: JSON.stringify({ 
      fileName: file.name, 
      fileType: file.type, 
      folder: folder,
      fileSize: file.size // <-- FIXED: Added to satisfy edge size-limit validation rules!
    }) 
  });
  
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to get upload URL");
  
  // Step 2: PUT file directly to R2
  const upload = await fetch(result.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file
  });
  if (!upload.ok) throw new Error("Storage upload failed");
  
  // Step 3: Return public URL
  return result.publicUrl;
}

/** Delete from R2 immediately 
 * Cleaned up path formatting to avoid duplicate slash artifacts
 */
async function settingsDeleteFromR2(url) {
  if (!url) return true;
  try {
    // Strip public base url prefix to cleanly isolate the direct R2 object storage key path
    const basePrefix = R2_PUBLIC_BASE + "/";
    const fileKey = url.startsWith(basePrefix) ? url.replace(basePrefix, "") : url;
    
    if (!fileKey || fileKey === url) return true;
    
    const res = await fetch(`${supabaseUrl}/functions/v1/delete-r2-file`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentSessionToken}`
      },
      body: JSON.stringify({ fileKey })
    });
    return res.ok;
  } catch (e) {
    console.error("Storage delete error:", e);
    return false;
  }
}

/** Save profile logo_url column immediately to Supabase */
async function _syncLogoToSupabase(url) {
  if (!settingsProfileId) return;
  await supabaseClient
    .from("profile")
    .update({ logo_url: url || null })
    .eq("id", settingsProfileId)
    .eq("store_id", runtimeState.store_id); // Multi-tenant isolated layer check
}

/** Save store_photos array immediately to Supabase */
async function _syncPhotosToSupabase() {
  if (!settingsProfileId) return;
  const urls = storePhotos.filter(p => p.isSaved).map(p => p.url);
  await supabaseClient
    .from("profile")
    .update({ store_photos: urls })
    .eq("id", settingsProfileId)
    .eq("store_id", runtimeState.store_id); // Multi-tenant isolated layer check
}

/** Save documents array immediately to Supabase */
async function _syncDocsToSupabase() {
  if (!settingsProfileId) return;
  const urls = storeDocs.filter(d => d.isSaved).map(d => d.url);
  await supabaseClient
    .from("profile")
    .update({ documents: urls })
    .eq("id", settingsProfileId)
    .eq("store_id", runtimeState.store_id); // Multi-tenant isolated layer check
}

/** Compress image */
async function compressForSettings(file) {
  if (typeof optimizeImage === "function") {
    try { return await optimizeImage(file); } catch(e) {}
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const maxW = 1200;
      const scale = Math.min(1, maxW / img.width);
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) return reject("Compression failed");
        resolve(new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" }));
      }, "image/webp", 0.72);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function sanitizeHtml(html) {
  if (typeof DOMPurify !== "undefined") {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ["p","br","b","i","u","s","strong","em","h1","h2","h3","ul","ol","li","a","span","blockquote"],
      ALLOWED_ATTR: ["href","target","rel","class","style"]
    });
  }
  return html;
}

function stripHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.innerHTML = str;
  return div.textContent || div.innerText || "";
}

function lockTextField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    const clean = stripHtml(el.value);
    if (el.value !== clean) el.value = clean;
  });
  el.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    const pos = el.selectionStart;
    el.value = el.value.slice(0, pos) + text + el.value.slice(el.selectionEnd);
  });
}

function lockUrlField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain").trim();
    el.value = text;
  });
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function setSelectVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  for (let i = 0; i < el.options.length; i++) {
    if (el.options[i].value === val) { el.selectedIndex = i; break; }
  }
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? stripHtml(el.value.trim()) : "";
}

function getUrlVal(id) {
  const el = document.getElementById(id);
  if (!el) return "";
  const val = el.value.trim();
  if (val && !val.startsWith("http")) return "";
  return val;
}

// ── FETCH CURRENCIES FROM DB ──────────────────────────────────────
async function loadCurrencyOptions(selectedSymbol) {
  const container = document.getElementById("currencyOptions");
  const label     = document.getElementById("selectedCurrencyLabel");
  if (!container) return;

  try {
    const { data, error } = await supabaseClient.rpc("get_currencies");
    if (error) throw error;

    container.innerHTML = "";
    data.forEach(c => {
      const btn = document.createElement("button");
      btn.className = "currency-chip";
      btn.dataset.symbol = c.symbol;
      btn.textContent = `${c.symbol} ${c.name}`;
      btn.onclick = function() { window.selectCurrency(this); };
      if (c.symbol === selectedSymbol) {
        btn.classList.add("active");
        if (label) label.textContent = btn.textContent;
        selectedCurrency = c.symbol;
      }
      container.appendChild(btn);
    });
  } catch(e) {
    console.warn("Currencies DB failed, using fallback", e);
    const fallback = [
      {symbol:"₦",name:"Naira"},{symbol:"£",name:"Pound"},
      {symbol:"$",name:"Dollar"},{symbol:"R",name:"Rand"},
      {symbol:"€",name:"Euro"},{symbol:"GH₵",name:"Cedi"}
    ];
    container.innerHTML = "";
    fallback.forEach(c => {
      const btn = document.createElement("button");
      btn.className = "currency-chip";
      btn.dataset.symbol = c.symbol;
      btn.textContent = `${c.symbol} ${c.name}`;
      btn.onclick = function() { window.selectCurrency(this); };
      if (c.symbol === selectedSymbol) {
        btn.classList.add("active");
        if (label) label.textContent = btn.textContent;
        selectedCurrency = c.symbol;
      }
      container.appendChild(btn);
    });
  }
}

// ── FETCH COUNTRIES FROM DB ───────────────────────────────────────
async function loadCountryOptions(selectedCode) {
  const select = document.getElementById("st_country");
  if (!select) return;

  try {
    const { data, error } = await supabaseClient.rpc("get_countries");
    if (error) throw error;

    select.innerHTML = `<option value="">Select country...</option>`;
    data.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = `${c.flag} ${c.name}`;
      if (c.name === selectedCode) opt.selected = true;
      select.appendChild(opt);
    });
  } catch(e) {
    console.warn("Countries DB failed, using fallback", e);
  }
}

// ── CURRENCY PICKER ───────────────────────────────────────────────
window.selectCurrency = function(btn) {
  document.querySelectorAll(".currency-chip").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
  selectedCurrency = btn.dataset.symbol;
  const label = document.getElementById("selectedCurrencyLabel");
  if (label) label.textContent = btn.textContent;
};

// ── TRUST BADGES ──────────────────────────────────────────────────
function renderBadges() {
  const list = document.getElementById("badgeList");
  if (!list) return;
  list.innerHTML = "";
  catBadges.forEach((badge, i) => {
    const chip = document.createElement("span");
    chip.className = "badge-chip";
    chip.innerHTML = `🛡️ ${badge} <span class="remove-badge" onclick="removeBadge(${i})">×</span>`;
    list.appendChild(chip);
  });
}

window.addBadge = function() {
  const input = document.getElementById("newBadgeInput");
  const val = stripHtml(input.value.trim());
  if (!val) return toast("Type a badge text first.", "info");
  if (catBadges.length >= 8) return toast("Max 8 badges.", "error");
  catBadges.push(val);
  input.value = "";
  renderBadges();
};

window.removeBadge = function(i) {
  catBadges.splice(i, 1);
  renderBadges();
};

// ── LOGO ──────────────────────────────────────────────────────────
function showLogoPreview(url) {
  const img         = document.getElementById("logoPreviewImg");
  const placeholder = document.getElementById("logoPlaceholder");
  const actions     = document.getElementById("logoActions");
  if (img)         { img.src = url; img.style.display = "block"; }
  if (placeholder)   placeholder.style.display = "none";
  if (actions)       actions.style.display = "flex";
}

function clearLogoPreview() {
  const img         = document.getElementById("logoPreviewImg");
  const placeholder = document.getElementById("logoPlaceholder");
  const actions     = document.getElementById("logoActions");
  if (img)         { img.src = ""; img.style.display = "none"; }
  if (placeholder)   placeholder.style.display = "flex";
  if (actions)       actions.style.display = "none";
}

window.removeLogo = async function() {
  const btn = document.getElementById("removeLogoBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Removing…"; }

  try {
    const urlToDelete = _existingLogoUrl;
    _existingLogoUrl = null;
    _pendingLogoFile = null;
    clearLogoPreview();

    if (urlToDelete) {
      await settingsDeleteFromR2(urlToDelete);
      await _syncLogoToSupabase(null);
    }
    toast("Logo removed ✓", "success");
  } catch(e) {
    toast("Could not remove logo. Try again.", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "✕ Remove Logo"; }
  }
};

// ── STORE PHOTOS ──────────────────────────────────────────────────
function renderStorePhotos() {
  const grid    = document.getElementById("storePhotosGrid");
  const addBtn  = document.getElementById("storePhotosAddBtn");
  const countEl = document.getElementById("storePhotosCount");
  if (!grid) return;

  grid.innerHTML = "";
  storePhotos.forEach((photo, i) => {
    const item = document.createElement("div");
    item.className = "st-photo-item";
    if (photo.isUploading) {
      item.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;background:#f1f5f9;">
          <div class="spinner" style="width:24px;height:24px;"></div>
        </div>`;
    } else {
      item.innerHTML = `
        <img src="${photo.url}" alt="Store photo ${i+1}" loading="lazy">
        <button class="st-photo-remove" onclick="removeStorePhoto(${i})" title="Remove">×</button>`;
    }
    grid.appendChild(item);
  });

  const count = storePhotos.filter(p => !p.isUploading).length;
  if (countEl) countEl.textContent = `${storePhotos.length} / 5`;
  if (addBtn)  addBtn.style.display = storePhotos.length >= 5 ? "none" : "flex";
}

window.removeStorePhoto = async function(i) {
  const photo = storePhotos[i];
  if (!photo) return;

  storePhotos.splice(i, 1);
  renderStorePhotos();

  if (photo.isSaved && photo.url.startsWith(R2_PUBLIC_BASE)) {
    await settingsDeleteFromR2(photo.url);
    await _syncPhotosToSupabase();
  }
};

// ── DOCUMENTS ─────────────────────────────────────────────────────
function renderDocs() {
  const grid    = document.getElementById("docsGrid");
  const addBtn  = document.getElementById("docsAddBtn");
  const countEl = document.getElementById("docsCount");
  if (!grid) return;

  grid.innerHTML = "";
  storeDocs.forEach((doc, i) => {
    const item = document.createElement("div");
    item.className = "st-doc-item";
    item.title = doc.name || "Document";

    if (doc.isUploading) {
      item.innerHTML = `
        <span class="st-doc-icon">⏳</span>
        <span class="st-doc-label">Uploading…</span>`;
    } else if (doc.isPdf) {
      item.innerHTML = `
        <span class="st-doc-icon">📄</span>
        <span class="st-doc-label">${doc.name || "PDF"}</span>
        <button class="st-photo-remove" onclick="removeDoc(${i})" title="Remove">×</button>`;
    } else {
      item.innerHTML = `
        <img src="${doc.url}" alt="Document ${i+1}" loading="lazy">
        <span class="st-doc-label">${doc.name || "Doc"}</span>
        <button class="st-photo-remove" onclick="removeDoc(${i})" title="Remove">×</button>`;
    }
    if (!doc.isUploading) {
      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("st-photo-remove")) return;
        window.open(doc.url, "_blank");
      });
    }
    grid.appendChild(item);
  });

  const count = storeDocs.length;
  if (countEl) countEl.textContent = `${count} / 3`;
  if (addBtn)  addBtn.style.display = count >= 3 ? "none" : "flex";
}

window.removeDoc = async function(i) {
  const doc = storeDocs[i];
  if (!doc) return;

  storeDocs.splice(i, 1);
  renderDocs();

  if (doc.isSaved && doc.url.startsWith(R2_PUBLIC_BASE)) {
    await settingsDeleteFromR2(doc.url);
    await _syncDocsToSupabase();
  }
};

// ── QUILL INIT ────────────────────────────────────────────────────
function initQuill() {
  if (bioEditor) return;
  if (typeof Quill === "undefined") { console.warn("Quill not loaded"); return; }
  bioEditor = new Quill("#st_bio_editor", {
    theme: "snow",
    placeholder: "Tell customers about your store — your story, values, what makes you special...",
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike"],
        [{ color: [] }, { background: [] }],
        [{ align: [] }],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link"],
        ["clean"]
      ]
    }
  });
}

// ── BIND ALL LISTENERS (once, after form visible) ─────────────────
function _bindSettingsListeners() {
  if (_listenersBound) return;
  _listenersBound = true;

  document.getElementById("newBadgeInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); window.addBadge(); }
  });

  // ── LOGO INPUT ──────────────────────────────────────────────────
  document.getElementById("logoFileInput")?.addEventListener("change", async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    this.value = "";

    const oldUrl = _existingLogoUrl;
    const previewUrl = URL.createObjectURL(file);
    showLogoPreview(previewUrl);

    try {
      const compressed = await compressForSettings(file);
      toast("Uploading logo…", "info");
      const newUrl = await settingsUploadFile(compressed, "logos");

      await _syncLogoToSupabase(newUrl);
      if (oldUrl) await settingsDeleteFromR2(oldUrl);

      _existingLogoUrl = newUrl;
      _pendingLogoFile = null;
      showLogoPreview(newUrl);
      URL.revokeObjectURL(previewUrl);
      toast("Logo saved ✓", "success");

    } catch(err) {
      clearLogoPreview();
      if (oldUrl) showLogoPreview(oldUrl);
      _existingLogoUrl = oldUrl;
      toast("Logo upload failed. Try again.", "error");
    }
  });

  // ── STORE PHOTOS INPUT ──────────────────────────────────────────
  document.getElementById("storePhotosInput")?.addEventListener("change", async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    this.value = "";

    if (storePhotos.length >= 5) return toast("Max 5 store photos.", "error");

    const placeholder = { url: "", isUploading: true, isSaved: false };
    storePhotos.push(placeholder);
    renderStorePhotos();

    try {
      const compressed = await compressForSettings(file);
      const uploadedUrl = await settingsUploadFile(compressed, "store-photos");

      const idx = storePhotos.indexOf(placeholder);
      if (idx > -1) {
        storePhotos[idx] = { url: uploadedUrl, isUploading: false, isSaved: true };
      }

      await _syncPhotosToSupabase();
      renderStorePhotos();
      toast("Photo added ✓", "success");

    } catch(err) {
      const idx = storePhotos.indexOf(placeholder);
      if (idx > -1) storePhotos.splice(idx, 1);
      renderStorePhotos();
      toast("Photo upload failed. Try again.", "error");
    }
  });

  // ── DOCS INPUT ──────────────────────────────────────────────────
  document.getElementById("docsInput")?.addEventListener("change", async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    this.value = "";

    if (storeDocs.length >= 3) return toast("Max 3 documents.", "error");

    const isPdf = file.type === "application/pdf";
    const placeholder = { url: "", isUploading: true, isSaved: false, isPdf, name: file.name };
    storeDocs.push(placeholder);
    renderDocs();

    try {
      let processedFile = file;
      if (!isPdf) {
        try { processedFile = await compressForSettings(file); } catch(e) {}
      }

      const uploadedUrl = await settingsUploadFile(processedFile, "documents");

      const idx = storeDocs.indexOf(placeholder);
      if (idx > -1) {
        storeDocs[idx] = {
          url: uploadedUrl, isUploading: false, isSaved: true,
          isPdf, name: file.name
        };
      }

      await _syncDocsToSupabase();
      renderDocs();
      toast("Document added ✓", "success");

    } catch(err) {
      const idx = storeDocs.indexOf(placeholder);
      if (idx > -1) storeDocs.splice(idx, 1);
      renderDocs();
      toast("Document upload failed. Try again.", "error");
    }
  });

  // Lock text fields from HTML injection
  [
    "st_business_name","st_tagline","st_whatsapp","st_phone",
    "st_year_est","st_address","st_city","st_response_time",
    "st_wa_message","st_delivery_info","st_return_policy","newBadgeInput"
  ].forEach(lockTextField);

  // Lock URL fields
  ["st_facebook","st_instagram","st_twitter","st_tiktok","st_youtube","st_website"]
    .forEach(lockUrlField);
}

async function loadBusinessTypeOptions(selectedVal) {
  const select = document.getElementById("st_business_type");
  if (!select) return;

  try {
    const { data, error } = await supabaseClient.rpc("get_business_types");
    if (error) throw error;

    select.innerHTML = `<option value="">Select business type...</option>`;
    data.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.name;
      opt.textContent = b.name;
      if (b.name === selectedVal) opt.selected = true;
      select.appendChild(opt);
    });

  } catch (e) {
    console.warn("Business types DB failed, using fallback", e);
    const fallback = [
      "Retail Store", "Wholesaler", "Manufacturer", "Service Provider",
      "Digital Products", "Food & Restaurant", "Fashion & Clothing",
      "Electronics", "Health & Beauty"
    ];
    select.innerHTML = `<option value="">Select business type...</option>`;
    fallback.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === selectedVal) opt.selected = true;
      select.appendChild(opt);
    });
  }
}

// ── LOAD SETTINGS ─────────────────────────────────────────────────
window.loadSettings = async function() {
  const reloadBtn = document.querySelector(".st-reload-btn");
  const skeleton  = document.getElementById("settingsSkeleton");
  const form      = document.getElementById("settingsForm");

  if (reloadBtn) reloadBtn.classList.add("spinning");
  if (skeleton)  { skeleton.style.display = "grid"; }
  if (form)      { form.style.display = "none"; }

  try {
    const { data, error } = await supabaseClient
      .from("profile")
      .select("*")
      .eq("store_id", runtimeState.store_id) // Isolated tenancy security lookup
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    if (data) {
      settingsProfileId = data.id;

      setVal("st_business_name", data.business_name    || "");
      setVal("st_tagline",       data.tagline           || "");
      setVal("st_whatsapp",      data.whatsapp_number   || "");
      setVal("st_phone",         data.phone_number      || "");
      setVal("st_address",       data.store_address     || "");
      setVal("st_city",          data.store_city        || "");
      setVal("st_wa_message",    data.wa_message        || "Hi, I want to buy [Product Name]");
      setVal("st_response_time", data.response_time     || "");
      setVal("st_delivery_info", data.delivery_info     || "");
      setVal("st_return_policy", data.return_policy     || "");
      setVal("st_year_est",      data.year_established  || "");
      setSelectVal("st_business_type", data.business_type || "");

      await Promise.all([
        loadCurrencyOptions(data.currency_symbol || "₦"),
        loadCountryOptions(data.store_country || ""),
        loadBusinessTypeOptions(data.business_type || "")
      ]);

      setVal("st_facebook",  data.social_facebook  || "");
      setVal("st_instagram", data.social_instagram || "");
      setVal("st_twitter",   data.social_twitter   || "");
      setVal("st_tiktok",    data.social_tiktok    || "");
      setVal("st_youtube",   data.social_youtube   || "");
      setVal("st_website",   data.social_website   || "");

      catBadges = Array.isArray(data.trust_badges) ? data.trust_badges : [];
      renderBadges();

      _existingLogoUrl = data.logo_url || null;
      _existingLogoUrl ? showLogoPreview(_existingLogoUrl) : clearLogoPreview();

      initQuill();
      if (bioEditor) {
        bioEditor.root.innerHTML = sanitizeHtml(data.bio || "");
      }

      const rawPhotos = Array.isArray(data.store_photos) ? data.store_photos : [];
      storePhotos = rawPhotos.map(url => ({ url, isUploading: false, isSaved: true }));
      renderStorePhotos();

      const rawDocs = Array.isArray(data.documents) ? data.documents : [];
      storeDocs = rawDocs.map(url => ({
        url, isUploading: false, isSaved: true,
        isPdf: url.toLowerCase().endsWith(".pdf"),
        name: decodeURIComponent(url.split("/").pop())
      }));
      renderDocs();

    } else {
      settingsProfileId = null;
      initQuill();
      await Promise.all([
        loadCurrencyOptions("₦"),
        loadCountryOptions(""),
        loadBusinessTypeOptions("")
      ]);
      storePhotos = [];
      storeDocs   = [];
      renderStorePhotos();
      renderDocs();
      clearLogoPreview();
    }

    if (skeleton) skeleton.style.display = "none";
    if (form)      form.style.display     = "block";

    _bindSettingsListeners();

  } catch (err) {
    console.error("loadSettings error:", err);
    if (skeleton) skeleton.style.display = "none";
    if (form)      form.style.display     = "block";
    initQuill();
    _bindSettingsListeners();
    toast("Could not load settings.", "info");
  } finally {
    if (reloadBtn) reloadBtn.classList.remove("spinning");
  }
};

// ── SAVE SETTINGS ─────────────────────────────────────────────────
window.saveSettings = async function() {
  const btn = document.getElementById("saveSettingsBtn");
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:8px;vertical-align:middle;"></div>Saving…`;

  try {
    let bioHtml = "";
    if (bioEditor) {
      const raw = bioEditor.root.innerHTML;
      bioHtml = sanitizeHtml(raw);
      if (bioHtml === "<p><br></p>") bioHtml = "";
    }

    const finalPhotos = storePhotos.filter(p => p.isSaved).map(p => p.url);
    const finalDocs   = storeDocs.filter(d => d.isSaved).map(d => d.url);

    // RESTORED SIGNATURE: Removed p_store_id parameter so it perfectly maps your current RPC signature
    const payload = {
      p_id:               settingsProfileId,
      p_business_name:    getVal("st_business_name"),
      p_tagline:          getVal("st_tagline"),
      p_whatsapp_number:  getVal("st_whatsapp"),
      p_bio:              bioHtml,
      p_phone_number:     getVal("st_phone"),
      p_store_address:    getVal("st_address"),
      p_store_city:       getVal("st_city"),
      p_store_country:    getVal("st_country"),
      p_wa_message:       getVal("st_wa_message"),
      p_response_time:    getVal("st_response_time"),
      p_delivery_info:    getVal("st_delivery_info"),
      p_currency_symbol:  selectedCurrency,
      p_trust_badges:     catBadges,
      p_logo_url:         _existingLogoUrl || null,
      p_social_facebook:  getUrlVal("st_facebook"),
      p_social_instagram: getUrlVal("st_instagram"),
      p_social_twitter:   getUrlVal("st_twitter"),
      p_social_tiktok:    getUrlVal("st_tiktok"),
      p_social_youtube:   getUrlVal("st_youtube"),
      p_social_website:   getUrlVal("st_website"),
      p_store_photos:     finalPhotos,
      p_documents:        finalDocs,
      p_return_policy:    getVal("st_return_policy"),
      p_year_established: getVal("st_year_est"),
      p_business_type:    getVal("st_business_type")
    };

    const { data: saved, error } = await supabaseClient.rpc("upsert_profile", payload);
    if (error) throw error;

    if (saved && saved.length > 0 && saved[0].id) {
      settingsProfileId = saved[0].id;
      storePhotos.forEach(p => p.isSaved = true);
      storeDocs.forEach(d => d.isSaved = true);
    }

    const savedTag = document.getElementById("settingsSavedTag");
    if (savedTag) {
      savedTag.classList.add("show");
      setTimeout(() => savedTag.classList.remove("show"), 3000);
    }
    toast("Settings saved ✓", "success");

  } catch (err) {
    console.error("saveSettings error:", err);
    toast(err.message || "Failed to save settings.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Save All Settings";
  }
};
