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
// ── Pull shared globals set by runtime.js, config.js, helpers.js
// ================================================================
//  BiziNet Tab Engine · Stories
//  dashboard/js/stories.js
// ================================================================

let runtimeState = null;
let currentSessionToken = null;
const R2_PUBLIC_BASE = window.APP_CONFIG.r2PublicBase;
const supabaseClient = window.APP_CLIENT;

async function loadStories() {
  await window.APP_RUNTIME_READY;
  
  runtimeState = window.APP_RUNTIME.runtimeState;
  currentSessionToken = window.APP_RUNTIME.currentSessionToken;
  if (!runtimeState) return;

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

  // Helper to remove the popup and resume the story safely
  const closeAndResume = () => {
    if (popup) popup.remove();
    const modal = document.getElementById("storyPreviewModal");
    
    // Only resume if the main story modal is still open
    if (modal && modal.classList.contains("open")) {
      const wrap = document.getElementById("previewMediaWrap");
      if (wrap) wrap.querySelectorAll("video,audio").forEach(el => el.play().catch(()=>{}));
      
      const s = previewStoryList[previewIndex];
      if (!s || s.type === "image") {
        previewTimer = setTimeout(() => previewNav(1), 4000);
      }
    }
  };

  if (!popup) {
    popup = document.createElement("div");
    popup.id = "storyProductPreviewPopup";
    popup.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,.55);backdrop-filter:blur(6px);
      animation:stFadeIn .2s ease;`;
      
    // Close when clicking the dark background
    popup.onclick = e => { if (e.target === popup) closeAndResume(); };
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
      <button id="stProdCloseBtn"
        style="margin-top:16px;background:linear-gradient(135deg,#f1f5f9,#e2e8f0);
          color:#475569;border:none;border-radius:10px;padding:8px 20px;
          font-size:13px;font-weight:700;cursor:pointer;">Close</button>
    </div>`;

  // Attach the close/resume logic to the actual close button
  document.getElementById("stProdCloseBtn").onclick = closeAndResume;

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
  const storeNameEl = document.getElementById("previewStoreName");
  if (storeNameEl) {
    storeNameEl.textContent = s.store_name || "Our Store";
  }

  // ── Uploader name
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
          e.stopPropagation(); // 🔴 Stops the click from waking up the background wrapper

          // 🔴 Pause the story while the product popup is open        clearTimeout(previewTimer);
         _pauseProgressBar();
          const pWrap = document.getElementById("previewMediaWrap");
          if (pWrap) pWrap.querySelectorAll("video,audio").forEach(el => el.pause());
         showProductPreview(s.product_id, s.product_name);
        };

        // 🔴 Block touch events from triggering the swipe/hold handlers
        ctaEl.onmousedown = (e) => e.stopPropagation();
        ctaEl.onmouseup = (e) => e.stopPropagation();
        ctaEl.ontouchstart = (e) => e.stopPropagation();
        ctaEl.ontouchend = (e) => e.stopPropagation();

      } else if (s.link_type === "whatsapp") {
        ctaEl.style.cssText = `         display:block;background:linear-gradient(135deg,#28A428,#34BF49);         color:#fff;border:none;border-radius:12px;padding:10px 24px;          font-weight:800;font-size:14px;cursor:pointer;margin:8px auto;`;
        ctaEl.onclick = () => {
          if (s.whatsapp_number) {
            window.open(
              `https://wa.me/${s.whatsapp_number}?text=${encodeURIComponent("Hi, I saw your story: " + (s.title || ""))}`,
              "_blank"
            );
          }
        };
      } else {
        ctaEl.style.cssText = `          display:block;background:linear-gradient(135deg,#1877F2,#0d5bbf);         color:#fff;border:none;border-radius:12px;padding:10px 24px;         font-weight:800;font-size:14px;cursor:pointer;margin:8px auto;`;
        ctaEl.onclick = () => { if (s.link_target) window.open(s.link_target, "_blank"); };
      }
    } else {
      ctaEl.style.display = "none";
    }
  }
  const holdHint = document.getElementById("previewHoldHint");
  if (holdHint) { holdHint.style.opacity = "1"; setTimeout(() => holdHint.style.opacity = "0", 2000); }
}


window.closePreview = function () {
  clearTimeout(previewTimer);
  const overlay = document.getElementById("storyPreviewModal");
  if (overlay) {
    overlay.classList.remove("open");
    overlay.querySelectorAll("video,audio").forEach(el => { el.pause(); el.src = ""; });
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
      // 🔴 SAFETY CHECK: Do nothing if the preview is closed
      if (!document.getElementById("storyPreviewModal")?.classList.contains("open")) return; 
      
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
  // 🔴 SAFETY CHECK: Do nothing if the preview is closed
  if (!document.getElementById("storyPreviewModal")?.classList.contains("open")) return; 
  
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

  window.loadStories = loadStories;

