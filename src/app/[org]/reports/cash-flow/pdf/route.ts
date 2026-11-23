import { flattenCf } from "@/features/reports/flatten";
import { dmy, reportContext } from "@/features/reports/params";
import { pdfResponse, statementPdf } from "@/features/reports/pdf";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** GET /{slug}/reports/cash-flow/pdf?from&to (lejar.ai's link). */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const q = Object.fromEntries(new URL(request.url).searchParams);
  const ctx = await reportContext(await createSupabaseServerClient(), org, q);
  if (!ctx) return new Response("Not found", { status: 404 });
  const bytes = await statementPdf(ctx.org.legal_name, [{ title: "Cash flow", period: `${dmy(ctx.from)} -> ${dmy(ctx.to)} - direct method`, lines: flattenCf(ctx.ledger.cashFlow(ctx.from, ctx.to)) }]);
  return pdfResponse(bytes, `cash-flow-${ctx.from}-${ctx.to}.pdf`);
}
