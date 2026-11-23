import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { todayMY } from "@/features/books/load";
import { runTurn, type TurnEvent } from "@/features/chat/agent";
import { Books } from "@/features/chat/books";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * POST /api/assistant/turn (lejar.ai's endpoint name): {orgSlug, conversationId, create?, text}.
 * Streams newline-delimited JSON events {type, runId, seq, …}: message_saved (member), progress,
 * text_delta, message_saved (assistant), done | error. Aborting the request stops the reply.
 */
export const maxDuration = 300;
const MAX_CHARS = 4000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const conversationId = typeof body?.conversationId === "string" && /^[0-9a-f-]{36}$/.test(body.conversationId) ? body.conversationId : null;
  if (!text || text.length > MAX_CHARS || !conversationId) return Response.json({ error: "invalid" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return Response.json({ error: "signed_out" }, { status: 401 });
  const { data: org } = await supabase.from("organizations").select("id, slug, legal_name").eq("slug", String(body?.orgSlug ?? "")).maybeSingle();
  if (!org) return Response.json({ error: "not_found" }, { status: 404 });

  if (body?.create === true) {
    const { error } = await supabase.from("chat_conversations").insert({ id: conversationId, org_id: org.id, user_id: userId, title: text.replace(/\s+/g, " ").slice(0, 80) });
    if (error && error.code !== "23505") return Response.json({ error: "create_failed" }, { status: 500 });
  }
  const { data: conv } = await supabase.from("chat_conversations").select("id").eq("id", conversationId).eq("org_id", org.id).maybeSingle();
  if (!conv) return Response.json({ error: "not_found" }, { status: 404 });

  const { data: earlier } = await supabase
    .from("chat_messages")
    .select("role, content, status")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);
  const history = (earlier ?? [])
    .reverse()
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role === "member" ? ("user" as const) : ("assistant" as const), content: m.content }));
  // The API needs alternating turns starting with the member.
  while (history.length && history[0].role !== "user") history.shift();

  const { data: memberMsg } = await supabase.from("chat_messages").insert({ conversation_id: conversationId, org_id: org.id, role: "member", content: text }).select("id").single();

  const runId = randomUUID();
  let seq = 0;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ ...e, runId, seq: ++seq }) + "\n"));
        } catch {
          // The client went away; keep going so the reply is still saved.
        }
      };
      send({ type: "message_saved", role: "member", conversationId, messageId: memberMsg?.id ?? null, text });
      let result: Awaited<ReturnType<typeof runTurn>>;
      try {
        if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new Error("not_configured");
        result = await runTurn({
          books: new Books(supabase, org.id, org.slug),
          orgName: org.legal_name,
          today: todayMY(),
          history,
          question: text,
          signal: request.signal,
          emit: (e: TurnEvent) => send(e),
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message === "not_configured"
            ? "The AI is not set up for this Kira yet: add ANTHROPIC_API_KEY to .env.local and restart the server."
            : error instanceof Anthropic.RateLimitError
              ? "The AI is busy right now. Try again in a minute."
              : "Kira could not finish this reply.";
        if (!(error instanceof Error && error.message === "not_configured")) console.error("[chat] turn failed:", error);
        result = { text: "", tools: [], status: "failed" };
        send({ type: "error", message });
      }
      const { data: saved } = await supabase
        .from("chat_messages")
        .insert({ conversation_id: conversationId, org_id: org.id, role: "assistant", content: result.text, status: result.status, tools: result.tools })
        .select("id")
        .single();
      await supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      if (result.status === "complete" && result.text) await supabase.rpc("check_ask_section", { p_org: org.id });
      send({ type: "message_saved", role: "assistant", conversationId, messageId: saved?.id ?? null });
      send({ type: "done", messageId: saved?.id ?? null, status: result.status === "complete" ? "done" : result.status });
      try {
        controller.close();
      } catch {}
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
