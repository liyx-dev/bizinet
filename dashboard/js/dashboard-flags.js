// ================================================
//  BiziNet · Dashboard Flags
//  dashboard/js/dashboard-flags.js
//  Loaded in <head> — applies plan badge & trial
//  countdown. Call applyDashboardFlags(flags) from
//  anywhere after APP_RUNTIME_READY resolves.
// ================================================
let toastTimer = null;
let billboardIndex = 0;
let billboardInterval = null;
let billboardStarted = false;
// Theme configuration used by showSmartToast
const TOAST_THEMES = {

success:{
bg:"linear-gradient(135deg,var(--liyog-green),var(--liyog-deep-green))",
color:"#fff"
},

warning:{
bg:"linear-gradient(135deg,var(--liyog-orange),#ff9432)",
color:"#fff"
},

danger:{
bg:"linear-gradient(135deg,var(--liyog-red),var(--liyog-red-dark))",
color:"#fff"
},

premium:{
bg:"linear-gradient(135deg,var(--liyog-gold),#ffb800)",
color:"#111"
},

info:{
bg:"linear-gradient(135deg,var(--liyog-blue),#3f95ff)",
color:"#fff"
}

};

    

function startBillboard(){

    if(billboardStarted){
        return;
    }

    const flags =
        window.APP_RUNTIME?.dashboardFlags;

    if(
        !flags ||
        !flags.show_billboard ||
        !Array.isArray(flags.billboard_messages) ||
        flags.billboard_messages.length === 0
    ){
        return;
    }

    const text =
        document.getElementById(
            "billboardMessage"
        );

    const prevBtn =
        document.getElementById(
            "billboardPrev"
        );

    const nextBtn =
        document.getElementById(
            "billboardNext"
        );

    if(
        !text ||
        !prevBtn ||
        !nextBtn
    ){
        return;
    }

    const messages =
        flags.billboard_messages;

    function render(){

        text.textContent =
            messages[billboardIndex];

    }

    prevBtn.onclick = () => {

        billboardIndex--;

        if(
            billboardIndex < 0
        ){
            billboardIndex =
                messages.length - 1;
        }

        render();

    };

    nextBtn.onclick = () => {

        billboardIndex++;

        if(
            billboardIndex >= messages.length
        ){
            billboardIndex = 0;
        }

        render();

    };

    render();

    billboardInterval =
        setInterval(() => {

            billboardIndex++;

            if(
                billboardIndex >= messages.length
            ){
                billboardIndex = 0;
            }
            render();
        },15000);
    billboardStarted = true;

}

function showSmartToast(
    title,
    message,
    type = "info"
){

    const toast =
        document.getElementById(
            "smartToast"
        );

    if(!toast){
        return;
    }

    clearTimeout(
        toastTimer
    );

    const theme =
        TOAST_THEMES[type] ||
        TOAST_THEMES.info;

    toast.style.background =
        theme.bg;

    toast.style.color =
        theme.color;

    toast.innerHTML = `
        <span class="toast-close">✕</span>

        <div class="toast-title">
            ${title}
        </div>

        <div>
            ${message}
        </div>
    `;

    toast.style.display =
        "block";

    const closeBtn =
        toast.querySelector(
            ".toast-close"
        );

    if(closeBtn){

        closeBtn.onclick = () => {

            clearTimeout(
                toastTimer
            );

            toast.style.display =
                "none";

        };

    }

    if(
        navigator &&
        navigator.vibrate
    ){
        navigator.vibrate(25);
    }

    toastTimer =
        setTimeout(() => {

            toast.style.display =
               "none";
        },8000);
}

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
    const canManageBilling =
Boolean(
    flags.show_upgrade_cta
);
    const viewPlanBtn =
document.getElementById(
    "viewPlanDetailsBtn"
);

if(viewPlanBtn){

    viewPlanBtn.style.display =
        flags.show_upgrade_cta
        ? "inline-flex"
        : "none";
}

    /* future modal button */
    const upgradeBtn = document.getElementById("upgradePlanBtn");

    if(upgradeBtn){
    upgradeBtn.style.display =
        flags.show_upgrade_cta
        ? "inline-flex"
        : "none";
}

    /* --- ADDED TOAST LOGIC BELOW --- */
    if(flags.show_toast && flags.toast_message){
        showSmartToast(
            flags.assistant_title,
            flags.toast_message,
            flags.toast_type
        );
    }
/* ADDED BILLBOARD LOAD */
if(
flags.show_billboard &&
flags.billboard_messages
){
startBillboard();
}
}

    


