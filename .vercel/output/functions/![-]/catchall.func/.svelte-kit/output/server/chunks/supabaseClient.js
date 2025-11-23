import { createClient } from "@supabase/supabase-js";
const PUBLIC_SUPABASE_URL = "https://uvpycojmnmarcggjrgta.supabase.co";
const PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2cHljb2ptbm1hcmNnZ2pyZ3RhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0Nzk0MjMsImV4cCI6MjA3OTA1NTQyM30.PZNkKoo_XRGsrLUlGFRs56Wo-5VjHzm3tiBES1zwNiY";
const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseKey = PUBLIC_SUPABASE_ANON_KEY;
createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  auth: {
    persistSession: false
  }
});
