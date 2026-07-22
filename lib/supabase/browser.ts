import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicEnv } from "@/config/env";

export function createSupabaseBrowserClient(){
  const env=requireSupabasePublicEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
