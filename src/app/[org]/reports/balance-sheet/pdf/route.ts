import { flattenBs } from "@/features/reports/flatten";
import { dmy, reportContext } from "@/features/reports/params";
import { pdfResponse, statementPdf } from "@/features/reports/pdf";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** GET /{slug}/reports/balance-sheet/pdf?asOf (lejar.ai's link). */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const q = Object.fromEntries(new URL(request.url).searchParams);
  const ctx = await reportContext(await createSupabaseServerClient(), org, q);
  if (!ctx) return new Response("Not found", { status: 404 });
  const bytes = await statementPdf(ctx.org.legal_name, [{ title: "Balance sheet", period: `as of ${dmy(ctx.asOf)} - net assets / financed by`, lines: flattenBs(ctx.ledger.balanceSheet(ctx.asOf)) }]);
  return pdfResponse(bytes, `balance-sheet-${ctx.asOf}.pdf`);
}
