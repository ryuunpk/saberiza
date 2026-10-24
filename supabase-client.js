import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const publicKey = SUPABASE_PUBLISHABLE_KEY.trim();
const looksConfigured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL.trim())
  && publicKey.startsWith("sb_publishable_") && publicKey.length > "sb_publishable_".length && !/\s/.test(publicKey);

export const supabaseConfigured = looksConfigured;
export const supabase = looksConfigured
  ? createClient(SUPABASE_URL.replace(/\/$/, ""), SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;
