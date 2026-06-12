// ============================================================
//  BiziNet · Global Runtime & Session Engine v4.0
//  dashboard/js/runtime.js
//
//  v4.0 change: Realtime subscriptions REMOVED from here.
//  They are now fully owned by realtime-engine.js which loads
//  after this file and waits for APP_RUNTIME_READY before
//  subscribing. This file remains the boot authority only.
// ============================================================

window.APP_RUNTIME = {
  runtimeState:        null,
  dashboardFlags:      null,
  currentSessionToken: null
};

window.APP_RUNTIME_READY = new Promise(function (resolve) {
  window._resolveAppRuntime = resolve;
});

// Execution lock to prevent parallel state calculation collisions
let isRefreshingMetrics = false;

window.refreshLiveMetrics = async function () {
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
    console.error('Failed structural metrics engine refresh:', err);
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

    // Step 3 — Enforce Routing Truths
    if (window.APP_RUNTIME.runtimeState.redirect_to !== '/dashboard/') {
      return safeNavigate(window.APP_RUNTIME.runtimeState.redirect_to);
    }

    // Step 4 — Initial metrics load
    await window.refreshLiveMetrics();

    // Step 5 — APP_RUNTIME_READY resolved.
    // realtime-engine.js is waiting on this promise and will
    // now subscribe to all Supabase Realtime channels automatically.

  } catch (err) {
    console.error('Boot execution exception failure:', err);
    safeNavigate('/auth/');
  } finally {
    window._resolveAppRuntime();
  }
})();
