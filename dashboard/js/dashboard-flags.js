// ================================================
//  BiziNet · Dashboard Flags
//  dashboard/js/dashboard-flags.js
//  Loaded in <head> — applies plan badge & trial
//  countdown. Call applyDashboardFlags(flags) from
//  anywhere after APP_RUNTIME_READY resolves.
// ================================================
function applyDashboardFlags(flags){

    if(!flags) return;

    window.APP_RUNTIME.dashboardFlags = flags;

    /* welcome */
    document.getElementById(
        "welcomeTitle"
    ).textContent = flags.welcome_title;

    document.getElementById(
        "welcomeMessage"
    ).textContent = flags.welcome_message;

    /* assistant */
    document.getElementById(
        "assistantTitle"
    ).textContent = flags.assistant_title;

    document.getElementById(
        "assistantMessage"
    ).textContent = flags.assistant_message;

    /* store */
    document.getElementById(
        "storeNameUI"
    ).textContent = "🏪 " + flags.store_name;

    document.getElementById(
        "roleUI"
    ).textContent = "👤 " + flags.role.replace("_"," ");

    /* plan */
    const badge = document.getElementById("planBadgeUI");
    badge.textContent = flags.plan.toUpperCase();
    badge.className = "plan-pill plan-" + flags.plan;

    /* countdown */
    const countdown = document.getElementById("countdownUI");

    if(flags.is_trial){
        countdown.textContent = `⏳ ${flags.days_remaining} Days Left`;
    }
    else if(flags.is_grace){
        countdown.textContent = "⚠️ Grace";
    }
    else{
        countdown.textContent = "✅ Active";
    }

    /* billing permissions */
    const canManageBilling = ["owner","super_admin"].includes(flags.role);
    const viewPlanBtn = document.getElementById("viewPlanDetailsBtn");

    if(viewPlanBtn){
        viewPlanBtn.style.display = canManageBilling ? "inline-flex" : "none";
    }

    /* future modal button */
    const upgradeBtn = document.getElementById("upgradePlanBtn");

    if(upgradeBtn){
        upgradeBtn.style.display = (canManageBilling && flags.show_upgrade_cta) ? "inline-flex" : "none";
    }

    /* --- ADDED TOAST LOGIC BELOW --- */
    if(flags.show_toast && flags.toast_message){
        showSmartToast(
            flags.assistant_title,
            flags.toast_message,
            flags.toast_type
        );
}
  }



