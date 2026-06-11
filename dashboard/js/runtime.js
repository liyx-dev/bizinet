// ================================================
//  BiziNet · Global Runtime & Session
//  dashboard/js/runtime.js
//  Loaded in <head> AFTER global.js and config.js
// ================================================

// ── Shared state object (all scripts read/write here) ──
window.APP_RUNTIME = {
  runtimeState:        null,   // from get_store_runtime_state RPC
  dashboardFlags:      null,   // from get_dashboard_flags RPC
  currentSessionToken: null    // current auth access token
};

// ── Promise that resolves when boot guard finishes ──
// Any script that needs runtime data just does:
//   await window.APP_RUNTIME_READY;
window.APP_RUNTIME_READY = new Promise(function (resolve) {
  window._resolveAppRuntime = resolve;
});

// ── Boot Guard — runs immediately on page load ──
(async function executeBootGuard() {
  try {

    const supabaseClient = window.APP_CLIENT;

    // Step 1 — Auth check
    const { data: { session }, error: sessionError } =
      await supabaseClient.auth.getSession();
    if (sessionError || !session) return safeNavigate('/auth/');

    window.APP_RUNTIME.currentSessionToken = session.access_token;

    // Step 2 — Runtime truth from backend
    const { data: runtimeData, error: runtimeError } =
      await supabaseClient.rpc('get_store_runtime_state');
    if (runtimeError || !runtimeData || runtimeData.length === 0)
      return safeNavigate('/auth/');

    window.APP_RUNTIME.runtimeState = runtimeData[0];

    // Step 3 — Backend redirect enforcement
    if (window.APP_RUNTIME.runtimeState.redirect_to !== '/dashboard/') {
      return safeNavigate(window.APP_RUNTIME.runtimeState.redirect_to);
    }

    // Step 4 — Fetch UI flags
        // ============================================================================
    // UPDATE STEP 4 INSIDE EXECUTEBOOTGUARD(): INGEST LIVE STORE USAGE MATRICES
    // ============================================================================
    
    // Concurrently fetch global flags and operational metrics to drive real-time logic
    const [flagResponse, productsCount, storiesCount, teamCount, videosCount] = await Promise.all([
      supabaseClient.rpc('get_dashboard_flags'),
      supabaseClient.from('products').select('id', { count: 'exact', head: true }),
      supabaseClient.from('stories').select('id', { count: 'exact', head: true }),
      supabaseClient.from('store_members').select('id', { count: 'exact', head: true }),
      // Checks video counts dynamically if column references exist
      supabaseClient.from('products').select('id', { count: 'exact', head: true }).not('video_url', 'is', null)
    ]);

    if (flagResponse.data && flagResponse.data.length > 0) {
      let unifiedFlags = flagResponse.data[0];

      // Inject dynamically parsed structural live analytics properties
      unifiedFlags.products_count = productsCount.count ?? 0;
      unifiedFlags.active_stories_count = storiesCount.count ?? 0;
      unifiedFlags.staff_count = teamCount.count ?? 0;
      unifiedFlags.videos_count = videosCount.count ?? 0;

      window.APP_RUNTIME.dashboardFlags = unifiedFlags;

      // Handle DOM application safely based on browser parse speed
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyDashboardFlags(unifiedFlags));
      } else {
        applyDashboardFlags(unifiedFlags);
      }
    }

  } catch (err) {
    console.error("Boot failure", err);
    safeNavigate('/auth/');

  } finally {
    // Always resolve — even on error — so no script ever hangs
    window._resolveAppRuntime();
  }
})();
