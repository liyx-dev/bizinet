// ======================================================
// BIZINET GLOBAL NAVIGATION SYSTEM
// ======================================================

// Detect repo prefix automatically
function getBasePath() {
  const isGitHubPages = window.location.hostname.includes('github.io');

  if (!isGitHubPages) {
    return '';
  }

  // Example:
  // /bizinet/dashboard/onboarding/
  // -> ["bizinet","dashboard","onboarding"]
  const parts = window.location.pathname
    .split('/')
    .filter(Boolean);

  return parts.length > 0 ? '/' + parts[0] : '';
}

// ======================================================
// SAFE NAVIGATION
// ======================================================

function safeNavigate(targetPath, replace = false) {

  if (!targetPath) return;

  const cleanTarget = targetPath.startsWith('/')
    ? targetPath
    : '/' + targetPath;

  const finalUrl =
    window.location.origin +
    getBasePath() +
    cleanTarget;

  if (replace) {
    window.location.replace(finalUrl);
  } else {
    window.location.href = finalUrl;
  }
}

// ======================================================
// SAFE BACK NAVIGATION
// ======================================================

function safeBack(fallback = '') {

  // If browser has history
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  // Fallback route
  if (fallback) {
    safeNavigate(fallback);
  }
}

// ======================================================
// NORMALIZE DOUBLE SLASHES
// ======================================================

(function normalizeUrl() {

  const current = window.location.pathname;

  // Prevent accidental //dashboard//
  const normalized = current.replace(/\/{2,}/g, '/');

  if (normalized !== current) {

    const fixed =
      window.location.origin +
      normalized +
      window.location.search +
      window.location.hash;

    window.history.replaceState({}, '', fixed);
  }

})();

// ======================================================
// OPTIONAL GLOBAL HELPERS
// ======================================================

function goDashboard() {
  safeNavigate('dashboard');
}

function goAuth() {
  safeNavigate('auth');
}

function goBilling() {
  safeNavigate('dashboard/billing');
}

function goOnboarding() {
  safeNavigate('dashboard/onboarding');
}

function goSuspended() {
  safeNavigate('dashboard/suspended');
}
