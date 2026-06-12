// ============================================================
//  BiziNet · Realtime Intelligence Engine v1.0
//  dashboard/js/realtime-engine.js
//
//  Architecture:
//  - Owns ALL Supabase Realtime subscriptions
//  - Completely self-contained — zero dependency on tabscript.js
//  - Debounced refresh (300ms) prevents RPC hammer on bulk ops
//  - Exponential backoff reconnection (1s → 2s → 4s → max 30s)
//  - Watches: stores, products, stories, store_members, profile, categories
//  - window.BIZI_REALTIME → status/debug API only (no action hooks needed)
//
//  Load order in HTML:
//    config.js → dashboard-flags.js → runtime.js → realtime-engine.js
// ============================================================

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  const DEBOUNCE_MS       = 300;   // coalesce rapid fire changes
  const RECONNECT_BASE_MS = 1000;  // base backoff delay
  const RECONNECT_MAX_MS  = 30000; // cap backoff at 30s
  const MAX_RETRIES       = 10;    // give up after 10 attempts (page reload implied)
  const CHANNEL_NAME      = 'bizi-dashboard-realtime-v1';

  // ── Internal state ─────────────────────────────────────────
  let _channel         = null;
  let _storeId         = null;
  let _debounceTimer   = null;
  let _retryCount      = 0;
  let _retryTimer      = null;
  let _isSubscribed    = false;
  let _lastRefresh     = 0;
  let _statusListeners = [];

  // ── Status tracking ────────────────────────────────────────
  const Status = {
    WAITING:      'waiting',       // waiting for APP_RUNTIME to be ready
    CONNECTING:   'connecting',    // channel being created
    LIVE:         'live',          // subscribed and receiving events
    RECONNECTING: 'reconnecting',  // backoff in progress
    FAILED:       'failed'         // max retries exceeded
  };

  let _currentStatus = Status.WAITING;

  function _setStatus(s) {
    if (_currentStatus === s) return;
    _currentStatus = s;
    _statusListeners.forEach(fn => { try { fn(s); } catch(e) {} });
    if (s === Status.LIVE) {
      console.info('[BiziRealtime] ✅ Live — watching all store tables');
    } else if (s === Status.RECONNECTING) {
      console.warn(`[BiziRealtime] ♻️  Reconnecting (attempt ${_retryCount})…`);
    } else if (s === Status.FAILED) {
      console.error('[BiziRealtime] ❌ Max retries exceeded. Reload page to reconnect.');
    }
  }

  // ── Debounced refresh ──────────────────────────────────────
  // Coalesces rapid-fire DB events (e.g. bulk product imports)
  // into a single RPC call after DEBOUNCE_MS of quiet.
  function _scheduleRefresh(sourceTable) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(async () => {
      const now = Date.now();
      // Hard floor: never call RPC more than once per 250ms even if debounce fires
      if (now - _lastRefresh < 250) return;
      _lastRefresh = now;

      try {
        if (typeof window.refreshLiveMetrics === 'function') {
          await window.refreshLiveMetrics();
        }
      } catch (err) {
        console.warn('[BiziRealtime] Refresh error after', sourceTable, '→', err.message);
      }
    }, DEBOUNCE_MS);
  }

  // ── Channel builder ────────────────────────────────────────
  function _buildChannel(storeId) {
    const client = window.APP_CLIENT;
    if (!client) return null;

    // Remove any existing channel cleanly
    if (_channel) {
      try { client.removeChannel(_channel); } catch(e) {}
      _channel = null;
    }

    // Tables that affect dashboard intelligence:
    // stores        → plan, subscription_status, is_suspended, feature flags, limits
    // products      → products_count, videos_count (video_url not null)
    // stories       → active_stories_count (expires_at > now)
    // store_members → staff_count, role changes
    // profile       → profile_completeness score
    // categories    → categories_count for IntelEngine coaching

    const ch = client.channel(CHANNEL_NAME, {
      config: { broadcast: { self: false } }
    });

    const tables = [
      'stores',
      'products',
      'stories',
      'store_members',
      'profile',
      'categories'
    ];

    tables.forEach(table => {
      // Use store_id filter where the column name is store_id
      // stores table uses id as primary key, not store_id
      const filter = table === 'stores'
        ? `id=eq.${storeId}`
        : `store_id=eq.${storeId}`;

      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        (payload) => {
          _scheduleRefresh(table);
        }
      );
    });

    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        _isSubscribed = true;
        _retryCount   = 0;
        _setStatus(Status.LIVE);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        _isSubscribed = false;
        _setStatus(Status.RECONNECTING);
        _scheduleReconnect();
      } else if (status === 'CLOSED') {
        // Only reconnect if we didn't close intentionally
        if (_isSubscribed) {
          _isSubscribed = false;
          _setStatus(Status.RECONNECTING);
          _scheduleReconnect();
        }
      }
    });

    return ch;
  }

  // ── Reconnection with exponential backoff ─────────────────
  function _scheduleReconnect() {
    clearTimeout(_retryTimer);

    if (_retryCount >= MAX_RETRIES) {
      _setStatus(Status.FAILED);
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, _retryCount),
      RECONNECT_MAX_MS
    );
    _retryCount++;

    _retryTimer = setTimeout(() => {
      if (_storeId) {
        _setStatus(Status.CONNECTING);
        _channel = _buildChannel(_storeId);
      }
    }, delay);
  }

  // ── Boot ───────────────────────────────────────────────────
  // Waits for APP_RUNTIME_READY (set by runtime.js) so we always
  // have a valid storeId before subscribing.
  async function _boot() {
    _setStatus(Status.WAITING);

    try {
      // Wait for runtime boot to complete
      await window.APP_RUNTIME_READY;

      const runtimeState = window.APP_RUNTIME?.runtimeState;
      if (!runtimeState?.store_id) {
        console.warn('[BiziRealtime] No store_id found in APP_RUNTIME. Subscriptions not started.');
        return;
      }

      _storeId = runtimeState.store_id;
      _setStatus(Status.CONNECTING);
      _channel = _buildChannel(_storeId);

    } catch (err) {
      console.error('[BiziRealtime] Boot failed:', err);
      _setStatus(Status.RECONNECTING);
      _scheduleReconnect();
    }
  }

  // ── Page visibility API ────────────────────────────────────
  // When user returns to tab, do an immediate refresh to catch
  // anything that happened while the tab was hidden (WebSockets
  // can silently drop during device sleep/background).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Immediate refresh — reconnect channel if needed
      _scheduleRefresh('visibilitychange');

      if (!_isSubscribed && _storeId && _currentStatus !== Status.RECONNECTING) {
        _setStatus(Status.RECONNECTING);
        _retryCount = 0; // reset backoff on manual tab return
        _scheduleReconnect();
      }
    }
  });

  // ── Online/offline detection ───────────────────────────────
  window.addEventListener('online', () => {
    if (!_isSubscribed && _storeId) {
      _retryCount = 0;
      _setStatus(Status.RECONNECTING);
      _scheduleReconnect();
    }
  });

  // ── Public API ─────────────────────────────────────────────
  // Intentionally minimal — this is a status/debug surface only.
  // No action hooks. The backend drives everything.
  window.BIZI_REALTIME = {

    // Returns current subscription status string
    getStatus() {
      return _currentStatus;
    },

    // Returns true if actively subscribed
    isLive() {
      return _isSubscribed;
    },

    // Subscribe to status changes (for UI indicators if needed)
    onStatusChange(fn) {
      if (typeof fn === 'function') _statusListeners.push(fn);
    },

    // Force a manual refresh (e.g. after user-visible action)
    // Safe to call from anywhere — debounced internally
    forceRefresh() {
      _scheduleRefresh('manual');
    },

    // Debug: returns current internal state snapshot
    debug() {
      return {
        status:      _currentStatus,
        storeId:     _storeId,
        isSubscribed: _isSubscribed,
        retryCount:  _retryCount,
        lastRefresh: _lastRefresh ? new Date(_lastRefresh).toISOString() : null
      };
    }
  };

  // ── Start ──────────────────────────────────────────────────
  _boot();

})();
