const SUPABASE_URL = "https://uxfgnwaxgiljxpujqtah.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4Zmdud2F4Z2lsanhwdWpxdGFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTcxMjEsImV4cCI6MjA5OTY5MzEyMX0.ADVOJRridXcyuSV9_1wOhIKwyxCsEoeSHqSSxD0Hbg0";

export function isSupabaseConfigured() {
  return (
    SUPABASE_URL.startsWith("https://") &&
    SUPABASE_ANON_KEY.length > 40 &&
    window.supabase
  );
}

export const supabaseClient = isSupabaseConfigured()
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
