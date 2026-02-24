window.PRO_GRACE_CONFIG = {
  // Set these for Vercel + Supabase deployment.
  // Example: "https://abcxyzcompany.supabase.co"
  supabaseUrl: "https://eptfubotbeebkzgbvljx.supabase.co",
  // Use the public anon key from Supabase Project Settings -> API.
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdGZ1Ym90YmVlYmt6Z2J2bGp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MDEzNDUsImV4cCI6MjA4NzQ3NzM0NX0.O17r8vFOOEZj79bqaAIOCLb_hlc_SX-sIj2hkKVDQMQ",
  // Table with one row storing the full app payload as JSON.
  supabaseTable: "prograce_state",
  // Single row id in the table.
  supabaseRowId: "primary",
};
