// ============================================================
//  BiziNet · Global Runtime & Session Engine v4.1
//  dashboard/js/runtime.js
//
//  v4.1 fix: Execution lock now has a 10s safety timeout.
//  If refreshLiveMetrics() ever gets stuck (network hiccup,
//  silent throw before finally), the lock auto-releases after
//  10 seconds so the next realtime event is never permanently
//  blocked. Previously a stuck lock would silently swallow
//  all subsequent refresh calls while the tab was open.
// ============================================================

window.APP_RUNTIME = {
  runtimeState:        null,
  dashboardFlags:      null,
  currentSessionToken: null
};

window.APP_RUNTIME_READY = new Promise(function (resolve) {
  window._resolveAppRuntime = resolve;
});

// Execution lock — prevents parallel RPC calls colliding.
// Safety timeout: auto-releases after 10s so it can never
// permanently block realtime events.
let isRefreshingMetrics  = false;
let _refreshLockTimer    = null;
const REFRESH_LOCK_MAX_MS = 10000;

window.refreshLiveMetrics = async function () {
  if (isRefreshingMetrics) return;

  isRefreshingMetrics = true;

  // Safety net: if something goes wrong and finally never runs,
  // force-release the lock after REFRESH_LOCK_MAX_MS.
  clearTimeout(_refreshLockTimer);
  _refreshLockTimer = setTimeout(() => {
    if (isRefreshingMetrics) {
      console.warn('[BiziRuntime] Lock safety timeout — force releasing.');
      isRefreshingMetrics = false;
    }
  }, REFRESH_LOCK_MAX_MS);

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
    console.error('[BiziRuntime] refreshLiveMetrics failed:', err);
  } finally {
    clearTimeout(_refreshLockTimer);
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
    console.error('[BiziRuntime] Boot execution exception:', err);
    safeNavigate('/auth/');
  } finally {
    window._resolveAppRuntime();
  }
})();
