import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { fetchAPI } from "@/lib/fetch";

export async function getSupabaseClient() {
  const config = await fetchAPI("/(api)/client-config");
  const supabaseUrl = config?.data?.supabaseUrl;
  const supabasePublishableKey = config?.data?.supabasePublishableKey;

  if (typeof supabaseUrl !== "string" || typeof supabasePublishableKey !== "string") {
    throw new Error("Supabase client configuration is missing from the Render API.");
  }

  return createSupabaseClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
