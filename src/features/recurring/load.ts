import "server-only";
import { todayMY } from "@/features/books/load";
import { toSen } from "@/features/books/money";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type {
  AccountOpt,
  ContactOpt,
  Frequency,
  RecurringKind,
  RecurringRunRow,
  RecurringStatus,
  RecurringTemplateRow,
  RunStatus,
} from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const sen = (v: unknown) => toSen(String(v ?? 0)) ?? 0;

export async function loadRecurringData(supabase: Supabase, orgId: string, kind: RecurringKind) {
  const today = todayMY();
  const monthStart = `${today.slice(0, 7)}-01`;
  const contactKinds = kind === "invoice" ? ["customer", "both"] : ["supplier", "both"];
  const acctTypes = kind === "invoice" ? ["revenue"] : ["expense", "asset"];

  const [{ data: rawTemplates }, { data: rawRuns }, { data: rawContacts }, { data: rawAccounts }] = await Promise.all([
    supabase
      .from("recurring_templates")
      .select(
        "id, name, contact_id, frequency, interval_count, start_date, end_date, occurrences_limit, occurrences_generated, next_run_on, due_offset_days, number_prefix, auto_record, notes, status, total, contacts(name)",
      )
      .eq("org_id", orgId)
      .eq("kind", kind)
      .order("created_at", { ascending: false }),
    supabase
      .from("recurring_runs")
      .select("id, template_id, scheduled_on, status, invoice_id, bill_id, doc_number, error, ran_at, recurring_templates(name)")
      .eq("org_id", orgId)
      .eq("kind", kind)
      .order("ran_at", { ascending: false })
      .limit(50),
    supabase
      .from("contacts")
      .select("id, name")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .in("kind", contactKinds)
      .order("name"),
    supabase
      .from("accounts")
      .select("code, name, type")
      .eq("org_id", orgId)
      .eq("status", "active")
      .in("type", acctTypes)
      .eq("is_cash", false)
      .order("code"),
  ]);

  const templates: RecurringTemplateRow[] = (rawTemplates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    contactId: t.contact_id,
    contactName: one(t.contacts as { name: string } | { name: string }[] | null)?.name ?? "-",
    frequency: t.frequency as Frequency,
    intervalCount: t.interval_count,
    startDate: t.start_date,
    endDate: t.end_date ?? null,
    occurrencesLimit: t.occurrences_limit ?? null,
    occurrencesGenerated: t.occurrences_generated,
    nextRunOn: t.next_run_on ?? null,
    dueOffsetDays: t.due_offset_days,
    numberPrefix: t.number_prefix,
    autoRecord: Boolean(t.auto_record),
    notes: t.notes ?? null,
    status: t.status as RecurringStatus,
    totalSen: sen(t.total),
  }));

  const runs: RecurringRunRow[] = (rawRuns ?? []).map((r) => ({
    id: r.id,
    templateId: r.template_id,
    templateName: one(r.recurring_templates as { name: string } | { name: string }[] | null)?.name ?? "-",
    scheduledOn: r.scheduled_on,
    status: r.status as RunStatus,
    docId: kind === "invoice" ? (r.invoice_id ?? null) : (r.bill_id ?? null),
    docNumber: r.doc_number ?? null,
    error: r.error ?? null,
    ranAt: r.ran_at,
  }));

  const active = templates.filter((t) => t.status === "active");
  const nextRun =
    active
      .map((t) => t.nextRunOn)
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? null;
  const generatedThisMonth = runs.filter(
    (r) => (r.status === "draft" || r.status === "recorded") && r.ranAt.slice(0, 10) >= monthStart,
  ).length;

  return {
    today,
    templates,
    runs,
    contacts: (rawContacts ?? []) as ContactOpt[],
    accounts: (rawAccounts ?? []) as AccountOpt[],
    stats: {
      activeCount: active.length,
      nextRun,
      generatedThisMonth,
    },
  };
}
