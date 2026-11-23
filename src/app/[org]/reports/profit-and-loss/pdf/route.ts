import { flattenPnl } from "@/features/reports/flatten";
import { dmy, reportContext } from "@/features/reports/params";
import { pdfResponse, statementPdf } from "@/features/reports/pdf";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** GET /{slug}/reports/profit-and-loss/pdf?from&to&compare (lejar.ai's link). */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const q = Object.fromEntries(new URL(request.url).searchParams);
  const ctx = await reportContext(await createSupabaseServerClient(), org, q);
  if (!ctx) return new Response("Not found", { status: 404 });
  const p = ctx.ledger.profitAndLoss(ctx.from, ctx.to, ctx.range ?? undefined);
  const bytes = await statementPdf(ctx.org.legal_name, [
    { title: "Profit & loss", period: `${dmy(ctx.from)} -> ${dmy(ctx.to)}`, lines: flattenPnl(p), compareLabel: ctx.range ? `${dmy(ctx.range.from)} -> ${dmy(ctx.range.to)}` : undefined },
  ]);
  return pdfResponse(bytes, `profit-and-loss-${ctx.from}-${ctx.to}.pdf`);
}
