// ================================================
//  BiziNet · Global Runtime & Session
//  dashboard/js/runtime.js
//  Loaded in <head> AFTER global.js and config.js
// ================================================

// ── Shared state object (all scripts read/write here) ──
window.APP_RUNTIME = {
  runtimeState:        null,   // from get_store_runtime_state RPC
  dashboardFlags:      null,   // from get_smart_dashboard_state RPC
  currentSessionToken: null    // current auth access token
};

// ── Promise that resolves when boot guard finishes ──
window.APP_RUNTIME_READY = new Promise(function (resolve) {
  window._resolveAppRuntime = resolve;
});

// ── Global Refresh Trigger for Other Tabs ──
window.refreshLiveMetrics = async function() {
    try {
        const { data, error } = await window.APP_CLIENT.rpc('get_smart_dashboard_state');
        if (error || !data || data.length === 0) return;
        
        const state = data[0];
        window.APP_RUNTIME.dashboardFlags = state;
        
        // Pass the fresh state to the UI generator cleanly
        if (typeof applyDashboardFlags === 'function') {
            applyDashboardFlags(state);
        }
    } catch (err) {
        console.error("Failed to refresh live metrics:", err);
    }
};

// ── Boot Guard — runs immediately on page load ──
(async function executeBootGuard() {
  try {
    const supabaseClient = window.APP_CLIENT;

    // Step 1 — Auth check
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session) return safeNavigate('/auth/');

    window.APP_RUNTIME.currentSessionToken = session.access_token;

    // Step 2 — Runtime truth from backend
    const { data: runtimeData, error: runtimeError } = await supabaseClient.rpc('get_store_runtime_state');
    if (runtimeError || !runtimeData || runtimeData.length === 0) return safeNavigate('/auth/');

    window.APP_RUNTIME.runtimeState = runtimeData[0];
    const storeId = runtimeData[0].store_id;

    // Step 3 — Backend redirect enforcement
    if (window.APP_RUNTIME.runtimeState.redirect_to !== '/dashboard/') {
      return safeNavigate(window.APP_RUNTIME.runtimeState.redirect_to);
    }

    // Step 4 — Initial Fetch & Render
    await window.refreshLiveMetrics();

    // ============================================================================
    // THE REVOLUTIONARY UPGRADE: SUPABASE REALTIME SUBSCRIPTION
    // ============================================================================
    supabaseClient.channel('custom-dashboard-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores', filter: `id=eq.${storeId}` }, payload => {
          window.refreshLiveMetrics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `store_id=eq.${storeId}` }, payload => {
          window.refreshLiveMetrics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories', filter: `store_id=eq.${storeId}` }, payload => {
          window.refreshLiveMetrics();
      })
      .subscribe();

  } catch (err) {
    console.error("Boot failure", err);
    safeNavigate('/auth/');
  } finally {
    // Always resolve — even on error — so no script ever hangs
    window._resolveAppRuntime();
  }
})();
