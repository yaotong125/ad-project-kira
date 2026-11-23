"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SupabaseNotConfiguredError, supabaseEnv } from "./env";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Supabase client for the browser (Storage uploads to signed URLs). One per tab. */
export function supabaseBrowser() {
  if (client) return client;
  const env = supabaseEnv();
  if (!env) throw new SupabaseNotConfiguredError();
  client = createBrowserClient(env.url, env.key);
  return client;
}
