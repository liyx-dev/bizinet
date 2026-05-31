// ============================================
// DASHBOARD AUTH GUARD
// ============================================

window.runtimeState = null;
window.dashboardFlags = null;
window.currentSessionToken = null;

window.executeBootGuard = async function () {
  try {

    const {
      data: { session },
      error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError || !session) {
      return safeNavigate("auth");
    }

    window.currentSessionToken =
      session.access_token;

    const {
      data: runtimeData,
      error: runtimeError
    } = await supabaseClient.rpc(
      "get_store_runtime_state"
    );

    if (
      runtimeError ||
      !runtimeData ||
      runtimeData.length === 0
    ) {
      return safeNavigate("auth");
    }

    window.runtimeState = runtimeData[0];

    if (
      window.runtimeState.redirect_to !==
      "/dashboard/"
    ) {
      return safeNavigate(
        window.runtimeState.redirect_to
      );
    }

    const { data: flagData } =
      await supabaseClient.rpc(
        "get_dashboard_flags"
      );

    if (
      flagData &&
      flagData.length > 0
    ) {
      window.dashboardFlags =
        flagData[0];

      applyDashboardFlags(
        window.dashboardFlags
      );
    }

  } catch (err) {

    console.error(
      "Boot failure",
      err
    );

    safeNavigate("auth");
  }
};

function applyDashboardFlags(flags) {

  const planBadge =
    document.getElementById(
      "planBadgeUI"
    );

  const trialBadge =
    document.getElementById(
      "trialCountdownUI"
    );

  if (planBadge) {

    planBadge.style.display =
      "inline-flex";

    planBadge.textContent =
      `Plan: ${flags.plan.toUpperCase()}`;

    if (flags.plan === "premium") {
      planBadge.style.background =
        "var(--liyog-gold)";
    }
  }

  if (
    flags.is_trial &&
    trialBadge
  ) {

    trialBadge.style.display =
      "inline-flex";

    trialBadge.textContent =
      `${flags.days_remaining} Days Left`;

  } else {

    if (trialBadge) {
      trialBadge.style.display =
        "none";
    }
  }
}
