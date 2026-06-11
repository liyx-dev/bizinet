// ============================================================================
//  BiziNet · Master Dashboard Intelligence Engine v3.0
//  dashboard/js/dashboard-flags.js
//
//  Architecture:
//  - PLAN_REGISTRY       → single source of truth for all plan metadata
//  - ROLE_PERMISSIONS    → capability matrix per role
//  - IntelEngine         → pure recommendation generator (no DOM, no side effects)
//  - DashboardRenderer   → DOM writer (reads IntelEngine output)
//  - ToastController     → priority queue, never pushy
//  - BillboardController → rotating tips fed from live intelligence
//  - window.INTEL        → public API for tabscript.js hooks
// ============================================================================

// ============================================================================
//  PLAN REGISTRY — Add a new plan here and everything else adapts automatically
// ============================================================================
const PLAN_REGISTRY = {
  trial: {
    label: 'Free Trial',
    tier: 0,
    isPaid: false,
    color: '#6B7280',
    celebrationMessage: null,
    upgradeHook: true
  },
  free_user: {
    label: 'Free',
    tier: 0,
    isPaid: false,
    color: '#6B7280',
    celebrationMessage: null,
    upgradeHook: true
  },
  starter: {
    label: 'Starter',
    tier: 1,
    isPaid: true,
    color: '#10B981',
    celebrationMessage: '🚀 Starter plan is active. Keep growing your catalog.',
    upgradeHook: true
  },
  business: {
    label: 'Business',
    tier: 2,
    isPaid: true,
    color: '#3B82F6',
    celebrationMessage: '📈 Business tools are fully active. Scale faster with videos and campaigns.',
    upgradeHook: true
  },
  premium: {
    label: 'Premium',
    tier: 3,
    isPaid: true,
    color: '#F59E0B',
    celebrationMessage: '👑 All premium selling tools are available. You have maximum reach.',
    upgradeHook: false  // Premium users are never upsold
  }
};

// ============================================================================
//  ROLE PERMISSIONS — Capability matrix
// ============================================================================
const ROLE_PERMISSIONS = {
  owner:       { billing: true,  upgrade: true,  team: true,  features: true,  operations: true },
  super_admin: { billing: true,  upgrade: true,  team: true,  features: true,  operations: true },
  admin:       { billing: false, upgrade: false, team: true,  features: false, operations: true },
  staff:       { billing: false, upgrade: false, team: false, features: false, operations: true }
};

function getRolePermissions(role) {
  return ROLE_PERMISSIONS[(role || 'staff').toLowerCase()] || ROLE_PERMISSIONS.staff;
}

function getPlanMeta(planSlug) {
  return PLAN_REGISTRY[(planSlug || 'trial').toLowerCase()] || PLAN_REGISTRY.trial;
}

// ============================================================================
//  TOAST THEMES
// ============================================================================
const TOAST_THEMES = {
  critical: { bg: 'linear-gradient(135deg, #FF3B30, #C1271A)', color: '#fff', duration: 10000, vibrate: [50, 30, 50] },
  high:     { bg: 'linear-gradient(135deg, #FF7A00, #e65c00)', color: '#fff', duration: 8000,  vibrate: [30, 20, 30] },
  medium:   { bg: 'linear-gradient(135deg, #1877F2, #0056b3)', color: '#fff', duration: 6000,  vibrate: [20] },
  low:      { bg: 'linear-gradient(135deg, #28A428, #006400)', color: '#fff', duration: 5000,  vibrate: [15] },
  premium:  { bg: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#111', duration: 5000,  vibrate: [15] },
  info:     { bg: 'linear-gradient(135deg, #1877F2, #3f95ff)', color: '#fff', duration: 5000,  vibrate: [10] }
};

// ============================================================================
//  INTEL ENGINE — Pure recommendation generator. No DOM access.
//  Input: flags (from get_smart_dashboard_state RPC) + live action counts
//  Output: { notifications[], recommendations[], assistantNode, billboardMessages[] }
// ============================================================================
const IntelEngine = {

  // Live action counts injected by tabscript.js via window.INTEL.trackAction()
  _actionCounts: {
    productsAdded: 0,
    storiesCreated: 0,
    categoriesAdded: 0,
    profileUpdated: false
  },

  generate(flags) {
    if (!flags) return null;

    const role      = (flags.role || 'staff').toLowerCase();
    const plan      = (flags.plan || 'trial').toLowerCase();
    const perms     = getRolePermissions(role);
    const planMeta  = getPlanMeta(plan);

    const metrics = this._buildMetrics(flags);
    const state   = this._buildState(flags, plan);

    const notifications    = this._buildNotifications(flags, state, perms, planMeta, metrics);
    const recommendations  = this._buildRecommendations(flags, state, perms, planMeta, metrics);

    // Sort by priority weight descending
    const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    notifications.sort((a, b) => (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0));
    recommendations.sort((a, b) => (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0));

    const assistantNode  = this._buildAssistantNode(flags, state, perms, recommendations, notifications);
    const billboardMsgs  = this._buildBillboard(flags, state, perms, planMeta, metrics, recommendations);

    return { notifications, recommendations, assistantNode, billboardMsgs, metrics, state };
  },

  _buildMetrics(flags) {
    const prodCount   = flags.products_count       ?? 0;
    const maxProd     = flags.max_products          ?? 0;
    const staffCount  = flags.staff_count           ?? 0;
    const maxStaff    = flags.max_staff             ?? 0;
    const vidCount    = flags.videos_count          ?? 0;
    const maxVid      = flags.max_video_uploads     ?? 0;
    const storyCount  = flags.active_stories_count  ?? 0;
    const profScore   = flags.profile_completeness  ?? 25;

    return {
      products:  { current: prodCount,  max: maxProd,  remaining: Math.max(0, maxProd - prodCount),  pct: maxProd  > 0 ? Math.round((prodCount  / maxProd)  * 100) : 0 },
      staff:     { current: staffCount, max: maxStaff, remaining: Math.max(0, maxStaff - staffCount), pct: maxStaff > 0 ? Math.round((staffCount / maxStaff) * 100) : 0 },
      videos:    { current: vidCount,   max: maxVid,   remaining: Math.max(0, maxVid - vidCount),    pct: maxVid   > 0 ? Math.round((vidCount   / maxVid)   * 100) : 0 },
      stories:   { active: storyCount },
      profile:   { score: Math.min(profScore, 100) }
    };
  },

  _buildState(flags, plan) {
    return {
      isSuspended:    flags.is_suspended    === true,
      isGrace:        flags.is_grace        === true,
      isTrial:        flags.is_trial        === true || plan === 'trial',
      isFreeUser:     plan === 'free_user',
      isPaid:         getPlanMeta(plan).isPaid,
      isPremium:      plan === 'premium',
      daysLeft:       flags.days_remaining  ?? 0,
      hasVideo:       flags.allow_video     === true,
      hasDomain:      flags.allow_custom_domain === true,
      hasPixel:       flags.allow_pixel     === true
    };
  },

  // ── NOTIFICATIONS (urgent events only) ──────────────────────────────────
  _buildNotifications(flags, state, perms, planMeta, metrics) {
    const notes = [];

    // SUSPENDED — always critical, all roles
    if (state.isSuspended) {
      notes.push({
        priority: 'critical',
        toastType: 'danger',
        title: '🚫 Store Suspended',
        message: perms.billing
          ? 'Your store is currently suspended. Renew your subscription immediately to restore full access.'
          : 'This store is currently suspended. Please contact your administrator.'
      });
      return notes; // Suspension overrides everything else
    }

    // GRACE PERIOD — critical, billing roles only
    if (state.isGrace && perms.billing) {
      notes.push({
        priority: 'critical',
        toastType: 'danger',
        title: '⚠️ Grace Period Active',
        message: 'Your subscription has expired. Renew now before your store is suspended and taken offline.'
      });
    }

    // TRIAL COUNTDOWN — billing roles only
    if (state.isTrial && perms.billing) {
      const d = state.daysLeft;
      if (d <= 1) {
        notes.push({ priority: 'critical', toastType: 'danger',  title: '🚨 Trial Expires Tomorrow',  message: 'Your trial ends in less than 24 hours. Secure your plan to keep your store running.' });
      } else if (d <= 3) {
        notes.push({ priority: 'high',     toastType: 'warning', title: '⚠️ Trial Ending Soon',       message: `Only ${d} days left in your trial. Upgrade now to avoid interruption.` });
      } else if (d <= 5) {
        notes.push({ priority: 'medium',   toastType: 'warning', title: `⏳ ${d} Days Remaining`,     message: 'Your trial is active. Consider upgrading for full business capabilities.' });
      }
    }

    // FREE USER — billing roles only
    if (state.isFreeUser && perms.billing) {
      notes.push({
        priority: 'medium',
        toastType: 'info',
        title: '🎁 Free Plan Active',
        message: 'Upgrade to a paid plan to unlock more products, team members, and business tools.'
      });
    }

    // PLAN CELEBRATION — paid plans, billing roles
    if (state.isPaid && planMeta.celebrationMessage && perms.billing) {
      notes.push({ priority: 'low', toastType: state.isPremium ? 'premium' : 'info', title: '✅ Plan Active', message: planMeta.celebrationMessage });
    }

    // FEATURE UNLOCKS — billing/features roles
    if (state.hasVideo && perms.features) {
      // Only celebrate if just activated (video count = 0 suggests they haven't used it yet)
      // Suppress if user has already uploaded videos
      if ((flags.videos_count ?? 0) === 0) {
        notes.push({ priority: 'low', toastType: 'info', title: '🎥 Video Selling Unlocked', message: 'Your plan includes product videos. Upload your first video product to stand out.' });
      }
    }

    return notes;
  },

  // ── RECOMMENDATIONS (growth coaching) ───────────────────────────────────
  _buildRecommendations(flags, state, perms, planMeta, metrics) {
    const recs = [];

    // If suspended, no recommendations — only notifications matter
    if (state.isSuspended) return recs;

    // ── PRODUCT RECOMMENDATIONS ──
    if (perms.operations) {
      if (metrics.products.current === 0) {
        recs.push({ priority: 'high', category: 'products', icon: '📦', title: 'Add Your First Product', message: 'Your catalog is empty. Add your first product to start attracting WhatsApp customers.' });
      } else if (metrics.products.current <= 3) {
        recs.push({ priority: 'high', category: 'products', icon: '📦', title: 'Grow Your Catalog', message: `You have ${metrics.products.current} product${metrics.products.current > 1 ? 's' : ''}. Stores with larger catalogs receive significantly more engagement.` });
      } else if (metrics.products.remaining <= 3 && metrics.products.max > 0) {
        recs.push({ priority: 'medium', category: 'products', icon: '📦', title: 'Product Limit Approaching', message: `Only ${metrics.products.remaining} product slot${metrics.products.remaining !== 1 ? 's' : ''} remain on your current plan.${perms.upgrade ? ' Consider upgrading for more.' : ''}` });
      } else if (metrics.products.pct >= 80 && metrics.products.max > 0) {
        recs.push({ priority: 'medium', category: 'products', icon: '📦', title: 'Catalog Almost Full', message: `You've used ${metrics.products.current} of ${metrics.products.max} product slots (${metrics.products.pct}%).${perms.upgrade ? ' Upgrade to expand your catalog.' : ''}` });
      } else if (metrics.products.current >= 20) {
        recs.push({ priority: 'low', category: 'products', icon: '🚀', title: 'Excellent Catalog Growth', message: `You have ${metrics.products.current} products live. Keep adding new arrivals to maintain customer interest.` });
      }
    }

    // ── STORY RECOMMENDATIONS ──
    if (perms.operations) {
      if (metrics.stories.active === 0) {
        recs.push({ priority: 'high', category: 'stories', icon: '📲', title: 'Post a Story Today', message: 'You have no active stories. Posting stories helps customers discover your latest products and promotions.' });
      } else if (metrics.stories.active <= 2) {
        recs.push({ priority: 'medium', category: 'stories', icon: '📲', title: 'Post More Stories', message: `You have ${metrics.stories.active} active story. Regular story posts drive higher customer engagement.` });
      } else {
        recs.push({ priority: 'low', category: 'stories', icon: '🔥', title: 'Strong Story Activity', message: `${metrics.stories.active} active stories are running. Keep posting consistently for maximum reach.` });
      }
    }

    // ── PROFILE COMPLETENESS ──
    if (perms.operations) {
      const score = metrics.profile.score;
      if (score < 50) {
        recs.push({ priority: 'high', category: 'profile', icon: '🏪', title: 'Complete Your Profile', message: `Your store profile is ${score}% complete. A complete profile builds customer trust and increases conversions.` });
      } else if (score < 80) {
        recs.push({ priority: 'medium', category: 'profile', icon: '🏪', title: 'Improve Your Profile', message: `Your profile is ${score}% complete. Add more details to strengthen customer confidence.` });
      }
    }

    // ── VIDEO RECOMMENDATIONS ──
    if (state.hasVideo && perms.operations) {
      if (metrics.videos.current === 0) {
        recs.push({ priority: 'medium', category: 'videos', icon: '🎥', title: 'Upload Your First Product Video', message: 'Video products convert significantly better than images. Upload your first video to drive more WhatsApp inquiries.' });
      } else if (metrics.videos.remaining === 1) {
        recs.push({ priority: 'medium', category: 'videos', icon: '🎥', title: 'Last Video Slot Remaining', message: `You've used ${metrics.videos.current} of ${metrics.videos.max} video slots.${perms.upgrade ? ' Upgrade to unlock more.' : ''}` });
      } else if (metrics.videos.current > 0) {
        recs.push({ priority: 'low', category: 'videos', icon: '🎥', title: 'Video Selling Active', message: `${metrics.videos.current} product video${metrics.videos.current > 1 ? 's are' : ' is'} live. Video products attract higher-intent buyers.` });
      }
    } else if (!state.hasVideo && perms.upgrade) {
      recs.push({ priority: 'low', category: 'upgrade', icon: '🎥', title: 'Unlock Video Selling', message: 'Upgrade to Business or Premium to add product videos and stand out from competitors.' });
    }

    // ── CUSTOM DOMAIN ──
    if (state.hasDomain && perms.operations) {
      recs.push({ priority: 'medium', category: 'domain', icon: '🌐', title: 'Connect Your Custom Domain', message: 'Your plan includes a custom domain but none has been connected yet. Strengthen your brand identity.' });
    } else if (!state.hasDomain && perms.upgrade) {
      recs.push({ priority: 'low', category: 'upgrade', icon: '🌐', title: 'Unlock Custom Domain', message: 'Connect your own domain to present a professional brand identity to customers.' });
    }

    // ── TEAM / STAFF ──
    if (perms.team) {
      if (metrics.staff.remaining > 0) {
        recs.push({ priority: 'low', category: 'team', icon: '👥', title: 'Expand Your Team', message: `You can still add ${metrics.staff.remaining} team member${metrics.staff.remaining !== 1 ? 's' : ''} under your current plan.` });
      } else if (metrics.staff.max > 0) {
        recs.push({ priority: 'low', category: 'team', icon: '👥', title: 'Team Capacity Reached', message: `All ${metrics.staff.max} staff slots are filled.${perms.upgrade ? ' Upgrade for more team members.' : ''}` });
      }
    }

    // ── MARKETING INTELLIGENCE ──
    if (perms.operations && metrics.products.current > 0) {
      // Encourage sharing
      recs.push({ priority: 'low', category: 'marketing', icon: '📲', title: 'Share Your Store Link', message: 'Post your store link on WhatsApp Status daily to drive consistent traffic to your catalog.' });
    }

    // ── PREMIUM CELEBRATION (never upsell premium users) ──
    if (state.isPremium && perms.billing) {
      recs.push({ priority: 'low', category: 'premium', icon: '👑', title: 'Premium Tools Active', message: 'All premium selling tools are fully available. Continue scaling your business with maximum capabilities.' });
    }

    return recs;
  },

  // ── ASSISTANT NODE — single most important action ────────────────────────
  _buildAssistantNode(flags, state, perms, recommendations, notifications) {
    // Critical notifications override recommendations in the assistant
    const criticalNote = notifications.find(n => n.priority === 'critical');
    if (criticalNote && perms.billing) {
      return { title: criticalNote.title, message: criticalNote.message };
    }

    // Pick the highest-priority recommendation as the assistant focus
    const topRec = recommendations[0];
    if (topRec) {
      return {
        title:   `${topRec.icon} ${topRec.title}`,
        message: topRec.message
      };
    }

    // Healthy fallback
    return {
      title:   flags.assistant_title   || '🏪 Your Store Is Active',
      message: flags.assistant_message || 'Keep adding products and sharing your store link on WhatsApp Status to grow your sales.'
    };
  },

  // ── BILLBOARD — rotating tips from live intelligence ─────────────────────
  _buildBillboard(flags, state, perms, planMeta, metrics, recommendations) {
    const msgs = [];

    // Lead with the most critical state message
    if (state.isSuspended) {
      msgs.push('🚫 Store suspended. Renew subscription to restore access.');
    } else if (state.isGrace && perms.billing) {
      msgs.push('⚠️ Grace period active. Renew now before your store goes offline.');
    } else if (state.isTrial && perms.billing) {
      msgs.push(`⏳ ${state.daysLeft} day${state.daysLeft !== 1 ? 's' : ''} left in your trial. Upgrade to keep your store running.`);
    }

    // Pull the top 4 recommendations as billboard messages
    recommendations.slice(0, 4).forEach(r => {
      msgs.push(`${r.icon} ${r.message}`);
    });

    // Fill with evergreen tips from server if needed
    let serverMsgs = [];
    if (flags.billboard_messages) {
      try {
        serverMsgs = Array.isArray(flags.billboard_messages)
          ? flags.billboard_messages
          : JSON.parse(flags.billboard_messages);
      } catch(e) {}
    }

    // Append server messages that aren't already covered
    serverMsgs.forEach(m => { if (msgs.length < 8) msgs.push(m); });

    // Absolute fallback
    if (msgs.length === 0) {
      msgs.push('📦 Keep your catalog fresh by adding new products regularly.');
      msgs.push('📲 Share your store link on WhatsApp Status every day.');
    }

    return msgs;
  }
};

// ============================================================================
//  DASHBOARD RENDERER — All DOM writes live here
// ============================================================================
const DashboardRenderer = {

  renderHeader(flags, intel) {
    const { metrics, state } = intel;
    const planMeta = getPlanMeta(flags.plan);

    // Welcome title
    this._set('welcomeTitle', flags.welcome_title || `🏪 ${flags.store_name || 'Dashboard'}`);

    // Welcome message — preserve assistant box child if present
    const wmEl = document.getElementById('welcomeMessage');
    if (wmEl) {
      // Only update the text node (first text child), not the assistantBox child
      const textNodes = Array.from(wmEl.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
      if (textNodes.length > 0) {
        textNodes[0].textContent = flags.welcome_message || '';
      } else {
        const assistantBox = document.getElementById('assistantBox');
        wmEl.insertBefore(document.createTextNode(flags.welcome_message || ''), assistantBox || null);
      }
    }

    // Store name & role
    this._set('storeNameUI',   `🏪 ${flags.store_name || 'Business'}`);
    this._set('storeNameBadge', flags.store_name || 'Business');
    const roleLabel = (flags.role || 'Staff').toUpperCase().replace(/_/g, ' ');
    this._set('roleUI',   `👤 ${roleLabel}`);
    this._set('roleBadge', roleLabel);

    // Plan badge
    const planEl = document.getElementById('planBadgeUI') || document.getElementById('planBadge');
    if (planEl) {
      planEl.textContent  = planMeta.label.toUpperCase();
      planEl.className    = `plan-pill plan-${(flags.plan || 'trial').toLowerCase()}`;
      planEl.style.borderColor = planMeta.color;
    }

    // Countdown pill
    const cdEl = document.getElementById('countdownUI') || document.getElementById('countdownBadge');
    if (cdEl) {
      if (state.isSuspended) {
        cdEl.textContent       = '🚫 SUSPENDED';
        cdEl.style.background  = '#FF3B30';
        cdEl.style.color       = '#fff';
      } else if (state.isGrace) {
        cdEl.textContent       = '⚠️ OVERDUE';
        cdEl.style.background  = '#FF7A00';
        cdEl.style.color       = '#fff';
      } else if (state.isTrial) {
        cdEl.textContent       = `⏳ ${state.daysLeft} Day${state.daysLeft !== 1 ? 's' : ''} Trial`;
        cdEl.style.background  = state.daysLeft <= 3 ? '#FF7A00' : '';
        cdEl.style.color       = state.daysLeft <= 3 ? '#fff' : '';
      } else {
        cdEl.textContent       = '✅ ACTIVE';
        cdEl.style.background  = '';
        cdEl.style.color       = '';
      }
    }

    // Assistant card
    this._set('assistantTitle',   intel.assistantNode.title);
    this._set('assistantMessage', intel.assistantNode.message);

    // Upgrade / View Plan button visibility
    const perms = getRolePermissions(flags.role);
    const showUpgradeBtn = perms.upgrade && Boolean(flags.show_upgrade_cta);
    ['viewPlanDetailsBtn', 'viewPlanDetails', 'upgradePlanBtn', 'upgradeBtn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.style.display = showUpgradeBtn ? 'inline-flex' : 'none';
    });

    // Profile completeness progress bar
    this._renderProfileBar(metrics.profile.score);

    // Usage meters (products, staff, videos)
    this._renderUsageMeters(metrics, flags);
  },

  _renderProfileBar(score) {
    // Inject or update the profile progress bar in the assistant box
    const box = document.getElementById('assistantBox');
    if (!box) return;

    let barWrap = document.getElementById('profileProgressWrap');
    if (!barWrap) {
      barWrap = document.createElement('div');
      barWrap.id = 'profileProgressWrap';
      barWrap.style.cssText = 'margin-top:10px;';
      barWrap.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:11px;font-weight:600;color:var(--text-secondary,#888);letter-spacing:.04em;">PROFILE COMPLETENESS</span>
          <span id="profileScoreLabel" style="font-size:12px;font-weight:700;color:var(--text-primary,#333);">${score}%</span>
        </div>
        <div style="background:rgba(0,0,0,.08);border-radius:99px;height:6px;overflow:hidden;">
          <div id="profileProgressBar" style="height:100%;border-radius:99px;transition:width .6s ease;background:var(--liyog-blue,#1877F2);"></div>
        </div>`;
      box.appendChild(barWrap);
    }

    const bar   = document.getElementById('profileProgressBar');
    const label = document.getElementById('profileScoreLabel');
    if (bar)   bar.style.width   = `${score}%`;
    if (label) label.textContent = `${score}%`;

    // Color shift: red < 50, orange < 80, green >= 80
    if (bar) {
      bar.style.background = score >= 80 ? '#28A428' : score >= 50 ? '#FF7A00' : '#FF3B30';
    }
  },

  _renderUsageMeters(metrics, flags) {
    // Inject a live usage strip below the billboard
    let strip = document.getElementById('biziUsageStrip');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'biziUsageStrip';
      strip.style.cssText = [
        'display:flex',
        'gap:10px',
        'flex-wrap:wrap',
        'padding:10px 0 4px',
        'margin-top:8px'
      ].join(';');

      // Insert after billboard
      const billboard = document.getElementById('assistantBillboard');
      if (billboard && billboard.parentNode) {
        billboard.parentNode.insertBefore(strip, billboard.nextSibling);
      }
    }

    const items = [
      { key: 'products', icon: '📦', label: 'Products', m: metrics.products, show: metrics.products.max > 0 },
      { key: 'staff',    icon: '👥', label: 'Staff',    m: metrics.staff,    show: metrics.staff.max > 0 },
      { key: 'videos',   icon: '🎥', label: 'Videos',   m: metrics.videos,   show: flags.allow_video && metrics.videos.max > 0 }
    ];

    strip.innerHTML = items.filter(i => i.show).map(i => {
      const pct   = i.m.pct;
      const color = pct >= 90 ? '#FF3B30' : pct >= 70 ? '#FF7A00' : 'var(--liyog-blue,#1877F2)';
      const label = `${i.m.current}/${i.m.max}`;
      return `
        <div style="flex:1;min-width:90px;background:rgba(0,0,0,.04);border-radius:10px;padding:8px 10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <span style="font-size:11px;font-weight:600;color:var(--text-secondary,#888);">${i.icon} ${i.label}</span>
            <span style="font-size:11px;font-weight:700;color:${color};">${label}</span>
          </div>
          <div style="background:rgba(0,0,0,.08);border-radius:99px;height:4px;">
            <div style="height:100%;border-radius:99px;width:${Math.min(pct,100)}%;background:${color};transition:width .5s ease;"></div>
          </div>
        </div>`;
    }).join('');
  },

  _set(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
};

// ============================================================================
//  TOAST CONTROLLER — Priority queue, non-pushy, max 1 critical per session
// ============================================================================
const ToastController = {
  _queue:       [],
  _processing:  false,
  _timer:       null,
  _shownCriticals: new Set(), // Prevent repeat critical toasts in same session

  enqueue(items) {
    // Items already sorted by priority from IntelEngine
    items.forEach(item => {
      // Deduplicate criticals within a session
      const key = `${item.priority}_${item.title}`;
      if (item.priority === 'critical' && this._shownCriticals.has(key)) return;

      this._queue.push(item);
      if (item.priority === 'critical') this._shownCriticals.add(key);
    });

    // Keep queue reasonable — max 5 items, drop lowest priority overflow
    while (this._queue.length > 5) this._queue.pop();

    if (!this._processing) this._next();
  },

  _next() {
    if (this._processing || this._queue.length === 0) return;
    this._processing = true;

    const item  = this._queue.shift();
    const theme = TOAST_THEMES[item.toastType || item.priority] || TOAST_THEMES.info;
    const el    = document.getElementById('smartToast') || document.getElementById('toastNotification');
    if (!el) { this._processing = false; return; }

    el.style.background = theme.bg;
    el.style.color      = theme.color;
    el.innerHTML = `
      <span class="toast-close" style="float:right;cursor:pointer;font-weight:700;margin-left:10px;opacity:.8;">✕</span>
      <div class="toast-title" style="font-weight:700;margin-bottom:4px;">${item.title}</div>
      <div style="font-size:13px;line-height:1.45;opacity:.95;">${item.message}</div>`;
    el.style.display = 'block';

    if (navigator?.vibrate) navigator.vibrate(theme.vibrate || [15]);

    const tearDown = () => {
      clearTimeout(this._timer);
      el.style.display = 'none';
      setTimeout(() => {
        this._processing = false;
        // Space out toast chain — 800ms gap between toasts
        setTimeout(() => this._next(), 800);
      }, 300);
    };

    const closeBtn = el.querySelector('.toast-close');
    if (closeBtn) closeBtn.onclick = tearDown;
    this._timer = setTimeout(tearDown, theme.duration);
  },

  clear() {
    this._queue = [];
    clearTimeout(this._timer);
    this._processing = false;
    const el = document.getElementById('smartToast') || document.getElementById('toastNotification');
    if (el) el.style.display = 'none';
  }
};

// ============================================================================
//  BILLBOARD CONTROLLER
// ============================================================================
const BillboardController = {
  _messages:  [],
  _index:     0,
  _interval:  null,

  init(messages) {
    if (this._interval) clearInterval(this._interval);

    const el = document.getElementById('billboardMessage') || document.getElementById('billboardText');
    if (!el || !messages || messages.length === 0) return;

    this._messages = messages;
    this._index    = 0;

    const render = () => {
      el.style.opacity = '0';
      setTimeout(() => {
        el.textContent  = this._messages[this._index];
        el.style.opacity = '1';
      }, 180);
    };

    const prev = document.getElementById('billboardPrev');
    const next = document.getElementById('billboardNext');
    if (prev) prev.onclick = () => { this._index = (this._index - 1 + this._messages.length) % this._messages.length; render(); };
    if (next) next.onclick = () => { this._index = (this._index + 1) % this._messages.length; render(); };

    render();
    this._interval = setInterval(() => {
      this._index = (this._index + 1) % this._messages.length;
      render();
    }, 12000);
  }
};

// ============================================================================
//  MAIN ENTRY POINT — called by runtime.js
// ============================================================================
function applyDashboardFlags(flags) {
  if (!flags) return;

  // Clear stale state
  ToastController.clear();
  window.APP_RUNTIME.dashboardFlags = flags;

  // Run the intelligence engine
  const intel = IntelEngine.generate(flags);
  if (!intel) return;

  // Render header + assistant + usage meters
  DashboardRenderer.renderHeader(flags, intel);

  // Spin up billboard with live-generated messages
  BillboardController.init(intel.billboardMsgs);

  // Queue toasts: notifications first (urgent), then top recommendation (coaching)
  // Critical + High notifications only — don't spam the user
  const toastableNotes = intel.notifications.filter(n => ['critical', 'high'].includes(n.priority));
  const toastableRecs  = intel.recommendations
    .filter(r => r.priority === 'high')  // Only high-priority recs become toasts
    .slice(0, 1)                          // Max 1 recommendation toast
    .map(r => ({ ...r, title: `${r.icon} ${r.title}`, toastType: 'info' }));

  ToastController.enqueue([...toastableNotes, ...toastableRecs]);
}

// ============================================================================
//  PUBLIC API — window.INTEL
//  tabscript.js calls these hooks to feed live action data back into the engine
// ============================================================================
window.INTEL = {

  // Called by tabscript.js when user performs an action
  // e.g. after product created: window.INTEL.trackAction('productAdded')
  trackAction(actionType) {
    const actionToastMap = {
      productAdded:     { priority: 'low', toastType: 'low',   title: '📦 Product Added',    message: 'Your new product is live on your store catalog.' },
      storyCreated:     { priority: 'low', toastType: 'low',   title: '📲 Story Posted',      message: 'Your story is now visible to customers.' },
      categoryAdded:    { priority: 'low', toastType: 'low',   title: '🗂 Category Created',  message: 'New category added to your catalog.' },
      profileUpdated:   { priority: 'low', toastType: 'low',   title: '🏪 Profile Updated',   message: 'Your store profile has been saved.' },
      productFeatured:  { priority: 'low', toastType: 'low',   title: '⭐ Product Featured',  message: 'Featured products get more visibility in your catalog.' },
      productDeleted:   { priority: 'low', toastType: 'info',  title: '🗑 Product Removed',   message: 'Product has been removed from your catalog.' },
      videoUploaded:    { priority: 'low', toastType: 'premium',title: '🎥 Video Uploaded',   message: 'Video product is live. Video listings convert better.' },
      storyExpired:     { priority: 'low', toastType: 'info',  title: '📲 Story Expired',     message: 'This story has reached its expiry time.' }
    };

    const toast = actionToastMap[actionType];
    if (toast) ToastController.enqueue([toast]);

    // Trigger a live metrics refresh after any action
    if (typeof window.refreshLiveMetrics === 'function') {
      window.refreshLiveMetrics();
    }
  },

  // Called by tabscript.js to get current plan/role context
  // e.g. disable video upload button if can_upload_video returns false
  getContext() {
    const flags = window.APP_RUNTIME?.dashboardFlags;
    if (!flags) return null;
    return {
      plan:         flags.plan,
      role:         flags.role,
      planMeta:     getPlanMeta(flags.plan),
      permissions:  getRolePermissions(flags.role),
      canVideo:     flags.allow_video    === true,
      canDomain:    flags.allow_custom_domain === true,
      canPixel:     flags.allow_pixel    === true,
      productsLeft: Math.max(0, (flags.max_products ?? 0) - (flags.products_count ?? 0)),
      staffLeft:    Math.max(0, (flags.max_staff ?? 0) - (flags.staff_count ?? 0)),
      videosLeft:   Math.max(0, (flags.max_video_uploads ?? 0) - (flags.videos_count ?? 0))
    };
  },

  // Called when a limit wall is hit — shows contextual upgrade prompt
  showLimitWall(limitType) {
    const perms = getRolePermissions(window.APP_RUNTIME?.dashboardFlags?.role);
    if (!perms.upgrade) return; // Staff never see upgrade prompts

    const messages = {
      products: { title: '📦 Product Limit Reached',    message: 'You\'ve reached your plan\'s product limit. Upgrade to add more products.' },
      staff:    { title: '👥 Staff Limit Reached',       message: 'You\'ve reached your team member limit. Upgrade to add more staff.' },
      video:    { title: '🎥 Video Limit Reached',       message: 'You\'ve used all your video upload slots. Upgrade for more.' },
      domain:   { title: '🌐 Feature Not Available',    message: 'Custom domains require a Business or Premium plan.' },
      pixel:    { title: '📈 Feature Not Available',    message: 'Marketing pixels require a Business or Premium plan.' }
    };

    const msg = messages[limitType];
    if (msg) {
      ToastController.enqueue([{ ...msg, priority: 'medium', toastType: 'medium' }]);
    }
  },

  // Force a fresh intelligence run (e.g. after tab switch)
  refresh() {
    if (typeof window.refreshLiveMetrics === 'function') {
      window.refreshLiveMetrics();
    }
  }
};

