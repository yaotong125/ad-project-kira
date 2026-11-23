import { flattenBs, flattenCf, flattenPnl } from "@/features/reports/flatten";
import { dmy, reportContext } from "@/features/reports/params";
import { pdfResponse, statementPdf } from "@/features/reports/pdf";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * GET /{slug}/reports/year-end-pack?asOf (lejar.ai's "Download year-end pack"): the three statements for
 * the financial year up to asOf in one PDF for the accountant.
 */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const asOf = new URL(request.url).searchParams.get("asOf") ?? undefined;
  const ctx = await reportContext(await createSupabaseServerClient(), org, { asOf, to: asOf });
  if (!ctx) return new Response("Not found", { status: 404 });
  const from = ctx.fy?.starts_on ?? ctx.from;
  const period = `${dmy(from)} -> ${dmy(ctx.asOf)}`;
  const bytes = await statementPdf(ctx.org.legal_name, [
    { title: "Profit & loss", period, lines: flattenPnl(ctx.ledger.profitAndLoss(from, ctx.asOf)) },
    { title: "Balance sheet", period: `as of ${dmy(ctx.asOf)}`, lines: flattenBs(ctx.ledger.balanceSheet(ctx.asOf)) },
    { title: "Cash flow", period: `${period} - direct method`, lines: flattenCf(ctx.ledger.cashFlow(from, ctx.asOf)) },
  ]);
  return pdfResponse(bytes, `year-end-pack-${ctx.asOf}.pdf`);
}
