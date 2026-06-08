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

// ==========================================================
//  BiziNet · Main Application Script (Refactored for Runtime Engine)
//  dashboard/js/tabscript.js
// ==========================================================

// 1. Direct pointers to our unified shared instances
const supabaseUrl    = window.APP_CONFIG.supabaseUrl;
const renderUrl      = window.APP_CONFIG.renderUrl;
const supabaseClient = window.APP_CLIENT; // Safely reuse the global instance

// 2. Reference variables mapped explicitly to the global runtime state
let runtimeState        = null;
let currentSessionToken = null;

let els = {};
let quill;

// 3. Listen for DOM Content Ready
document.addEventListener("DOMContentLoaded", async () => {
  
  // ─── CRITICAL CRASH GUARD ───
  // We pause execution here until runtime.js completes its auth verification,
  // network redirects, and populates the shared window context.
  await window.APP_RUNTIME_READY;

  // Sync our local convenience variables safely with the verified global state
  runtimeState        = window.APP_RUNTIME.runtimeState;
  currentSessionToken = window.APP_RUNTIME.currentSessionToken;

  // If the boot guard failed or redirected out, stop executing script logics safely
  if (!runtimeState) return;

  // Initialize your application layout maps 
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


// ============================================================
// STORIES TAB — JAVASCRIPT v10  |  LIYOG ADMIN DASHBOARD
// ============================================================
// ZERO-CACHE ARCHITECTURE — FINAL:
//
//  get_all_stories is the single source of truth for ALL store
//  identity data. Every row carries:
//    s.store_logo      ← profile.logo_url        (live JOIN)
//    s.store_name      ← profile.business_name   (live JOIN) ← NEW
//    s.store_whatsapp  ← profile.whatsapp_number (live JOIN) ← NEW
//    s.creator_name    ← store_members.member_name (live JOIN)
//
//  There are NO module-level vars for logo, store name, store WA,
//  store_id, or business name. No window.* pollution. No
//  localStorage/sessionStorage. Switching stores or accounts
//  in the same browser produces correct data automatically.
//
//  useProfileWhatsapp() now reads s.store_whatsapp from the
//  already-loaded allStories[0] row — zero extra DB call.
//
//  Load more: graceful network failure + retry button.
//  Feed load: graceful timeout + retry on failure.
// ============================================================

const STORY_R2_BASE = "https://pub-0fc5736899f3449d987d356eafdca873.r2.dev";

// ── Core State
let allStories             = [];
let currentFilter          = "all";
let currentMediaTypeFilter = "all";
let currentCreatedByFilter = "all";
let currentRoleFilter      = "all";
let currentUserUidCache    = null;  // auth UID — "my stories" filter only
let storyEditingId         = null;
let storyDraftId           = null;
let storySelectedHours     = 24;
let storyCtaType           = "none";
let storyIsFeatured        = false;
let storyCurrentMedia      = null;

// Product picker cache — wiped every modal open, never crosses sessions
let _storyProductsCache = null;

// Pagination
let storyCurrentPage = 1;
const STORY_PAGE_SIZE = 12;
let storyHasMore = false;

// Preview state
let previewStoryList   = [];
let previewIndex       = 0;
let previewTimer       = null;
let previewHolding     = false;
let previewTouchStartX = 0;
let previewTouchStartT = 0;
// Preview CTA Lock System
let previewCtaActive = false;
let previewCtaPaused = false;

// ============================================================
// INJECT KEYFRAMES ONCE
// ============================================================
(function injectStoryStyles() {
  if (document.getElementById("storyTabStyles")) return;
  const s = document.createElement("style");
  s.id = "storyTabStyles";
  s.innerHTML = `
    @keyframes stSpinnerSpin {
      0%   { transform: translate(-50%,-50%) rotate(0deg); }
      100% { transform: translate(-50%,-50%) rotate(360deg); }
    }
    @keyframes stFadeIn  { from { opacity:0 }                       to { opacity:1 } }
    @keyframes stScaleIn { from { transform:scale(.92);opacity:0 }  to { transform:scale(1);opacity:1 } }
    @keyframes stLoadMorePulse {
      0%,100% { opacity:1; }
      50%     { opacity:.45; }
    }
    @keyframes stSpinConic { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(s);
})();

// ============================================================
// R2 STORAGE HELPERS
// ============================================================

function r2KeyStory(url) {
  if (!url) return null;
  const key = url.replace(STORY_R2_BASE + "/", "");
  return key === url ? null : key;
}

async function storyUploadToR2(file, folder) {
  const payload = { fileName: file.name, fileType: file.type, fileSize: file.size, folder };
  const res = await fetch(`${supabaseUrl}/functions/v1/generate-r2-upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${currentSessionToken}`
    },
    body: JSON.stringify(payload)
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Upload setup failed. Please try again.");
  const upload = await fetch(result.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file
  });
  if (!upload.ok) throw new Error("File upload didn't complete. Check your connection and retry.");
  return result.publicUrl;
}

async function storyDeleteFromR2(url) {
  if (!url) return;
  try {
    const fileKey = r2KeyStory(url);
    if (!fileKey) return;
    await fetch(`${supabaseUrl}/functions/v1/delete-r2-file`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentSessionToken}`
      },
      body: JSON.stringify({ fileKey })
    });
  } catch (e) {
    console.error("File cleanup error:", e);
  }
}

// ============================================================
// SUPABASE MEDIA SYNC
// ============================================================

async function _syncMediaToSupabase(storyId, mediaUrl, mediaThumb, type, width, height, aspectRatio, fileSize, duration) {
  if (!storyId) return;
  const { error } = await supabaseClient.from("stories").update({
    media_url:    mediaUrl,
    media_thumb:  mediaThumb  || null,
    type,
    media_width:  width       || null,
    media_height: height      || null,
    aspect_ratio: aspectRatio || null,
    file_size:    fileSize    || null,
    duration:     duration    || null
  }).eq("id", storyId);
  if (error) throw error;
}

async function _clearMediaFromSupabase(storyId) {
  if (!storyId) return;
  await supabaseClient.from("stories")
    .update({ media_url: null, media_thumb: null })
    .eq("id", storyId);
}

// ============================================================
// MEDIA PROCESSING UTILITIES
// ============================================================

function getImageDimensions(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload  = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0 }); };
    img.src = url;
  });
}

function computeAspectRatio(w, h) {
  if (!w || !h) return null;
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

async function compressStoryImage(file) {
  const dims = await getImageDimensions(file);
  return new Promise((resolve, reject) => {
    const img    = new Image();
    const reader = new FileReader();
    reader.onload  = e => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx    = canvas.getContext("2d");
      const maxW   = 1080;
      const scale  = Math.min(1, maxW / img.width);
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error("Image preparation failed. Please try a different file."));
        resolve({
          file:   new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" }),
          width:  dims.width,
          height: dims.height
        });
      }, "image/webp", 0.78);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function generateVideoThumbnail(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url   = URL.createObjectURL(file);
    video.src     = url;
    video.muted   = true;
    video.preload = "metadata";
    video.onloadeddata = () => { video.currentTime = Math.min(1, video.duration * 0.1); };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) return resolve(null);
        resolve({
          file:   new File([blob], "thumb.webp", { type: "image/webp" }),
          width:  video.videoWidth,
          height: video.videoHeight
        });
      }, "image/webp", 0.75);
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
  });
}

function getAudioDuration(file) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url   = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Math.round(audio.duration)); };
    audio.onerror          = () => { URL.revokeObjectURL(url); resolve(null); };
  });
}

// ============================================================
// PROGRESS BAR
// ============================================================

function showProgress(pct, label) {
  const bar  = document.getElementById("storyUploadProgress");
  const fill = document.getElementById("storyProgressFill");
  const lbl  = document.getElementById("storyProgressLabel");
  if (!bar) return;
  if (pct === null) { bar.style.display = "none"; return; }
  bar.style.display = "flex";
  if (fill) fill.style.width = `${pct}%`;
  if (lbl)  lbl.textContent  = label || "Getting things ready…";
}

// ============================================================
// TIME HELPERS
// ============================================================

function getTimeRemaining(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt) - new Date();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}d left`;
  if (h > 0)   return `${h}h ${m}m left`;
  return `${m}m left`;
}

function isUrgent(expiresAt) {
  const diff = new Date(expiresAt) - new Date();
  return diff > 0 && diff < 2 * 3600000;
}

function timeAgo(ts) {
  if (!ts) return "";
  const diff = (new Date() - new Date(ts)) / 1000;
  if (diff < 60)    return "Just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.substring(0, max).trimEnd() + "…" : str;
}

// ============================================================
// LOAD STORIES — single RPC, zero visual cache
// Graceful timeout + retry on network failure
// ============================================================
async function loadStories(appendMode = false) {
  const grid  = document.getElementById("storiesGrid");
  const empty = document.getElementById("storiesEmpty");
  const btn   = document.getElementById("storiesReloadBtn");

  if (!appendMode) {
    storyCurrentPage = 1;
    if (btn)   btn.classList.add("spinning");
    if (empty) empty.style.display = "none";
    if (grid)  grid.innerHTML = [1, 2, 3].map(() => `
      <div class="st-story-card sk">
        <div class="st-story-sk-media"></div>
        <div class="st-story-sk-body">
          <div class="settings-skel" style="height:12px;width:70%;"></div>
          <div class="settings-skel" style="height:10px;width:50%;margin-top:6px;"></div>
        </div>
      </div>`).join("");
  }

  // Timeout safety — avoids forever-loading on dead network
  const LOAD_TIMEOUT = 15000;
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    if (btn) btn.classList.remove("spinning");
    if (grid && !appendMode) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:48px 20px;">
          <div style="font-size:40px;margin-bottom:12px;">📶</div>
          <p style="font-weight:700;color:#1e293b;font-size:15px;margin-bottom:6px;">Connection is taking too long</p>
          <p style="color:#64748b;font-size:13px;margin-bottom:16px;">Check your network and try again</p>
          <button onclick="loadStories(false)" style="
            background:linear-gradient(135deg,#28A428,#34BF49);color:#fff;
            border:none;border-radius:10px;padding:10px 22px;
            font-size:14px;font-weight:700;cursor:pointer;">
            🔄 Retry
          </button>
        </div>`;
    }
    toast("Connection timed out. Please check your network.", "error");
  }, LOAD_TIMEOUT);

  try {
    // ONE RPC — returns per-row:
    //   store_logo      ← profile.logo_url          (live JOIN, no cache)
    //   store_name      ← profile.business_name     (live JOIN, no cache)
    //   store_whatsapp  ← profile.whatsapp_number   (live JOIN, no cache)
    //   creator_name    ← store_members.member_name (live JOIN, per uploader)
    const { data, error } = await supabaseClient.rpc("get_all_stories");

    clearTimeout(timeoutId);
    if (timedOut) return; // timeout already rendered error UI

    if (error) throw error;

    const fetchedStories = (data || []).map(story => {
      let calcStatus = "active";
      if (story.is_hidden) {
        calcStatus = "hidden";
      } else if (story.expires_at && new Date(story.expires_at) < new Date()) {
        calcStatus = "expired";
      }
      return { ...story, status: calcStatus };
    });

    const startOffset = (storyCurrentPage - 1) * STORY_PAGE_SIZE;
    const endOffset   = startOffset + STORY_PAGE_SIZE;
    const pageSlice   = fetchedStories.slice(startOffset, endOffset);
    storyHasMore      = fetchedStories.length > endOffset;

    allStories = appendMode ? [...allStories, ...pageSlice] : pageSlice;

    renderStories();
    updateStats();
    _injectLoadMoreTrigger();

    if (!appendMode && fetchedStories.length === 0 && empty) {
      empty.style.display = "block";
    }

  } catch (err) {
    clearTimeout(timeoutId);
    if (timedOut) return;
    console.error("loadStories error:", err);
    if (grid && !appendMode) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:48px 20px;">
          <div style="font-size:40px;margin-bottom:12px;">😕</div>
          <p style="font-weight:700;color:#1e293b;font-size:15px;margin-bottom:6px;">Couldn't load your stories</p>
          <p style="color:#64748b;font-size:13px;margin-bottom:16px;">Something went wrong on our end</p>
          <button onclick="loadStories(false)" style="
            background:linear-gradient(135deg,#28A428,#34BF49);color:#fff;
            border:none;border-radius:10px;padding:10px 22px;
            font-size:14px;font-weight:700;cursor:pointer;">
            🔄 Try Again
          </button>
        </div>`;
    } else if (appendMode) {
      storyCurrentPage--; // roll back page count so retry works correctly     _injectLoadMoreTrigger(true);
      _watchForReconnect();
    }
    toast("Couldn't load your stories. Please try again.", "error");
  } finally {
    if (btn) btn.classList.remove("spinning");
  }
}

window.reloadStories = () => loadStories(false);

// ============================================================
// LOAD MORE TRIGGER — premium spinner + graceful failure
// ============================================================

function _injectLoadMoreTrigger(failed = false) {
  const existing = document.getElementById("storyLoadMoreTrigger");
  if (existing) existing.remove();
  if (!storyHasMore) return;

  const grid = document.getElementById("storiesGrid");
  if (!grid) return;

  const trigger = document.createElement("div");
  trigger.id = "storyLoadMoreTrigger";
  trigger.style.cssText = `
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px 20px 40px;
    cursor: pointer;
    user-select: none;
  `;

  if (failed) {
    // ── Network failed state
    trigger.innerHTML = `
      <div style="
        width:52px;height:52px;border-radius:50%;
        background:linear-gradient(135deg,#FFD700,#FF7A00);
        display:flex;align-items:center;justify-content:center;
        font-size:22px;
        box-shadow:0 4px 16px rgba(255,122,0,.35);">
        📶
      </div>
      <p style="
        font-size:13px;font-weight:700;
        color:#FF7A00;margin:0;text-align:center;">
        No connection right now
      </p>
      <p style="
        font-size:11px;font-weight:500;
        color:#94a3b8;margin:0;text-align:center;">
        We'll load more stories once you're back online
      </p>
      <div id="stLoadMoreRetryBtn" style="
        background:linear-gradient(135deg,#FFD700,#FF7A00);
        color:#111;border:none;border-radius:10px;
        padding:9px 22px;font-size:13px;font-weight:800;
        cursor:pointer;box-shadow:0 4px 12px rgba(255,122,0,.3);
        transition:.2s;">
        🔄 Retry
      </div>`;

    // Retry button click
    trigger.querySelector("#stLoadMoreRetryBtn").onclick = (e) => {
      e.stopPropagation();
      _attemptLoadMore();
    };

    // Also wire the whole trigger as clickable
    trigger.onclick = () => _attemptLoadMore();

  } else {
    // ── Normal idle state — Gold/Orange gradient spinner
    trigger.innerHTML = `
      <div id="stLoadMoreSpinner" style="
        width: 42px; height: 42px; border-radius: 50%;
        background: conic-gradient(#FFD700 0%, #FF7A00 35%, #FF3B30 65%, #FFD700 100%);
        animation: stSpinConic 1s linear infinite;
        mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px));
        -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px));
        box-shadow: 0 2px 12px rgba(255,122,0,.25);
      "></div>
      <span id="stLoadMoreLabel" style="
        font-size: 13px; font-weight: 700;
        background: linear-gradient(90deg, #FFD700, #FF7A00, #FF3B30);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: stLoadMorePulse 2s ease-in-out infinite;
        letter-spacing: .3px;">
        Load more stories
      </span>`;

    trigger.onclick = () => _attemptLoadMore();
  }

  grid.appendChild(trigger);
}

// Handles load-more with online detection + auto-retry on reconnect
async function _attemptLoadMore() {
  // If offline, show failed state and start watching for reconnect
  if (!navigator.onLine) {
    _injectLoadMoreTrigger(true);
    _watchForReconnect();
    return;
  }

  // Show loading state
  const label = document.getElementById("stLoadMoreLabel");
  const trigger = document.getElementById("storyLoadMoreTrigger");
  if (label) {
    label.style.animation           = "none";
    label.textContent               = "Loading…";
    label.style.webkitTextFillColor = "#FF7A00";
    label.style.backgroundClip      = "unset";
  }
  if (trigger) trigger.onclick = null; // prevent double-tap

  storyCurrentPage++;

  try {
    await loadStories(true);
    // loadStories(true) calls _injectLoadMoreTrigger() itself on success
  } catch (e) {
    // loadStories already handles its own error UI
    // Re-inject failed state so user can retry
    _injectLoadMoreTrigger(true);
  }
}

// Watches for network restoration and auto-retries load-more
function _watchForReconnect() {
  // Avoid stacking multiple listeners
  if (window._stReconnectWatching) return;
  window._stReconnectWatching = true;

  const onReconnect = () => {
    window._stReconnectWatching = false;
    window.removeEventListener("online", onReconnect);

    // Show a brief "back online" pulse on the trigger before loading
    const trigger = document.getElementById("storyLoadMoreTrigger");
    if (trigger) {
      trigger.innerHTML = `
        <div style="
          width:44px;height:44px;border-radius:50%;
          background:linear-gradient(135deg,#28A428,#34BF49);
          display:flex;align-items:center;justify-content:center;
          font-size:20px;
          box-shadow:0 4px 14px rgba(40,164,40,.35);
          animation:stSpinConic .6s linear infinite;">
          ✅
        </div>
        <span style="font-size:13px;font-weight:700;color:#28A428;">
          Back online! Loading…
        </span>`;
    }

    // Small delay so user sees the "back online" message
    setTimeout(() => {
      loadStories(true);
    }, 800);
  };

  window.addEventListener("online", onReconnect);
}


// ============================================================
// RENDER ENGINE
// ============================================================

function renderStories() {
  const grid = document.getElementById("storiesGrid");
  if (!grid) return;

  const searchInput = document.getElementById("storySearchInput");
  const keyword     = searchInput ? searchInput.value.toLowerCase().trim() : "";

  // Lazy-fetch current user UID for "my stories" filter only
  if (!currentUserUidCache && allStories.length > 0) {
    supabaseClient.auth.getUser().then(({ data }) => {
      if (data?.user) { currentUserUidCache = data.user.id; renderStories(); }
    });
  }

  // Owner-only role filter panel
  if (allStories.length > 0) {
    const primaryRow = allStories[0];
    const ownerPanel = document.getElementById("premiumOwnerFilterContainer");
    const roleSelect = document.getElementById("storyRoleSelectFilter");
    if (primaryRow.viewer_role === "owner" && ownerPanel && ownerPanel.style.display === "none") {
      ownerPanel.style.display = "flex";
      const uniqueRoles      = [...new Set(allStories.map(s => s.creator_role).filter(Boolean))];
      const currentSelection = roleSelect ? roleSelect.value : "all";
      if (roleSelect) {
        roleSelect.innerHTML = `<option value="all">All Team Roles</option>`;
        uniqueRoles.forEach(role => {
          const opt = document.createElement("option");
          opt.value       = role;
          opt.textContent = role.charAt(0).toUpperCase() + role.slice(1);
          roleSelect.appendChild(opt);
        });
        roleSelect.value = currentSelection;
      }
    }
  }

  // Apply all filters
  const filtered = allStories.filter(s => {
    if (currentFilter !== "all" && s.status !== currentFilter)                          return false;
    if (currentMediaTypeFilter !== "all" && s.type !== currentMediaTypeFilter)          return false;
    if (keyword) {
      const tm = s.title   ? s.title.toLowerCase().includes(keyword)   : false;
      const cm = s.caption ? s.caption.toLowerCase().includes(keyword) : false;
      if (!tm && !cm) return false;
    }
    if (currentCreatedByFilter === "me" && currentUserUidCache && s.creator_id !== currentUserUidCache) return false;
    if (currentRoleFilter !== "all" && s.creator_role !== currentRoleFilter)            return false;
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px 20px;color:#64748b;font-weight:600;">
        No stories match your current filters.
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map((s, idx) => buildStoryCard(s, idx, filtered)).join("");

  if (storyHasMore && !document.getElementById("storyLoadMoreTrigger") && !keyword && currentMediaTypeFilter === "all") {
    _injectLoadMoreTrigger();
  }
}

// ============================================================
// STORY CARD BUILDER
// ============================================================

function buildStoryCard(s, idx, list) {
  const timer     = getTimeRemaining(s.expires_at);
  const urgent    = isUrgent(s.expires_at);
  const isExpired = s.status === "expired";
  const isHidden  = s.status === "hidden";
  const thumbSrc  = s.media_thumb || s.media_url;

  // Media block
  let mediaHtml = "";
  if (s.type === "video") {
    mediaHtml = `
      <div class="st-card-media" onclick="openPreviewAt('${s.id}')">
        ${thumbSrc
          ? `<img src="${thumbSrc}" alt="video cover"
               style="width:100%;height:100%;object-fit:cover;"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
             <div class="st-card-video-fallback" style="display:none;"><span>🎬</span><small>Video</small></div>`
          : `<div class="st-card-video-fallback"><span>🎬</span><small>Video</small></div>`}
        <div class="st-card-play-badge">▶</div>
        <div class="st-card-preview-btn"><span>▶ Play</span></div>
        ${timer ? `<div class="st-card-timer${urgent ? " urgent" : ""}">${timer}</div>` : ""}
      </div>`;
  } else if (s.type === "audio") {
    mediaHtml = `
      <div class="st-card-audio" onclick="openPreviewAt('${s.id}')">
        <span class="st-card-audio-icon">🎵</span>
        <span class="st-card-audio-label">${s.duration
          ? Math.floor(s.duration / 60) + "m " + (s.duration % 60) + "s"
          : "Audio Story"}</span>
      </div>`;
  } else {
    mediaHtml = `
      <div class="st-card-media" onclick="openPreviewAt('${s.id}')">
        <img src="${s.media_url}" alt="${s.title || 'Story'}" loading="lazy"
          style="width:100%;height:100%;object-fit:cover;"
          onerror="this.style.display='none';this.parentElement.querySelector('.st-card-img-fallback').style.display='flex';">
        <div class="st-card-img-fallback" style="display:none;"><span>🖼</span><small>Image unavailable</small></div>
        <div class="st-card-preview-btn"><span>👁 Preview</span></div>
        ${timer ? `<div class="st-card-timer${urgent ? " urgent" : ""}">${timer}</div>` : ""}
      </div>`;
  }

  // Link tag — product name truncated to keep feed clean
  const linkTag = s.link_type && s.link_type !== "none"
    ? `<span style="
        display:inline-block;max-width:140px;
        overflow:hidden;white-space:nowrap;text-overflow:ellipsis;vertical-align:middle;
        background:${s.link_type === "product"
          ? "linear-gradient(135deg,#fff9e6,#fff3cc);color:#92400e;border:1px solid #FFD700;"
          : s.link_type === "whatsapp"
          ? "linear-gradient(135deg,#f0fdf4,#dcfce7);color:#166534;border:1px solid #86efac;"
          : "linear-gradient(135deg,#eff6ff,#dbeafe);color:#1e40af;border:1px solid #93c5fd;"}
        font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;"
        title="${s.link_type === "product" ? (s.product_name || "Product") : s.link_type === "whatsapp" ? "WhatsApp" : "Link"}">
        ${s.link_type === "product"
          ? `🛍 ${truncate(s.product_name || "Product", 18)}`
          : s.link_type === "whatsapp"
          ? "💬 WhatsApp"
          : "🔗 Link"}
      </span>` : "";

  // Role badge
  const roleBg = s.creator_role === "owner"
    ? "linear-gradient(135deg,#FFD700,#FF7A00)"
    : s.creator_role === "super_admin"
    ? "linear-gradient(135deg,#FF7A00,#FF3B30)"
    : s.creator_role === "admin"
    ? "linear-gradient(135deg,#1877F2,#0d5bbf)"
    : "linear-gradient(135deg,#28A428,#34BF49)";

  // Status ribbon
  const ribbonStyle = s.status === "active"
    ? "background:linear-gradient(90deg,#28A428,#34BF49);color:#fff;"
    : s.status === "expired"
    ? "background:linear-gradient(90deg,#FF3B30,#C1271A);color:#fff;"
    : "background:linear-gradient(90deg,#475569,#334155);color:#fff;";
  const ribbonLabel = s.status === "active" ? "🟢 Live" : s.status === "expired" ? "🔴 Expired" : "👁 Hidden";

  // Action buttons
  const editBtn = `
    <button onclick="openStoryModal('${s.id}')"
      style="background:linear-gradient(135deg,#1877F2,#0d5bbf);color:#fff;border:none;
        border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;transition:.2s;"
      onmouseover="this.style.opacity='.82'" onmouseout="this.style.opacity='1'">✏️ Edit</button>`;

  const restoreBtn = isExpired ? `
    <button onclick="restoreStory('${s.id}')"
      style="background:linear-gradient(135deg,#FFD700,#FF7A00);color:#111;border:none;
        border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;transition:.2s;"
      onmouseover="this.style.opacity='.82'" onmouseout="this.style.opacity='1'">🔄 Renew</button>` : "";

  const hideLabel = isHidden ? "👁 Show" : "🙈 Hide";
  const hideStyle = isHidden
    ? "background:linear-gradient(135deg,#28A428,#34BF49);color:#fff;"
    : "background:linear-gradient(135deg,#475569,#334155);color:#fff;";
  const hideBtn = `
    <button onclick="toggleStoryVisibility('${s.id}')"
      style="${hideStyle}border:none;border-radius:8px;padding:6px 14px;
        font-size:12px;font-weight:700;cursor:pointer;transition:.2s;"
      onmouseover="this.style.opacity='.82'" onmouseout="this.style.opacity='1'">${hideLabel}</button>`;

  const deleteBtn = `
    <button onclick="deleteStory('${s.id}')"
      style="background:linear-gradient(135deg,#FF3B30,#C1271A);color:#fff;border:none;
        border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:.2s;"
      onmouseover="this.style.opacity='.82'" onmouseout="this.style.opacity='1'">🗑</button>`;

  const upBtn = `
    <button onclick="moveStory('${s.id}',-1)" ${idx === 0 ? "disabled" : ""}
      style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;
        padding:4px 9px;cursor:pointer;font-size:13px;transition:.2s;"
      onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">▲</button>`;

  const downBtn = `
    <button onclick="moveStory('${s.id}',1)" ${idx === list.length - 1 ? "disabled" : ""}
      style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;
        padding:4px 9px;cursor:pointer;font-size:13px;transition:.2s;"
      onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">▼</button>`;

  return `
    <div class="st-story-card ${isHidden ? "hidden-card" : ""} ${isExpired ? "expired-card" : ""}"
      id="storyCard_${s.id}" style="position:relative;">
      <div style="${ribbonStyle}font-size:11px;font-weight:700;padding:3px 10px;
        border-radius:0 0 8px 0;position:absolute;top:0;left:0;z-index:3;">${ribbonLabel}</div>
      ${s.is_featured ? `
        <div style="background:linear-gradient(90deg,#FFD700,#FF7A00);color:#111;
          font-size:11px;font-weight:700;padding:3px 10px;
          border-radius:0 0 0 8px;position:absolute;top:0;right:0;z-index:3;">⭐ Featured</div>` : ""}
      ${mediaHtml}
      <div class="st-card-body">
        <div class="st-card-title">${s.title || "Untitled Story"}</div>
        ${s.caption ? `<div class="st-card-caption">${s.caption}</div>` : ""}
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;align-items:center;">
          <span style="background:${s.type==='image'?'#e0f2fe':s.type==='video'?'#fce7f3':'#f0fdf4'};
            color:${s.type==='image'?'#0369a1':s.type==='video'?'#be185d':'#166534'};
            font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;">
            ${s.type.toUpperCase()}
          </span>
          ${linkTag}
          ${s.aspect_ratio ? `<span style="background:#f1f5f9;color:#475569;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;">${s.aspect_ratio}</span>` : ""}
        </div>
        <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;
          background:linear-gradient(135deg,#f8fafc,#f1f5f9);
          border-radius:20px;margin-bottom:10px;border:1px solid #e2e8f0;width:fit-content;">
          <span style="font-size:11px;font-weight:600;color:#475569;">
            👤 <strong style="color:#111;">${s.creator_name || "Team Member"}</strong>
            <span style="font-size:10px;font-weight:700;color:#fff;background:${roleBg};
              padding:2px 7px;border-radius:20px;margin-left:4px;text-transform:uppercase;">
              ${s.creator_role || "staff"}
            </span>
          </span>
        </div>
        <div style="display:flex;gap:10px;font-size:12px;color:#64748b;font-weight:600;flex-wrap:wrap;margin-bottom:10px;">
          <span>👁 ${s.views_count || 0} views</span>
          <span>👆 ${s.clicks_count || 0} taps</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          ${editBtn}${restoreBtn || hideBtn}
          <div style="display:flex;gap:4px;">${upBtn}${downBtn}</div>
          ${deleteBtn}
        </div>
      </div>
    </div>`;
}

function updateStats() {
  const activeEl  = document.getElementById("statActive");
  const expiredEl = document.getElementById("statExpired");
  const hiddenEl  = document.getElementById("statHidden");
  if (activeEl)  activeEl.textContent  = allStories.filter(s => s.status === "active").length;
  if (expiredEl) expiredEl.textContent = allStories.filter(s => s.status === "expired").length;
  if (hiddenEl)  hiddenEl.textContent  = allStories.filter(s => s.status === "hidden").length;
}

window.filterStories = function (filter, btn) {
  currentFilter = filter;
  document.querySelectorAll(".st-filter-tab").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderStories();
};

// ============================================================
// MODAL — OPEN / CLOSE / RELOAD
// ============================================================

window.openStoryModal = async function (editId = null) {
  storyEditingId      = editId || null;
  storyDraftId        = null;
  storyCurrentMedia   = null;
  storyIsFeatured     = false;
  storyCtaType        = "none";
  storySelectedHours  = 24;
  _storyProductsCache = null; // always clear — fresh RPC on every open

  ["st_story_title", "st_story_caption", "st_story_wa", "st_story_url", "st_story_cta_text"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });

  const captionCount = document.getElementById("captionCount");
  if (captionCount) captionCount.textContent = "0 / 300";

  _resetMediaZone();
  _resetCtaType("none");
  _setFeaturedToggle(false);
  _setExpiryBtn(24);
  showProgress(null);

  const reloadBtn = document.getElementById("storyEditReloadBtn");
  if (reloadBtn) reloadBtn.style.display = editId ? "flex" : "none";

  await _loadProductsForPicker();

  const modalTitle   = document.getElementById("storyModalTitle");
  const modalSaveTxt = document.getElementById("storyModalSaveTxt");
  if (editId) {
    if (modalTitle)   modalTitle.textContent   = "✏️ Edit Story";
    if (modalSaveTxt) modalSaveTxt.textContent = "Save Changes ✓";
    _prefillEditModal(editId);
  } else {
    if (modalTitle)   modalTitle.textContent   = "✨ Create New Story";
    if (modalSaveTxt) modalSaveTxt.textContent = "Publish Story 🚀";
  }

  const modalContainer = document.getElementById("storyModal");
  if (modalContainer) {
    modalContainer.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  setTimeout(_initStoryUploadZone, 100);
};

function _prefillEditModal(editId) {
  const s = allStories.find(x => x.id === editId);
  if (!s) return;

  const titleEl   = document.getElementById("st_story_title");
  const captionEl = document.getElementById("st_story_caption");
  if (titleEl)   titleEl.value   = s.title   || "";
  if (captionEl) captionEl.value = s.caption || "";

  const cc = document.getElementById("captionCount");
  if (cc) cc.textContent = `${(s.caption || "").length} / 300`;

  if (s.media_url) {
    storyCurrentMedia = {
      url: s.media_url, thumbUrl: s.media_thumb,
      type: s.type, width: s.media_width,
      height: s.media_height, aspectRatio: s.aspect_ratio
    };
    _showMediaPreview(s.media_url, s.type, s.media_thumb, s.media_width, s.media_height);
  }

  _resetCtaType(s.link_type || "none");

  setTimeout(() => {
    if (s.link_type === "product" && s.product_id) {
      const sel = document.getElementById("st_story_product");
      if (sel) sel.value = s.product_id;
    }
    if (s.link_type === "whatsapp") {
      const el = document.getElementById("st_story_wa");
      if (el) el.value = s.whatsapp_number || "";
    }
    if (s.link_type === "external") {
      const el = document.getElementById("st_story_url");
      if (el) el.value = s.cta_url || "";
    }
    const ctaEl = document.getElementById("st_story_cta_text");
    if (ctaEl) ctaEl.value = s.cta_text || "";
  }, 200);

  _setFeaturedToggle(s.is_featured);
}

window.closeStoryModal = function () {
  if (!storyEditingId && storyDraftId) {
    supabaseClient.from("stories").delete().eq("id", storyDraftId).then(() => {});
    if (storyCurrentMedia?.url)      storyDeleteFromR2(storyCurrentMedia.url);
    if (storyCurrentMedia?.thumbUrl) storyDeleteFromR2(storyCurrentMedia.thumbUrl);
    storyDraftId      = null;
    storyCurrentMedia = null;
  }
  const modalContainer = document.getElementById("storyModal");
  if (modalContainer) {
    modalContainer.classList.remove("open");
    document.body.style.overflow = "";
  }
};

window.reloadStoryEdit = async function () {
  if (!storyEditingId) return;
  const btn = document.getElementById("storyEditReloadBtn");
  if (btn) btn.classList.add("spinning");
  try {
    const { data, error } = await supabaseClient.rpc("get_all_stories");
    if (error) throw error;
    allStories = (data || []).map(story => {
      let calcStatus = "active";
      if (story.is_hidden) calcStatus = "hidden";
      else if (story.expires_at && new Date(story.expires_at) < new Date()) calcStatus = "expired";
      return { ...story, status: calcStatus };
    });
    _prefillEditModal(storyEditingId);
    toast("Story refreshed successfully ✓", "success");
  } catch (e) {
    toast("Couldn't reload this story. Try again.", "error");
  } finally {
    if (btn) btn.classList.remove("spinning");
  }
};

document.getElementById("storyModal")?.addEventListener("click", function (e) {
  if (e.target === this) window.closeStoryModal();
});

// ============================================================
// MEDIA ZONE — SHOW / RESET / TRIGGER
// ============================================================

function _showMediaPreview(url, type, thumbUrl, origWidth, origHeight) {
  const zone = document.getElementById("storyMediaZone");
  const ph   = document.getElementById("storyMediaPlaceholder");
  if (!zone) return;

  zone.querySelectorAll(".st-media-preview-wrap").forEach(el => el.remove());
  if (ph) ph.style.display = "none";

  const wrap = document.createElement("div");
  wrap.className      = "st-media-preview-wrap";
  wrap.style.position = "relative";

  const spinner = document.createElement("div");
  spinner.className = "st-media-network-loader";
  spinner.style.cssText = `
    position:absolute;top:50%;left:50%;
    transform:translate(-50%,-50%);
    width:32px;height:32px;
    border:4px solid rgba(255,255,255,.2);
    border-top-color:#28A428;
    border-radius:50%;
    animation:stSpinnerSpin 0.8s linear infinite;
    z-index:10;`;
  wrap.appendChild(spinner);

  const ratio     = (origWidth && origHeight) ? origWidth / origHeight : null;
  const maxH      = 240;
  const dispW     = ratio ? Math.round(maxH * ratio) : null;
  const sizeStyle = dispW
    ? `width:${Math.min(dispW, 480)}px;max-width:100%;height:${maxH}px;`
    : `width:100%;height:220px;`;

  const changeBtn = `
    <button type="button" onclick="event.stopPropagation();_triggerMediaChange()"
      style="margin-top:8px;background:linear-gradient(135deg,#475569,#334155);color:#fff;
        border:none;border-radius:8px;padding:7px 16px;font-size:12px;font-weight:700;
        cursor:pointer;transition:.2s;"
      onmouseover="this.style.opacity='.82'" onmouseout="this.style.opacity='1'">
      🔄 Replace File
    </button>`;

  if (type === "video") {
    wrap.innerHTML += `
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 0;">
        <video src="${url}" poster="${thumbUrl || ''}" controls playsinline
          style="${sizeStyle}object-fit:contain;border-radius:12px;background:#0f172a;"
          onclick="event.stopPropagation();"
          onloadeddata="this.parentElement.parentElement.querySelector('.st-media-network-loader')?.remove();"
          oncontextmenu="return false;"></video>
        ${changeBtn}
      </div>`;
  } else if (type === "audio") {
    wrap.innerHTML += `
      <div style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;">
        <div style="font-size:48px;">🎵</div>
        <audio src="${url}" controls style="width:100%;max-width:340px;"
          onclick="event.stopPropagation();"
          oncanplaythrough="this.parentElement.parentElement.querySelector('.st-media-network-loader')?.remove();"
          oncontextmenu="return false;"></audio>
        ${changeBtn}
      </div>`;
  } else {
    wrap.innerHTML += `
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 0;">
        <img src="${url}" alt="Preview"
          style="${sizeStyle}object-fit:contain;border-radius:12px;background:#f1f5f9;"
          onclick="event.stopPropagation();"
          onload="this.parentElement.parentElement.querySelector('.st-media-network-loader')?.remove();">
        ${changeBtn}
      </div>`;
  }
  zone.appendChild(wrap);
}

function _resetMediaZone() {
  const zone = document.getElementById("storyMediaZone");
  const ph   = document.getElementById("storyMediaPlaceholder");
  if (zone) zone.querySelectorAll(".st-media-preview-wrap").forEach(el => el.remove());
  if (ph)   ph.style.display = "flex";
}

window._triggerMediaChange = () => {
  const input = document.getElementById("storyMediaInput");
  if (input) input.click();
};

function _initStoryUploadZone() {
  const input = document.getElementById("storyMediaInput");
  const zone  = document.getElementById("storyMediaZone");
  const ph    = document.getElementById("storyMediaPlaceholder");
  if (!input || !zone) return;

  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener("change", _handleStoryMediaChange);

  if (ph) {
    ph.style.cursor = "pointer";
    ph.onclick = e => { e.preventDefault(); e.stopPropagation(); newInput.click(); };
  }
  zone.onclick = e => {
    if (e.target === zone || e.target === ph || ph?.contains(e.target)) {
      e.preventDefault(); newInput.click();
    }
  };
}

// ============================================================
// MEDIA UPLOAD HANDLER
// ============================================================

async function _handleStoryMediaChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = "";

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");

  if (isVideo && file.size > 100 * 1024 * 1024) {
    return toast("Video is too large. Please keep it under 100MB. 🎬", "error");
  }

  const targetId = storyEditingId || storyDraftId;

  if (storyCurrentMedia?.url) {
    showProgress(5, "Clearing old file…");
    await storyDeleteFromR2(storyCurrentMedia.url);
    if (storyCurrentMedia.thumbUrl && storyCurrentMedia.thumbUrl !== storyCurrentMedia.url) {
      await storyDeleteFromR2(storyCurrentMedia.thumbUrl);
    }
    if (targetId) await _clearMediaFromSupabase(targetId);
    storyCurrentMedia = null;
    _resetMediaZone();
  }

  showProgress(15,
    isImage ? "Optimising your image…" :
    isVideo ? "Preparing your video…"  : "Preparing your audio…"
  );

  try {
    let mediaUrl, thumbUrl = null;
    let width = 0, height = 0, duration = null, fileSize = 0;
    const mediaType = isVideo ? "video" : isAudio ? "audio" : "image";

    if (isImage) {
      const { file: compressed, width: w, height: h } = await compressStoryImage(file);
      showProgress(45, "Uploading your image…");
      mediaUrl = await storyUploadToR2(compressed, "stories");
      thumbUrl = mediaUrl;
      width = w; height = h; fileSize = compressed.size;
    } else if (isVideo) {
      const thumbResult = await generateVideoThumbnail(file);
      width  = thumbResult?.width  || 0;
      height = thumbResult?.height || 0;
      if (thumbResult?.file) { thumbUrl = await storyUploadToR2(thumbResult.file, "stories"); }
      showProgress(60, "Uploading your video…");
      mediaUrl = await storyUploadToR2(file, "stories");
      fileSize = file.size;
    } else if (isAudio) {
      duration = await getAudioDuration(file);
      showProgress(50, "Uploading your audio…");
      mediaUrl = await storyUploadToR2(file, "stories");
      fileSize = file.size;
    }

    showProgress(85, "Saving to your store…");
    const aspectRatio = computeAspectRatio(width, height);

    if (storyEditingId) {
      await _syncMediaToSupabase(storyEditingId, mediaUrl, thumbUrl, mediaType, width, height, aspectRatio, fileSize, duration);
      toast("File saved! Looking great ✓", "success");
    } else {
      if (!storyDraftId) {
        const { data: drafted, error: draftErr } = await supabaseClient.rpc("create_story", {
          p_media_url:     mediaUrl,
          p_media_thumb:   thumbUrl     || null,
          p_type:          mediaType,
          p_expires_hours: storySelectedHours,
          p_file_size:     fileSize     || null,
          p_duration:      duration     || null,
          p_media_width:   width        || null,
          p_media_height:  height       || null,
          p_aspect_ratio:  aspectRatio  || null
        });
        if (draftErr) throw draftErr;
        storyDraftId = drafted?.[0]?.id || null;
      } else {
        await _syncMediaToSupabase(storyDraftId, mediaUrl, thumbUrl, mediaType, width, height, aspectRatio, fileSize, duration);
      }
      toast("File ready! Now fill in the details below 👇", "success");
    }

    showProgress(100, "Done ✓");
    setTimeout(() => showProgress(null), 600);

    storyCurrentMedia = { url: mediaUrl, thumbUrl, type: mediaType, width, height, aspectRatio, fileSize, duration };
    _showMediaPreview(mediaUrl, mediaType, thumbUrl, width, height);
    _initStoryUploadZone();

  } catch (err) {
    showProgress(null);
    console.error("Upload error:", err);
    toast("Upload failed: " + err.message, "error");
  }
}

// ============================================================
// CTA TYPE SELECTOR
// ============================================================

window.selectCtaType = (type) => _resetCtaType(type);

function _resetCtaType(type) {
  storyCtaType = type;
  document.querySelectorAll(".st-cta-type-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.type === type)
  );
  ["ctaProductPanel", "ctaWhatsappPanel", "ctaExternalPanel"].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = "none";
  });
  const map = { product: "ctaProductPanel", whatsapp: "ctaWhatsappPanel", external: "ctaExternalPanel" };
  if (map[type]) { const el = document.getElementById(map[type]); if (el) el.style.display = "flex"; }
  const textRow = document.getElementById("ctaTextRow");
  if (textRow) textRow.style.display = type !== "none" ? "block" : "none";
}

window.setCTAText = (t) => {
  const el = document.getElementById("st_story_cta_text"); if (el) el.value = t;
};

// ── WhatsApp autofill
// Reads s.store_whatsapp from the already-loaded allStories data.
// get_all_stories returned this live from profile. Zero extra DB call.
// Zero caching. Zero cross-store contamination.
window.useProfileWhatsapp = function () {
  const el = document.getElementById("st_story_wa");
  if (!el) return;
  // Pull from the live story data already in memory from this session's RPC call
  const liveWa = allStories[0]?.store_whatsapp || "";
  if (liveWa) {
    el.value = liveWa;
  } else {
    toast("No WhatsApp number found in your store profile. Add one in Settings.", "error");
  }
};

// ============================================================
// PRODUCT PICKER — get_all_products_v2 RPC, fresh every modal open
// ============================================================

async function _loadProductsForPicker() {
  const sel = document.getElementById("st_story_product");
  if (!sel) return;

  let searchInput = document.getElementById("st_story_product_search");
  if (!searchInput) {
    const searchWrap = document.createElement("div");
    searchWrap.className = "st-product-search-wrapper";
    searchWrap.style.cssText = "margin-bottom:8px;display:flex;flex-direction:column;gap:4px;";
    searchWrap.innerHTML = `
      <label for="st_story_product_search"
        style="font-size:12px;font-weight:600;color:#64748b;">🔍 Search your products:</label>
      <input type="text" id="st_story_product_search"
        placeholder="Type to filter…"
        style="width:100%;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;
          font-size:14px;outline:none;background:#fff;transition:.2s;"
        onfocus="this.style.borderColor='#28A428';this.style.boxShadow='0 0 0 3px rgba(40,164,40,.12)'"
        onblur="this.style.borderColor='#e2e8f0';this.style.boxShadow='none'">`;
    sel.parentNode.insertBefore(searchWrap, sel);
    searchInput = document.getElementById("st_story_product_search");
  } else {
    searchInput.value = "";
  }

  sel.innerHTML = `<option value="">Loading your products…</option>`;

  try {
    const { data, error } = await supabaseClient.rpc("get_all_products_v2");
    if (error) throw error;

    _storyProductsCache = data || [];

    const renderOptions = (filterText = "") => {
      sel.innerHTML = `<option value="">Choose a product…</option>`;
      const term    = filterText.toLowerCase().trim();
      const matched = _storyProductsCache.filter(p => p.name.toLowerCase().includes(term));
      if (matched.length === 0) {
        sel.innerHTML = `<option value="">No products found</option>`;
        return;
      }
      matched.forEach(p => {
        const o       = document.createElement("option");
        o.value       = p.id;
        o.textContent = p.price ? `${p.name} — ${p.price}` : p.name;
        sel.appendChild(o);
      });
    };

    renderOptions("");
    if (searchInput) searchInput.oninput = e => renderOptions(e.target.value);

  } catch (e) {
    console.error("Product picker error:", e);
    sel.innerHTML = `<option value="">Couldn't load products. Try reopening.</option>`;
  }
}

// ============================================================
// EXPIRY + FEATURED
// ============================================================

window.selectExpiry = (hours) => _setExpiryBtn(hours);

function _setExpiryBtn(hours) {
  storySelectedHours = hours;
  document.querySelectorAll(".st-expiry-btn").forEach(b =>
    b.classList.toggle("active", parseInt(b.dataset.hours) === hours)
  );
}

window.toggleFeatured = () => { storyIsFeatured = !storyIsFeatured; _setFeaturedToggle(storyIsFeatured); };

function _setFeaturedToggle(val) {
  storyIsFeatured = val;
  const t = document.getElementById("featuredToggle");
  if (t) t.classList.toggle("on", val);
}

document.getElementById("st_story_caption")?.addEventListener("input", function () {
  const len = this.value.length;
  const el  = document.getElementById("captionCount");
  if (!el) return;
  el.textContent = `${len} / 300`;
  el.className = "st-char-count" + (len > 280 ? " warn" : "") + (len >= 300 ? " over" : "");
});

// ============================================================
// SAVE STORY
// ============================================================

window.saveStory = async function () {
  const targetId = storyEditingId || storyDraftId;
  if (!targetId || !storyCurrentMedia) {
    return toast("Please add a photo, video, or audio first! 📸", "error");
  }

  const btn = document.getElementById("storyModalSaveBtn");
  const txt = document.getElementById("storyModalSaveTxt");
  if (btn) btn.disabled = true;
  if (txt) txt.textContent = "Publishing…";

  try {
    const title   = document.getElementById("st_story_title")?.value.trim()    || null;
    const caption = document.getElementById("st_story_caption")?.value.trim()  || null;
    const ctaText = document.getElementById("st_story_cta_text")?.value.trim() || null;
    const waNum   = document.getElementById("st_story_wa")?.value.trim()       || null;
    const extUrl  = document.getElementById("st_story_url")?.value.trim()      || null;

    const productSel = document.getElementById("st_story_product");
    const productId  = (storyCtaType === "product" && productSel?.value) ? productSel.value : null;

    let linkTarget = null, ctaUrl = null, waNumber = null;
    if (storyCtaType === "product")  { linkTarget = productId; }
    if (storyCtaType === "whatsapp") { waNumber   = waNum; }
    if (storyCtaType === "external") { ctaUrl = extUrl; linkTarget = extUrl; }

    let error;

    if (storyEditingId) {
      const { error: e } = await supabaseClient.rpc("update_story", {
        p_id:              storyEditingId,
        p_title:           title,
        p_caption:         caption,
        p_product_id:      productId,
        p_link_type:       storyCtaType,
        p_link_target:     linkTarget,
        p_cta_text:        ctaText,
        p_cta_url:         ctaUrl,
        p_whatsapp_number: waNumber,
        p_is_hidden:       false,
        p_is_featured:     storyIsFeatured
      });
      error = e;
    } else if (storyDraftId) {
      const { error: e } = await supabaseClient.from("stories").update({
        title,
        caption,
        product_id:      productId,
        link_type:       storyCtaType,
        link_target:     linkTarget,
        cta_text:        ctaText,
        cta_url:         ctaUrl,
        whatsapp_number: waNumber,
        is_featured:     storyIsFeatured,
        expires_at:      new Date(Date.now() + storySelectedHours * 3600 * 1000).toISOString(),
        auto_delete_at:  new Date(Date.now() + (storySelectedHours + 24) * 3600 * 1000).toISOString()
      }).eq("id", storyDraftId);
      error = e;
      if (!e) storyDraftId = null;
    }

    if (error) throw error;

    storyCurrentMedia = null;
    toast(
      storyEditingId
        ? "Story updated! Your audience sees it now ✓"
        : "Story is live! Your audience can see it now 🚀",
      "success"
    );
    closeStoryModal();
    await loadStories(false);

  } catch (err) {
    console.error("Save error:", err);
    toast(err.message || "Couldn't save your story. Please try again.", "error");
  } finally {
    if (btn) btn.disabled = false;
    if (txt) txt.textContent = storyEditingId ? "Save Changes ✓" : "Publish Story 🚀";
  }
};

// ============================================================
// MUTATION ACTIONS
// ============================================================

window.deleteStory = async function (id) {
  if (!confirm("Are you sure? This story will be permanently deleted.")) return;
  try {
    const { data, error } = await supabaseClient.rpc("delete_story", { p_id: id });
    if (error) throw error;
    if (data?.length > 0) {
      await storyDeleteFromR2(data[0].media_url);
      if (data[0].media_thumb && data[0].media_thumb !== data[0].media_url) {
        await storyDeleteFromR2(data[0].media_thumb);
      }
    }
    allStories = allStories.filter(s => s.id !== id);
    renderStories();
    updateStats();
    toast("Story deleted ✓", "success");
  } catch (err) {
    toast("Couldn't delete this story. Try again.", "error");
  }
};

window.toggleStoryVisibility = async function (id) {
  try {
    const { data, error } = await supabaseClient.rpc("toggle_story_visibility", { p_id: id });
    if (error) throw error;
    const isNowHidden = data?.[0]?.is_hidden ?? false;
    const story = allStories.find(s => s.id === id);
    if (story) {
      story.is_hidden = isNowHidden;
      story.status    = isNowHidden ? "hidden" : (new Date(story.expires_at) < new Date() ? "expired" : "active");
    }
    renderStories();
    updateStats();
    toast(
      isNowHidden ? "Story hidden from your audience." : "Story is visible to your audience ✓",
      "success"
    );
  } catch (err) {
    toast("Couldn't update visibility. Try again.", "error");
  }
};

window.restoreStory = async function (id) {
  try {
    const { error } = await supabaseClient.rpc("restore_story", { p_id: id, p_hours: 24 });
    if (error) throw error;
    toast("Story renewed for another 24 hours! ✓", "success");
    await loadStories(false);
  } catch (err) {
    toast("Couldn't renew this story. Try again.", "error");
  }
};

window.moveStory = async function (id, direction) {
  const filtered = currentFilter === "all"
    ? allStories
    : allStories.filter(s => s.status === currentFilter);
  const idx    = filtered.findIndex(s => s.id === id);
  const newIdx = idx + direction;
  if (idx < 0 || newIdx < 0 || newIdx >= filtered.length) return;
  const idxA = allStories.findIndex(s => s.id === filtered[idx].id);
  const idxB = allStories.findIndex(s => s.id === filtered[newIdx].id);
  [allStories[idxA], allStories[idxB]] = [allStories[idxB], allStories[idxA]];
  renderStories();
  try {
    const orderedIds = allStories.map(s => s.id);
    const { error } = await supabaseClient.rpc("reorder_stories", { p_ids: orderedIds });
    if (error) throw error;
    allStories.forEach((s, i) => { s.sort_order = i; });
  } catch (e) {
    console.error("Reorder save error:", e);
    toast("Order shown but couldn't save. Please try again.", "error");
  }
};

// ============================================================
// PRODUCT PREVIEW POPUP
// ============================================================

window.showProductPreview = async function (productId, productName) {
  if (!productId) return;
  let popup = document.getElementById("storyProductPreviewPopup");
  if (!popup) {
    popup = document.createElement("div");
    popup.id = "storyProductPreviewPopup";
    popup.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,.55);backdrop-filter:blur(6px);
      animation:stFadeIn .2s ease;`;
    popup.onclick = e => {
  if (e.target === popup) {
    popup.remove();

    previewCtaActive = false;

    resumeStoryPreview();
  }
};
    document.body.appendChild(popup);
  }
  popup.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:28px 24px;max-width:340px;width:90%;
      text-align:center;box-shadow:0 25px 60px rgba(0,0,0,.18);animation:stScaleIn .25s ease;">
      <div id="storyProdPopupContent">
        <div style="width:56px;height:56px;border-radius:50%;
          background:linear-gradient(135deg,#28A428,#34BF49);
          display:flex;align-items:center;justify-content:center;
          font-size:22px;margin:0 auto 14px;">🛍</div>
        <p style="font-weight:700;font-size:15px;color:#1e293b;">Loading product…</p>
      </div>
      <button onclick="
const p=document.getElementById('storyProductPreviewPopup');
if(p)p.remove();
previewCtaActive=false;
resumeStoryPreview();
      style="margin-top:16px;background:linear-gradient(135deg,#f1f5f9,#e2e8f0);
          color:#475569;border:none;border-radius:10px;padding:8px 20px;
          font-size:13px;font-weight:700;cursor:pointer;">Close</button>
    </div>`;
  try {
    const { data, error } = await supabaseClient
      .from("products")
      .select("id, name, image_urls, price, description")
      .eq("id", productId)
      .single();
    if (error || !data) throw new Error("Product not found");
    const imgSrc  = data.image_urls?.[0] || null;
    const content = document.getElementById("storyProdPopupContent");
    if (content) {
      content.innerHTML = `
        ${imgSrc
          ? `<img src="${imgSrc}" alt="${data.name}"
               style="width:100%;height:180px;object-fit:cover;border-radius:12px;margin-bottom:14px;">`
          : `<div style="width:100%;height:100px;border-radius:12px;
               background:linear-gradient(135deg,#f1f5f9,#e2e8f0);
               display:flex;align-items:center;justify-content:center;
               font-size:36px;margin-bottom:14px;">🛍</div>`}
        <p style="font-weight:800;font-size:16px;color:#111;margin-bottom:4px;">${data.name}</p>
        ${data.price ? `<p style="font-weight:700;font-size:18px;color:#28A428;margin-bottom:8px;">${data.price}</p>` : ""}
        ${data.description
          ? `<p style="font-size:13px;color:#64748b;line-height:1.5;margin-bottom:8px;">
               ${data.description.substring(0, 100)}${data.description.length > 100 ? "…" : ""}
             </p>` : ""}
        <div style="background:linear-gradient(135deg,#fff9e6,#fff3cc);
          border:1px solid #FFD700;border-radius:10px;padding:10px 14px;margin-top:8px;">
          <p style="font-size:12px;color:#92400e;font-weight:600;margin:0;">
            🛒 On the storefront, tapping this story opens <strong>${data.name}</strong>'s page directly.
          </p>
        </div>`;
    }
  } catch (e) {
    const content = document.getElementById("storyProdPopupContent");
    if (content) content.innerHTML = `
      <div style="font-size:36px;margin-bottom:10px;">😕</div>
      <p style="color:#FF3B30;font-weight:700;">Couldn't load product details.</p>`;
  }
};

// ============================================================
// WHATSAPP-STYLE PREVIEW VIEWER
// ============================================================
// BINDING CONTRACT — FINAL v10:
//
//   #previewStoreLogo     ← s.store_logo      (profile JOIN, per row, no cache)
//   #previewStoreName     ← s.store_name      (profile JOIN, per row, no cache) ← NEW
//   #previewUploaderName  ← s.creator_name    (store_members JOIN, per row)
//   #previewTime          ← timeAgo(s.created_at)
//
//   useProfileWhatsapp()  ← s.store_whatsapp  (profile JOIN, per row, no cache) ← NEW
//
//   Zero window.* variables. Zero module-level name/logo/wa cache.
//   Every single store identity field comes live from the DB per story row.
// ============================================================

function pauseStoryPreview() {
  if (previewCtaPaused) return;

  previewCtaPaused = true;

  clearTimeout(previewTimer);

  _pauseProgressBar();

  document
    .getElementById("previewMediaWrap")
    ?.querySelectorAll("video,audio")
    .forEach(el => {
      try { el.pause(); } catch {}
    });
}

function resumeStoryPreview() {
  if (!previewCtaPaused) return;

  previewCtaPaused = false;

  document
    .getElementById("previewMediaWrap")
    ?.querySelectorAll("video,audio")
    .forEach(el => {
      try { el.play().catch(() => {}); } catch {}
    });

  const s = previewStoryList[previewIndex];

  if (!s) return;

  if (s.type === "image") {
    previewTimer = setTimeout(() => previewNav(1), 5000);
  }
}
function resetPreviewCtaState() {
  previewCtaActive = false;
  previewCtaPaused = false;
}

window.openPreviewAt = function (id) {
  const filtered = currentFilter === "all"
    ? allStories
    : allStories.filter(s => s.status === currentFilter);
  previewStoryList = filtered;
  previewIndex     = Math.max(0, filtered.findIndex(s => s.id === id));
  const previewModal = document.getElementById("storyPreviewModal");
  if (previewModal) {
    previewModal.classList.add("open");
    document.body.style.overflow = "hidden";
    _renderPreviewSlide();
  }
};

function _renderPreviewSlide() {
  const s = previewStoryList[previewIndex];
previewCtaActive = false;
previewCtaPaused = false;
  if (!s) return;
  clearTimeout(previewTimer);

  // Progress dots
  const track = document.getElementById("previewProgressTrack");
  if (track) track.innerHTML = previewStoryList.map((_, i) =>
    `<div class="st-preview-dot ${i === previewIndex ? "active" : i < previewIndex ? "done" : ""}"></div>`
  ).join("");

  const counter = document.getElementById("previewCounter");
  if (counter) counter.textContent = `${previewIndex + 1} / ${previewStoryList.length}`;

  // ── Store logo
  // Source: s.store_logo — live from profile LEFT JOIN in get_all_stories
  // No window var. No cache. Fresh from DB per story row.
  const storeLogoEl = document.getElementById("previewStoreLogo");
  if (storeLogoEl) {
    storeLogoEl.innerHTML = s.store_logo
      ? `<img src="${s.store_logo}" alt="Store logo"
           style="width:38px;height:38px;border-radius:50%;object-fit:cover;
                  border:2px solid rgba(255,255,255,.55);"
           onerror="this.outerHTML='<div style=\\'width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#28A428,#34BF49);display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid rgba(255,255,255,.4);\\'>🏪</div>'">`
      : `<div style="width:38px;height:38px;border-radius:50%;
           background:linear-gradient(135deg,#28A428,#34BF49);
           display:flex;align-items:center;justify-content:center;
           font-size:18px;border:2px solid rgba(255,255,255,.4);">🏪</div>`;
  }

  // ── Store name
  // Source: s.store_name — live from profile.business_name JOIN in get_all_stories (NEW in v10)
  // No async fetch. No window._profileBusinessName. No stale global.
  // Store A sees "Store A". Store B sees "Store B". Always correct.
  const storeNameEl = document.getElementById("previewStoreName");
  if (storeNameEl) {
    storeNameEl.textContent = s.store_name || "Our Store";
  }

  // ── Uploader name
  // Source: s.creator_name — live from store_members JOIN in get_all_stories
  // Sarah's story shows "by Sarah". James's story shows "by James". Per row.
  const uploaderEl = document.getElementById("previewUploaderName");
  if (uploaderEl) {
    uploaderEl.textContent = s.creator_name ? `by ${s.creator_name}` : "";
  }

  const timeEl = document.getElementById("previewTime");
  if (timeEl) timeEl.textContent = timeAgo(s.created_at);

  // Media wrap
  const wrap = document.getElementById("previewMediaWrap");
  if (!wrap) return;
  wrap.querySelectorAll("video,audio").forEach(el => { el.pause(); el.src = ""; });
  wrap.innerHTML = "";

  const inlineLoader = document.createElement("div");
  inlineLoader.className = "st-preview-network-spinner";
  inlineLoader.style.cssText = `
    position:absolute;top:50%;left:50%;
    transform:translate(-50%,-50%);
    width:40px;height:40px;
    border:4px solid rgba(255,255,255,.1);
    border-top-color:#ffffff;
    border-radius:50%;
    animation:stSpinnerSpin 0.8s linear infinite;
    z-index:5;`;
  wrap.appendChild(inlineLoader);

  let slideDuration = 5;

  if (s.type === "video") {
    const vid = document.createElement("video");
    vid.src = s.media_url; vid.autoplay = true; vid.playsInline = true; vid.muted = false;
    vid.style.cssText = `
      max-width:100%;max-height:100%;width:auto;height:auto;
      object-fit:contain;position:absolute;
      top:50%;left:50%;transform:translate(-50%,-50%);z-index:2;`;
    vid.oncontextmenu    = () => false;
    vid.oncanplay        = () => wrap.querySelector(".st-preview-network-spinner")?.remove();
    vid.onloadedmetadata = () => { slideDuration = vid.duration || 10; _startProgressBar(slideDuration); };
    vid.onended          = () => previewNav(1);
    wrap.appendChild(vid);

  } else if (s.type === "audio") {
    slideDuration = s.duration || 15;
    const ph = document.createElement("div");
    ph.style.cssText = `
      position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:16px;
      background:linear-gradient(135deg,#0f172a,#1e293b);z-index:1;`;
    ph.innerHTML = `
      <span style="font-size:64px;">🎵</span>
      <p style="color:rgba(255,255,255,.6);font-size:13px;font-weight:700;">${s.title || "Audio Story"}</p>`;
    wrap.appendChild(ph);
    const aud = document.createElement("audio");
    aud.src = s.media_url; aud.autoplay = true;
    aud.oncanplay = () => wrap.querySelector(".st-preview-network-spinner")?.remove();
    aud.onended   = () => previewNav(1);
    wrap.appendChild(aud);
    _startProgressBar(slideDuration);
    previewTimer = setTimeout(() => previewNav(1), slideDuration * 1000);

  } else {
    const img = document.createElement("img");
    img.src = s.media_url; img.alt = s.title || "Story";
    img.style.cssText = `
      max-width:100%;max-height:100%;width:auto;height:auto;
      object-fit:contain;position:absolute;
      top:50%;left:50%;transform:translate(-50%,-50%);z-index:2;`;
    img.oncontextmenu = () => false;
    img.draggable     = false;
    img.onload = () => wrap.querySelector(".st-preview-network-spinner")?.remove();
    wrap.appendChild(img);
    _startProgressBar(slideDuration);
    previewTimer = setTimeout(() => previewNav(1), slideDuration * 1000);
  }

  // Title / caption
  const titleEl   = document.getElementById("previewTitle");
  const captionEl = document.getElementById("previewCaption");
  if (titleEl)   titleEl.textContent   = s.title   || "";
  if (captionEl) captionEl.textContent = s.caption || "";

  // CTA button
  const ctaEl = document.getElementById("previewCta");
  if (ctaEl) {
    if (s.cta_text && s.link_type && s.link_type !== "none") {
      ctaEl.textContent   = s.cta_text;
      ctaEl.style.display = "block";
      if (s.link_type === "product") {
        ctaEl.style.cssText = `
          display:block;background:linear-gradient(135deg,#FFD700,#FF7A00);
          color:#111;border:none;border-radius:12px;padding:10px 24px;
          font-weight:800;font-size:14px;cursor:pointer;margin:8px auto;`;
        ctaEl.onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (previewCtaActive) return;

  previewCtaActive = true;

  pauseStoryPreview();

  showProductPreview(
    s.product_id,
    s.product_name
  );
};
} 
else if (s.link_type === "whatsapp") {
        ctaEl.style.cssText = `
          display:block;background:linear-gradient(135deg,#28A428,#34BF49);
          color:#fff;border:none;border-radius:12px;padding:10px 24px;
          font-weight:800;font-size:14px;cursor:pointer;margin:8px auto;`;
        ctaEl.onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (previewCtaActive) return;
  previewCtaActive = true;
  pauseStoryPreview();
 {
          if (s.whatsapp_number) {
            window.open(
              `https://wa.me/${s.whatsapp_number}?text=${encodeURIComponent("Hi, I saw your story: " + (s.title || ""))}`,
              "_blank"
            );
setTimeout(() => {
  previewCtaActive = false;
  resumeStoryPreview();
}, 1000);
          }
        };
      } else {
        ctaEl.style.cssText = `
          display:block;background:linear-gradient(135deg,#1877F2,#0d5bbf);
          color:#fff;border:none;border-radius:12px;padding:10px 24px;
          font-weight:800;font-size:14px;cursor:pointer;margin:8px auto;`;
        ctaEl.onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (previewCtaActive) return;
  previewCtaActive = true;
  pauseStoryPreview();
 { if (s.link_target) window.open(s.link_target, "_blank"); 
setTimeout(() => {
  previewCtaActive = false;
  resumeStoryPreview();
}, 1000);
};
      }
    } else {
      ctaEl.style.display = "none";
    }
  }

  const holdHint = document.getElementById("previewHoldHint");
  if (holdHint) { holdHint.style.opacity = "1"; setTimeout(() => holdHint.style.opacity = "0", 2000); }
}

window.closePreview = function () {
  resetPreviewCtaState();
  clearTimeout(previewTimer);
  const overlay =    document.getElementById("storyPreviewModal");
  if (overlay) {
    overlay.classList.remove("open");
    overlay
      .querySelectorAll("video,audio")
      .forEach(el => {
        try {
          el.pause();
          el.src = "";
        } catch {}
      });
  }
  const cta =    document.getElementById("previewCta");
  if (cta) {
    cta.onclick = null;
  }
  document.body.style.overflow = "";
};


function _startProgressBar(durationSecs) {
  const fill = document.getElementById("previewProgFill");
  if (!fill) return;
  fill.style.transition = "none";
  fill.style.width      = "0%";
  requestAnimationFrame(() => {
    fill.style.transition = `width ${durationSecs}s linear`;
    fill.style.width      = "100%";
  });
}

function _pauseProgressBar() {
  const fill = document.getElementById("previewProgFill");
  if (!fill) return;
  const w = getComputedStyle(fill).width;
  fill.style.transition = "none";
  fill.style.width      = w;
}

window.previewNav = function (direction) {
  if (previewHolding) return;
  clearTimeout(previewTimer);
  const newIdx = previewIndex + direction;
  if (newIdx < 0 || newIdx >= previewStoryList.length) { closePreview(); return; }
  previewIndex = newIdx;
  _renderPreviewSlide();
};

// ============================================================
// TOUCH & HOLD HANDLERS
// ============================================================

(function setupPreviewHold() {
  const init = () => {
    const screen = document.getElementById("previewScreen");
    if (!screen) return;
    screen.addEventListener("contextmenu", e => e.preventDefault(), { passive: false });
    screen.addEventListener("selectstart",  e => e.preventDefault());
    screen.addEventListener("dragstart",    e => e.preventDefault());
    screen.addEventListener("mousedown", () => {
      previewHolding = true;
      clearTimeout(previewTimer);
      _pauseProgressBar();
      document.getElementById("previewMediaWrap")?.querySelectorAll("video,audio").forEach(el => el.pause());
    });
    screen.addEventListener("mouseup", () => {
      previewHolding = false;
      document.getElementById("previewMediaWrap")?.querySelectorAll("video,audio").forEach(el => el.play().catch(() => {}));
      const s = previewStoryList[previewIndex];
      if (s?.type === "image") previewTimer = setTimeout(() => previewNav(1), 4000);
    });
    screen.addEventListener("mouseleave", () => {
      if (previewHolding) {
        previewHolding = false;
        document.getElementById("previewMediaWrap")?.querySelectorAll("video,audio").forEach(el => el.play().catch(() => {}));
      }
    });
  };
  if (document.readyState === "complete" || document.readyState === "interactive") init();
  else document.addEventListener("DOMContentLoaded", init);
})();

function onPreviewTouchStart(e) {
  e.preventDefault();
  previewTouchStartX = e.touches[0].clientX;
  previewTouchStartT = Date.now();
  previewHolding     = true;
  clearTimeout(previewTimer);
  _pauseProgressBar();
  document.getElementById("previewMediaWrap")?.querySelectorAll("video,audio").forEach(el => el.pause());
}
window.onPreviewTouchStart = onPreviewTouchStart;

function onPreviewTouchEnd(e, defaultDir) {
  e.preventDefault();
  previewHolding = false;
  const held   = Date.now() - previewTouchStartT;
  const deltaX = (e.changedTouches?.[0]?.clientX || previewTouchStartX) - previewTouchStartX;
  const wrap   = document.getElementById("previewMediaWrap");
  if (held > 350) {
    wrap?.querySelectorAll("video,audio").forEach(el => el.play().catch(() => {}));
    const s = previewStoryList[previewIndex];
    if (s?.type === "image") previewTimer = setTimeout(() => previewNav(1), 4000);
    return;
  }
  if (Math.abs(deltaX) > 35) { previewNav(deltaX < 0 ? 1 : -1); return; }
  previewNav(defaultDir === "next" ? 1 : -1);
}
window.onPreviewTouchEnd = onPreviewTouchEnd;

document.getElementById("storyPreviewModal")?.addEventListener("click", function (e) {
  if (e.target === this) closePreview();
});

// ============================================================
// FILTER HANDLERS
// ============================================================

window.handleStorySearchFilter = function () { renderStories(); };

window.filterMediaType = function (mediaType, btnElement) {
  currentMediaTypeFilter = mediaType;
  document.querySelectorAll(".st-media-filter-btn").forEach(btn => btn.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");
  renderStories();
};

window.toggleAddedByMeFilter = function (checkboxElement) {
  currentCreatedByFilter = checkboxElement.checked ? "me" : "all";
  renderStories();
};

window.handleRoleSelectFilter = function (selectElement) {
  currentRoleFilter = selectElement.value;
  renderStories();
};

// ============================================================
// GLOBAL SPINNER KEYFRAMES
// ============================================================

(function injectSpinnerStyle() {
  if (document.getElementById("stSpinnerStyle")) return;
  const s = document.createElement("style");
  s.id = "stSpinnerStyle";
  s.innerHTML = `
    @keyframes stSpinnerSpin {
      0%   { transform: translate(-50%,-50%) rotate(0deg); }
      100% { transform: translate(-50%,-50%) rotate(360deg); }
    }
  `;
  document.head.appendChild(s);
})();

// ================================================================
//  SHARED HELPER — tiny toast alias (uses the one already in scope)
// ================================================================
// (toast() already exists in the outer DOMContentLoaded scope — no redeclaration)

// ================================================================
// CATEGORIES TAB — JavaScript v2  |  LIYOG ADMIN DASHBOARD
// Friendly language · Global CSS tokens · Search · Premium UX
// All RPC calls unchanged — only UI layer upgraded
// ================================================================

const EMOJI_SHORTCUTS = [
  "👟","📱","🍔","👗","💄","🎮","📸","🏠","🌿","⌚",
  "🎒","🏋️","🍕","💻","🧴","🎁","👒","🛍️","🌸","🎵"
];

// Module state
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
});

