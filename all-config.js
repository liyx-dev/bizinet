/**
 * ============================================================================
 * BIZINET / BIZIPLEX — SHARED CONFIG
 * ============================================================================
 * Single source of truth for the Supabase client. Every portal (auth,
 * team-invite, dashboard, onboarding...) imports THIS file instead of
 * creating its own client. One client instance per tab keeps auth state,
 * session storage, and realtime sockets from fighting each other.
 *
 * Path on your repo: bizinet/all-config.js
 * Usage in any page:
 *   <script src="https://liyx-dev.github.io/bizinet/all-config.js"></script>
 *   <script>
 *     const supa = window.BiziplexConfig.client;
 *   </script>
 * ============================================================================
 */

(function () {
  "use strict";

  // NOTE: this is the Supabase *anon* key. Anon keys are designed to be
  // public/client-side — that is how Supabase auth works (Row Level Security
  // does the real enforcement server-side). Never put a service_role key
  // here or in any frontend file.
  const SUPABASE_URL = "https://ugffezktrojjhfbaxrrq.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZmZlemt0cm9qamhmYmF4cnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODg3NzIsImV4cCI6MjA5MTI2NDc3Mn0.gzFuLSj225QRnxdwyrH25Xpe1YZqPiK7fp_nrsETsW8";

  if (typeof supabase === "undefined") {
    console.error(
      "[Biziplex] Supabase SDK not loaded. Include the supabase-js " +
        "<script> tag BEFORE all-config.js on every page."
    );
    return;
  }

  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "biziplex-auth", // namespaced so it never collides with other apps on the same domain
    },
  });

  /**
   * NOTE: Navigation is NOT handled here. Use window.safeNavigate directly
   * (defined in global.js, loaded in <head> on every page). This file used
   * to wrap it, which caused a real bug: if this script ran before
   * global.js had finished loading/executing, the wrapper's fallback
   * fired and produced a URL with the /bizinet prefix stripped out
   * entirely. Removing the wrapper removes that failure mode — there's
   * nothing here to race against. Just make sure global.js's <script> tag
   * appears before this file's <script> tag in the HTML, with no `defer`
   * mismatch between them (either both deferred, or global.js loaded
   * earlier as a normal blocking script).
   */

  /**
   * Calls the runtime-state RPC. This RPC is the ONLY source of truth for
   * "where should this logged-in user go." No page should ever compute a
   * redirect target by inspecting localStorage or guessing from form state.
   *
   * Your actual function ALWAYS returns exactly one row (it falls back to
   * a null-store / onboarding row via "if not found" inside the function
   * body), so data.length === 0 should never really happen — but we still
   * guard for it defensively in case of a transport hiccup.
   */
  async function resolveRuntimeState() {
    const { data, error } = await client.rpc("get_store_runtime_state");
    if (error) throw error;
    if (!data || data.length === 0) {
      return { redirect_to: "/dashboard/onboarding/", store_id: null, can_access_dashboard: false };
    }
    return data[0];
  }

  /**
   * Ensures a workspace exists for the current session. Safe to call
   * repeatedly — the RPC is idempotent. This is the orphan-account fix:
   * call this after signup AND opportunistically on login if the runtime
   * state shows no store, so a dropped connection during signup can never
   * leave a permanently stranded auth-only account.
   */
  async function ensureWorkspace(businessName) {
    const { data, error } = await client.rpc("create_store_workspace", {
      p_business_name: businessName,
    });
    if (error) throw error;
    return data;
  }

  window.BiziplexConfig = {
    client,
    resolveRuntimeState,
    ensureWorkspace,
  };
})();
