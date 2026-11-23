"use client";

import { ArrowUp, Lightbulb, MessageSquarePlus, PanelLeft, Search, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Lang } from "@/shared/i18n";
import { cn } from "@/shared/ui/cn";
import { deleteConversationAction } from "./actions";
import { CHAT_TEXT, type ChatTextKey } from "./copy-data";

export type ChatMessage = { id: string; role: "member" | "assistant"; content: string; status: "sending" | "streaming" | "complete" | "stopped" | "failed"; error?: string };
export type ConversationItem = { id: string; title: string; updatedAt: string };
type Progress = { stage: "model" | "tool"; tool?: string; afterTools?: boolean } | null;

const MAX = 4000;
const STARTS = [
  ["chat.start.snap", "/inbox"],
  ["chat.start.statement", "/import"],
  ["chat.start.invoice", "/invoices?new=1"],
] as const;

function ct(lang: Lang, key: ChatTextKey, vars?: Record<string, string | number>): string {
  const s: string = CHAT_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Markdown answers, styled with Kira's tokens (tables, lists, bold, code). */
function Answer({ text }: { text: string }) {
  return (
    <div className="text-[14.5px] leading-[1.6] text-ink [&_a]:text-brand [&_a]:underline [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:text-[13px] [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-[var(--radius-lg)] border border-border">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          th: ({ children, style }) => <th style={style} className="border-b border-border bg-surface px-3 py-1.5 text-left text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted">{children}</th>,
          td: ({ children, style }) => <td style={style} className="num-sans border-b border-border px-3 py-1.5 text-ink-2">{children}</td>,
          a: ({ href, children }) => <Link href={href ?? "#"}>{children}</Link>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function groupLabel(lang: Lang, iso: string, today: string) {
  const d = iso.slice(0, 10);
  const days = Math.round((Date.parse(today) - Date.parse(d)) / 86400000);
  if (days <= 0) return ct(lang, "chat.list.today");
  if (days === 1) return ct(lang, "chat.list.yesterday");
  if (days <= 7) return ct(lang, "chat.list.previous7");
  return d.slice(0, 7);
}

/**
 * lejar.ai's ChatShell (chunk 2izis602kd9nz, observed 2026-11-22): header "{entity} / {title}", the
 * conversation rail (New conversation, Search conversations, What Kira knows, list by day), greeting
 * with starter buttons, messages, and the composer. Replies stream from /api/assistant/turn as
 * newline-delimited JSON events. Files, proposals, citations and usage limits are not in this slice.
 */
export function ChatShell({
  orgSlug,
  orgName,
  lang,
  greeting,
  today,
  conversationId: initialId,
  title: initialTitle,
  initialMessages,
  conversations: initialConversations,
}: {
  orgSlug: string;
  orgName: string;
  lang: Lang;
  greeting: string;
  today: string;
  conversationId: string | null;
  title: string | null;
  initialMessages: ChatMessage[];
  conversations: ConversationItem[];
}) {
  const t = (k: ChatTextKey, v?: Record<string, string | number>) => ct(lang, k, v);
  const router = useRouter();
  const base = `/${orgSlug}`;
  const [conversationId, setConversationId] = useState(initialId);
  const [title, setTitle] = useState(initialTitle);
  const [messages, setMessages] = useState(initialMessages);
  const [conversations, setConversations] = useState(initialConversations);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const [query, setQuery] = useState("");
  const [railOpen, setRailOpen] = useState(true);
  const [status, setStatus] = useState("");
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, progress]);

  const filtered = useMemo(() => conversations.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase())), [conversations, query]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy || q.length > MAX) return;
    let id = conversationId;
    const create = id === null;
    if (create) id = crypto.randomUUID();
    const replyKey = `reply-${Date.now()}`;
    setMessages((m) => [...m, { id: `me-${Date.now()}`, role: "member", content: q, status: "sending" }, { id: replyKey, role: "assistant", content: "", status: "streaming" }]);
    setDraft("");
    setBusy(true);
    setProgress({ stage: "model" });
    setStatus(t("chat.turn.sending"));
    const ctrl = new AbortController();
    abort.current = ctrl;
    const patchReply = (p: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) =>
      setMessages((ms) => ms.map((m) => (m.id === replyKey ? { ...m, ...(typeof p === "function" ? p(m) : p) } : m)));
    try {
      const res = await fetch("/api/assistant/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgSlug, conversationId: id, create, text: q }),
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok || !res.body) throw new Error("send");
      if (create) {
        setConversationId(id);
        const newTitle = q.replace(/\s+/g, " ").slice(0, 80);
        setTitle(newTitle);
        setConversations((cs) => [{ id: id!, title: newTitle, updatedAt: new Date().toISOString() }, ...cs]);
        // Keep this component mounted: change the address without a navigation (lejar.ai's ReplaceUrl).
        window.history.replaceState(null, "", `${base}/chat/${id}`);
      }
      setMessages((ms) => ms.map((m) => (m.status === "sending" ? { ...m, status: "complete" } : m)));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: { type: string; [k: string]: unknown };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "progress") {
            setProgress({ stage: ev.stage as "model" | "tool", tool: ev.tool as string | undefined, afterTools: ev.afterTools as boolean | undefined });
          } else if (ev.type === "text_delta") {
            patchReply((m) => ({ content: m.content + String(ev.text) }));
          } else if (ev.type === "error") {
            patchReply({ status: "failed", error: String(ev.message) });
          } else if (ev.type === "done") {
            const st = ev.status === "done" ? "complete" : (ev.status as ChatMessage["status"]);
            patchReply((m) => ({ id: (ev.messageId as string) ?? m.id, status: m.status === "failed" ? "failed" : st }));
            setStatus(lang === "ms" ? "Jawapan sedia." : "Reply ready.");
          }
        }
      }
    } catch {
      if (ctrl.signal.aborted) patchReply({ status: "stopped" });
      else {
        setMessages((ms) => ms.map((m) => (m.status === "sending" ? { ...m, status: "failed", error: t("chat.turn.notSent") } : m)));
        patchReply({ status: "failed", error: t("chat.turn.failed") });
      }
    } finally {
      setBusy(false);
      setProgress(null);
      abort.current = null;
      router.refresh();
    }
  };

  const progressText = (() => {
    if (!progress) return "";
    if (progress.stage === "tool" && progress.tool) {
      const key = `chat.turn.tool.${progress.tool}` as ChatTextKey;
      return key in CHAT_TEXT ? t("chat.turn.progress.reading", { what: t(key) }) : t("chat.turn.progress.records");
    }
    return progress.afterTools ? t("chat.turn.progress.answer") : t("chat.turn.progress.thinking");
  })();

  const groups: [string, ConversationItem[]][] = [];
  for (const c of filtered) {
    const g = groupLabel(lang, c.updatedAt, today);
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(c);
    else groups.push([g, [c]]);
  }

  return (
    <div data-testid="chat-shell" className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
      <header data-testid="chat-header" lang={lang} className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-bg px-1 sm:px-2">
        <span className="relative hidden lg:inline-flex">
          <button
            type="button"
            aria-label={railOpen ? t("chat.sidebar.hide") : t("chat.sidebar.show")}
            aria-pressed={railOpen}
            onClick={() => setRailOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <PanelLeft size={16} />
          </button>
        </span>
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5 px-1">
          <span className="max-w-[45%] shrink-0 truncate text-[12.5px] text-muted">{orgName}</span>
          <span aria-hidden="true" className="shrink-0 text-[12.5px] text-muted">
            /
          </span>
          <h1 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{title ?? t("chat.sidebar.new")}</h1>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {railOpen && (
          <aside data-testid="chat-sidebar" aria-label={t("chat.sidebar.ariaLabel")} className="hidden w-[260px] shrink-0 border-r border-border bg-bg lg:block">
            <div lang={lang} className="flex h-full min-h-0 flex-col gap-2 px-3 pb-3 pt-3">
              <div className="flex flex-col gap-px">
                <a className="flex h-9 items-center gap-2 rounded-[var(--radius)] px-2 text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-ink" href={`${base}/chat`}>
                  <MessageSquarePlus size={15} aria-hidden="true" />
                  <span className="flex-1 truncate">{t("chat.sidebar.new")}</span>
                </a>
                <label className="flex h-9 items-center gap-2 rounded-[var(--radius)] px-2 text-[12.5px] text-ink-2 focus-within:bg-surface-2">
                  <Search size={15} aria-hidden="true" />
                  <input type="search" aria-label={t("chat.sidebar.search")} placeholder={t("chat.sidebar.search")} value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-2" />
                </label>
                <Link className="flex h-9 items-center gap-2 rounded-[var(--radius)] px-2 text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-ink" href={`${base}/chat/knows`}>
                  <Lightbulb size={15} aria-hidden="true" />
                  <span className="flex-1 truncate">{t("chat.sidebar.knows")}</span>
                </Link>
              </div>
              <nav data-testid="conversation-list" aria-label={t("chat.sidebar.listLabel")} className="scroll min-h-0 flex-1 overflow-y-auto pr-0.5">
                {filtered.length === 0 ? (
                  <p className="px-2 py-2 text-[12px] text-muted">{conversations.length === 0 ? t("chat.sidebar.empty") : t("chat.sidebar.noMatch")}</p>
                ) : (
                  groups.map(([label, items]) => (
                    <div key={label} className="mb-2">
                      <p className="px-2 pb-1 pt-2 text-[11.5px] font-medium text-muted">{label}</p>
                      {items.map((c) => (
                        <div key={c.id} className={cn("group flex items-center rounded-[var(--radius)] hover:bg-surface-2", c.id === conversationId && "bg-surface-2")}>
                          <a href={`${base}/chat/${c.id}`} className="min-w-0 flex-1 truncate px-2 py-1.5 text-[12.5px] text-ink-2 hover:text-ink">
                            {c.title}
                          </a>
                          <button
                            type="button"
                            aria-label={`Delete ${c.title}`}
                            className="mr-1 hidden h-7 w-7 items-center justify-center rounded text-muted hover:text-negative group-hover:flex"
                            onClick={async () => {
                              const r = await deleteConversationAction(orgSlug, c.id);
                              if (!r.ok) return;
                              setConversations((cs) => cs.filter((x) => x.id !== c.id));
                              if (c.id === conversationId) router.push(`${base}/chat`);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </nav>
            </div>
          </aside>
        )}
        <main id="main-content" tabIndex={-1} className="scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-bg outline-none">
          <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-4 py-5">
            <div lang={lang} className="flex flex-1 flex-col">
              <p data-testid="turn-status" role="status" aria-live="polite" aria-atomic="true" className="sr-only">
                {status}
              </p>
              {messages.length === 0 ? (
                <div className="flex flex-1 flex-col justify-center py-8">
                  <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                    <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-ai" />
                    Kira
                  </p>
                  <p data-testid="chat-greeting" className="mt-2 text-[15px] leading-[1.5] text-ink">
                    {greeting}
                  </p>
                  <div data-testid="greeting-starts" className="mt-5 flex flex-wrap gap-2">
                    {STARTS.map(([key, path]) => (
                      <Link key={key} href={`${base}${path}`} className="rounded-[var(--radius)] border border-border-strong bg-surface px-3.5 py-2 text-[13.5px] font-medium text-ink shadow-[var(--shadow-xs)] hover:bg-surface-2">
                        {t(key)}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-6 py-4">
                  {messages.map((m) =>
                    m.role === "member" ? (
                      <div key={m.id} className="flex flex-col items-end gap-1">
                        <div className="max-w-[85%] whitespace-pre-wrap rounded-[14px] bg-surface-2 px-3.5 py-2.5 text-[14.5px] leading-[1.55] text-ink">{m.content}</div>
                        {m.status === "failed" && <span className="text-[12px] text-negative">{m.error}</span>}
                      </div>
                    ) : (
                      <div key={m.id} data-testid="assistant-message" className="flex flex-col gap-1">
                        <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-ai" />
                          Kira
                        </p>
                        {m.content && <Answer text={m.content} />}
                        {m.status === "streaming" && progress && !m.content && (
                          <p className="flex items-center gap-2 text-[13px] text-muted">
                            <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-ai/30 border-t-ai" />
                            {progressText}
                          </p>
                        )}
                        {m.status === "streaming" && progress && m.content && progress.stage === "tool" && <p className="text-[12.5px] text-muted">{progressText}</p>}
                        {m.status === "stopped" && <p className="text-[12.5px] text-muted">{t("chat.turn.stopped")}</p>}
                        {m.status === "failed" && <p className="text-[13px] text-negative">{m.error ?? t("chat.turn.failed")}</p>}
                      </div>
                    ),
                  )}
                  <div ref={bottom} />
                </div>
              )}
              <div data-testid="composer-dock" className="sticky bottom-0 z-20 bg-bg">
                <div className="pb-2 pt-2" data-flow="ask-lejar">
                  <div data-testid="composer-field" className="rounded-[16px] border border-border-strong bg-surface p-2 shadow-[var(--shadow-sm)] focus-within:border-ai focus-within:ring-[3px] focus-within:ring-ai-soft">
                    <div className="flex items-end gap-2">
                      <textarea
                        ref={box}
                        rows={1}
                        placeholder={t("chat.composer.placeholder")}
                        aria-label={t("chat.composer.placeholder")}
                        value={draft}
                        maxLength={MAX + 1}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          e.target.style.height = "44px";
                          e.target.style.height = `${Math.min(216, e.target.scrollHeight)}px`;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void send(draft);
                          }
                        }}
                        style={{ maxHeight: 216, height: 44 }}
                        className="block min-h-[44px] w-full resize-none bg-transparent px-2 py-2.5 text-[16px] leading-[1.5] text-ink outline-none placeholder:text-muted"
                      />
                      {busy ? (
                        <button type="button" aria-label={t("chat.turn.stop")} onClick={() => abort.current?.abort()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white hover:brightness-125">
                          <Square size={14} fill="currentColor" />
                        </button>
                      ) : (
                        <button type="button" data-testid="composer-send" aria-label={t("chat.turn.send")} disabled={!draft.trim() || draft.length > MAX} onClick={() => void send(draft)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ai text-white hover:bg-ai-2 disabled:cursor-not-allowed disabled:opacity-50">
                          <ArrowUp size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                  {draft.length > MAX && <p className="mt-1.5 px-2 text-[12px] text-negative">{t("chat.composer.tooLong", { max: MAX })}</p>}
                  <p data-testid="composer-ai-disclosure" className="mt-1.5 px-2 text-[11.5px] text-muted">
                    {t("chat.composer.aiDisclosure")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
