// ============================================================================
//  BiziNet · Intelligent Dashboard Engine 
//  dashboard/js/dashboard-flags.js
// ============================================================================

let toastTimer = null;
let toastQueue = [];
let isProcessingToast = false;
let billboardIndex = 0;

const TOAST_THEMES = {
  critical: { bg: "linear-gradient(135deg, #FF3B30, #C1271A)", color: "#fff" },
  high:     { bg: "linear-gradient(135deg, #FF7A00, #e65c00)", color: "#fff" },
  medium:   { bg: "linear-gradient(135deg, #1877F2, #0056b3)", color: "#fff" },
  low:      { bg: "linear-gradient(135deg, #28A428, #006400)", color: "#fff" },
  premium:  { bg: "linear-gradient(135deg, #FFD700, #ffb800)", color: "#111" },
  info:     { bg: "linear-gradient(135deg, #1877F2, #3f95ff)", color: "#fff" }
};

function applyDashboardFlags(flags) {
  if (!flags) return;

  if (window.billboardInterval) {
      clearInterval(window.billboardInterval);
  }
  toastQueue = []; 

  window.APP_RUNTIME.dashboardFlags = flags;

  const metrics = {
    products: { 
        current: flags.products_count ?? 0, 
        max: flags.max_products ?? 0, 
        remaining: Math.max(0, (flags.max_products ?? 0) - (flags.products_count ?? 0)) 
    },
    staff: { 
        current: flags.staff_count ?? 0, 
        max: flags.max_staff ?? 0, 
        remaining: Math.max(0, (flags.max_staff ?? 0) - (flags.staff_count ?? 0)) 
    },
    videos: { 
        current: flags.videos_count ?? 0, 
        max: flags.max_video_uploads ?? 0, 
        remaining: Math.max(0, (flags.max_video_uploads ?? 0) - (flags.videos_count ?? 0)) 
    },
    profileCompleteness: flags.profile_completeness ?? 0,
    activeStories: flags.active_stories_count ?? 0
  };

  const intelligence = generateDashboardIntelligence(flags, metrics);

  renderDashboardHeader(flags, metrics, intelligence);
  queueSystemToasts(flags, intelligence);
  initializeBillboardRotation(intelligence.billboardMessages);
}

function generateDashboardIntelligence(flags, metrics) {
  const role = flags.role ? flags.role.toLowerCase() : 'staff';
  const plan = flags.plan ? flags.plan.toLowerCase() : 'trial';
  const isOwnerTier = (role === 'owner' || role === 'super_admin');

  let notifications = [];
  let advisorNode = { title: flags.assistant_title || "🏪 Optimize Your Store", message: flags.assistant_message || "Complete tasks within your dashboard to continuously scale your sales flow." };
  let billboarding = [];

  // Parse server array elements if they arrive formatted natively
  if (flags.billboard_messages) {
    if (Array.isArray(flags.billboard_messages)) {
        billboarding = [...flags.billboard_messages];
    } else if (typeof flags.billboard_messages === 'string') {
        try { billboarding = JSON.parse(flags.billboard_messages); } catch(e){}
    }
  }

  if (flags.is_suspended) {
    notifications.push({ priority: 'critical', title: '🚫 Store Suspended', message: isOwnerTier ? 'Your listing portal is suspended. Renew subscription immediately to re-enable buyer routing.' : 'This store platform is currently suspended. Please contact the administrator.' });
  } 
  else if (flags.is_grace) {
    if (isOwnerTier) {
      notifications.push({ priority: 'critical', title: '⚠️ Grace Period Warning', message: 'Your payment period expired. Renew immediately to prevent operational interruption.' });
    }
  }
  else if (plan === 'trial' && isOwnerTier) {
    const days = flags.days_remaining ?? 0;
    if (days <= 1) {
      notifications.push({ priority: 'critical', title: '🚨 Trial Expires Tomorrow', message: 'Your high-conversion features terminate in under 24 hours. Secure your plan.' });
    } else if (days <= 3) {
      notifications.push({ priority: 'high', title: '⚠️ Trial Ending Soon', message: `Only ${days} days remain inside your active discovery test cycle.` });
    }
  }

  if (billboarding.length === 0) {
     billboarding = [
        "📦 Maintain dynamic product lists to drive user engagement.",
        "📲 Broadcast promotional links directly across WhatsApp status lists daily."
     ];
  }

  return {
    notifications: notifications,
    assistantNode: advisorNode,
    billboardMessages: billboarding
  };
}

function renderDashboardHeader(flags, metrics, intelligence) {
  // Elements structural injection updates mapping
  const setters = [
    { id: "welcomeTitle", text: flags.welcome_title || `🏪 ${flags.store_name || 'Dashboard'}` },
    { id: "welcomeMessage", html: flags.welcome_message || 'Next-Gen Premium Listing Portal Operations Control.' },
    { id: "assistantTitle", text: intelligence.assistantNode.title },
    { id: "assistantMessage", text: intelligence.assistantNode.message },
    { id: "storeNameUI", text: `🏪 ${flags.store_name || 'Business'}` },
    { id: "storeNameBadge", text: flags.store_name || 'Business' }, // Common alternate target names
    { id: "roleUI", text: `👤 ${(flags.role || 'Staff').toUpperCase().replace('_', ' ')}` },
    { id: "roleBadge", text: (flags.role || 'Staff').toUpperCase().replace('_', ' ') }
  ];

  setters.forEach(s => {
    const el = document.getElementById(s.id);
    if (el) {
        if (s.text !== undefined) el.textContent = s.text;
        if (s.html !== undefined) el.innerHTML = s.html;
    }
  });

  // Render Plan badge component mapping elements
  const elPlan = document.getElementById("planBadgeUI") || document.getElementById("planBadge") || document.getElementById("planUI");
  if (elPlan) {
     const pStr = (flags.plan || 'trial').toUpperCase();
     elPlan.textContent = pStr;
     elPlan.className = `plan-pill plan-${pStr.toLowerCase()}`;
  }

  // Handle Loading placeholder countdown blocks precisely
  const elCountdown = document.getElementById("countdownUI") || document.getElementById("countdownBadge");
  if (elCountdown) {
    if (flags.is_suspended) {
      elCountdown.textContent = "🚫 SUSPENDED";
      elCountdown.style.background = "#FF3B30";
    } else if (flags.is_grace) {
      elCountdown.textContent = "⚠️ OVERDUE";
      elCountdown.style.background = "#FF7A00";
    } else if (flags.plan === 'trial') {
      elCountdown.textContent = `⏳ ${flags.days_remaining ?? 0} Days Trial`;
      elCountdown.style.background = ""; 
    } else {
      elCountdown.textContent = "✅ ACTIVE STATUS";
      elCountdown.style.background = "";
    }
  }

  const role = flags.role ? flags.role.toLowerCase() : 'staff';
  const satisfiesBillingRule = (role === 'owner' || role === 'super_admin') && Boolean(flags.show_upgrade_cta);

  ["viewPlanDetailsBtn", "viewPlanDetails", "upgradePlanBtn", "upgradeBtn"].forEach(id => {
     const btn = document.getElementById(id);
     if (btn) btn.style.display = satisfiesBillingRule ? "inline-flex" : "none";
  });
}

function queueSystemToasts(flags, intelligence) {
  if (flags.show_toast && flags.toast_message) {
    toastQueue.push({
      title: flags.assistant_title || "System Alert",
      message: flags.toast_message,
      type: flags.toast_type || 'info',
      priority: (flags.toast_type === 'danger' || flags.toast_type === 'warning') ? 'high' : 'medium'
    });
  }

  intelligence.notifications.forEach(note => {
    toastQueue.push({
      title: note.title,
      message: note.message,
      type: (note.priority === 'critical') ? 'danger' : (note.priority === 'high' ? 'warning' : 'info'),
      priority: note.priority
    });
  });

  if (toastQueue.length > 0 && !isProcessingToast) {
     executeNextToast();
  }
}

function executeNextToast() {
  if (isProcessingToast || toastQueue.length === 0) return;

  isProcessingToast = true;
  const currentItem = toastQueue.shift();
  const toastNode = document.getElementById("smartToast") || document.getElementById("toastNotification");

  if (!toastNode) {
    isProcessingToast = false;
    return;
  }

  const themeConfig = TOAST_THEMES[currentItem.type] || TOAST_THEMES.info;
  toastNode.style.background = themeConfig.bg;
  toastNode.style.color = themeConfig.color;

  toastNode.innerHTML = `
    <span class="toast-close" style="float:right; cursor:pointer; font-weight:700; margin-left:10px;">✕</span>
    <div class="toast-title" style="font-weight:700; margin-bottom:4px;">${currentItem.title}</div>
    <div style="font-size:13px; line-height:1.4; opacity:0.95;">${currentItem.message}</div>
  `;

  toastNode.style.display = "block";

  if (navigator && navigator.vibrate) {
    navigator.vibrate(currentItem.priority === 'critical' ? [40, 30, 40] : 25);
  }

  const closeButton = toastNode.querySelector(".toast-close");
  
  const tearDownToast = () => {
    clearTimeout(toastTimer);
    toastNode.style.display = "none";
    setTimeout(() => {
      isProcessingToast = false;
      executeNextToast();
    }, 400);
  };

  if (closeButton) closeButton.onclick = tearDownToast;
  toastTimer = setTimeout(tearDownToast, currentItem.priority === 'critical' ? 9000 : 6000);
}

function initializeBillboardRotation(messages) {
  if (window.billboardInterval) clearInterval(window.billboardInterval);
  
  const textContainer = document.getElementById("billboardMessage") || document.getElementById("billboardText");
  if (!textContainer || !messages || messages.length === 0) return;

  billboardIndex = 0;
  
  const renderItem = () => { 
      textContainer.style.opacity = '0';
      setTimeout(() => {
          textContainer.textContent = messages[billboardIndex]; 
          textContainer.style.opacity = '1';
      }, 150);
  };

  const prevAction = document.getElementById("billboardPrev");
  const nextAction = document.getElementById("billboardNext");

  if (prevAction) prevAction.onclick = () => { billboardIndex = (billboardIndex - 1 + messages.length) % messages.length; renderItem(); };
  if (nextAction) nextAction.onclick = () => { billboardIndex = (billboardIndex + 1) % messages.length; renderItem(); };

  renderItem();

  window.billboardInterval = setInterval(() => {
    billboardIndex = (billboardIndex + 1) % messages.length;
    renderItem();
  }, 12000); 
}
