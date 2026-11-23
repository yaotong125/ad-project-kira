import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AllowedType } from "../limits";

/**
 * Reads one business document with Claude and returns a structured draft. lejar.ai's server-side
 * prompt is not visible; the output fields mirror what its analyze action returns (draft type,
 * summary, confidence, document date) plus the lines its review forms are pre-filled with.
 */
export const MODEL = "claude-opus-5-5";

const TAX_CODES = ["none", "sst_6", "sst_8", "sales_5", "sales_10", "exempt"] as const;

export const DocumentReading = z.object({
  kind: z
    .enum(["bill", "payment", "invoice", "journal", "not_accounting"])
    .describe(
      "bill: a supplier bill or invoice this business must still pay. payment: proof of money this business already paid for goods or services (till or cash receipt, paid receipt, payment voucher, transfer slip). invoice: a sales invoice issued BY this business to its customer. journal: another accounting record that needs a journal entry. not_accounting: not a document for the books.",
    ),
  document_type: z.string().describe("Short name of the document, e.g. 'Tax invoice', 'Cash receipt'."),
  summary: z
    .string()
    .describe("One sentence for the inbox list: what it is, from whom, the total in RM, and whether it is paid."),
  confidence: z.number().describe("0 to 1: how sure you are about the kind and the amounts together."),
  document_date: z.string().nullable().describe("Date printed on the document, YYYY-MM-DD."),
  due_date: z.string().nullable().describe("Payment due date if printed or stated by terms, YYYY-MM-DD."),
  document_number: z.string().nullable().describe("The supplier's invoice / receipt number."),
  counterparty: z
    .object({
      name: z.string(),
      tin: z.string().nullable(),
      registration_number: z.string().nullable(),
    })
    .nullable()
    .describe("The supplier (for bills and payments) or customer (for sales invoices)."),
  currency: z.string().describe("ISO currency code, e.g. MYR."),
  lines: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number(),
        unit_price: z.number().describe("Price per unit before tax, in the document currency."),
        tax_code: z.enum(TAX_CODES),
        account_code: z.string().describe("Code from the chart of accounts given to you."),
      }),
    )
    .describe("One line per item printed. If the document shows only a total, use one line."),
  tax_total: z.number().describe("Total tax printed on the document, 0 if none."),
  total: z.number().describe("Grand total printed on the document."),
  paid_from_account_code: z
    .string()
    .nullable()
    .describe("For payments: the cash or bank account code it was paid from, from the cash accounts given to you."),
  not_accounting_reason: z.string().nullable().describe("For not_accounting: what the document is instead."),
});
export type DocumentReading = z.infer<typeof DocumentReading>;

export type ChartAccount = { code: string; name: string; type: string; is_cash: boolean };

export class AiNotConfiguredError extends Error {}
export class AiReadError extends Error {}

function systemPrompt(orgName: string, entityType: string, chart: ChartAccount[]) {
  const lines = chart
    .filter((a) => ["expense", "asset", "liability", "revenue"].includes(a.type) && !a.is_cash)
    .map((a) => `${a.code} ${a.name} (${a.type})`)
    .join("\n");
  const cash = chart
    .filter((a) => a.is_cash)
    .map((a) => `${a.code} ${a.name}`)
    .join("\n");
  return `You read business documents for the bookkeeping of ${orgName}, a Malaysian ${entityType.replace("_", " ")}.
You get one document (a photo or PDF) and return the transaction it supports, for a person to check before anything is recorded.

Rules:
- Copy amounts, dates, names and numbers exactly as printed. Do not invent anything that is not on the document; use null when a field is absent.
- Amounts are numbers in the document currency (no currency symbols, no thousands separators). Line unit prices are before tax.
- Tax codes: sst_6 / sst_8 for Malaysian Service Tax at 6% / 8%, sales_5 / sales_10 for Sales Tax at 5% / 10%, exempt when the document says exempt, otherwise none. Only use a tax code when the document charges that tax.
- Pick each line's account_code from this chart of accounts. Prefer the most specific account (for example office supplies over a heading such as Operating Expenses). Use 700-0000 Cost of Sales only for goods bought for resale or production.
${lines}
- Cash and bank accounts (for paid_from_account_code only):
${cash}
- Confidence reflects whether the document is clear and the lines add up to the printed total.`;
}

/** Calls Claude once. Throws AiNotConfiguredError without an API key, AiReadError when no draft can be made. */
export async function readDocument(input: {
  bytes: Buffer;
  contentType: AllowedType;
  orgName: string;
  entityType: string;
  chart: ChartAccount[];
  userNote: string | null;
}): Promise<{ reading: DocumentReading; model: string }> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new AiNotConfiguredError("ANTHROPIC_API_KEY is not set");
  }
  const client = new Anthropic();
  const data = input.bytes.toString("base64");
  const documentBlock =
    input.contentType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: input.contentType, data } } as const);
  const ask = input.userNote
    ? `Read this document. The person who uploaded it says: "${input.userNote}"`
    : "Read this document.";

  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(DocumentReading) },
      system: systemPrompt(input.orgName, input.entityType, input.chart),
      messages: [{ role: "user", content: [documentBlock, { type: "text", text: ask }] }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new AiNotConfiguredError("The Anthropic API key was refused");
    if (error instanceof Anthropic.RateLimitError) throw new AiReadError("The AI is busy right now. Try again in a minute.");
    if (error instanceof Anthropic.BadRequestError) throw new AiReadError("The AI could not open this file. Save it again as a PDF, JPG or PNG and upload it.");
    if (error instanceof Anthropic.APIError) throw new AiReadError("The AI could not read this document right now. Try again.");
    throw new AiReadError("Could not reach the AI. Check the connection and try again.");
  }
  if (response.stop_reason === "refusal") throw new AiReadError("The AI declined to read this document.");
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new AiReadError("The AI could not finish reading this document. Try again.");
  }
  return { reading: response.parsed_output, model: response.model };
}
