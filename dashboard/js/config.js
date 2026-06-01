// ================================================
//  BiziNet · Config & Runtime State
//  dashboard/js/config.js
// ================================================

window.APP_CONFIG = {
  supabaseUrl: "https://ugffezktrojjhfbaxrrq.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZmZlemt0cm9qamhmYmF4cnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODg3NzIsImV4cCI6MjA5MTI2NDc3Mn0.gzFuLSj225QRnxdwyrH25Xpe1YZqPiK7fp_nrsETsW8",
  renderUrl: "https://video-compressor-ilg5.onrender.com"
};

// Global runtime state — written by bootguard.js, read by any tab script
window.APP_RUNTIME = {
  runtimeState: null,       // from get_store_runtime_state RPC
  dashboardFlags: null,     // from get_dashboard_flags RPC
  currentSessionToken: null // current auth session token
};
