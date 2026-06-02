// ================================================
//  BiziNet · Dashboard Flags
//  dashboard/js/dashboard-flags.js
//  Loaded in <head> — applies plan badge & trial
//  countdown. Call applyDashboardFlags(flags) from
//  anywhere after APP_RUNTIME_READY resolves.
// ================================================

function applyDashboardFlags(flags) {
  if (!flags) return;

  const planBadge  = document.getElementById('planBadgeUI');
  const trialBadge = document.getElementById('trialCountdownUI');

  // ── Plan badge (always visible) ──
  if (planBadge) {
    planBadge.style.display = 'inline-flex';
    planBadge.textContent   = `Plan: ${flags.plan.toUpperCase()}`;

    // Reset first so switching plans updates color correctly
    planBadge.style.background = '';

    if (flags.plan === 'premium')
      planBadge.style.background = 'var(--liyog-gold)';
    else if (flags.plan === 'business')
      planBadge.style.background = 'var(--liyog-blue)';
    else
      planBadge.style.background = 'var(--liyog-red)';
  }

  // ── Trial countdown (only when on trial) ──
  if (flags.is_trial && trialBadge) {
    trialBadge.style.display = 'inline-flex';
    trialBadge.textContent   = `${flags.days_remaining} Day${flags.days_remaining === 1 ? '' : 's'} Left`;
  } else {
    if (trialBadge) trialBadge.style.display = 'none';
  }
}

// ── Re-apply helper — call this anytime you need to refresh the badges ──
// e.g. after a plan upgrade without full page reload
window.refreshDashboardFlags = async function () {
  const { data: flagData } =
    await window.APP_CLIENT.rpc('get_dashboard_flags');
  if (flagData && flagData.length > 0) {
    window.APP_RUNTIME.dashboardFlags = flagData[0];
    applyDashboardFlags(flagData[0]);
  }
};
