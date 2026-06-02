// ================================================
//  BiziNet · Dashboard Flags
//  dashboard/js/dashboard-flags.js
//  Loaded in <head> — applies plan badge & trial
//  countdown. Call applyDashboardFlags(flags) from
//  anywhere after APP_RUNTIME_READY resolves.
// ================================================
function applyDashboardFlags(flags){
if(!flags) return;
document.getElementById("welcomeTitle").textContent =
flags.welcome_title;
document.getElementById("welcomeMessage").textContent =
flags.welcome_message;
document.getElementById("storeNameUI").textContent =
"🏪 " + flags.store_name;
document.getElementById("roleUI").textContent =
"👤 " + flags.role.replace("_"," ");
const badge =
document.getElementById("planBadgeUI");
badge.textContent =
flags.plan.toUpperCase();
badge.className =
"plan-pill plan-" + flags.plan;
const countdown =
document.getElementById("countdownUI");
if(flags.is_trial){
countdown.textContent =
`⏳ ${flags.days_remaining} Days Left`;
}
else{
countdown.textContent =
"✅ Active";
}
}



