import { todayMY } from "@/features/books/load";
import { ComingSoon } from "@/features/coming-soon/coming-soon";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { ChatShell, type ChatMessage } from "./chat-shell";
import { CHAT_TEXT } from "./copy-data";

/** "Good afternoon, Ganyaotong." lejar.ai greets by the time of day and the email's first part. */
function greetingFor(lang: "en" | "ms", email: string, org: string) {
  const hour = (new Date().getUTCHours() + 8) % 24;
  const part = lang === "ms" ? (hour < 12 ? "Selamat pagi" : hour < 19 ? "Selamat petang" : "Selamat malam") : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const local = email.split("@")[0]?.split(/[._+-]/)[0] ?? "";
  const name = local ? local[0].toUpperCase() + local.slice(1) : "";
  const tpl: string = name ? CHAT_TEXT["chat.greeting"][lang] : CHAT_TEXT["chat.greeting.noName"][lang];
  return tpl.replace("{greeting}", part).replace("{name}", name).replace("{org}", org);
}

/** /{slug}/chat and /{slug}/chat/{id}: Ask Kira. */
export async function ChatPage({ slug, conversationId }: { slug: string; conversationId: string | null }) {
  const ctx = await loadOrgContext(slug);
  if (conversationId === "knows" || conversationId === "new") {
    if (conversationId === "knows") return <ComingSoon slug={ctx.org.slug} path="chat" lang={ctx.lang} />;
    conversationId = null;
  }
  const supabase = await createSupabaseServerClient();
  const { data: list } = await supabase.from("chat_conversations").select("id, title, updated_at").eq("org_id", ctx.org.id).order("updated_at", { ascending: false }).limit(100);
  let messages: ChatMessage[] = [];
  let title: string | null = null;
  if (conversationId) {
    if (!/^[0-9a-f-]{36}$/.test(conversationId)) conversationId = null;
    else {
      const [{ data: conv }, { data: rows }] = await Promise.all([
        supabase.from("chat_conversations").select("id, title").eq("id", conversationId).maybeSingle(),
        supabase.from("chat_messages").select("id, role, content, status").eq("conversation_id", conversationId).order("created_at"),
      ]);
      if (!conv) conversationId = null;
      else {
        title = conv.title;
        messages = (rows ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, status: m.status, ...(m.status === "failed" && !m.content ? { error: "Kira could not finish this reply." } : {}) }));
      }
    }
  }
  return (
    <ChatShell
      key={conversationId ?? "new"}
      orgSlug={ctx.org.slug}
      orgName={ctx.org.legal_name}
      lang={ctx.lang}
      greeting={greetingFor(ctx.lang, ctx.email, ctx.org.legal_name)}
      today={todayMY()}
      conversationId={conversationId}
      title={title}
      initialMessages={messages}
      conversations={(list ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }))}
    />
  );
}
