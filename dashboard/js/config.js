// ================================================
//  BiziNet · Config
//  dashboard/js/config.js
// ================================================

window.APP_CONFIG = {
  supabaseUrl: "https://ugffezktrojjhfbaxrrq.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZmZlemt0cm9qamhmYmF4cnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODg3NzIsImV4cCI6MjA5MTI2NDc3Mn0.gzFuLSj225QRnxdwyrH25Xpe1YZqPiK7fp_nrsETsW8",
  renderUrl:   "https://video-compressor-ilg5.onrender.com",
  // Moved dynamically from helper.js into central config
  r2PublicBase: "https://pub-0fc5736899f3449d987d356eafdca873.r2.dev" 
};

// Supabase client — created once, used by ALL scripts
window.APP_CLIENT = window.supabase.createClient(
  window.APP_CONFIG.supabaseUrl,
  window.APP_CONFIG.supabaseKey
);
