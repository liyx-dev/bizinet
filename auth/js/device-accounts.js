/**
 * ============================================================================
 * BIZIPLEX — DEVICE ACCOUNT MEMORY
 * ============================================================================
 * Powers the "accounts on this device" switcher, in the spirit of how
 * Facebook/Google let you tap a face instead of retyping an email.
 *
 * Hard security rule this file enforces everywhere:
 *   - NEVER stores a password.
 *   - NEVER stores a session token or refresh token.
 *   - ONLY stores: email, store name, logo URL, member name, last-seen time.
 *   - Switching accounts ALWAYS requires re-entering the password. This
 *     module only pre-fills identity, it never grants access.
 *
 * Storage: IndexedDB (not localStorage) so entries survive longer and don't
 * block the main thread on write. Falls back to an in-memory array if
 * IndexedDB is unavailable (private browsing, locked-down browsers) — the
 * switcher simply won't persist across reloads in that case, which is a
 * safe degradation, not a broken one.
 * ============================================================================
 */

(function () {
  "use strict";

  const DB_NAME = "biziplex-device-accounts";
  const DB_VERSION = 1;
  const STORE_NAME = "accounts";
  const MAX_ACCOUNTS = 6;

  let memoryFallback = [];
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    if (!("indexedDB" in window)) {
      dbPromise = Promise.resolve(null);
      return dbPromise;
    }
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "email" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn("[Biziplex] IndexedDB unavailable, using memory fallback.");
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });
    return dbPromise;
  }

  async function getAll() {
    const db = await openDb();
    if (!db) return [...memoryFallback];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async function upsert(account) {
    if (!account || !account.email) return;
    const safeAccount = {
      email: String(account.email).toLowerCase().trim(),
      storeName: account.storeName || null,
      logoUrl: account.logoUrl || null,
      memberName: account.memberName || null,
      lastSeen: Date.now(),
    };

    const db = await openDb();
    if (!db) {
      memoryFallback = memoryFallback.filter((a) => a.email !== safeAccount.email);
      memoryFallback.unshift(safeAccount);
      memoryFallback = memoryFallback.slice(0, MAX_ACCOUNTS);
      return;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(safeAccount);
        tx.oncomplete = async () => {
          // Trim to MAX_ACCOUNTS, dropping the oldest by lastSeen.
          const all = await getAll();
          if (all.length > MAX_ACCOUNTS) {
            const sorted = all.sort((a, b) => b.lastSeen - a.lastSeen);
            const toRemove = sorted.slice(MAX_ACCOUNTS);
            const tx2 = db.transaction(STORE_NAME, "readwrite");
            const store2 = tx2.objectStore(STORE_NAME);
            toRemove.forEach((a) => store2.delete(a.email));
          }
          resolve();
        };
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  async function remove(email) {
    if (!email) return;
    const clean = String(email).toLowerCase().trim();
    const db = await openDb();
    if (!db) {
      memoryFallback = memoryFallback.filter((a) => a.email !== clean);
      return;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(clean);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  async function list() {
    const all = await getAll();
    return all.sort((a, b) => b.lastSeen - a.lastSeen);
  }

  window.BiziplexDeviceAccounts = { upsert, remove, list };
})();
