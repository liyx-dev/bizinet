/**
 * ============================================================================
 * BIZIPLEX AUTH — PAGE LOGIC
 * ============================================================================
 * Backend (RPC) is the only source of truth. This file never computes a
 * redirect target itself — it always asks get_store_runtime_state(). It
 * never assumes provisioning succeeded — it verifies via the runtime state
 * and retries create_store_workspace() (idempotent) until it has proof.
 *
 * Written as plain top-level code (no IIFE wrapper), calling safeNavigate()
 * as a bare global identifier — exactly the pattern from your original
 * working page and every other page that already uses global.js. Load
 * order required in the HTML:
 *   1. global.js
 *   2. supabase-js CDN
 *   3. all-config.js
 *   4. device-accounts.js
 *   5. auth.js   (this file)
 * ============================================================================
 */

if (typeof biziplexClient === "undefined") {
  console.error("[Biziplex] all-config.js must load before auth.js");
}

// ---------------------------------------------------------------------
// ELEMENT REFS
// ---------------------------------------------------------------------
function el(id) {
  return document.getElementById(id);
}

const signupTab = el("signupTab");
const signinTab = el("signinTab");
const signupForm = el("signupForm");
const signinForm = el("signinForm");
const signupBtn = el("signupBtn");
const signinBtn = el("signinBtn");
const messageBox = el("messageBox");
const provisioningOverlay = el("provisioningOverlay");
const provisioningText = el("provisioningText");
const offlineBanner = el("authOfflineBanner");

const switcherPill = el("switcherPill");
const switcherList = el("switcherList");
const switcherLabel = el("switcherLabel");
const switcherAvatars = el("switcherAvatars");
const switcherWrap = el("switcherWrap");

const passwordInput = el("signupPassword");
const strengthMeter = el("strengthMeter");
const strengthLabel = el("strengthLabel");

// ---------------------------------------------------------------------
// MESSAGE SYSTEM
// ---------------------------------------------------------------------
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function showMessage(type, text) {
  if (!messageBox) return;
  messageBox.className = `auth-message show ${type}`;
  messageBox.innerHTML = `<span>${escapeHtml(text)}</span>`;
}
function clearMessage() {
  if (!messageBox) return;
  messageBox.className = "auth-message";
  messageBox.innerHTML = "";
}

// ---------------------------------------------------------------------
// LOADING STATES
// ---------------------------------------------------------------------
function setLoading(button, isLoading, text) {
  if (!button) return;
  if (isLoading) {
    button.disabled = true;
    button.dataset.originalLabel = button.dataset.originalLabel || button.innerHTML;
    button.innerHTML = `<span class="loader"></span><span>${escapeHtml(text || "Please wait...")}</span>`;
    return;
  }
  button.disabled = false;
  if (button.dataset.originalLabel) {
    button.innerHTML = button.dataset.originalLabel;
  }
}

function showProvisioningOverlay(show, text) {
  if (!provisioningOverlay) return;
  provisioningOverlay.classList.toggle("show", !!show);
  if (text && provisioningText) provisioningText.textContent = text;
}

// ---------------------------------------------------------------------
// OFFLINE DETECTION
// ---------------------------------------------------------------------
function updateOnlineStatus() {
  if (!offlineBanner) return;
  offlineBanner.classList.toggle("show", !navigator.onLine);
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
updateOnlineStatus();

// ---------------------------------------------------------------------
// TAB SWITCHING
// ---------------------------------------------------------------------
if (signupTab && signinTab) {
  signupTab.addEventListener("click", () => {
    signupTab.classList.add("active");
    signinTab.classList.remove("active");
    signupForm.classList.remove("hidden");
    signinForm.classList.add("hidden");
    clearMessage();
  });
  signinTab.addEventListener("click", () => {
    signinTab.classList.add("active");
    signupTab.classList.remove("active");
    signinForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
    clearMessage();
  });
}

// ---------------------------------------------------------------------
// PASSWORD STRENGTH (client-side hint only — server enforces the real rule)
// ---------------------------------------------------------------------
function scorePassword(pw) {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

if (passwordInput && strengthMeter) {
  passwordInput.addEventListener("input", () => {
    const score = scorePassword(passwordInput.value);
    const segs = strengthMeter.querySelectorAll(".strength-seg");
    const tier = score <= 1 ? "weak" : score <= 3 ? "fair" : "strong";
    segs.forEach((seg, i) => {
      seg.className = "strength-seg" + (i < score ? ` on-${tier}` : "");
    });
    if (strengthLabel) {
      strengthLabel.textContent = passwordInput.value
        ? tier === "weak" ? "Weak — add more characters" : tier === "fair" ? "Fair" : "Strong password"
        : "";
      strengthLabel.style.color =
        tier === "weak" ? "var(--biz-red)" : tier === "fair" ? "var(--biz-orange)" : "var(--biz-green)";
    }
  });
}

// ---------------------------------------------------------------------
// PROVISIONING GUARANTEE
// Calls the idempotent RPC, then VERIFIES via runtime state. Retries with
// backoff. This is the orphan-account fix in practice — never just hope.
// ---------------------------------------------------------------------
async function guaranteeWorkspace(businessName, maxAttempts) {
  maxAttempts = maxAttempts || 8;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      showProvisioningOverlay(
        true,
        attempt === 1
          ? "Setting up your workspace..."
          : `Still working on it (attempt ${attempt} of ${maxAttempts})...`
      );

      await ensureWorkspace(businessName);
      const runtime = await resolveRuntimeState();

      if (runtime && runtime.store_id) {
        showProvisioningOverlay(false);
        return runtime;
      }
      // No store_id yet even after the call — fall through and retry.
    } catch (err) {
      lastError = err;
      console.warn(`[Biziplex] provisioning attempt ${attempt} failed:`, err);
    }

    const delay = Math.min(1200 * attempt, 5000);
    await new Promise((r) => setTimeout(r, delay));
  }

  showProvisioningOverlay(false);
  throw (
    lastError ||
    new Error(
      "We couldn't finish setting up your workspace yet. Your account is safe — refresh this page and we'll pick up right where we left off."
    )
  );
}

// ---------------------------------------------------------------------
// SIGNUP FLOW
// ---------------------------------------------------------------------
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage();

    const businessName = el("businessName").value.trim();
    const email = el("signupEmail").value.trim().toLowerCase();
    const password = el("signupPassword").value;

    if (businessName.length < 2) {
      showMessage("error", "Business name is too short.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage("error", "Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      showMessage("error", "Password must be at least 6 characters.");
      return;
    }
    if (!navigator.onLine) {
      showMessage("error", "You're offline. Reconnect and try again.");
      return;
    }

    setLoading(signupBtn, true, "Creating account...");

    try {
      const { data, error } = await biziplexClient.auth.signUp({
        email,
        password,
        options: { data: { business_name: businessName, display_name: businessName } },
      });

      if (error) throw error;

      if (data?.user && !data?.session) {
        showMessage("success", "Account created. Check your email to verify before logging in.");
        signupForm.reset();
        setLoading(signupBtn, false);
        return;
      }

      const runtime = await guaranteeWorkspace(businessName);

      if (window.BiziplexDeviceAccounts) {
        await window.BiziplexDeviceAccounts.upsert({
          email,
          storeName: runtime.store_name || businessName,
          logoUrl: runtime.logo_url || null,
          memberName: runtime.member_name || "Store Owner",
        });
      }

      safeNavigate(runtime.redirect_to, true);
    } catch (err) {
      console.error(err);
      showMessage("error", humanizeAuthError(err));
    } finally {
      setLoading(signupBtn, false);
    }
  });
}

// ---------------------------------------------------------------------
// LOGIN FLOW
// ---------------------------------------------------------------------
if (signinForm) {
  signinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage();

    const email = el("signinEmail").value.trim().toLowerCase();
    const password = el("signinPassword").value;

    if (!navigator.onLine) {
      showMessage("error", "You're offline. Reconnect and try again.");
      return;
    }

    setLoading(signinBtn, true, "Signing in...");

    try {
      const { error } = await biziplexClient.auth.signInWithPassword({ email, password });
      if (error) throw error;

      let runtime = await resolveRuntimeState();

      // Defensive net: if a previously-signed-up user somehow has no
      // store, heal it silently on login rather than stranding them.
      if (!runtime?.store_id) {
        const fallbackName = email.split("@")[0];
        runtime = await guaranteeWorkspace(fallbackName);
      }

      if (window.BiziplexDeviceAccounts) {
        await window.BiziplexDeviceAccounts.upsert({
          email,
          storeName: runtime.store_name,
          logoUrl: runtime.logo_url,
          memberName: runtime.member_name,
        });
      }

      safeNavigate(runtime.redirect_to, true);
    } catch (err) {
      console.error(err);
      showMessage("error", humanizeAuthError(err));
    } finally {
      setLoading(signinBtn, false);
    }
  });
}

function humanizeAuthError(err) {
  const msg = err?.message || "";
  if (/invalid login credentials/i.test(msg)) return "Incorrect email or password.";
  if (/user already registered/i.test(msg)) return "An account with this email already exists. Try logging in instead.";
  if (/rate limit/i.test(msg)) return "Too many attempts. Wait a moment and try again.";
  return msg || "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------
// ACCOUNT SWITCHER (device memory — identity hints only, never access)
// ---------------------------------------------------------------------
function initials(name) {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase();
}

async function renderSwitcher() {
  if (!window.BiziplexDeviceAccounts || !switcherWrap) return;
  const accounts = await window.BiziplexDeviceAccounts.list();

  if (!accounts.length) {
    switcherWrap.style.display = "none";
    return;
  }
  switcherWrap.style.display = "block";

  switcherAvatars.innerHTML = accounts
    .slice(0, 3)
    .map((a) =>
      a.logoUrl
        ? `<img class="switcher-avatar" src="${escapeHtml(a.logoUrl)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'switcher-avatar',textContent:'${initials(a.storeName || a.email)}'}))">`
        : `<div class="switcher-avatar">${initials(a.storeName || a.email)}</div>`
    )
    .join("");

  switcherLabel.innerHTML = `Continue as <small>${escapeHtml(accounts[0].storeName || accounts[0].email)} ${accounts.length > 1 ? `+ ${accounts.length - 1} more` : ""}</small>`;

  switcherList.innerHTML =
    accounts
      .map(
        (a) => `
      <button type="button" class="switcher-item" data-email="${escapeHtml(a.email)}">
        ${
          a.logoUrl
            ? `<img src="${escapeHtml(a.logoUrl)}" alt="" onerror="this.outerHTML='<div class=\\'switcher-avatar-lg\\'>${initials(a.storeName || a.email)}</div>'">`
            : `<div class="switcher-avatar-lg">${initials(a.storeName || a.email)}</div>`
        }
        <span class="si-text">
          <span class="si-name">${escapeHtml(a.storeName || "Unnamed store")}</span>
          <span class="si-email">${escapeHtml(a.email)}</span>
        </span>
        <button type="button" class="si-remove" data-remove="${escapeHtml(a.email)}" title="Remove from this device" aria-label="Remove account">&times;</button>
      </button>
    `
      )
      .join("") +
    `<button type="button" class="switcher-add" id="switcherAddNew">+ Use a different account</button>`;
}

if (switcherPill) {
  switcherPill.addEventListener("click", () => {
    const isOpen = switcherList.classList.contains("open");
    switcherList.classList.toggle("open", !isOpen);
    switcherPill.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (e) => {
    if (!switcherWrap.contains(e.target)) {
      switcherList.classList.remove("open");
      switcherPill.setAttribute("aria-expanded", "false");
    }
  });

  switcherList.addEventListener("click", async (e) => {
    const removeBtn = e.target.closest("[data-remove]");
    if (removeBtn) {
      e.stopPropagation();
      await window.BiziplexDeviceAccounts.remove(removeBtn.dataset.remove);
      await renderSwitcher();
      return;
    }

    if (e.target.id === "switcherAddNew") {
      switcherList.classList.remove("open");
      signinTab.click();
      el("signinEmail").value = "";
      el("signinEmail").focus();
      return;
    }

    const item = e.target.closest(".switcher-item[data-email]");
    if (item) {
      signinTab.click();
      el("signinEmail").value = item.dataset.email;
      el("signinPassword").focus();
      switcherList.classList.remove("open");
    }
  });
}

renderSwitcher();

// ---------------------------------------------------------------------
// FORGOT PASSWORD MODAL
// ---------------------------------------------------------------------
const forgotBtn = el("forgotPasswordBtn");
const modalOverlay = el("forgotModalOverlay");
const cancelResetBtn = el("cancelResetBtn");
const sendResetBtn = el("sendResetBtn");
const resetEmailInput = el("resetEmailInput");
const resetError = el("resetEmailError");

if (forgotBtn && modalOverlay) {
  forgotBtn.addEventListener("click", () => {
    resetEmailInput.value = el("signinEmail")?.value || "";
    resetError.classList.remove("show");
    modalOverlay.classList.add("show");
    resetEmailInput.focus();
  });
  cancelResetBtn.addEventListener("click", () => modalOverlay.classList.remove("show"));
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove("show");
  });

  sendResetBtn.addEventListener("click", async () => {
    const email = resetEmailInput.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      resetError.textContent = "Enter a valid email address.";
      resetError.classList.add("show");
      return;
    }
    setLoading(sendResetBtn, true, "Sending...");
    try {
      const { error } = await biziplexClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname.replace(/auth.*/, "auth/reset-password.html"),
      });
      if (error) throw error;
      modalOverlay.classList.remove("show");
      showMessage("success", "If that account exists, a reset link is on its way.");
    } catch (err) {
      console.error(err);
      resetError.textContent = humanizeAuthError(err);
      resetError.classList.add("show");
    } finally {
      setLoading(sendResetBtn, false);
    }
  });
}

// ---------------------------------------------------------------------
// BOOT — zero frontend trust, RPC decides everything
// ---------------------------------------------------------------------
async function boot() {
  try {
    const { data: { session } } = await biziplexClient.auth.getSession();
    if (!session) return;

    let runtime = await resolveRuntimeState();

    if (!runtime?.store_id) {
      const fallbackName = (session.user.email || "my-store").split("@")[0];
      runtime = await guaranteeWorkspace(fallbackName);
    }

    safeNavigate(runtime.redirect_to, true);
  } catch (err) {
    console.error("[Biziplex] boot error:", err);
    // Fail open into the auth form rather than a blank/stuck page.
  }
}

biziplexClient.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    safeNavigate("auth", true);
  }
});

boot();
