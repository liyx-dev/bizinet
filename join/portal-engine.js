/**
 * ============================================================
 * BiziPlex Command — Join Portal Engine
 * /join/portal-engine.js
 *
 * Lifecycle:
 *   1. Read ?token= from URL
 *   2. RPC get_invitation_details(token)  -> populate identity rail, show signup view
 *   3. User submits signup -> supabase.auth.signUp() -> RPC accept_team_invitation(token, name)
 *      OR user logs in directly -> supabase.auth.signInWithPassword() -> RPC accept_team_invitation(token, null)
 *   4. RPC get_member_runtime_state() -> decide: dashboard, or blocking modal (never onboarding redirect)
 * ============================================================
 */
(function () {
  const SUPABASE_URL = "https://ugffezktrojjhfbaxrrq.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZmZlemt0cm9qamhmYmF4cnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODg3NzIsImV4cCI6MjA5MTI2NDc3Mn0.gzFuLSj225QRnxdwyrH25Xpe1YZqPiK7fp_nrsETsW8";

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.APP_CLIENT = window.APP_CLIENT || client;

  const PortalEngine = {

    state: {
      token: null,
      invite: null, // { email, role, store_id, store_name, logo_url, store_photos, expires_at }
    },

    refs() {
      return {
        verify: document.getElementById("viewVerify"),
        invalid: document.getElementById("viewInvalid"),
        invalidMessage: document.getElementById("invalidMessage"),
        signUp: document.getElementById("viewSignUp"),
        login: document.getElementById("viewLogin"),
        forgot: document.getElementById("viewForgot"),
        done: document.getElementById("viewDone"),
        doneTitle: document.getElementById("doneTitle"),
        doneMessage: document.getElementById("doneMessage"),

        storeCard: document.getElementById("storeCard"),
        storeName: document.getElementById("storeName"),
        storeLogo: document.getElementById("storeLogo"),
        roleChip: document.getElementById("roleChip"),
        roleChipText: document.getElementById("roleChipText"),
        railBackdrop: document.getElementById("railBackdrop"),

        signupEmail: document.getElementById("signupEmail"),
        signupName: document.getElementById("signupName"),
        signupPassword: document.getElementById("signupPassword"),
        btnSignUpSubmit: document.getElementById("btnSignUpSubmit"),
        signupAlertSlot: document.getElementById("signupAlertSlot"),

        loginEmail: document.getElementById("loginEmail"),
        loginPassword: document.getElementById("loginPassword"),
        btnLoginSubmit: document.getElementById("btnLoginSubmit"),
        loginAlertSlot: document.getElementById("loginAlertSlot"),

        forgotEmail: document.getElementById("forgotEmail"),
        btnForgotSubmit: document.getElementById("btnForgotSubmit"),
        forgotAlertSlot: document.getElementById("forgotAlertSlot"),

        modal: document.getElementById("systemModal"),
        modalIcon: document.getElementById("modalIcon"),
        modalTitle: document.getElementById("modalTitle"),
        modalText: document.getElementById("modalText"),
      };
    },

    // ------------------------------------------------------------
    // VIEW SWITCHING
    // ------------------------------------------------------------
    switchView(viewId) {
      document.querySelectorAll(".portal-view").forEach(v => v.classList.remove("active"));
      const target = document.getElementById(viewId);
      if (target) target.classList.add("active");
    },

    setConnectionStep(step, status) {
      // step: 'verify' | 'identity' | 'join'   status: 'current' | 'done' | 'error'
      const el = document.querySelector(`.conn-step[data-step="${step}"]`);
      if (!el) return;
      el.classList.remove("is-current", "is-done", "is-error");
      el.classList.add(`is-${status}`);
    },

    // ------------------------------------------------------------
    // ALERTS / TOASTS
    // ------------------------------------------------------------
    showAlert(slotEl, type, message) {
      if (!slotEl) return;
      const icon = type === "error" ? "⚠️" : "✓";
      slotEl.innerHTML = `
        <div class="inline-alert ${type}">
          <span class="inline-alert-icon">${icon}</span>
          <span>${message}</span>
        </div>`;
    },
    clearAlert(slotEl) {
      if (slotEl) slotEl.innerHTML = "";
    },

    toast(message, type = "success") {
      const el = document.getElementById("joinToast");
      if (!el) return;
      el.className = `toast-${type}`;
      el.innerHTML = `<span>${message}</span><span class="toast-close" onclick="this.parentElement.style.display='none'">&times;</span>`;
      el.style.display = "flex";
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { el.style.display = "none"; }, 5000);
    },

    setButtonLoading(btn, loading, loadingText, idleText) {
      if (!btn) return;
      btn.disabled = loading;
      btn.classList.toggle("is-loading", loading);
      const label = btn.querySelector(".btn-label");
      if (label) label.textContent = loading ? loadingText : idleText;
    },

    // ------------------------------------------------------------
    // INIT
    // ------------------------------------------------------------
    async init() {
      window.toast = (msg, type) => this.toast(msg, type === "error" ? "error" : "success");

      const fx = this.refs();
      const params = new URLSearchParams(window.location.search);
      this.state.token = params.get("token");

      this.bindStaticEvents(fx);

      if (!this.state.token) {
        this.setConnectionStep("verify", "error");
        fx.invalidMessage.textContent = "No invitation token was found in this link. Please use the exact link sent to you.";
        this.switchView("viewInvalid");
        return;
      }

      try {
        const { data, error } = await window.APP_CLIENT.rpc("get_invitation_details", {
          p_token: this.state.token
        });
        if (error) throw error;

        if (!data || data.success === false) {
          this.setConnectionStep("verify", "error");
          fx.invalidMessage.textContent = (data && data.error) || "This invitation could not be verified.";
          this.switchView("viewInvalid");
          return;
        }

        this.state.invite = data;
        this.setConnectionStep("verify", "done");
        this.setConnectionStep("identity", "current");
        this.populateIdentity(fx, data);

        // Pre-fill and lock the email field, then show signup view
        fx.signupEmail.value = data.email;
        this.switchView("viewSignUp");

      } catch (err) {
        console.error("[PortalEngine] verify failure:", err);
        this.setConnectionStep("verify", "error");
        fx.invalidMessage.textContent = "We couldn't verify this invitation right now. Please try again in a moment.";
        this.switchView("viewInvalid");
      }
    },

    populateIdentity(fx, invite) {
      fx.storeName.textContent = invite.store_name || "BiziPlex Client Workspace";

      if (invite.logo_url) {
        fx.storeLogo.innerHTML = `<img src="${invite.logo_url}" alt="${invite.store_name || 'Store'} logo">`;
      } else {
        const initial = (invite.store_name || "B").trim().charAt(0).toUpperCase();
        fx.storeLogo.textContent = initial || "B";
      }

      if (invite.role) {
        fx.roleChip.style.display = "inline-flex";
        fx.roleChipText.textContent = String(invite.role).replace("_", " ");
      }

      requestAnimationFrame(() => fx.storeCard.classList.add("visible"));

      // Ambient backdrop from store_photos, if present
      if (Array.isArray(invite.store_photos) && invite.store_photos.length > 0) {
        const url = invite.store_photos[0];
        const img = new Image();
        img.onload = () => {
          fx.railBackdrop.innerHTML = `<img src="${url}" alt="">`;
          fx.railBackdrop.classList.add("loaded");
        };
        img.src = url;
      }
    },

    // ------------------------------------------------------------
    // EVENT BINDING
    // ------------------------------------------------------------
    bindStaticEvents(fx) {
      document.getElementById("formSignUp").addEventListener("submit", (e) => this.handleSignUp(e));
      document.getElementById("formLogin").addEventListener("submit", (e) => this.handleLogin(e));
      document.getElementById("formForgot").addEventListener("submit", (e) => this.handleForgot(e));

      document.querySelectorAll(".pw-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
          const targetInput = document.getElementById(btn.dataset.target);
          const isHidden = targetInput.type === "password";
          targetInput.type = isHidden ? "text" : "password";
          btn.textContent = isHidden ? "Hide" : "Show";
        });
      });
    },

    // ------------------------------------------------------------
    // SIGN UP -> creates auth user, then accepts invite
    // ------------------------------------------------------------
    async handleSignUp(e) {
      e.preventDefault();
      const fx = this.refs();
      this.clearAlert(fx.signupAlertSlot);

      const email = fx.signupEmail.value.trim();
      const name = fx.signupName.value.trim();
      const password = fx.signupPassword.value;

      if (!name) {
        this.showAlert(fx.signupAlertSlot, "error", "Please enter your full name.");
        return;
      }
      if (password.length < 6) {
        this.showAlert(fx.signupAlertSlot, "error", "Password must be at least 6 characters.");
        return;
      }

      this.setButtonLoading(fx.btnSignUpSubmit, true, "Creating account…", "Accept invitation");

      try {
        // Step 1: create the auth identity
        const { data: signUpData, error: signUpError } = await window.APP_CLIENT.auth.signUp({
          email,
          password,
          options: { data: { display_name: name } }
        });

        if (signUpError) {
          // Most common real-world case: this email already has an account.
          if (/already registered|already exists/i.test(signUpError.message || "")) {
            this.showAlert(fx.signupAlertSlot, "error", "An account already exists for this email. Please log in instead.");
            this.setButtonLoading(fx.btnSignUpSubmit, false, "", "Accept invitation");
            return;
          }
          throw signUpError;
        }

        // If email confirmations are enabled on this Supabase project, there is no
        // active session yet — the invite can't be accepted until the user verifies
        // their email and logs in. Handle both paths gracefully.
        if (!signUpData.session) {
          this.setButtonLoading(fx.btnSignUpSubmit, false, "", "Accept invitation");
          this.showAlert(
            fx.signupAlertSlot,
            "success",
            "Account created! Check your inbox to confirm your email, then log in to finish joining the workspace."
          );
          return;
        }

        // Step 2: accept the invitation now that we have a session
        await this.finalizeAcceptance(name);

      } catch (err) {
        console.error("[PortalEngine] signup failure:", err);
        this.setConnectionStep("identity", "error");
        this.showAlert(fx.signupAlertSlot, "error", err.message || "Something went wrong creating your account.");
        this.setButtonLoading(fx.btnSignUpSubmit, false, "", "Accept invitation");
      }
    },

    // ------------------------------------------------------------
    // LOG IN -> existing users accepting an invite, or returning members
    // ------------------------------------------------------------
    async handleLogin(e) {
      e.preventDefault();
      const fx = this.refs();
      this.clearAlert(fx.loginAlertSlot);

      const email = fx.loginEmail.value.trim();
      const password = fx.loginPassword.value;

      this.setButtonLoading(fx.btnLoginSubmit, true, "Logging in…", "Log in");

      try {
        const { error: signInError } = await window.APP_CLIENT.auth.signInWithPassword({ email, password });
        if (signInError) {
          this.showAlert(fx.loginAlertSlot, "error", "Incorrect email or password. Please try again.");
          this.setButtonLoading(fx.btnLoginSubmit, false, "", "Log in");
          return;
        }

        // If this login happened via a real invite link, finalize acceptance.
        // If they just navigated to /join/ without a token, send them straight in.
        if (this.state.token && this.state.invite) {
          await this.finalizeAcceptance(null);
        } else {
          await this.routeToDashboard();
        }

      } catch (err) {
        console.error("[PortalEngine] login failure:", err);
        this.showAlert(fx.loginAlertSlot, "error", err.message || "Couldn't log you in. Please try again.");
        this.setButtonLoading(fx.btnLoginSubmit, false, "", "Log in");
      }
    },

    // ------------------------------------------------------------
    // FORGOT PASSWORD
    // ------------------------------------------------------------
    async handleForgot(e) {
      e.preventDefault();
      const fx = this.refs();
      this.clearAlert(fx.forgotAlertSlot);
      const email = fx.forgotEmail.value.trim();

      this.setButtonLoading(fx.btnForgotSubmit, true, "Sending…", "Send reset link");

      try {
        const redirectTo = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, "")}/reset-password.html`;
        const { error } = await window.APP_CLIENT.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        this.showAlert(fx.forgotAlertSlot, "success", "If an account exists for that email, a reset link is on its way.");
      } catch (err) {
        console.error("[PortalEngine] forgot-password failure:", err);
        this.showAlert(fx.forgotAlertSlot, "error", "Couldn't send the reset link right now. Please try again shortly.");
      } finally {
        this.setButtonLoading(fx.btnForgotSubmit, false, "", "Send reset link");
      }
    },

    // ------------------------------------------------------------
    // ACCEPT INVITATION (after a session exists)
    // ------------------------------------------------------------
    async finalizeAcceptance(preferredName) {
      const fx = this.refs();
      this.setConnectionStep("identity", "done");
      this.setConnectionStep("join", "current");

      try {
        const { data, error } = await window.APP_CLIENT.rpc("accept_team_invitation", {
          p_token: this.state.token,
          p_preferred_name: preferredName
        });
        if (error) throw error;

        this.setConnectionStep("join", "done");

        const fxDone = this.refs();
        fxDone.doneTitle.textContent = data.already_member ? "Welcome back" : "You're in";
        fxDone.doneMessage.textContent = data.already_member
          ? "You're already part of this workspace. Taking you to your dashboard…"
          : "Your account is connected to the workspace. Taking you to your dashboard…";
        this.switchView("viewDone");

        await this.routeToDashboard();

      } catch (err) {
        console.error("[PortalEngine] accept-invitation failure:", err);
        this.setConnectionStep("join", "error");
        this.setButtonLoading(this.refs().btnSignUpSubmit, false, "", "Accept invitation");
        this.setButtonLoading(this.refs().btnLoginSubmit, false, "", "Log in");
        this.toast(err.message || "Couldn't complete joining the workspace. Please try again.", "error");
      }
    },

    // ------------------------------------------------------------
    // RUNTIME GATING — never sends team members to owner onboarding
    // ------------------------------------------------------------
    async routeToDashboard() {
      try {
        const { data, error } = await window.APP_CLIENT.rpc("get_member_runtime_state");
        if (error) throw error;

        const state = Array.isArray(data) ? data[0] : data;
        if (!state) {
          window.toast("Workspace context not found. Please contact your workspace owner.", "error");
          return;
        }

        if (state.can_access_dashboard) {
          setTimeout(() => { if (window.safeNavigate) window.safeNavigate("dashboard"); else window.location.href = "../dashboard/"; }, 900);
          return;
        }

        // Blocked: show the appropriate premium modal instead of redirecting.
        this.showBlockingModal(state.blocking_reason, state);

      } catch (err) {
        console.error("[PortalEngine] runtime-state failure:", err);
        window.toast("Couldn't check workspace status. Please refresh and try again.", "error");
      }
    },

    showBlockingModal(reason, state) {
      const fx = this.refs();
      const presets = {
        owner_onboarding_pending: {
          tone: "tone-amber",
          icon: "⏳",
          title: "Workspace setup in progress",
          text: "Your workspace owner is still completing initial setup. You'll get access as soon as that's finished — no action is needed from you right now."
        },
        suspended: {
          tone: "tone-red",
          icon: "🚫",
          title: "Workspace temporarily suspended",
          text: state.suspended_reason
            ? `This workspace is currently suspended: ${state.suspended_reason}`
            : "This workspace is currently suspended. Please reach out to your workspace owner for details."
        },
        inactive: {
          tone: "tone-red",
          icon: "🚫",
          title: "Workspace unavailable",
          text: "This workspace isn't active right now. Please contact your workspace owner."
        },
        billing: {
          tone: "tone-blue",
          icon: "💳",
          title: "Billing action needed",
          text: "There's a billing issue on this workspace's plan. Your workspace owner needs to resolve this before the team can access the dashboard."
        }
      };

      const preset = presets[reason] || presets.owner_onboarding_pending;

      fx.modalIcon.className = `modal-icon ${preset.tone}`;
      fx.modalIcon.textContent = preset.icon;
      fx.modalTitle.textContent = preset.title;
      fx.modalText.textContent = preset.text;
      fx.modal.classList.add("active");
    },

    closeModal() {
      this.refs().modal.classList.remove("active");
    }
  };

  window.PortalEngine = PortalEngine;
  document.addEventListener("DOMContentLoaded", () => PortalEngine.init());
})();


