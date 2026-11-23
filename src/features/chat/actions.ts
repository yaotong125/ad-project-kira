"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** lejar.ai's renameConversationAction / deleteConversationAction (chunk 01i0bp5d3r49q). */
export async function renameConversationAction(orgSlug: string, id: string, title: string): Promise<{ ok: boolean }> {
  const t = title.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!t) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("chat_conversations").update({ title: t }).eq("id", id);
  revalidatePath(`/${orgSlug}/chat`);
  return { ok: !error };
}

export async function deleteConversationAction(orgSlug: string, id: string): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("chat_conversations").delete().eq("id", id);
  revalidatePath(`/${orgSlug}/chat`);
  return { ok: !error };
}
