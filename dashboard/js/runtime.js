// ================================================
//  BiziNet · Global Runtime & Session Engine
//  dashboard/js/runtime.js
// ================================================

window.APP_RUNTIME = {
  runtimeState:        null,   
  dashboardFlags:      null,   
  currentSessionToken: null    
};

window.APP_RUNTIME_READY = new Promise(function (resolve) {
  window._resolveAppRuntime = resolve;
});

// Explicit execution lock to prevent parallel state calculation collisions
let isRefreshingMetrics = false;

window.refreshLiveMetrics = async function() {
    if (isRefreshingMetrics) return;
    isRefreshingMetrics = true;
    try {
        const { data, error } = await window.APP_CLIENT.rpc('get_smart_dashboard_state');
        if (error) throw error;
        
        if (data && data.length > 0) {
            const state = data[0];
            window.APP_RUNTIME.dashboardFlags = state;
            
            if (typeof applyDashboardFlags === 'function') {
                applyDashboardFlags(state);
            }
        }
    } catch (err) {
        console.error("Failed structural metrics engine refresh:", err);
    } finally {
        isRefreshingMetrics = false;
    }
};

(async function executeBootGuard() {
  try {
    const supabaseClient = window.APP_CLIENT;

    // Step 1 — Verify Active Session
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session) return safeNavigate('/auth/');

    window.APP_RUNTIME.currentSessionToken = session.access_token;

    // Step 2 — Run Runtime Baseline Checks
    const { data: runtimeData, error: runtimeError } = await supabaseClient.rpc('get_store_runtime_state');
    if (runtimeError || !runtimeData || runtimeData.length === 0) return safeNavigate('/auth/');

    window.APP_RUNTIME.runtimeState = runtimeData[0];
    const storeId = runtimeData[0].store_id;

    // Step 3 — Enforce Routing Truths
    if (window.APP_RUNTIME.runtimeState.redirect_to !== '/dashboard/') {
      return safeNavigate(window.APP_RUNTIME.runtimeState.redirect_to);
    }

    // Step 4 — Pop State Before Realtime Subscriptions Bind
    await window.refreshLiveMetrics();

    // Step 5 — Native Realtime Real-time Engine Routing Pipeline
    supabaseClient.channel('custom-dashboard-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores', filter: `id=eq.${storeId}` }, () => {
          window.refreshLiveMetrics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `store_id=eq.${storeId}` }, () => {
          window.refreshLiveMetrics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories', filter: `store_id=eq.${storeId}` }, () => {
          window.refreshLiveMetrics();
      })
      .subscribe();

  } catch (err) {
    console.error("Boot execution exception failure:", err);
    safeNavigate('/auth/');
  } finally {
    window._resolveAppRuntime();
  }
})();
