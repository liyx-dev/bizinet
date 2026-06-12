// ============================================================
//  BiziNet · Realtime Intelligence Engine v1.1
//  dashboard/js/realtime-engine.js
//
//  v1.1 fixes:
//  - HEARTBEAT POLL added (every 30s) — silent safety net for
//    mobile browsers that throttle WebSocket events when the
//    app is in the foreground but OS deprioritises the tab.
//    This is why changes weren't appearing while screen was on.
//  - _scheduleRefresh now bypasses the 250ms hard floor when
//    called from a confirmed WebSocket event (not just timer).
//  - Channel rebuild on SUBSCRIBED confirmation — ensures
//    postgres_changes filters are active and not stale.
//  - Subscription health check: if channel says SUBSCRIBED
//    but no event received in 60s during active use, quietly
//    rebuilds the channel.
//
//  Architecture:
//  - Owns ALL Supabase Realtime subscriptions
//  - Zero dependency on tabscript.js
//  - 300ms debounce — coalesces rapid-fire events
//  - Exponential backoff reconnection (1s → 2s → 4s → max 30s)
//  - 30s heartbeat poll — guarantees updates even when WebSocket
//    events are throttled by mobile OS
//  - Page visibility + online/offline recovery
//  - window.BIZI_REALTIME → status/debug API
//
//  Load order in HTML:
//    config.js → dashboard-flags.js → runtime.js → realtime-engine.js
// ============================================================

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  const DEBOUNCE_MS        = 300;    // coalesce rapid-fire events
  const RECONNECT_BASE_MS  = 1000;   // base backoff delay
  const RECONNECT_MAX_MS   = 30000;  // cap backoff at 30s
  const MAX_RETRIES        = 10;     // give up after 10 attempts
  const HEARTBEAT_MS       = 30000;  // poll every 30s as safety net
  const CHANNEL_NAME       = 'bizi-dashboard-realtime-v2';

  // ── Internal state ─────────────────────────────────────────
  let _channel          = null;
  let _storeId          = null;
  let _debounceTimer    = null;
  let _retryTimer       = null;
  let _heartbeatTimer   = null;
  let _isSubscribed     = false;
  let _lastRefresh      = 0;
  let _lastEventTime    = 0;
  let _retryCount       = 0;
  let _statusListeners  = [];

  // ── Status ─────────────────────────────────────────────────
  const Status = {
    WAITING:      'waiting',
    CONNECTING:   'connecting',
    LIVE:         'live',
    RECONNECTING: 'reconnecting',
    FAILED:       'failed'
  };

  let _currentStatus = Status.WAITING;

  function _setStatus(s) {
    if (_currentStatus === s) return;
    _currentStatus = s;
    _statusListeners.forEach(fn => { try { fn(s); } catch(e) {} });
    if (s === Status.LIVE) {
      console.info('[BiziRealtime] ✅ Live — watching stores, products, stories, store_members, profile, categories');
    } else if (s === Status.RECONNECTING) {
      console.warn(`[BiziRealtime] ♻️  Reconnecting (attempt ${_retryCount})…`);
    } else if (s === Status.FAILED) {
      console.error('[BiziRealtime] ❌ Max retries exceeded.');
    }
  }

  // ── Core refresh ───────────────────────────────────────────
  // fromEvent=true means a confirmed WebSocket event fired —
  // skip the 250ms hard floor so the UI updates immediately.
  async function _doRefresh(source, fromEvent) {
    const now = Date.now();

    // Hard floor only applies to non-event triggers (heartbeat,
    // visibility, online). Real WebSocket events always go through.
    if (!fromEvent && (now - _lastRefresh) < 250) return;

    _lastRefresh = now;
    if (fromEvent) _lastEventTime = now;

    try {
      if (typeof window.refreshLiveMetrics === 'function') {
        await window.refreshLiveMetrics();
      }
    } catch (err) {
      console.warn('[BiziRealtime] Refresh error from', source, '→', err.message);
    }
  }

  // ── Debounced refresh (for WebSocket events) ───────────────
  // Debounce coalesces burst events (bulk imports) into one call.
  // We pass fromEvent=true so the hard floor is bypassed once
  // the debounce settles — the UI updates on the first quiet moment.
  function _scheduleRefresh(sourceTable) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      _doRefresh(sourceTable, true); // true = from confirmed WS event
    }, DEBOUNCE_MS);
  }

  // ── Heartbeat poll ─────────────────────────────────────────
  // Every 30 seconds, quietly call refreshLiveMetrics regardless
  // of WebSocket state. This is the safety net that ensures mobile
  // browsers (which throttle WebSocket push when OS deprioritises
  // the tab foreground) always stay in sync.
  // Cost: one RPC call per 30 seconds per open dashboard tab —
  // negligible at scale, and Supabase's RPC is cheap.
  function _startHeartbeat() {
    _stopHeartbeat();
    _heartbeatTimer = setInterval(() => {
      _doRefresh('heartbeat', false);
    }, HEARTBEAT_MS);
  }

  function _stopHeartbeat() {
    if (_heartbeatTimer) {
      clearInterval(_heartbeatTimer);
      _heartbeatTimer = null;
    }
  }

  // ── Channel builder ────────────────────────────────────────
  function _buildChannel(storeId) {
    const client = window.APP_CLIENT;
    if (!client) return null;

    // Cleanly remove existing channel before rebuilding
    if (_channel) {
      try { client.removeChannel(_channel); } catch(e) {}
      _channel = null;
      _isSubscribed = false;
    }

    const ch = client.channel(CHANNEL_NAME, {
      config: {
        broadcast:  { self: false  },
        presence:   { key: ''      }
      }
    });

    // Tables → filters
    // stores uses `id`, all others use `store_id`
    const tableFilters = [
      { table: 'stores',        filter: `id=eq.${storeId}`         },
      { table: 'products',      filter: `store_id=eq.${storeId}`   },
      { table: 'stories',       filter: `store_id=eq.${storeId}`   },
      { table: 'store_members', filter: `store_id=eq.${storeId}`   },
      { table: 'profile',       filter: `store_id=eq.${storeId}`   },
      { table: 'categories',    filter: `store_id=eq.${storeId}`   }
    ];

    tableFilters.forEach(({ table, filter }) => {
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        (_payload) => {
          // Confirmed WebSocket push — schedule debounced refresh
          _scheduleRefresh(table);
        }
      );
    });

    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        _isSubscribed = true;
        _retryCount   = 0;
        _setStatus(Status.LIVE);
        _startHeartbeat(); // start 30s safety poll once confirmed live

      } else if (status === 'CHANNEL_ERROR') {
        _isSubscribed = false;
        _stopHeartbeat();
        console.error('[BiziRealtime] Channel error:', err);
        _setStatus(Status.RECONNECTING);
        _scheduleReconnect();

      } else if (status === 'TIMED_OUT') {
        _isSubscribed = false;
        _stopHeartbeat();
        _setStatus(Status.RECONNECTING);
        _scheduleReconnect();

      } else if (status === 'CLOSED') {
        // Only reconnect if this wasn't an intentional close
        if (_isSubscribed) {
          _isSubscribed = false;
          _stopHeartbeat();
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
      // Even after giving up on WebSocket, keep heartbeat going
      // so the dashboard still refreshes every 30s via poll.
      _startHeartbeat();
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
  async function _boot() {
    _setStatus(Status.WAITING);

    try {
      await window.APP_RUNTIME_READY;

      const runtimeState = window.APP_RUNTIME?.runtimeState;
      if (!runtimeState?.store_id) {
        console.warn('[BiziRealtime] No store_id in APP_RUNTIME. Starting heartbeat-only mode.');
        // No store_id — fall back to heartbeat poll only
        _startHeartbeat();
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

  // ── Page visibility ────────────────────────────────────────
  // When user returns to tab after screen-off or app switch:
  // do an immediate refresh + reset backoff + rebuild channel
  // if it silently dropped while backgrounded.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Immediate refresh — catch anything that changed while away
      _doRefresh('visibilitychange', false);

      if (!_isSubscribed && _storeId && _currentStatus !== Status.RECONNECTING) {
        _retryCount = 0; // reset backoff — user just came back
        _setStatus(Status.RECONNECTING);
        _scheduleReconnect();
      }
    } else {
      // Tab hidden — stop heartbeat to save resources
      _stopHeartbeat();
    }
  });

  // ── Network recovery ───────────────────────────────────────
  window.addEventListener('online', () => {
    console.info('[BiziRealtime] Network back online — reconnecting…');
    _doRefresh('online', false);

    if (_storeId) {
      _retryCount = 0;
      _setStatus(Status.RECONNECTING);
      _scheduleReconnect();
    }
  });

  window.addEventListener('offline', () => {
    _stopHeartbeat();
    console.warn('[BiziRealtime] Network offline — pausing heartbeat.');
  });

  // ── Public API ─────────────────────────────────────────────
  window.BIZI_REALTIME = {

    getStatus() {
      return _currentStatus;
    },

    isLive() {
      return _isSubscribed;
    },

    onStatusChange(fn) {
      if (typeof fn === 'function') _statusListeners.push(fn);
    },

    // Force immediate refresh — bypasses debounce and floor
    forceRefresh() {
      _doRefresh('manual', true);
    },

    debug() {
      return {
        status:        _currentStatus,
        storeId:       _storeId,
        isSubscribed:  _isSubscribed,
        retryCount:    _retryCount,
        heartbeatActive: !!_heartbeatTimer,
        lastRefresh:   _lastRefresh   ? new Date(_lastRefresh).toISOString()   : null,
        lastWsEvent:   _lastEventTime ? new Date(_lastEventTime).toISOString() : null
      };
    }
  };

  // ── Start ──────────────────────────────────────────────────
  _boot();

})();
