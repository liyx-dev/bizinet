// =============================
  //  RESPONSIVE TABLE SHOW/HIDE LOGIC
// ===============================
  // Show table on md+ screens, cards on mobile
function applyTableLayout() {
  const desktopWrap = document.querySelector('.table-wrap');
  const mobileWrap = document.getElementById('productsMobileContainer');

  if (!desktopWrap || !mobileWrap) return;

  const isDesktop = window.innerWidth >= 768;

  desktopWrap.style.display = isDesktop ? "block" : "none";

  mobileWrap.style.display = isDesktop ? "none" : "flex";
}

window.addEventListener("resize", applyTableLayout);

window.addEventListener("orientationchange", applyTableLayout);

document.addEventListener("DOMContentLoaded", applyTableLayout);

// ================================================
//  BiziNet · Main Application Script
//  dashboard/js/tabscript.js
// ================================================

// Read config injected by config.js
const supabaseUrl = window.APP_CONFIG.supabaseUrl;
const supabaseKey = window.APP_CONFIG.supabaseKey;
const renderUrl   = window.APP_CONFIG.renderUrl;

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let els  = {};
let quill;

document.addEventListener("DOMContentLoaded", async () => {

 
// =============================================
// DYNAMIC SESSION & RUNTIME GUARD
// =============================================

let runtimeState = null;
let currentSessionToken = null;

async function executeBootGuard() {
  try {

    // Check Auth
    const {
      data: { session },
      error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError || !session) {
      return safeNavigate('auth');
    }

    // Store current access token
    currentSessionToken = session.access_token;

    // Check Runtime Truth
    const {
      data: runtimeData,
      error: runtimeError
    } = await supabaseClient.rpc('get_store_runtime_state');

    if (
      runtimeError ||
      !runtimeData ||
      runtimeData.length === 0
    ) {
      return safeNavigate('auth');
    }

    // Store runtime state globally within this page
    runtimeState = runtimeData[0];

    // Enforce backend redirect logic
    if (runtimeState.redirect_to !== '/dashboard/') {
      return safeNavigate(runtimeState.redirect_to);
    }

  } catch (err) {

    console.error('Boot failure', err);
    safeNavigate('auth');

  }
}

// Run immediately
await executeBootGuard();

 els = {
    formTitle: document.getElementById("formTitle"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),
    name: document.getElementById("name"),
    price: document.getElementById("price"),
    stock: document.getElementById("stock"),
    category: document.getElementById("category"),
    tags: document.getElementById("tags"),
    discount: document.getElementById("discount"),
    discountPreview: document.getElementById("discountPreview"),
    isVisible: document.getElementById("isVisible"),
    isFeatured: document.getElementById("isFeatured"),
    whatsapp: document.getElementById("whatsapp"),
    youtube: document.getElementById("youtube"),
    description: document.getElementById("description"),
    images: document.getElementById("images"),
    video: document.getElementById("video"),
    existingVideoBanner: document.getElementById("existingVideoBanner"),
    dropZone: document.getElementById("dropZone"),
    preview: document.getElementById("preview"),
    liveImage: document.getElementById("liveImage"),
    liveName: document.getElementById("liveName"),
    livePrice: document.getElementById("livePrice"),
    liveDesc: document.getElementById("liveDesc"),
    submitBtn: document.getElementById("submitBtn"),
    statusText: document.getElementById("statusText"),
    progressContainer: document.getElementById("progressContainer"),
    progressBar: document.getElementById("progressBar"),
    previewVideoBtn: document.getElementById("previewVideoBtn"),
    mediaModal: document.getElementById("mediaModal"),
    modalContent: document.getElementById("modalContent"),
    productsTableBody: document.getElementById("productsTableBody"),
    productsMobileContainer: document.getElementById("productsMobileContainer")
  };

quill = new Quill('#editor', {
  theme: 'snow',
  placeholder: 'Write detailed product description...',
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

// Prevents overflow for quill on screens 
setTimeout(() => {
  document.querySelectorAll('.ql-picker').forEach(picker => {
    picker.addEventListener('click', () => {
      const options = picker.querySelector('.ql-picker-options');
      if (!options) return;
      const rect = options.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        options.style.left = 'auto';
        options.style.right = '0';
      }
      if (rect.left < 0) {
        options.style.left = '0';
        options.style.right = 'auto';
      }
    });
  });
}, 500);

  // STATE
  let selectedImages = [];
  let uploading = false;
  let editingProductId = null;
  let currentEditingProduct = null;
  let filesToDeleteFromR2 = [];

  let currentSearch = "";
  let currentVisibilityFilter = "";
  let currentPage = 1;
  const PAGE_SIZE = 10;

  // SORTABLE — image previews
  Sortable.create(els.preview, {
    animation: 150,
    ghostClass: 'sortable-ghost',
    onEnd: function (evt) {
      const item = selectedImages.splice(evt.oldIndex, 1)[0];
      selectedImages.splice(evt.newIndex, 0, item);
      updateLive();
    }
  });

  // SORTABLE — desktop table
  Sortable.create(els.productsTableBody, {
    animation: 150,
    handle: '.drag-handle',
    onEnd: async () => {
      const ids = [...els.productsTableBody.children].map(x => x.dataset.id);
      await supabaseClient.rpc("reorder_products", { p_ids: ids });
      toast("Desktop order updated", "success");
      loadProducts();
    }
  });

  // SORTABLE — mobile cards
  Sortable.create(els.productsMobileContainer, {
    animation: 150,
    handle: '.drag-handle',
    onEnd: async () => {
      const ids = [...els.productsMobileContainer.children].map(x => x.dataset.id);
      await supabaseClient.rpc("reorder_products", { p_ids: ids });
      toast("Mobile order updated", "success");
      loadProducts();
    }
  });

  // TOAST
  function toast(msg, type = "success", duration = 4000) {
    const div = document.createElement("div");
    div.className = `toast ${type}`;
    div.textContent = msg;
    document.body.appendChild(div);
    requestAnimationFrame(() => div.classList.add("show"));
    setTimeout(() => {
      div.classList.remove("show");
      setTimeout(() => div.remove(), 300);
    }, duration);
  }

  // LIVE PREVIEW UPDATER
  function updateLive() {
    els.liveName.textContent = els.name.value.trim() || "Product Name";
    const rawPrice = els.price.value;
    els.livePrice.textContent = rawPrice ? `${Number(rawPrice).toLocaleString()}` : "0";
    const descHTML = quill.root.innerHTML.trim();

if (
  descHTML &&
  descHTML !== "<p><br></p>"
) {
  els.liveDesc.innerHTML = descHTML;
} else {
  els.liveDesc.innerHTML =
    "<span style='color:var(--text-muted)'>Description preview will appear here...</span>";
}
    if (selectedImages.length > 0) {
      els.liveImage.src = selectedImages[0].url;
    } else {
      els.liveImage.src = "https://placehold.co/600x400?text=Image+Preview";
    }
    // update mini stats
    const imgCount = document.getElementById("previewImgCount");
    const stockCount = document.getElementById("previewStockCount");
    const videoStatus = document.getElementById("previewVideoStatus");
    if (imgCount) imgCount.textContent = selectedImages.length;
    if (stockCount) stockCount.textContent = els.stock.value || 1;
    if (videoStatus) videoStatus.textContent = (els.video.files && els.video.files.length > 0) ? "✓" : (currentEditingProduct?.video_url ? "✓" : "—");

const price = Number(els.price.value || 0);
const discount = Number(els.discount.value || 0);

if (discount > 0 && price > 0) {
  const original = Math.round(price / (1 - (discount / 100)));

  els.discountPreview.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:4px;">
      <span style="color:var(--liyog-red);">
        ${discount}% OFF
      </span>

      <span style="text-decoration:line-through;color:var(--text-muted);">
        ₦${original.toLocaleString()}
      </span>

      <span style="font-size:15px;color:var(--liyog-green);">
        Now: ₦${price.toLocaleString()}
      </span>
    </div>
  `;
} else {
  els.discountPreview.textContent = "No discount applied";
}
  }

async function loadCategories() {
  try {
    els.category.innerHTML = `<option>Loading...</option>`;
    
    // UPGRADED: Added explicit store_id filter for strict SaaS isolation
    const { data, error } = await supabaseClient
      .from("categories")
      .select("id,name")
      .eq("store_id", runtimeState.store_id) 
      .order("name");
      
    if (error) throw error;
    
    els.category.innerHTML = `<option value="">Select a category</option>`;
    
    data.forEach(cat => {
      const option = document.createElement("option");
      option.value = cat.id; 
      option.textContent = cat.name;
      els.category.appendChild(option);
    });
    
  } catch (err) { 
    toast("Failed to load categories.", "error"); 
  }
}

  // IMAGE OPTIMISE
  async function optimizeImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const reader = new FileReader();
      reader.onload = e => { img.src = e.target.result; }; reader.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d");
        const maxWidth = 1200; const scale = Math.min(1, maxWidth / img.width);
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) return reject("Processing failed");
          resolve(new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" }));
        }, "image/webp", 0.70);
      };
      img.onerror = reject; reader.readAsDataURL(file);
    });
  }

  function renderPreviews() {
    els.preview.innerHTML = "";
    selectedImages.forEach((imageObj) => {
      const div = document.createElement("div");
      div.className = "preview-item"; div.setAttribute("data-id", imageObj.id);
      const img = document.createElement("img"); img.src = imageObj.url;
      const btn = document.createElement("div"); btn.className = "remove-btn"; btn.innerHTML = "&times;";
      btn.onclick = (e) => { e.stopPropagation(); removeImage(imageObj.id); };
      div.appendChild(img); div.appendChild(btn); els.preview.appendChild(div);
    });
    updateLive();
  }

  function removeImage(id) {
    const imgToRemove = selectedImages.find(img => img.id === id);
    if (imgToRemove) {
      if (!imgToRemove.existing) URL.revokeObjectURL(imgToRemove.url);
      else filesToDeleteFromR2.push(imgToRemove.url);
    }
    selectedImages = selectedImages.filter(img => img.id !== id);
    renderPreviews();
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter(file => file.type.startsWith("image/"));
    if (selectedImages.length + files.length > 10) return toast("Maximum 10 images allowed.", "error");
    els.dropZone.style.opacity = "0.6";
    for (let file of files) {
      try {
        const optimized = await optimizeImage(file);
        selectedImages.push({ id: crypto.randomUUID(), file: optimized, url: URL.createObjectURL(optimized), existing: false });
      } catch { toast(`Failed to process ${file.name}`, "error"); }
    }
    els.dropZone.style.opacity = "1"; renderPreviews(); els.images.value = "";
  }

function validateVideo(file) {
  return new Promise((resolve) => {
    const MAX_SIZE_MB = 50;

    // Convert MB to bytes
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

    // 1. File size check
    if (file.size > MAX_SIZE_BYTES) {
      toast(
        `Video is too large. Please upload a file under ${MAX_SIZE_MB}MB.`,
        "error"
      );
      return resolve(false);
    }

    // 2. Basic file validation
    const video = document.createElement("video");
    const videoURL = URL.createObjectURL(file);

    video.src = videoURL;

    video.onloadeddata = () => {
      URL.revokeObjectURL(videoURL);
      resolve(true);
    };

    video.onerror = () => {
      URL.revokeObjectURL(videoURL);
      toast(
        "We couldn’t process this video. Please upload a valid video file.",
        "error"
      );
      resolve(false);
    };
  });
}

  async function uploadFile(file) {
  // Step 1: Get presigned PUT URL using session token
  const response = await fetch(`${supabaseUrl}/functions/v1/generate-r2-upload-url`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      "Authorization": `Bearer ${currentSessionToken}` // UPGRADED: Using session token
    },
    body: JSON.stringify({ 
    fileName: file.name, 
    fileType: file.type, 
    folder: "products",
    fileSize: file.size // <-- FIX: Added to pass Edge Function validation
  })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Failed to get upload URL");
  // Step 2: PUT file directly to R2
  const upload = await fetch(result.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file
  });
  if (!upload.ok) throw new Error("Direct upload to Storage failed");

  // Step 3: Return public URL
  return result.publicUrl;
}

  /** * Upgraded Delete functions using currentSessionToken 
 */
async function deleteFromR2(url) {
  try {
    const fileKey = url.replace("https://pub-0fc5736899f3449d987d356eafdca873.r2.dev/", "");
    const res = await fetch(`${supabaseUrl}/functions/v1/delete-r2-file`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentSessionToken}` // UPGRADED
      },
      body: JSON.stringify({ fileKey })
    });
    if (!res.ok) throw new Error("Store delete failed");
    return true;
  } catch (err) {
    console.error("Store Cleanup error", err);
    return false;
  }
}

  function setStatus(loading, text = "", progress = 0) {
    if (loading) {
      els.submitBtn.disabled = true;
      els.submitBtn.innerHTML = `<div class="spinner"></div><span>${text}</span>`;
      els.statusText.classList.remove("hidden"); els.statusText.textContent = text;
      els.progressContainer.style.display = "block"; els.progressBar.style.width = `${progress}%`;
    } else {
      els.submitBtn.disabled = false;
      els.submitBtn.innerHTML = `<span>${editingProductId ? "Update Product" : "Upload Product"}</span>`;
      els.statusText.classList.add("hidden"); els.progressContainer.style.display = "none";
    }
  }

  function updateStatus(text, isWarning = false) {
    els.statusText.textContent = text;
    els.statusText.style.color = isWarning ? "var(--liyog-orange)" : "var(--text-muted)";
  }

  window.resetForm = function () {
    ["name", "price", "stock", "tags", "whatsapp", "youtube", "discount"].forEach(id => els[id].value = "");
quill.setText("");
els.isVisible.checked = true;
els.isFeatured.checked = false;
els.discountPreview.textContent = "No discount applied";

    els.stock.value = "1"; els.category.value = ""; els.video.value = "";
    els.previewVideoBtn.classList.add("hidden"); els.existingVideoBanner.classList.add("hidden");
    selectedImages.forEach(img => { if (!img.existing) URL.revokeObjectURL(img.url); });
    selectedImages = []; filesToDeleteFromR2 = [];
    editingProductId = null; currentEditingProduct = null;
    els.formTitle.textContent = "Upload New Product";
    els.cancelEditBtn.classList.add("hidden");
    els.submitBtn.innerHTML = `<span>Upload Product</span>`;
    renderPreviews(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validateForm() {
    document.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
    let isValid = true;
    const markInvalid = (el) => {
      el.classList.add("input-error", "animate-shake");
      setTimeout(() => el.classList.remove("animate-shake"), 400);
    }
    if (!els.name.value.trim()) { markInvalid(els.name); isValid = false; }
    if (!els.price.value.trim() || isNaN(els.price.value) || Number(els.price.value) < 0) { markInvalid(els.price); isValid = false; }
    const waVal = els.whatsapp.value.replace(/\s+/g, '');
    if (!waVal || !/^[0-9]{10,15}$/.test(waVal)) { markInvalid(els.whatsapp); isValid = false; toast("WhatsApp: 10–15 digits, no spaces.", "error"); }
    if (els.youtube.value && !/^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/.test(els.youtube.value)) { markInvalid(els.youtube); isValid = false; }
    if (selectedImages.length === 0) { markInvalid(els.dropZone); isValid = false; toast("Add at least 1 image.", "error"); }
    return isValid;
  }

  window.previewYouTube = () => {
    const url = els.youtube.value.trim(); if (!url) return toast("Enter a YouTube URL first.", "info");
    let videoId = url.includes("youtu.be/") ? url.split("youtu.be/")[1]?.split("?")[0] : (url.includes("watch?v=") ? url.split("watch?v=")[1]?.split("&")[0] : "");
    if (!videoId) return toast("Invalid YouTube URL format.", "error");
    els.modalContent.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" style="width:100%;height:100%;" frameborder="0" allow="autoplay;encrypted-media" allowfullscreen></iframe>`;
    els.mediaModal.classList.add("active");
  };

  window.previewLocalVideo = () => {
    const file = els.video.files[0]; if (!file) return;
    els.modalContent.innerHTML = `<video src="${URL.createObjectURL(file)}" style="width:100%;height:100%;object-fit:contain;" controls autoplay></video>`;
    els.mediaModal.classList.add("active");
  };

  window.previewExistingVideo = () => {
    if (!currentEditingProduct || !currentEditingProduct.video_url) return;
    els.modalContent.innerHTML = `<video src="${currentEditingProduct.video_url}" style="width:100%;height:100%;object-fit:contain;" controls autoplay></video>`;
    els.mediaModal.classList.add("active");
  };

  window.removeExistingVideo = () => {
    if (currentEditingProduct && currentEditingProduct.video_url) {
      filesToDeleteFromR2.push(currentEditingProduct.video_url);
      currentEditingProduct.video_url = null;
    }
    els.existingVideoBanner.classList.add("hidden");
    toast("Attached video removed.", "info");
    updateLive();
  };

  window.closeModal = () => {
    els.mediaModal.classList.remove("active");
    setTimeout(() => { els.modalContent.innerHTML = ""; }, 300);
  };
  els.mediaModal.addEventListener("click", (e) => { if (e.target === els.mediaModal) closeModal(); });

  // LISTENERS
  els.dropZone.addEventListener("click", () => els.images.click());
  els.dropZone.addEventListener("dragover", e => { e.preventDefault(); els.dropZone.classList.add("dragover"); });
  els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragover"));
  els.dropZone.addEventListener("drop", e => { e.preventDefault(); els.dropZone.classList.remove("dragover"); handleFiles(e.dataTransfer.files); });
  els.images.addEventListener("change", e => handleFiles(e.target.files));
  els.video.addEventListener("change", (e) => {
    if (e.target.files.length > 0) els.previewVideoBtn.classList.remove("hidden");
    else els.previewVideoBtn.classList.add("hidden");
    updateLive();
  });
  ["name", "price", "stock", "discount"].forEach(id => { els[id].addEventListener("input", updateLive); });
quill.on('text-change', updateLive);

 window.submitProduct = async function () {
  if (uploading) return;
  if (!validateForm()) return toast("Please fix the highlighted errors.", "error");
  uploading = true; setStatus(true, "Initializing...", 5);
  try {
    const imageUrls = []; const totalImages = selectedImages.length;
    for (let i = 0; i < totalImages; i++) {
      let pct = 5 + ((i / totalImages) * 40);
      setStatus(true, `Uploading image ${i + 1}/${totalImages}...`, pct);
      if (selectedImages[i].existing) imageUrls.push(selectedImages[i].url);
      else imageUrls.push(await uploadFile(selectedImages[i].file));
    }

    let finalVideoUrl = currentEditingProduct ? currentEditingProduct.video_url : null;
    const newVideoFile = els.video.files[0];

    if (newVideoFile) {
      // Validate before anything else
      const isValid = await validateVideo(newVideoFile);
      if (!isValid) {
        uploading = false; setStatus(false);
        return; // Stop — updateStatus already showed the error
      }

      setStatus(true, "Uploading video...", 60);
      if (finalVideoUrl) filesToDeleteFromR2.push(finalVideoUrl);
      finalVideoUrl = await uploadFile(newVideoFile); // Direct upload, no compression
    }

    setStatus(true, editingProductId ? "Updating Product Details..." : "Creating product...", 90);
    let response;
    if (editingProductId) {
      response = await supabaseClient.rpc("update_product", {
        p_id: editingProductId, p_name: els.name.value.trim(), p_price: String(els.price.value),
        p_image_urls: imageUrls, p_description: quill.root.innerHTML,
        p_whatsapp_number: els.whatsapp.value.replace(/\s+/g, ''),
        p_category_id: els.category.value || null, p_tags: els.tags.value.trim(),
        p_video_url: finalVideoUrl, p_youtube_url: els.youtube.value.trim() || null,
        p_stock_quantity: parseInt(els.stock.value) || 0,
p_is_visible: els.isVisible.checked,
p_is_featured: els.isFeatured.checked,
p_discount_percentage: parseFloat(els.discount.value) || 0,
      });
      if (response.error) throw response.error;
      for (let url of filesToDeleteFromR2) { await deleteFromR2(url); }
      toast("Product updated successfully! ✓", "success");
    } else {
      response = await supabaseClient.rpc("create_product", {
  p_name: els.name.value.trim(),
  p_price: String(els.price.value),
  p_image_urls: imageUrls,
  p_description: quill.root.innerHTML,
  p_whatsapp_number: els.whatsapp.value.replace(/\s+/g, ''),
  p_category_id: els.category.value || null,
  p_tags: els.tags.value.trim(),
  p_video_url: finalVideoUrl,
  p_youtube_url: els.youtube.value.trim() || null,
  p_sort_order: 0,
  p_stock_quantity: parseInt(els.stock.value) || 0,
  p_is_visible: els.isVisible.checked,
  p_is_featured: els.isFeatured.checked,
  p_discount_percentage: parseFloat(els.discount.value) || 0
});

      if (response.error) throw response.error;
      toast("Product listed successfully! ✓", "success");
    }
    await loadProducts();
    setTimeout(() => { resetForm(); }, 500);
  } catch (error) {
    console.error(error);
    toast(error.message || "Action failed", "error");
  } finally {
    uploading = false; setStatus(false);
  }
};
 
  window.toggleVisible = async function (id, current) {
    const { error } = await supabaseClient.from("products").update({ is_visible: !current }).eq("id", id);
    if (error) return toast("Failed to update visibility.", "error");
    loadProducts();
  };
  window.toggleProductFeatured = async function (id, current) {
    const newValue = current === true || current === 'true' ? false : true;
    const { error } = await supabaseClient.from("products").update({ is_featured: newValue }).eq("id", id);
    if (error) {
        console.error(error);
        return toast(error.message || "Failed to update featured.", "error");
    }
    loadProducts();
};

  window.deleteProduct = async function (id) {
  if (!confirm("Delete this product permanently?")) return;

  // Step 1: Fetch file URLs first without deleting Supabase yet
  const { data: product, error: fetchError } = await supabaseClient
    .from("products")
    .select("image_urls, video_url")
    .eq("id", id)
    .single();

  if (fetchError) return toast("Delete failed.", "error");

  // Step 2: Delete all files from R2 first
  const files = [...(product.image_urls || []), product.video_url].filter(Boolean);
  const r2Results = await Promise.all(files.map(url => deleteFromR2(url)));
  const allR2Deleted = r2Results.every(result => result === true);

  if (!allR2Deleted) {
    // R2 failed — Supabase record still safe, user can retry
    return toast("Delete failed. Please try again.", "error");
  }

  // Step 3: Only delete from Supabase AFTER R2 is confirmed deleted
  const { error } = await supabaseClient.rpc("delete_product_full", { p_id: id });
  if (error) return toast("Files deleted but database error. Contact support.", "error");

  toast("Product deleted. ✓", "success");
  loadProducts();
};

  // LOAD PRODUCTS
  async function loadProducts() {
    // Skeleton
    els.productsTableBody.innerHTML = `<tr><td colspan="5" style="padding:16px;"><div class="skeleton" style="height:52px;width:100%;"></div></td></tr><tr><td colspan="5" style="padding:8px 16px;"><div class="skeleton" style="height:52px;width:100%;"></div></td></tr>`;
    els.productsMobileContainer.innerHTML = `<div class="skeleton" style="height:110px;width:100%;"></div><div class="skeleton" style="height:110px;width:100%;margin-top:12px;"></div>`;

    // FETCH RAW PRODUCTS TABLE AND FILTER STRICTLY BY THE RUNTIME STORE CONTEXT
    let query = supabaseClient
      .from("products")
      .select("*, categories(name)", { count: "exact" })
      .eq("store_id", runtimeState.store_id) // Isolated directly here!
      .order("sort_order", { ascending: true });

    if (currentSearch) query = query.ilike("name", `%${currentSearch}%`);
    if (currentVisibilityFilter === "visible") query = query.eq("is_visible", true);
    if (currentVisibilityFilter === "hidden") query = query.eq("is_visible", false);
if (currentVisibilityFilter === "featured")
  query = query.eq("is_featured", true);
    query = query.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

    const { data, error, count } = await query;

    if (error) {
      els.productsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--liyog-red);padding:24px;font-weight:600;">Failed to load products</td></tr>`;
      els.productsMobileContainer.innerHTML = `<p style="text-align:center;color:var(--liyog-red);padding:24px;font-weight:600;">Failed to load products</p>`;
      return toast("Failed to load products", "error");
    }

    els.productsTableBody.innerHTML = "";
    els.productsMobileContainer.innerHTML = "";

    if (data.length === 0) {
      els.productsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:40px;font-size:15px;">No products found</td></tr>`;
      els.productsMobileContainer.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px 0;font-size:15px;font-weight:600;">No products found</div>`;
    }

    data.forEach(product => {
      const finalPrice = Number(product.price || 0);
const discount = Number(product.discount_percentage || 0);

let originalPrice = finalPrice;

if(discount > 0){
  originalPrice = Math.round(
    finalPrice / (1 - discount / 100)
  );
}

const priceFmt = finalPrice.toLocaleString();
const originalFmt = originalPrice.toLocaleString();

      const imgUrl = product.image_urls?.[0] || 'https://placehold.co/100x100';
      const catName = product.categories?.name || 'Uncategorized';

      // DESKTOP ROW
      const tr = document.createElement("tr");
      tr.dataset.id = product.id;
      tr.innerHTML = `
        <td><span class="drag-handle">☰</span></td>
        <td><img src="${imgUrl}" class="product-thumb" alt="${product.name}"></td>
        <td>
          <div class="prod-name">${product.name || "Unnamed"}</div>
          <div class="prod-price">

  ${
    discount > 0
    ? `
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="
          text-decoration:line-through;
          color:var(--text-muted);
          font-size:12px;
        ">
          ${originalFmt}
        </span>

        <span style="
          color:var(--liyog-green);
          font-weight:700;
        ">
          ${priceFmt}
        </span>

        <span style="
          color:var(--liyog-red);
          font-size:11px;
          font-weight:700;
        ">
          ${discount}% OFF
        </span>
      </div>
    `
    : `${priceFmt}`
  }

</div>
          <div class="prod-meta">${catName} · Stock: ${product.stock_quantity || 0}</div>
        </td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="toggle-btn ${product.is_visible ? 'active' : ''}" onclick="toggleVisible('${product.id}', ${product.is_visible})">👁 Visible</button>
            <button class="toggle-btn ${product.is_featured ? 'featured active' : ''}" onclick="toggleProductFeatured('${product.id}', ${product.is_featured})">⭐ Featured</button>
          </div>
        </td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
       <button class="action-btn"
onclick="moveProduct('${product.id}','up')">⬆️</button>

<button class="action-btn"
onclick="moveProduct('${product.id}','down')">⬇️</button>     
<button class="action-btn edit-btn" onclick="editProduct('${product.id}')">✏️ Edit</button>
            <button class="action-btn delete-btn" onclick="deleteProduct('${product.id}')">🗑</button>
          </div>
        </td>
      `;
      els.productsTableBody.appendChild(tr);

      // MOBILE CARD
      const card = document.createElement("div");
      card.className = "mobile-product-card";
      card.dataset.id = product.id;
      card.innerHTML = `
        <div class="mobile-card-top">
          <span class="mobile-card-drag drag-handle">☰</span>
          <img src="${imgUrl}" class="mobile-card-img" alt="${product.name}">
          <div class="mobile-card-info">
            <div class="mobile-card-name">${product.name || "Unnamed"}</div>
            
<div class="mobile-card-price">

  ${
    discount > 0
    ? `
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="
          text-decoration:line-through;
          color:var(--text-muted);
          font-size:12px;
        ">
          ${originalFmt}
        </span>

        <span style="
          color:var(--liyog-green);
          font-weight:700;
        ">
          ${priceFmt}
        </span>

        <span style="
          color:var(--liyog-red);
          font-size:11px;
          font-weight:700;
        ">
          ${discount}% OFF
        </span>
      </div>
    `
    : `${priceFmt}`
  }

</div>

            <div class="mobile-card-cat">${catName}</div>
            <div class="mobile-card-stock">Stock: ${product.stock_quantity || 0}</div>
          </div>
        </div>
        <div class="mobile-card-footer">
          <div class="mobile-card-toggles">
            <button class="toggle-btn ${product.is_visible ? 'active' : ''}" onclick="toggleVisible('${product.id}', ${product.is_visible})">👁 Visible</button>
            <button class="toggle-btn ${product.is_featured ? 'featured active' : ''}" onclick="toggleProductFeatured('${product.id}', ${product.is_featured})">⭐ Featured</button>
          </div>
          <div class="mobile-card-actions">
     <button class="action-btn"
onclick="moveProduct('${product.id}','up')">⬆️</button>

<button class="action-btn"
onclick="moveProduct('${product.id}','down')">⬇️</button>
       
<button class="action-btn edit-btn" onclick="editProduct('${product.id}')">✏️</button>
            <button class="action-btn delete-btn" onclick="deleteProduct('${product.id}')">🗑</button>
          </div>
        </div>
      `;
      els.productsMobileContainer.appendChild(card);
    });

    applyTableLayout();

    // PAGINATION
    const paginationWrap = document.getElementById("pagination");
    paginationWrap.innerHTML = "";
    const totalPages = Math.ceil((count || 0) / PAGE_SIZE);
    if (totalPages > 1) {
      const prevBtn = document.createElement("button");
      prevBtn.className = "page-btn"; prevBtn.textContent = "← Prev";
      prevBtn.disabled = currentPage === 1;
      prevBtn.onclick = () => { currentPage--; loadProducts(); };
      paginationWrap.appendChild(prevBtn);

      const pageInd = document.createElement("span");
      pageInd.className = "page-indicator";
      pageInd.textContent = `${currentPage} / ${totalPages}`;
      paginationWrap.appendChild(pageInd);

      const nextBtn = document.createElement("button");
      nextBtn.className = "page-btn"; nextBtn.textContent = "Next →";
      nextBtn.disabled = currentPage >= totalPages;
      nextBtn.onclick = () => { currentPage++; loadProducts(); };
      paginationWrap.appendChild(nextBtn);
    }
  }

  // SEARCH & FILTER
  document.getElementById("searchProducts").addEventListener("input", e => { currentSearch = e.target.value.trim(); currentPage = 1; loadProducts(); });
  document.getElementById("filterVisibility").addEventListener("change", e => { currentVisibilityFilter = e.target.value; currentPage = 1; loadProducts(); });

  // EDIT PRODUCT
  window.editProduct = async function (id) {
    resetForm();
    toast("Loading product details...", "info", 2000);
    const { data, error } = await supabaseClient.from("products").select("*").eq("id", id).single();
    if (error) return toast("Failed to load product.", "error");

    editingProductId = id;
    currentEditingProduct = data;

    els.formTitle.textContent = "Edit Product";
    els.cancelEditBtn.classList.remove("hidden");
    els.name.value = data.name || "";
    els.price.value = data.price || "";
    els.stock.value = data.stock_quantity || "0";
els.discount.value = data.discount_percentage || 0;

els.isVisible.checked = data.is_visible ?? true;
els.isFeatured.checked = data.is_featured ?? false;

    quill.root.innerHTML = data.description || "";
    els.whatsapp.value = data.whatsapp_number || "";
    els.category.value = data.category_id || "";
    els.tags.value = data.tags ? (Array.isArray(data.tags) ? data.tags.join(",") : data.tags) : "";
    els.youtube.value = data.youtube_url || "";

    if (data.video_url) els.existingVideoBanner.classList.remove("hidden");

    selectedImages = (data.image_urls || []).map(url => ({
      id: crypto.randomUUID(), file: null, url, existing: true
    }));

    renderPreviews();
    els.submitBtn.innerHTML = `<span>Update Product</span>`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelector('[data-tab="uploadTab"]').click();
  };

window.moveProduct = async function(id, direction){
  const isDesktop = window.matchMedia("(min-width: 768px)").matches;
  const container = isDesktop
    ? els.productsTableBody
    : els.productsMobileContainer;

  const rows = [...container.children];
  const ids = rows.map(r => r.dataset.id);
  const index = ids.indexOf(id);

  if(index === -1) return;

  if(direction === 'up' && index > 0){
    [ids[index - 1], ids[index]] =
      [ids[index], ids[index - 1]];
  }

  if(direction === 'down' && index < ids.length - 1){
    [ids[index + 1], ids[index]] =
      [ids[index], ids[index + 1]];
  }

  const { error } = await supabaseClient.rpc(
    "reorder_products",
    { p_ids: ids }
  );

  if(error){
    console.error(error);
    toast("Reorder failed","error");
    return;
  }

  toast("Product moved","success");
  await loadProducts();
}

  // TAB SWITCHER
  let _catLoaded = false;
let _storiesLoaded = false;

// TAB SWITCHER
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", async () => {

    document.querySelectorAll(".tab-btn")
      .forEach(b => b.classList.remove("active"));

    document.querySelectorAll(".admin-section")
      .forEach(sec => sec.classList.remove("active"));

    btn.classList.add("active");

    document.getElementById(btn.dataset.tab)
      .classList.add("active");

    const tab = btn.dataset.tab;

    if (tab === "categoriesTab" && !_catLoaded) {
      _catLoaded = true;
      await loadCategoriesTab();
    }

    if (tab === "settingsTab" && !_settingsLoaded) {
      _settingsLoaded = true;
      await window.loadSettings();
    }

    if (tab === "storiesTab" && !_storiesLoaded) {
      _storiesLoaded = true;
      await loadStories();
    }

  });
});

// INIT
updateLive();
await loadCategories();
await loadProducts();



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
});// DOM CLOSURE

