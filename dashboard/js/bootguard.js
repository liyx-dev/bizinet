// ================================================
//  BiziNet · Boot Guard & Dashboard Flags
//  dashboard/js/bootguard.js
// ================================================

(async function () {

  const supabaseClient = window.supabase.createClient(
    window.APP_CONFIG.supabaseUrl,
    window.APP_CONFIG.supabaseKey
  );

  // Make client globally available so tabscript.js + other tabs reuse it
  window.APP_CLIENT = supabaseClient;

  function safeNavigate(target) {
    const map = {
      auth: "/bizinet/auth/",
      onboarding: "/bizinet/dashboard/onboarding",
      suspended: "/bizinet/dashboard/suspended/"
    };
    window.location.href = map[target] || target;
  }

  // Expose so tab scripts can call it if needed
  window.safeNavigate = safeNavigate;

  async function executeBootGuard() {
    try {
      const { data: { session }, error: sessionError } =
        await supabaseClient.auth.getSession();
      if (sessionError || !session) return safeNavigate('auth');

      window.APP_RUNTIME.currentSessionToken = session.access_token;

      const { data: runtimeData, error: runtimeError } =
        await supabaseClient.rpc('get_store_runtime_state');
      if (runtimeError || !runtimeData || runtimeData.length === 0)
        return safeNavigate('auth');

      window.APP_RUNTIME.runtimeState = runtimeData[0];

      if (window.APP_RUNTIME.runtimeState.redirect_to !== '/dashboard/') {
        return safeNavigate(window.APP_RUNTIME.runtimeState.redirect_to);
      }

      const { data: flagData } = await supabaseClient.rpc('get_dashboard_flags');
      if (flagData && flagData.length > 0) {
        window.APP_RUNTIME.dashboardFlags = flagData[0];
        applyDashboardFlags(flagData[0]);
      }

    } catch (err) {
      console.error("Boot failure", err);
      safeNavigate('auth');
    }
  }

  function applyDashboardFlags(flags) {
    const planBadge  = document.getElementById('planBadgeUI');
    const trialBadge = document.getElementById('trialCountdownUI');

    if (planBadge) {
      planBadge.style.display = 'inline-flex';
      planBadge.textContent = `Plan: ${flags.plan.toUpperCase()}`;
      if (flags.plan === 'premium')
        planBadge.style.background = 'var(--liyog-gold)';
    }

    if (flags.is_trial && trialBadge) {
      trialBadge.style.display = 'inline-flex';
      trialBadge.textContent = `${flags.days_remaining} Days Left`;
    } else {
      if (trialBadge) trialBadge.style.display = 'none';
    }
  }

  await executeBootGuard();

})();

