/**
 * ============================================================================
 * BIZINET / BIZIPLEX — SHARED CONFIG
 * ============================================================================
 * Single source of truth for the Supabase client. Every portal (auth,
 * team-invite, dashboard, onboarding...) loads THIS file instead of
 * creating its own client, so auth state and realtime sockets don't fight.
 *
 * Written as plain top-level declarations (no IIFE wrapper) on purpose —
 * this matches the exact pattern your global.js already uses successfully:
 * a classic <script> tag, loaded before the scripts that use it, with
 * functions attaching to the shared global scope the same simple way
 * safeNavigate() already does. No window.* wrapper, no destructuring
 * boundary, nothing to silently break if load order shifts by a few ms.
 *
 * Path on your repo: bizinet/all-config.js
 * Load order on every page:
 *   1. global.js          (defines safeNavigate, getBasePath, etc.)
 *   2. supabase-js CDN     (defines window.supabase)
 *   3. all-config.js       (this file — defines biziplexClient, etc.)
 *   4. your page script    (auth.js, dashboard.js, ...)
 * ============================================================================
 */

// NOTE: this is the Supabase *anon* key. Anon keys are designed to be
// public/client-side — that is how Supabase auth works (Row Level Security
// does the real enforcement server-side). Never put a service_role key
// here or in any frontend file.
const BIZIPLEX_SUPABASE_URL = "https://ugffezktrojjhfbaxrrq.supabase.co";
const BIZIPLEX_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZmZlemt0cm9qamhmYmF4cnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODg3NzIsImV4cCI6MjA5MTI2NDc3Mn0.gzFuLSj225QRnxdwyrH25Xpe1YZqPiK7fp_nrsETsW8";

if (typeof supabase === "undefined") {
  console.error(
    "[Biziplex] Supabase SDK not loaded. Include the supabase-js <script> " +
      "tag BEFORE all-config.js on every page."
  );
}

// Single shared client instance for the whole page.
const biziplexClient = supabase.createClient(
  BIZIPLEX_SUPABASE_URL,
  BIZIPLEX_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "biziplex-auth", // namespaced so it never collides with other apps on the same domain
    },
  }
);

/**
 * Calls the runtime-state RPC. This RPC is the ONLY source of truth for
 * "where should this logged-in user go." No page should ever compute a
 * redirect target by inspecting localStorage or guessing from form state.
 *
 * Your get_store_runtime_state() always returns exactly one row (it falls
 * back to a null-store / onboarding row internally via "if not found"),
 * so the empty-data branch below is just a defensive guard against a
 * transport-level hiccup, not the expected path.
 */
async function resolveRuntimeState() {
  const { data, error } = await biziplexClient.rpc("get_store_runtime_state");
  if (error) throw error;
  if (!data || data.length === 0) {
    return { redirect_to: "/dashboard/onboarding/", store_id: null, can_access_dashboard: false };
  }
  return data[0];
}

/**
 * Ensures a workspace exists for the current session. Safe to call
 * repeatedly — create_store_workspace() is idempotent server-side and
 * returns the existing store instead of erroring on a second call. This
 * is the orphan-account fix: call this after signup AND opportunistically
 * on login if the runtime state shows no store, so a dropped connection
 * during signup can never leave a permanently stranded auth-only account.
 */
async function ensureWorkspace(businessName) {
  const { data, error } = await biziplexClient.rpc("create_store_workspace", {
    p_business_name: businessName,
  });
  if (error) throw error;
  return data;
}
