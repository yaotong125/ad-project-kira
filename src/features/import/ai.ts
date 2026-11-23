import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AiNotConfiguredError, AiReadError, MODEL, type ChartAccount } from "@/features/inbox/ai/read-document";

/**
 * Claude for bank statements: reading PDF / photo statements into lines (lejar.ai reads scans with AI
 * and gates them; Kira reads every PDF this way), and suggesting a category for each line
 * (lejar.ai's categoriseChunkAction).
 */
const ReadStatement = z.object({
  readable: z.boolean().describe("false when the statement cannot be read reliably (blurred, cut off, not a bank statement)."),
  problem: z.string().nullable().describe("When not readable: why, in one sentence."),
  bank: z.string().nullable().describe("The bank's name as printed."),
  period_start: z.string().nullable().describe("YYYY-MM-DD"),
  period_end: z.string().nullable().describe("YYYY-MM-DD"),
  opening_balance: z.number().nullable(),
  closing_balance: z.number().nullable(),
  lines: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD"),
      description: z.string().describe("The transaction text as printed, joined into one line."),
      reference: z.string().nullable(),
      amount: z.number().describe("Positive amount of the transaction."),
      direction: z.enum(["in", "out"]).describe("in = deposit / credit to the account; out = withdrawal / debit."),
      balance: z.number().nullable().describe("Running balance after this line, if printed."),
    }),
  ),
});
export type StatementReading = z.infer<typeof ReadStatement>;

const Categories = z.object({
  lines: z.array(
    z.object({
      position: z.number(),
      account_code: z.string().describe("A code from the chart given, or an empty string when unsure."),
      confidence: z.number().describe("0 to 1."),
      reasoning: z.string().describe("One short sentence."),
    }),
  ),
});

function client() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new AiNotConfiguredError("ANTHROPIC_API_KEY is not set");
  return new Anthropic();
}

async function ask<T>(params: Parameters<Anthropic["beta"]["messages"]["parse"]>[0]): Promise<T> {
  let response;
  try {
    response = await client().beta.messages.parse(params);
  } catch (error) {
    if (error instanceof AiNotConfiguredError) throw error;
    if (error instanceof Anthropic.AuthenticationError) throw new AiNotConfiguredError("The Anthropic API key was refused");
    if (error instanceof Anthropic.RateLimitError) throw new AiReadError("The AI is busy right now. Try again in a minute.");
    if (error instanceof Anthropic.APIError) throw new AiReadError("The AI could not read this right now. Try again.");
    throw new AiReadError("Could not reach the AI. Check the connection and try again.");
  }
  if (response.stop_reason === "refusal") throw new AiReadError("The AI declined to read this statement.");
  if (response.stop_reason === "max_tokens") {
    throw new AiReadError("This scan has too many rows to read in one go. Upload it a few pages at a time, or use the bank-generated PDF e-statement or a CSV export.");
  }
  if (!response.parsed_output) throw new AiReadError("The AI could not read this statement. Try again.");
  return response.parsed_output as T;
}

export async function readStatement(bytes: Buffer, contentType: string): Promise<StatementReading> {
  const data = bytes.toString("base64");
  const block =
    contentType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: contentType as "image/png" | "image/jpeg" | "image/webp", data } } as const);
  return ask<StatementReading>({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ReadStatement) },
    system:
      "You read Malaysian bank statements into transaction lines for bookkeeping. Copy every transaction line exactly: date, description, amount and direction (deposit = in, withdrawal = out), and the running balance when printed. Skip opening/closing balance rows, page headers and totals. Never invent or merge lines. If any line cannot be read clearly, set readable to false.",
    messages: [{ role: "user", content: [block, { type: "text", text: "Read this bank statement." }] }],
  });
}

export async function categoriseLines(
  orgName: string,
  chart: ChartAccount[],
  lines: { position: number; date: string; description: string; amount: string; direction: "in" | "out" }[],
): Promise<{ position: number; accountCode: string; confidence: number; reasoning: string }[]> {
  const accounts = chart
    .filter((a) => !a.is_cash && ["expense", "revenue", "asset", "liability", "equity"].includes(a.type))
    .map((a) => `${a.code} ${a.name} (${a.type})`)
    .join("\n");
  const out = await ask<z.infer<typeof Categories>>({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Categories) },
    system: `You categorise bank statement lines for ${orgName}, a Malaysian business. For each line pick the account on the other side of the bank entry from this chart (never a cash or bank account), give a confidence from 0 to 1 and one short reason. Money in is usually revenue, a customer receipt or a loan; money out is usually an expense, a supplier payment, a director withdrawal or a loan repayment. Use an empty account_code when you cannot tell.\n${accounts}`,
    messages: [{ role: "user", content: JSON.stringify(lines) }],
  });
  return out.lines.map((l) => ({ position: l.position, accountCode: l.account_code, confidence: l.confidence, reasoning: l.reasoning }));
}
