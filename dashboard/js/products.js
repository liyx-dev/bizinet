// ================================================================
//  BiziNet · Products Tab (Upload & Manage Engine)
//  dashboard/js/products.js
// ================================================================

// Local structural reference variables linked safely to the global runtime environment
let runtimeState = null;
let currentSessionToken = null;

// Direct pointers to our unified shared instances
const supabaseUrl    = window.APP_CONFIG.supabaseUrl;
const renderUrl      = window.APP_CONFIG.renderUrl;
const supabaseClient = window.APP_CLIENT;

// Global application trackers
let els = {};
let quill;

// This wrapper is fired automatically by tab-loader.js once partial HTML is safe in the DOM
async function loadProducts() {
  
  // ─── CRITICAL CRASH GUARD ───
  // We pause execution here until runtime.js completes its auth verification
  // and populates the shared window context.
  await window.APP_RUNTIME_READY;
  
  runtimeState        = window.APP_RUNTIME.runtimeState;
  currentSessionToken = window.APP_RUNTIME.currentSessionToken;
  if (!runtimeState) return;

  // ── Element cache (Populated after partial products.html exists in DOM)
  els = {
    formTitle:                document.getElementById("formTitle"),
    cancelEditBtn:            document.getElementById("cancelEditBtn"),
    name:                     document.getElementById("name"),
    price:                    document.getElementById("price"),
    stock:                    document.getElementById("stock"),
    category:                 document.getElementById("category"),
    tags:                     document.getElementById("tags"),
    discount:                 document.getElementById("discount"),
    discountPreview:          document.getElementById("discountPreview"),
    isVisible:                document.getElementById("isVisible"),
    isFeatured:               document.getElementById("isFeatured"),
    whatsapp:                 document.getElementById("whatsapp"),
    youtube:                  document.getElementById("youtube"),
    description:              document.getElementById("description"),
    images:                   document.getElementById("images"),
    video:                    document.getElementById("video"),
    existingVideoBanner:      document.getElementById("existingVideoBanner"),
    dropZone:                 document.getElementById("dropZone"),
    preview:                  document.getElementById("preview"),
    liveImage:                document.getElementById("liveImage"),
    liveName:                 document.getElementById("liveName"),
    livePrice:                document.getElementById("livePrice"),
    liveDesc:                 document.getElementById("liveDesc"),
    submitBtn:                document.getElementById("submitBtn"),
    statusText:               document.getElementById("statusText"),
    progressContainer:        document.getElementById("progressContainer"),
    progressBar:              document.getElementById("progressBar"),
    previewVideoBtn:          document.getElementById("previewVideoBtn"),
    mediaModal:               document.getElementById("mediaModal"),
    modalContent:             document.getElementById("modalContent"),
    productsTableBody:        document.getElementById("productsTableBody"),
    productsMobileContainer:  document.getElementById("productsMobileContainer")
  };

  // ── Quill editor initialization
  quill = new Quill("#editor", {
    theme: "snow",
    placeholder: "Write detailed product description...",
    modules: {
      toolbar: [
        [{ color: [] }, { background: [] }],
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike"],
        [{ align: [] }],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link"],
        ["clean"]
      ]
    }
  });

  // Quill picker overflow fix for mobile
  setTimeout(() => {
    document.querySelectorAll(".ql-picker").forEach(picker => {
      picker.addEventListener("click", () => {
        const options = picker.querySelector(".ql-picker-options");
        if (!options) return;
        const rect = options.getBoundingClientRect();
        if (rect.right > window.innerWidth) { options.style.left = "auto"; options.style.right = "0"; }
        if (rect.left  < 0)                { options.style.left = "0";    options.style.right = "auto"; }
      });
    });
  }, 500);

  // ── Core Operational Functional State Management ──
  let selectedImages        = [];
  let uploading             = false;
  let editingProductId      = null;
  let currentEditingProduct = null;
  let filesToDeleteFromR2   = [];
  let currentSearch         = "";
  let currentVisibilityFilter = "";
  let currentPage           = 1;
  const PAGE_SIZE           = 10;

  // ── Sortable — image previews
  Sortable.create(els.preview, {
    animation: 150,
    ghostClass: "sortable-ghost",
    onEnd: (evt) => {
      const item = selectedImages.splice(evt.oldIndex, 1)[0];
      selectedImages.splice(evt.newIndex, 0, item);
      updateLive();
    }
  });

  // ── Sortable — desktop table
  Sortable.create(els.productsTableBody, {
    animation: 150,
    handle: ".drag-handle",
    onEnd: async () => {
      const ids = [...els.productsTableBody.children].map(x => x.dataset.id);
      await supabaseClient.rpc("reorder_products", { p_ids: ids });
      toast("Desktop order updated", "success");
      internalLoadProducts();
    }
  });

  // ── Sortable — mobile cards
  Sortable.create(els.productsMobileContainer, {
    animation: 150,
    handle: ".drag-handle",
    onEnd: async () => {
      const ids = [...els.productsMobileContainer.children].map(x => x.dataset.id);
      await supabaseClient.rpc("reorder_products", { p_ids: ids });
      toast("Mobile order updated", "success");
      internalLoadProducts();
    }
  });

  // ================================================================
  // LIVE PREVIEW UPDATER
  // ================================================================
  function updateLive() {
    if (!els.liveName) return;
    els.liveName.textContent = els.name.value.trim() || "Product Name";
    const rawPrice = els.price.value;
    els.livePrice.textContent = rawPrice ? `${Number(rawPrice).toLocaleString()}` : "0";

    const descHTML = quill.root.innerHTML.trim();
    if (descHTML && descHTML !== "<p><br></p>") {
      els.liveDesc.innerHTML = descHTML;
    } else {
      els.liveDesc.innerHTML = "<span style='color:var(--text-muted)'>Description preview will appear here...</span>";
    }

    if (selectedImages.length > 0) {
      els.liveImage.src = selectedImages[0].url;
    } else {
      els.liveImage.src = "https://placehold.co/600x400?text=Image+Preview";
    }

    const imgCount    = document.getElementById("previewImgCount");
    const stockCount  = document.getElementById("previewStockCount");
    const videoStatus = document.getElementById("previewVideoStatus");
    if (imgCount)    imgCount.textContent    = selectedImages.length;
    if (stockCount)  stockCount.textContent  = els.stock.value || 1;
    if (videoStatus) videoStatus.textContent = (els.video.files?.length > 0)
      ? "✓" : (currentEditingProduct?.video_url ? "✓" : "—");

    const price    = Number(els.price.value    || 0);
    const discount = Number(els.discount.value || 0);
    if (discount > 0 && price > 0) {
      const original = Math.round(price / (1 - discount / 100));
      els.discountPreview.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:4px;">
          <span style="color:var(--liyog-red);">${discount}% OFF</span>
          <span style="text-decoration:line-through;color:var(--text-muted);">₦${original.toLocaleString()}</span>
          <span style="font-size:15px;color:var(--liyog-green);">Now: ₦${price.toLocaleString()}</span>
        </div>`;
    } else {
      els.discountPreview.textContent = "No discount applied";
    }
  }

  // ================================================================
  // LOAD CATEGORIES (dropdown selection)
  // ================================================================
  async function loadCategories() {
    if (!els.category) return;
    try {
      els.category.innerHTML = `<option>Loading...</option>`;
      const { data, error } = await supabaseClient
        .from("categories")
        .select("id,name")
        .eq("store_id", runtimeState.store_id)
        .order("name");
      if (error) throw error;
      els.category.innerHTML = `<option value="">Select category</option>`;
      (data || []).forEach(cat => {
        const opt = document.createElement("option");
        opt.value       = cat.id;
        opt.textContent = cat.name;
        els.category.appendChild(opt);
      });
    } catch (err) {
      console.error("loadCategories error:", err);
      els.category.innerHTML = `<option value="">Couldn't load categories</option>`;
    }
  }
  window.loadCategories = loadCategories;

  // ================================================================
  // IMAGE MANAGERS & COMPRESSION
  // ================================================================
  function renderPreviews() {
    if (!els.preview) return;
    els.preview.innerHTML = "";
    selectedImages.forEach(img => {
      const item = document.createElement("div");
      item.className = "preview-item";
      item.innerHTML = `
        <img src="${img.url}" alt="preview">
        <button class="remove-btn" onclick="removeImage('${img.id}')">×</button>`;
      els.preview.appendChild(item);
    });
    updateLive();
  }

  window.removeImage = function (imgId) {
    const idx = selectedImages.findIndex(i => i.id === imgId);
    if (idx === -1) return;
    const img = selectedImages[idx];
    if (img.url?.startsWith("blob:")) URL.revokeObjectURL(img.url);
    if (img.existing) filesToDeleteFromR2.push(img.url);
    selectedImages.splice(idx, 1);
    renderPreviews();
  };

  async function handleFiles(fileList) {
    const files = [...fileList];
    if (selectedImages.length + files.length > 10) {
      return toast("Maximum 10 images allowed.", "error");
    }
    for (const file of files) {
      try {
        const optimised = await window.optimizeImage(file);
        selectedImages.push({
          id:   crypto.randomUUID(),
          file: optimised,
          url:  URL.createObjectURL(optimised),
          existing: false
        });
      } catch (e) {
        toast(`Couldn't process ${file.name}`, "error");
      }
    }
    renderPreviews();
  }

  // ================================================================
  // VIDEO ENGINE VALIDATION
  // ================================================================
  async function validateVideo(file) {
    if (file.size > 50 * 1024 * 1024) throw new Error("Video must be under 50MB.");
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const url   = URL.createObjectURL(file);
      video.src   = url;
      video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(true); };
      video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Invalid video file.")); };
    });
  }

  // ================================================================
  // CLOUD STORAGE UPLOAD / REMOVAL (R2 BUCKETS)
  // ================================================================
  async function uploadFile(file) {
    const payload = { fileName: file.name, fileType: file.type, fileSize: file.size, folder: "products" };
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-r2-upload-url`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${currentSessionToken}`
      },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Upload URL failed.");
    await fetch(result.uploadUrl, {
      method:  "PUT",
      headers: { "Content-Type": file.type },
      body:    file
    });
    return result.publicUrl;
  }

  async function deleteFromR2(url) {
    if (!url) return;
    try {
      const fileKey = url.replace(window.APP_CONFIG.r2PublicBase + "/", "");
      if (fileKey === url) return;
      await fetch(`${supabaseUrl}/functions/v1/delete-r2-file`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${currentSessionToken}`
        },
        body: JSON.stringify({ fileKey })
      });
    } catch (e) { console.error("R2 delete error:", e); }
  }

  // ================================================================
  // UX CORE VISUAL STATUS INDICATORS
  // ================================================================
  function setStatus(loading, text, progress = null) {
    if (!els.submitBtn) return;
    els.submitBtn.disabled = loading;
    els.submitBtn.innerHTML = loading
      ? `<span class="spinner"></span><span>${text}</span>`
      : `<span>${text || "Upload Product"}</span>`;
    if (els.progressContainer) els.progressContainer.style.display = loading ? "block" : "none";
    if (progress !== null && els.progressBar) els.progressBar.style.width = `${progress}%`;
  }

  function updateStatus(text, isWarning = false) {
    if (!els.statusText) return;
    els.statusText.textContent = text;
    els.statusText.style.color = isWarning ? "var(--liyog-red)" : "var(--text-muted)";
  }

  // ================================================================
  // DATA VALIDATION PIPELINE
  // ================================================================
  function validateForm() {
    let valid = true;
    const markError = (el) => {
      if (!el) return;
      el.classList.add("input-error", "animate-shake");
      setTimeout(() => el.classList.remove("animate-shake"), 400);
      valid = false;
    };
    const clearError = (el) => el?.classList.remove("input-error");

    if (!els.name.value.trim())                          { markError(els.name);     } else { clearError(els.name); }
    if (!els.price.value || isNaN(Number(els.price.value))) { markError(els.price); } else { clearError(els.price); }
    if (els.whatsapp.value && !/^\d{10,15}$/.test(els.whatsapp.value.replace(/\D/g, ""))) {
      markError(els.whatsapp); toast("Enter a valid WhatsApp number (10-15 digits).", "error");
    } else { clearError(els.whatsapp); }
    if (els.youtube.value && !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)/.test(els.youtube.value)) {
      markError(els.youtube); toast("Enter a valid YouTube URL.", "error");
    } else { clearError(els.youtube); }
    if (selectedImages.length === 0) {
      toast("Please add at least one product image.", "error"); valid = false;
    }
    return valid;
  }

  // ================================================================
  // TRANSACTION STAGE CLEAN RESET
  // ================================================================
  window.resetForm = function () {
    if (!els.formTitle) return;
    els.formTitle.textContent     = "Upload New Product";
    els.cancelEditBtn.classList.add("hidden");
    els.name.value                = "";
    els.price.value               = "";
    els.stock.value               = "";
    els.discount.value            = "";
    els.tags.value                = "";
    els.whatsapp.value            = "";
    els.youtube.value             = "";
    els.isVisible.checked         = true;
    els.isFeatured.checked        = false;
    els.category.value            = "";
    quill.setText("");
    selectedImages.forEach(img => { if (img.url?.startsWith("blob:")) URL.revokeObjectURL(img.url); });
    selectedImages        = [];
    filesToDeleteFromR2   = [];
    editingProductId      = null;
    currentEditingProduct = null;
    renderPreviews();
    setStatus(false, "Upload Product");
    updateStatus("");
    els.existingVideoBanner.classList.add("hidden");
    if (els.video) els.video.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ================================================================
  // MULTIMEDIA CONTEXT MODALS (WINDOW EVENTS)
  // ================================================================
  window.previewYouTube = function () {
    const url = els.youtube.value.trim();
    if (!url) return toast("Paste a YouTube URL first.", "error");
    let videoId = null;
    try {
      const u = new URL(url);
      videoId = u.searchParams.get("v") || u.pathname.split("/").pop();
    } catch { videoId = url.split("v=")[1]?.split("&")[0]; }
    if (!videoId) return toast("Couldn't find a video ID in that URL.", "error");
    els.modalContent.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" frameborder="0" allow="autoplay;encrypted-media" allowfullscreen style="width:100%;height:100%;"></iframe>`;
    els.mediaModal.style.display = "flex";
    document.body.style.overflow = "hidden";
  };

  window.previewLocalVideo = function () {
    const file = els.video.files?.[0];
    if (!file) return toast("No video selected.", "error");
    const url  = URL.createObjectURL(file);
    els.modalContent.innerHTML = `<video src="${url}" controls autoplay style="width:100%;height:100%;object-fit:contain;"></video>`;
    els.mediaModal.style.display = "flex";
    document.body.style.overflow = "hidden";
  };

  window.previewExistingVideo = function () {
    const url = currentEditingProduct?.video_url;
    if (!url) return toast("No existing video found.", "error");
    els.modalContent.innerHTML = `<video src="${url}" controls autoplay style="width:100%;height:100%;object-fit:contain;"></video>`;
    els.mediaModal.style.display = "flex";
    document.body.style.overflow = "hidden";
  };

  window.removeExistingVideo = function () {
    if (currentEditingProduct?.video_url) filesToDeleteFromR2.push(currentEditingProduct.video_url);
    els.existingVideoBanner.classList.add("hidden");
    if (currentEditingProduct) currentEditingProduct.video_url = null;
    updateLive();
  };

  window.closeModal = function () {
    els.mediaModal.style.display = "none";
    els.modalContent.innerHTML   = "";
    document.body.style.overflow = "";
  };

  // ================================================================
  // DRAG & DROP AREA CAPTURE HANDLERS
  // ================================================================
  els.dropZone.addEventListener("click",     () => els.images.click());
  els.dropZone.addEventListener("dragover",  e  => { e.preventDefault(); els.dropZone.classList.add("dragover"); });
  els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragover"));
  els.dropZone.addEventListener("drop", e => {
    e.preventDefault();
    els.dropZone.classList.remove("dragover");
    handleFiles(e.dataTransfer.files);
  });
  els.images.addEventListener("change", e => { handleFiles(e.target.files); els.images.value = ""; });

  els.video.addEventListener("change", () => {
    els.previewVideoBtn.style.display = els.video.files?.length > 0 ? "inline-flex" : "none";
    updateLive();
  });

  // Event maps for live rendering synchronization
  ["name", "price", "stock", "discount"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", updateLive);
  });
  quill.on("text-change", updateLive);

  // ================================================================
  // ENGINE INVENTORY WRITEBACK SUBMISSION
  // ================================================================
  window.submitProduct = async function () {
    if (uploading)       return;
    if (!validateForm()) return;

    uploading = true;
    setStatus(true, "Preparing upload…", 5);
    updateStatus("Starting upload…");

    try {
      // Upload images
      const imageUrls = [];
      let uploaded    = 0;
      for (const img of selectedImages) {
        if (img.existing) { imageUrls.push(img.url); uploaded++; }
        else {
          setStatus(true, `Uploading image ${uploaded + 1} of ${selectedImages.length}…`, Math.round((uploaded / selectedImages.length) * 60) + 10);
          imageUrls.push(await uploadFile(img.file));
          uploaded++;
        }
      }

      // Upload video if new
      let videoUrl = currentEditingProduct?.video_url || null;
      if (els.video.files?.length > 0) {
        const vFile = els.video.files[0];
        setStatus(true, "Validating video…", 70);
        await validateVideo(vFile);
        setStatus(true, "Uploading video…", 75);
        videoUrl = await uploadFile(vFile);
      }

      setStatus(true, editingProductId ? "Updating product…" : "Saving product…", 90);

      const tags        = els.tags.value.split(",").map(t => t.trim()).filter(Boolean);
      const description = quill.root.innerHTML.trim();
      const categoryId  = els.category.value || null;
      const payload     = {
        p_name:                els.name.value.trim(),
        p_price:               Number(els.price.value),
        p_image_urls:          imageUrls,
        p_description:         description,
        p_whatsapp_number:     els.whatsapp.value.trim() || null,
        p_category_id:         categoryId,
        p_tags:                tags,
        p_video_url:           videoUrl,
        p_youtube_url:         els.youtube.value.trim() || null,
        p_stock_quantity:      Number(els.stock.value || 0),
        p_is_visible:          els.isVisible.checked,
        p_is_featured:         els.isFeatured.checked,
        p_discount_percentage: Number(els.discount.value || 0)
      };

      let error;
      if (editingProductId) {
        const { error: e } = await supabaseClient.rpc("update_product", { ...payload, p_id: editingProductId });
        error = e;
      } else {
        const { error: e } = await supabaseClient.rpc("create_product", payload);
        error = e;
      }
      if (error) throw error;

      // Clean old assets out of cloud bucket safely
      for (const url of filesToDeleteFromR2) await deleteFromR2(url);
      filesToDeleteFromR2 = [];

      toast(editingProductId ? "Product updated ✓" : "Product uploaded ✓", "success");
      setStatus(true, "Done!", 100);
      setTimeout(() => { resetForm(); internalLoadProducts(); }, 800);

    } catch (err) {
      console.error("submitProduct error:", err);
      toast(err.message || "Upload failed. Please try again.", "error");
      setStatus(false, editingProductId ? "Update Product" : "Upload Product");
      updateStatus("Something went wrong.", true);
    } finally {
      uploading = false;
    }
  };

  // ================================================================
  // REPOSITORY RECORD MANAGEMENT TOGGLES
  // ================================================================
  window.toggleVisible = async function (id, current) {
    const { error } = await supabaseClient.from("products").update({ is_visible: !current }).eq("id", id);
    if (error) return toast("Couldn't update visibility.", "error");
    toast(current ? "Product hidden." : "Product visible ✓", "success");
    internalLoadProducts();
  };

  window.toggleProductFeatured = async function (id, current) {
    const { error } = await supabaseClient.from("products").update({ is_featured: !current }).eq("id", id);
    if (error) return toast("Couldn't update featured status.", "error");
    toast(current ? "Removed from featured." : "Marked as featured ✓", "success");
    internalLoadProducts();
  };

  window.deleteProduct = async function (id) {
    if (!confirm("Delete this product permanently?")) return;
    try {
      const { data: prod } = await supabaseClient.from("products").select("image_urls,video_url").eq("id", id).single();
      for (const url of (prod?.image_urls || [])) await deleteFromR2(url);
      if (prod?.video_url) await deleteFromR2(prod.video_url);
      const { error } = await supabaseClient.rpc("delete_product_full", { p_id: id });
      if (error) throw error;
      toast("Product deleted ✓", "success");
      internalLoadProducts();
    } catch (err) {
      toast("Couldn't delete product. Please try again.", "error");
    }
  };

  // ================================================================
  // FETCH & RENDER CORE ENGINE PRODUCTS
  // ================================================================
  async function internalLoadProducts() {
    if (!els.productsTableBody || !els.productsMobileContainer) return;
    
    // Inject visual loaders
    els.productsTableBody.innerHTML = [1,2,3].map(() => `
      <tr>
        <td><div class="skeleton" style="width:44px;height:44px;border-radius:10px;"></div></td>
        <td><div class="skeleton" style="height:14px;width:80%;margin-bottom:6px;"></div><div class="skeleton" style="height:12px;width:55%;"></div></td>
        <td><div class="skeleton" style="height:30px;width:120px;"></div></td>
        <td><div class="skeleton" style="height:30px;width:140px;"></div></td>
      </tr>`).join("");
      
    els.productsMobileContainer.innerHTML = [1,2].map(() => `
      <div class="mobile-product-card">
        <div class="skeleton" style="height:72px;width:72px;border-radius:14px;flex-shrink:0;"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
          <div class="skeleton" style="height:14px;width:70%;"></div>
          <div class="skeleton" style="height:12px;width:50%;"></div>
        </div>
      </div>`).join("");

    try {
      let query = supabaseClient
        .from("products")
        .select("*, categories(name)", { count: "exact" })
        .eq("store_id", runtimeState.store_id)
        .order("sort_order", { ascending: true })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

      if (currentSearch)          query = query.ilike("name", `%${currentSearch}%`);
      if (currentVisibilityFilter === "visible")  query = query.eq("is_visible", true);
      if (currentVisibilityFilter === "hidden")   query = query.eq("is_visible", false);
      if (currentVisibilityFilter === "featured") query = query.eq("is_featured", true);

      const { data: products, error, count } = await query;
      if (error) throw error;

      els.productsTableBody.innerHTML      = "";
      els.productsMobileContainer.innerHTML = "";

      (products || []).forEach(product => {
        const imgUrl      = product.image_urls?.[0] || "https://placehold.co/80x80?text=No+Image";
        const catName     = product.categories?.name || "Uncategorised";
        const discount    = product.discount_percentage || 0;
        const price       = Number(product.price || 0);
        const original    = discount > 0 ? Math.round(price / (1 - discount / 100)) : price;
        const priceFmt    = `₦${price.toLocaleString()}`;
        const originalFmt = `₦${original.toLocaleString()}`;

        const priceHtml = discount > 0
          ? `<div style="display:flex;flex-direction:column;gap:2px;">
               <span style="text-decoration:line-through;color:var(--text-muted);font-size:12px;">${originalFmt}</span>
               <span style="color:var(--liyog-green);font-weight:700;">${priceFmt}</span>
               <span style="color:var(--liyog-red);font-size:11px;font-weight:700;">${discount}% OFF</span>
             </div>`
          : priceFmt;

        // Desktop structural generation
        const tr = document.createElement("tr");
        tr.dataset.id = product.id;
        tr.innerHTML = `
          <td><span class="drag-handle">⠿</span></td>
          <td><img src="${imgUrl}" class="product-thumb" alt="${product.name}" onerror="this.src='https://placehold.co/52x52?text=?'"></td>
          <td>
            <div class="prod-name">${product.name || "Unnamed"}</div>
            <div class="prod-price">${priceHtml}</div>
            <div class="prod-meta">${catName} · Stock: ${product.stock_quantity || 0}</div>
          </td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="toggle-btn ${product.is_visible  ? "active"        : ""}" onclick="toggleVisible('${product.id}', ${product.is_visible})">👁 Visible</button>
              <button class="toggle-btn ${product.is_featured ? "featured active" : ""}" onclick="toggleProductFeatured('${product.id}', ${product.is_featured})">⭐ Featured</button>
            </div>
          </td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="action-btn" onclick="moveProduct('${product.id}','up')">⬆️</button>
              <button class="action-btn" onclick="moveProduct('${product.id}','down')">⬇️</button>
              <button class="action-btn edit-btn"   onclick="editProduct('${product.id}')">✏️ Edit</button>
              <button class="action-btn delete-btn" onclick="deleteProduct('${product.id}')">🗑</button>
            </div>
          </td>`;
        els.productsTableBody.appendChild(tr);

        // Mobile structural card generation
        const card = document.createElement("div");
        card.className = "mobile-product-card";
        card.dataset.id = product.id;
        card.innerHTML = `
          <div class="mobile-card-top">
            <span class="mobile-card-drag drag-handle">☰</span>
            <img src="${imgUrl}" class="mobile-card-img" alt="${product.name}" onerror="this.src='https://placehold.co/72x72?text=?'">
            <div class="mobile-card-info">
              <div class="mobile-card-name">${product.name || "Unnamed"}</div>
              <div class="mobile-card-price">${priceHtml}</div>
              <div class="mobile-card-cat">${catName}</div>
              <div class="mobile-card-stock">Stock: ${product.stock_quantity || 0}</div>
            </div>
          </div>
          <div class="mobile-card-footer">
            <div class="mobile-card-toggles">
              <button class="toggle-btn ${product.is_visible  ? "active"         : ""}" onclick="toggleVisible('${product.id}', ${product.is_visible})">👁 Visible</button>
              <button class="toggle-btn ${product.is_featured ? "featured active" : ""}" onclick="toggleProductFeatured('${product.id}', ${product.is_featured})">⭐ Featured</button>
            </div>
            <div class="mobile-card-actions">
              <button class="action-btn" onclick="moveProduct('${product.id}','up')">⬆️</button>
              <button class="action-btn" onclick="moveProduct('${product.id}','down')">⬇️</button>
              <button class="action-btn edit-btn"   onclick="editProduct('${product.id}')">✏️</button>
              <button class="action-btn delete-btn" onclick="deleteProduct('${product.id}')">🗑</button>
            </div>
          </div>`;
        els.productsMobileContainer.appendChild(card);
      });

      // Synchronize viewport responsive visibility tables layouts
      if (typeof window.applyTableLayout === "function") {
        window.applyTableLayout();
      }

      // Pagination render loop engine logic
      const paginationWrap = document.getElementById("pagination");
      if (paginationWrap) {
        paginationWrap.innerHTML = "";
        const totalPages = Math.ceil((count || 0) / PAGE_SIZE);
        if (totalPages > 1) {
          const prevBtn = document.createElement("button");
          prevBtn.className = "page-btn"; prevBtn.textContent = "← Prev";
          prevBtn.disabled  = currentPage === 1;
          prevBtn.onclick   = () => { currentPage--; internalLoadProducts(); };
          paginationWrap.appendChild(prevBtn);

          const pageInd = document.createElement("span");
          pageInd.className   = "page-indicator";
          pageInd.textContent = `${currentPage} / ${totalPages}`;
          paginationWrap.appendChild(pageInd);

          const nextBtn = document.createElement("button");
          nextBtn.className = "page-btn"; nextBtn.textContent = "Next →";
          nextBtn.disabled  = currentPage >= totalPages;
          nextBtn.onclick   = () => { currentPage++; internalLoadProducts(); };
          paginationWrap.appendChild(nextBtn);
        }
      }

    } catch (err) {
      console.error("loadProducts error:", err);
      toast("Couldn't load products. Please try again.", "error");
    }
  }

  // Bind references globally for tab loaders or cross-module access maps
  window.loadProducts = internalLoadProducts;

  // ================================================================
  // FILTER INPUT CAPTURE ACTIONS
  // ================================================================
  document.getElementById("searchProducts")?.addEventListener("input", e => {
    currentSearch = e.target.value.trim(); currentPage = 1; internalLoadProducts();
  });
  document.getElementById("filterVisibility")?.addEventListener("change", e => {
    currentVisibilityFilter = e.target.value; currentPage = 1; internalLoadProducts();
  });

  // ================================================================
  // ROW FOCUS RECORD EDIT CORRECTION ENGINE
  // ================================================================
  window.editProduct = async function (id) {
    resetForm();
    toast("Loading product details...", "info", 2000);
    const { data, error } = await supabaseClient.from("products").select("*").eq("id", id).single();
    if (error) return toast("Failed to load product.", "error");

    editingProductId      = id;
    currentEditingProduct = data;
    els.formTitle.textContent = "Edit Product";
    els.cancelEditBtn.classList.remove("hidden");
    els.name.value     = data.name             || "";
    els.price.value    = data.price            || "";
    els.stock.value    = data.stock_quantity   || "0";
    els.discount.value = data.discount_percentage || 0;
    els.isVisible.checked  = data.is_visible  ?? true;
    els.isFeatured.checked = data.is_featured ?? false;
    quill.root.innerHTML   = data.description || "";
    els.whatsapp.value = data.whatsapp_number || "";
    els.category.value = data.category_id     || "";
    els.tags.value     = Array.isArray(data.tags) ? data.tags.join(",") : (data.tags || "");
    els.youtube.value  = data.youtube_url     || "";

    if (data.video_url) els.existingVideoBanner.classList.remove("hidden");

    selectedImages = (data.image_urls || []).map(url => ({
      id: crypto.randomUUID(), file: null, url, existing: true
    }));
    renderPreviews();
    els.submitBtn.innerHTML = `<span>Update Product</span>`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelector('[data-tab="uploadTab"]')?.click();
  };

  // ================================================================
  // RECORD SORT SEQUENCER ADJUSTMENTS
  // ================================================================
  window.moveProduct = async function (id, direction) {
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    const container = isDesktop ? els.productsTableBody : els.productsMobileContainer;
    if (!container) return;
    const rows      = [...container.children];
    const ids       = rows.map(r => r.dataset.id);
    const index     = ids.indexOf(id);
    if (index === -1) return;
    if (direction === "up"   && index > 0)              [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    if (direction === "down" && index < ids.length - 1) [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
    const { error } = await supabaseClient.rpc("reorder_products", { p_ids: ids });
    if (error) { toast("Reorder failed.", "error"); return; }
    toast("Product moved ✓", "success");
    await internalLoadProducts();
  };

  // ================================================================
  // IMMEDIATE VIEW EXECUTION INITIALIZATION
  // ================================================================
  updateLive();
  await loadCategories();
  await internalLoadProducts();
}

// Make loadProducts globally reachable for tab-loader.js immediately on file execution
window.loadProducts = loadProducts;
