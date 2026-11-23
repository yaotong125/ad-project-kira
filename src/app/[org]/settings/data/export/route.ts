import { createSupabaseServerClient } from "@/shared/supabase/server";

/** GET /{slug}/settings/data/export: full JSON export for owners and admins. */
export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { data: orgRow } = await supabase.from("organizations").select("*").eq("slug", org).maybeSingle();
  if (!orgRow) return new Response("Not found", { status: 404 });

  const { data: mem } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgRow.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!mem || (mem.role !== "owner" && mem.role !== "admin")) {
    return new Response("Forbidden", { status: 403 });
  }

  const [accounts, contacts, invoices, bills, journals, assets, prepaids, stockItems, myinvois, activity] =
    await Promise.all([
      supabase.from("accounts").select("*").eq("org_id", orgRow.id).order("code"),
      supabase.from("contacts").select("*").eq("org_id", orgRow.id).order("name"),
      supabase.from("invoices").select("*, invoice_lines(*)").eq("org_id", orgRow.id).order("invoice_date"),
      supabase.from("bills").select("*, bill_lines(*)").eq("org_id", orgRow.id).order("bill_date"),
      supabase.from("journal_entries").select("*, journal_lines(*)").eq("org_id", orgRow.id).order("occurred_on"),
      supabase.from("fixed_assets").select("*").eq("org_id", orgRow.id),
      supabase.from("prepaid_schedules").select("*, prepaid_schedule_lines(*)").eq("org_id", orgRow.id),
      supabase.from("inventory_items").select("*").eq("org_id", orgRow.id),
      supabase.from("myinvois_submissions").select("*").eq("org_id", orgRow.id),
      supabase.from("org_activity_log").select("*").eq("org_id", orgRow.id).order("created_at", { ascending: false }).limit(500),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    generator: "Kira",
    organization: orgRow,
    accounts: accounts.data ?? [],
    contacts: contacts.data ?? [],
    invoices: invoices.data ?? [],
    bills: bills.data ?? [],
    journalEntries: journals.data ?? [],
    fixedAssets: assets.data ?? [],
    prepaidSchedules: prepaids.data ?? [],
    inventoryItems: stockItems.data ?? [],
    myinvoisSubmissions: myinvois.data ?? [],
    activityLog: activity.data ?? [],
  };

  const filename = `kira-${orgRow.slug}-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
