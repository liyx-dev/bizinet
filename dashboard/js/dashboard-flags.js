// ============================================================================
//  BiziNet · Intelligent Dashboard Engine (SaaS Retention Edition)
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

/**
 * Main Orchestration Hook called by the runtime loop
 */
function applyDashboardFlags(flags) {
  if (!flags) return;

  // IMPORTANT: Clean up previous intervals and queues before injecting new state
  if (window.billboardInterval) {
      clearInterval(window.billboardInterval);
  }
  toastQueue = []; 

  // Cache configuration context safely onto the global state object
  window.APP_RUNTIME.dashboardFlags = flags;

  // 1. Map the new flat RPC data to the metrics object
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

  // 2. Synthesize High-Retention Context Recommendations
  const intelligence = generateDashboardIntelligence(flags, metrics);

  // 3. Perform Safe DOM Injection & State Rendering
  renderDashboardHeader(flags, metrics, intelligence);
  
  // 4. Trigger Orchestrated Event-Notification Infrastructure
  queueSystemToasts(flags, intelligence);
  
  // 5. Build and Fire Contextualized Assistant Billboard Loop
  initializeBillboardRotation(intelligence.billboardMessages);
}

/**
 * Core Intelligence Matrix: Maps structural state variants to psychological up-sells
 */
function generateDashboardIntelligence(flags, metrics) {
  const role = flags.role ? flags.role.toLowerCase() : 'staff';
  const plan = flags.plan ? flags.plan.toLowerCase() : 'trial';
  const isOwnerTier = (role === 'owner' || role === 'super_admin');
  const isAdminTier = (role === 'owner' || role === 'super_admin' || role === 'admin');

  let notifications = [];
  let advisorNode = { title: "🏪 Optimize Your Store", message: "Complete tasks within your dashboard to continuously scale your sales flow." };
  let billboarding = [];

  // --------------------------------------------------------------------------
  // RULE PHASE 1: SYSTEM AND CRITICAL REVENUE RISKS (Suspensions, Grace, Trials)
  // --------------------------------------------------------------------------
  if (flags.is_suspended || flags.subscription_status === 'suspended') {
    notifications.push({ priority: 'critical', title: '🚫 Store Suspended', message: isOwnerTier ? 'Your listing portal is suspended. Renew subscription immediately to re-enable buyer routing.' : 'This store platform is currently suspended. Please contact the administrator.' });
    advisorNode = { title: "🚫 Subscription Required", message: isOwnerTier ? "Your store services are paused. Renew your plan to fully reactivate checkout functions." : "System suspended due to outstanding administrative updates." };
    billboarding.push("🚫 Catalog indexing paused.", "💳 Account billing updates required.");
  } 
  else if (flags.is_grace || flags.subscription_status === 'grace') {
    if (isOwnerTier) {
      notifications.push({ priority: 'critical', title: '⚠️ Grace Period Warning', message: 'Your payment period expired. Renew immediately to prevent operational interruption.' });
      advisorNode = { title: "⚠️ Grace Period Active", message: "Renew your subscription profile now to maintain consistent customer WhatsApp routing." };
    }
    billboarding.push("⚠️ Payment period expired.", "⚡ Keep service running by updating your billing tab.");
  }
  else if (plan === 'trial' && isOwnerTier) {
    const days = flags.days_remaining ?? 0;
    if (days <= 1) {
      notifications.push({ priority: 'critical', title: '🚨 Trial Expires Tomorrow', message: 'Your high-conversion features terminate in under 24 hours. Secure your plan.' });
    } else if (days <= 3) {
      notifications.push({ priority: 'high', title: '⚠️ Trial Ending Soon', message: `Only ${days} days remain inside your active discovery test cycle.` });
    }
  }

  // --------------------------------------------------------------------------
  // RULE PHASE 2: REWARD PREMIUM USERS (Premium Loyalty Experience)
  // --------------------------------------------------------------------------
  if (plan === 'premium' && !flags.is_suspended && !flags.is_grace) {
    if (billboarding.length === 0) {
      billboarding.push("👑 Premium status is active. All premium scaling options unlocked.", "🚀 Scaling workflow: Share store links directly to high-traffic channels.");
    }
    if (advisorNode.title.includes("Optimize")) {
      advisorNode = { title: "👑 Premium Active", message: "Your store has complete access to our advanced conversion infrastructure. Enjoy unlimited scale!" };
    }
  }

  // --------------------------------------------------------------------------
  // RULE PHASE 3: PROGRESSIVE ONBOARDING & PROFILE STAGE COMPLETIONS
  // --------------------------------------------------------------------------
  let trackingRecommendations = [];

  if (metrics.profileCompleteness < 50) {
    trackingRecommendations.push({
      title: "🏪 Complete Your Profile",
      message: `Your catalog setup is at ${metrics.profileCompleteness}%. Finish basic details to unlock conversion authority.`,
      billboard: "🏪 Complete your profile settings tab to elevate search confidence."
    });
  } else if (metrics.profileCompleteness < 100) {
    trackingRecommendations.push({
      title: "📞 Add Store Metadata",
      message: "Adding specific contact points and delivery updates drives faster buyer closures on WhatsApp.",
      billboard: "📍 Ensure store links and map targets are explicitly configured."
    });
  }

  // --------------------------------------------------------------------------
  // RULE PHASE 4: INVENTORY/PRODUCT CAPACITY INTELLIGENCE
  // --------------------------------------------------------------------------
  if (metrics.products.current === 0) {
    trackingRecommendations.push({
      title: "📦 Add Your First Product",
      message: "Your display storefront is currently empty. Upload products to activate the interactive link engine.",
      billboard: "📦 Upload inventory models to turn chat visitors into retail conversions."
    });
  } else if (metrics.products.current > 0 && metrics.products.current <= 5) {
    trackingRecommendations.push({
      title: "📦 Expand Product Catalog",
      message: `You have successfully indexed ${metrics.products.current} items. Stores hosting 10+ options see 3x longer sessions.`,
      billboard: "📦 Expand catalog variation arrays to broaden targeted user search clicks."
    });
  } else if (metrics.products.remaining > 0 && metrics.products.remaining <= 3 && isOwnerTier) {
    trackingRecommendations.push({
      title: "⚠️ Inventory Capacity Limit",
      message: `Only ${metrics.products.remaining} functional item slots remain before hitting the max allocation. consider updating tiers.`,
      billboard: `⚠️ Storage Warning: ${metrics.products.remaining} product indexing channels available.`
    });
  }

  // --------------------------------------------------------------------------
  // RULE PHASE 5: ENGAGEMENT CHANNELS (Stories & Video adoption rules)
  // --------------------------------------------------------------------------
  if (metrics.activeStories === 0) {
    trackingRecommendations.push({
      title: "📲 Create Flash Stories",
      message: "No active buyer stories are currently broadcasted. Post daily updates to simulate continuous live updates.",
      billboard: "📲 Share dynamic updates to your stories panel to capture instant user interest."
    });
  }

  if (flags.allow_video && metrics.videos.current === 0) {
    trackingRecommendations.push({
      title: "🎥 Deploy Product Video",
      message: "Video streaming capabilities are active on this account. Upload short video demos to capture mobile buyers.",
      billboard: "🎥 Interactive Product videos boost immediate catalog checkouts by up to 40%."
    });
  }

  // --------------------------------------------------------------------------
  // RULE PHASE 6: STRATEGIC FEATURE UP-SELLS (Strictly bounded by user role checks)
  // --------------------------------------------------------------------------
  if (isOwnerTier && plan !== 'premium' && !flags.is_suspended) {
    if (!flags.allow_video) {
      trackingRecommendations.push({
        title: "🎥 Unlock Video Selling",
        message: "Upgrade to our Business or Premium tier to capture customers with rich, high-conversion video product reels.",
        billboard: "🚀 Feature upgrade: Unlock edge video rendering options on superior tiers."
      });
    }
    if (!flags.allow_custom_domain) {
      trackingRecommendations.push({
        title: "🌐 Connect Custom Domains",
        message: "Inject native brand permanence by converting generic app URLs into dedicated domain setups.",
        billboard: "🌐 Establish branding authority using targeted white-label premium domain routing."
      });
    }
  }

  // --------------------------------------------------------------------------
  // ASSISTANT ADVISOR CONTEXT PRIORITIZATION ARBITER
  // --------------------------------------------------------------------------
  if (!flags.is_suspended && !flags.is_grace && trackingRecommendations.length > 0) {
    advisorNode = {
      title: trackingRecommendations[0].title,
      message: trackingRecommendations[0].message
    };
  }

  // Fallback default message handling if no actions are flagged
  if (billboarding.length === 0) {
    trackingRecommendations.forEach(rec => { if (rec.billboard) billboarding.push(rec.billboard); });
    if (billboarding.length === 0) {
      billboarding.push(
        "📦 Maintain dynamic product lists to drive user engagement.",
        "📲 Broadcast promotional links directly across WhatsApp status lists daily."
      );
    }
  }

  return {
    notifications: notifications,
    assistantNode: advisorNode,
    billboardMessages: billboarding
  };
}

/**
 * Safely parses the DOM context to refresh UI elements cleanly without breaking custom views
 */
function renderDashboardHeader(flags, metrics, intelligence) {
  const elWelcomeTitle = document.getElementById("welcomeTitle");
  const elWelcomeMsg   = document.getElementById("welcomeMessage");
  const elAssistantTitle = document.getElementById("assistantTitle");
  const elAssistantMsg   = document.getElementById("assistantMessage");
  const elStoreNameUI    = document.getElementById("storeNameUI");
  const elRoleUI         = document.getElementById("roleUI");
  const elPlanBadgeUI    = document.getElementById("planBadgeUI");
  const elCountdownUI    = document.getElementById("countdownUI");
  const elViewPlanBtn    = document.getElementById("viewPlanDetailsBtn");
  const elUpgradeBtn     = document.getElementById("upgradePlanBtn");

  // Handle dynamic text greetings safely
  if (elWelcomeTitle) {
    elWelcomeTitle.textContent = flags.welcome_title || `🏪 ${flags.store_name || 'Dashboard'}`;
  }
  if (elWelcomeMsg) {
    elWelcomeMsg.innerHTML = flags.welcome_message || 'Next-Gen Premium Listing Portal Operations Control.';
  }

  // Inject Context-Synthesized Business Assistant Updates
  if (elAssistantTitle) elAssistantTitle.textContent = intelligence.assistantNode.title;
  if (elAssistantMsg)   elAssistantMsg.textContent   = intelligence.assistantNode.message;

  // Render Operational Indicators
  if (elStoreNameUI) elStoreNameUI.textContent = `🏪 ${flags.store_name || 'Business'}`;
  if (elRoleUI) {
    const formattedRole = (flags.role || 'Staff').toUpperCase().replace('_', ' ');
    elRoleUI.textContent = `👤 ${formattedRole}`;
  }

  // Apply Plan Badges & Precise Counter Displays
  if (elPlanBadgeUI) {
    const planStr = flags.plan || 'trial';
    elPlanBadgeUI.textContent = planStr.toUpperCase();
    elPlanBadgeUI.className = `plan-pill plan-${planStr}`;
  }

  if (elCountdownUI) {
    if (flags.is_suspended) {
      elCountdownUI.textContent = "🚫 SUSPENDED";
      elCountdownUI.style.background = "var(--liyog-red)";
      elCountdownUI.style.color = "#fff";
    } else if (flags.is_grace) {
      elCountdownUI.textContent = "⚠️ OVERDUE GRACE";
      elCountdownUI.style.background = "var(--liyog-orange)";
      elCountdownUI.style.color = "#fff";
    } else if (flags.plan === 'trial') {
      elCountdownUI.textContent = `⏳ ${flags.days_remaining ?? 0} Days Trial`;
    } else {
      elCountdownUI.textContent = "✅ ACTIVE STATUS";
    }
  }

  // Core Role Isolation Layer: Enforce zero billing manipulation exposure for lower roles
  const role = flags.role ? flags.role.toLowerCase() : 'staff';
  const satisfiesBillingRule = (role === 'owner' || role === 'super_admin') && Boolean(flags.show_upgrade_cta);

  if (elViewPlanBtn) elViewPlanBtn.style.display = satisfiesBillingRule ? "inline-flex" : "none";
  if (elUpgradeBtn)  elUpgradeBtn.style.display  = satisfiesBillingRule ? "inline-flex" : "none";
}

/**
 * Intelligent Toast Broker Engine: Processes sequential high-priority notification messages
 */
function queueSystemToasts(flags, intelligence) {
  // Append backend targeted toasts directly into the active handling pipeline
  if (flags.show_toast && flags.toast_message) {
    const initialType = flags.toast_type || 'info';
    let mappedPriority = 'medium';
    if (initialType === 'danger' || initialType === 'warning') mappedPriority = 'high';
    if (initialType === 'premium') mappedPriority = 'low';

    toastQueue.push({
      title: flags.assistant_title || "System Alert",
      message: flags.toast_message,
      type: initialType,
      priority: mappedPriority
    });
  }

  // Flatten synthesized business anomalies directly into the active notifications queue
  intelligence.notifications.forEach(note => {
    toastQueue.push({
      title: note.title,
      message: note.message,
      type: (note.priority === 'critical') ? 'danger' : (note.priority === 'high' ? 'warning' : 'info'),
      priority: note.priority
    });
  });

  // Sort queue by priority levels to guarantee absolute visual hierarchy
  const hierarchyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  toastQueue.sort((x, y) => (hierarchyOrder[x.priority] ?? 2) - (hierarchyOrder[y.priority] ?? 2));

  // Process the queue sequentially
  executeNextToast();
}

/**
 * Processes sequential, timed toast elements with physical haptic vibration support
 */
function executeNextToast() {
  if (isProcessingToast || toastQueue.length === 0) return;

  isProcessingToast = true;
  const currentItem = toastQueue.shift();
  const toastNode = document.getElementById("smartToast");

  if (!toastNode) {
    isProcessingToast = false;
    return;
  }

  const themeConfig = TOAST_THEMES[currentItem.type] || TOAST_THEMES.info;
  toastNode.style.background = themeConfig.bg;
  toastNode.style.color = themeConfig.color;

  toastNode.innerHTML = `
    <span class="toast-close" style="font-weight:700;">✕</span>
    <div class="toast-title" style="letter-spacing:-0.01em;">${currentItem.title}</div>
    <div style="font-size:13px; line-height:1.4; opacity:0.95;">${currentItem.message}</div>
  `;

  toastNode.style.display = "block";

  // Native hardware interaction trigger
  if (navigator && navigator.vibrate) {
    navigator.vibrate(currentItem.priority === 'critical' ? [40, 30, 40] : 25);
  }

  const closeButton = toastNode.querySelector(".toast-close");
  
  const tearDownToast = () => {
    clearTimeout(toastTimer);
    toastNode.style.display = "none";
    // Brief spacing before rendering next queued asset
    setTimeout(() => {
      isProcessingToast = false;
      executeNextToast();
    }, 400);
  };

  if (closeButton) closeButton.onclick = tearDownToast;
  
  // Dynamic visible timeline based on density calculations
  const displayWindow = currentItem.priority === 'critical' ? 10000 : 7000;
  toastTimer = setTimeout(tearDownToast, displayWindow);
}

/**
 * Manages clean state initialization and fade transitions for recommendation text banners
 */
function initializeBillboardRotation(messages) {
  if (window.billboardInterval) clearInterval(window.billboardInterval);
  
  const textContainer = document.getElementById("billboardMessage");
  const prevAction    = document.getElementById("billboardPrev");
  const nextAction    = document.getElementById("billboardNext");

  if (!textContainer || !messages || messages.length === 0) return;

  billboardIndex = 0;
  
  const renderItem = () => { 
      // Add a tiny fade effect for premium feel
      textContainer.style.transition = 'opacity 0.2s ease-in-out';
      textContainer.style.opacity = '0';
      
      setTimeout(() => {
          textContainer.textContent = messages[billboardIndex]; 
          textContainer.style.opacity = '1';
      }, 200);
  };

  if (prevAction) {
    prevAction.onclick = () => {
      billboardIndex = (billboardIndex - 1 + messages.length) % messages.length;
      renderItem();
    };
  }

  if (nextAction) {
    nextAction.onclick = () => {
      billboardIndex = (billboardIndex + 1) % messages.length;
      renderItem();
    };
  }

  renderItem();

  // Attach to window so it can be safely cleared on re-renders
  window.billboardInterval = setInterval(() => {
    billboardIndex = (billboardIndex + 1) % messages.length;
    renderItem();
  }, 12000); 
}
