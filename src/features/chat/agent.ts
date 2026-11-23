import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { MODEL } from "@/features/inbox/ai/read-document";
import type { Books } from "./books";

/**
 * Ask Kira's reply loop: Claude Opus 5.5 with read-only tools over the books (lejar.ai's tool names),
 * streamed back as lejar.ai-style events (progress, text_delta, done). Kira cannot change the books
 * from the chat in this slice.
 */
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optDate = date.nullable().optional();

const TOOLS = {
  list_accounts: { description: "List the chart of accounts (code, name, type, whether it is a cash/bank account).", input: z.object({}), run: (b: Books) => b.listAccounts() },
  list_periods: { description: "List the books' start date, financial years and accounting periods with their status.", input: z.object({}), run: (b: Books) => b.listPeriods() },
  get_trial_balance: {
    description: "Trial balance (debit/credit balance of every account with activity) as of a date.",
    input: z.object({ as_of: date }),
    run: (b: Books, i: { as_of: string }) => b.trialBalance(i.as_of),
  },
  get_p_and_l: {
    description: "Profit and loss for a date range: income and expense accounts with totals and net profit.",
    input: z.object({ from: date, to: date }),
    run: (b: Books, i: { from: string; to: string }) => b.profitAndLoss(i.from, i.to),
  },
  get_balance_sheet: {
    description: "Balance sheet as of a date: assets, liabilities, equity, and profit not yet closed to retained earnings.",
    input: z.object({ as_of: date }),
    run: (b: Books, i: { as_of: string }) => b.balanceSheet(i.as_of),
  },
  list_account_activity: {
    description: "Every posting to one account in a date range, with opening and closing balances (debit minus credit).",
    input: z.object({ account_code: z.string(), from: optDate, to: optDate }),
    run: (b: Books, i: { account_code: string; from?: string | null; to?: string | null }) => b.accountActivity(i.account_code, i.from ?? null, i.to ?? null),
  },
  list_journal_entries_for_period: {
    description: "Journal entries (up to 100) in a date range with their lines.",
    input: z.object({ from: date, to: date }),
    run: (b: Books, i: { from: string; to: string }) => b.journalEntries(i.from, i.to),
  },
  list_contacts: {
    description: "Customers and suppliers, optionally filtered by part of the name or by type (customer / supplier).",
    input: z.object({ query: z.string().nullable().optional(), type: z.enum(["customer", "supplier"]).nullable().optional() }),
    run: (b: Books, i: { query?: string | null; type?: string | null }) => b.contacts(i.query ?? null, i.type ?? null),
  },
  list_invoices: {
    description: "Sales invoices (newest first, up to 100). status: draft | open (unpaid) | paid | void. customer: part of the name.",
    input: z.object({ status: z.enum(["draft", "open", "paid", "void"]).nullable().optional(), customer: z.string().nullable().optional() }),
    run: (b: Books, i: { status?: string | null; customer?: string | null }) => b.invoices(i.status ?? null, i.customer ?? null),
  },
  get_invoice: {
    description: "One sales invoice with its lines, by invoice number.",
    input: z.object({ number: z.string() }),
    run: (b: Books, i: { number: string }) => b.invoice(i.number),
  },
  list_bills: {
    description: "Supplier bills (newest first, up to 100). status: draft | open (unpaid) | paid | void. supplier: part of the name.",
    input: z.object({ status: z.enum(["draft", "open", "paid", "void"]).nullable().optional(), supplier: z.string().nullable().optional() }),
    run: (b: Books, i: { status?: string | null; supplier?: string | null }) => b.bills(i.status ?? null, i.supplier ?? null),
  },
  get_bill: {
    description: "One supplier bill with its lines, by bill number.",
    input: z.object({ number: z.string() }),
    run: (b: Books, i: { number: string }) => b.bill(i.number),
  },
  get_sst_02_return: {
    description: "The SST-02 return (sales and service tax owed to Customs) for the taxable period holding a date (default: the current period): output tax by type and rate, the documents behind it and the filing due date.",
    input: z.object({ date: optDate }),
    run: (b: Books, i: { date?: string | null }) => b.sst02Return(i.date ?? null),
  },
} as const;
type ToolName = keyof typeof TOOLS;

const toolDefs: Anthropic.Beta.BetaTool[] = (Object.entries(TOOLS) as [ToolName, (typeof TOOLS)[ToolName]][]).map(([name, t]) => ({
  name,
  description: t.description,
  eager_input_streaming: true,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  input_schema: (({ $schema: _drop, ...schema }) => schema)(z.toJSONSchema(t.input) as Record<string, unknown>) as Anthropic.Beta.BetaTool.InputSchema,
}));

export type TurnEvent =
  | { type: "progress"; stage: "model" | "tool"; tool?: string; afterTools?: boolean }
  | { type: "text_delta"; text: string }
  | { type: "error"; message: string };

function system(org: string, today: string) {
  return `You are Kira, the bookkeeping assistant inside Kira, an accounting app for Malaysian small businesses. You are talking to a member of ${org}. Today is ${today} (Malaysia).

Answer questions about this business's own books. Always use the tools to read the figures; never guess or invent numbers. Amounts are in Malaysian ringgit: write them as RM1,234.50. Be brief and plain: lead with the answer, then the few figures that support it. Use a short table only when it helps. Say which dates you used. If the books do not hold what is needed to answer, say so and say what would need to be recorded. You cannot change the books from this chat; to record something, point the member to the page in Kira (AI Inbox, Invoices, Bills, Bank import, Reconcile, Journal entries). Reply in the language the member writes in (English or Bahasa Melayu).`;
}

/** Runs one reply. `history` holds earlier turns as plain text. */
export async function runTurn(opts: {
  books: Books;
  orgName: string;
  today: string;
  history: { role: "user" | "assistant"; content: string }[];
  question: string;
  signal: AbortSignal;
  emit: (e: TurnEvent) => void;
}): Promise<{ text: string; tools: string[]; status: "complete" | "stopped" | "failed" }> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [...opts.history, { role: "user", content: opts.question }];
  let text = "";
  const used: string[] = [];
  let afterTools = false;
  for (let round = 0; round < 8; round++) {
    opts.emit({ type: "progress", stage: "model", afterTools });
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: system(opts.orgName, opts.today),
        tools: toolDefs,
        messages,
      },
      { signal: opts.signal },
    );
    let roundText = "";
    stream.on("text", (delta) => {
      if (!roundText && text) {
        text += "\n\n";
        opts.emit({ type: "text_delta", text: "\n\n" });
      }
      roundText += delta;
      text += delta;
      opts.emit({ type: "text_delta", text: delta });
    });
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
    } catch (error) {
      if (opts.signal.aborted) return { text, tools: used, status: "stopped" };
      throw error;
    }
    if (message.stop_reason === "refusal") return { text: text || "Kira declined to answer this.", tools: used, status: "failed" };
    const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || calls.length === 0) return { text, tools: used, status: "complete" };
    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const tool = TOOLS[call.name as ToolName];
      opts.emit({ type: "progress", stage: "tool", tool: call.name });
      if (!tool) {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Unknown tool ${call.name}` });
        continue;
      }
      const parsed = tool.input.safeParse(call.input);
      if (!parsed.success) {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: JSON.stringify({ INVALID_INPUT: parsed.error.issues.map((i) => i.message) }) });
        continue;
      }
      used.push(call.name);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const out = await (tool.run as (b: Books, i: any) => Promise<unknown>)(opts.books, parsed.data);
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out).slice(0, 100_000) });
      } catch {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Reading the books failed." });
      }
    }
    messages.push({ role: "user", content: results });
    afterTools = true;
  }
  return { text: text || "Kira could not finish this reply.", tools: used, status: text ? "complete" : "failed" };
}
