import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { fetchAPI } from "@/lib/fetch";

const shouldUseNodeTransport = () => {
  return typeof window === "undefined" && typeof process !== "undefined" && !!process.versions?.node;
};

const getNodeWsTransport = async () => {
  if (!shouldUseNodeTransport()) {
    return undefined;
  }

  try {
    const wsModule = await import("ws");
    return (wsModule.WebSocket ?? wsModule.default ?? wsModule) as unknown as typeof WebSocket;
  } catch (error) {
    console.warn("Unable to load WebSocket transport for Supabase realtime client:", error);
    return undefined;
  }
};

export async function getSupabaseClient() {
  const config = await fetchAPI("/(api)/client-config");
  const supabaseUrl = config?.data?.supabaseUrl;
  const supabasePublishableKey = config?.data?.supabasePublishableKey;

  if (typeof supabaseUrl !== "string" || typeof supabasePublishableKey !== "string") {
    throw new Error("Supabase client configuration is missing from the Render API.");
  }

  const options: Record<string, unknown> = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };

  const wsTransport = await getNodeWsTransport();
  if (wsTransport) {
    options.realtime = {
      transport: wsTransport,
    };
  }

  return createSupabaseClient(supabaseUrl, supabasePublishableKey, options as never);
}
