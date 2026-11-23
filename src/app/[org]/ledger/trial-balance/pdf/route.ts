import { trialBalancePdf } from "@/features/ledger/pdf";
import { trialBalance } from "@/features/ledger/load";
import { pdfResponse } from "@/features/reports/pdf";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** GET /{slug}/ledger/trial-balance/pdf?periodId= (lejar.ai's link): the trial balance at the period's end. */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const periodId = new URL(request.url).searchParams.get("periodId") ?? "";
  const supabase = await createSupabaseServerClient();
  const { data: o } = await supabase.from("organizations").select("id, legal_name").eq("slug", org).maybeSingle();
  if (!o || !/^[0-9a-f-]{36}$/.test(periodId)) return new Response("Not found", { status: 404 });
  const { data: p } = await supabase.from("accounting_periods").select("ends_on").eq("org_id", o.id).eq("id", periodId).maybeSingle();
  if (!p) return new Response("Not found", { status: 404 });
  const tb = await trialBalance(supabase, o.id, p.ends_on);
  return pdfResponse(await trialBalancePdf(o.legal_name, p.ends_on, tb), `trial-balance-${p.ends_on}.pdf`);
}
