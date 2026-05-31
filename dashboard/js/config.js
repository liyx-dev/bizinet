// ============================================
// GLOBAL CONFIG
// ============================================

const SUPABASE_URL =
  "https://ugffezktrojjhfbaxrrq.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZmZlemt0cm9qamhmYmF4cnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODg3NzIsImV4cCI6MjA5MTI2NDc3Mn0.gzFuLSj225QRnxdwyrH25Xpe1YZqPiK7fp_nrsETsW8";

const RENDER_URL =
  "https://video-compressor-ilg5.onrender.com";

// Shared Supabase instance
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
