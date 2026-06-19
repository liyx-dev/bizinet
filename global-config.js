// =============================================================================
// BIZINET MASTER GLOBAL CONFIGURATION & ROUTING MATRIX
// =============================================================================

window.APP_CONFIG = {
  supabaseUrl: "https://ugffezktrojjhfbaxrrq.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZmZlemt0cm9qamhmYmF4cnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODg3NzIsImV4cCI6MjA5MTI2NDc3Mn0.gzFuLSj225QRnxdwyrH25Xpe1YZqPiK7fp_nrsETsW8",
  renderUrl:   "https://video-compressor-ilg5.onrender.com",
  r2PublicBase: "https://pub-0fc5736899f3449d987d356eafdca873.r2.dev" 
};

// Singleton Client Instance Injection
if (window.supabase) {
  window.APP_CLIENT = window.supabase.createClient(
    window.APP_CONFIG.supabaseUrl,
    window.APP_CONFIG.supabaseKey
  );
} else {
  console.error("Critical Matrix Failure: Supabase global CDN element missing from DOM headers.");
}

// =============================================================================
// CORE NAVIGATION HANDLERS (AUTOMATIC SUB-PATH DETECTION)
// =============================================================================

function getBasePath() {
  const isGitHubPages = window.location.hostname.includes('github.io');
  if (!isGitHubPages) return '';
  
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts.length > 0 ? '/' + parts[0] : '';
}

function safeNavigate(targetPath, replace = false) {
  if (!targetPath) return;
  const cleanTarget = targetPath.startsWith('/') ? targetPath : '/' + targetPath;
  const finalUrl = window.location.origin + getBasePath() + cleanTarget;
  
  if (replace) {
    window.location.replace(finalUrl);
  } else {
    window.location.href = finalUrl;
  }
}
