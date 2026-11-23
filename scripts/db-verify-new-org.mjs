// Checks the /new-org migration in the database without leaving data behind: runs
// create_organization() as an existing auth user inside a transaction and rolls it back.
// Usage: node scripts/db-verify-new-org.mjs
import { readFileSync } from "node:fs";
import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1, onnotice: () => {} });

const ROLLBACK = new Error("rollback");
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};

try {
  const tables = await sql`
    select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('organizations','organization_members','fiscal_years','accounting_periods','accounts','chart_template')`;
  check("6 tables exist", tables.length === 6, tables.map((t) => t.relname).join(", "));
  check("RLS on every table", tables.every((t) => t.relrowsecurity));
  const [{ count: templ }] = await sql`select count(*)::int from public.chart_template`;
  check("chart template has 121 rows", templ === 121, String(templ));

  const [user] = await sql`select id from auth.users order by created_at limit 1`;
  check("an auth user exists to test with", Boolean(user));

  const expected = { sdn_bhd: 107, sole_prop: 105, partnership: 106, llp: 106 };
  for (const [type, want] of Object.entries(expected)) {
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user.id, role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        const org = {
          legal_name: `Kira Verify ${type}`, entity_type: type, fiscal_year_end: "2026-12-31", cadence: "bimonthly",
          chart_mode: "standard", books_start: "2026-01-01", registration_type: "BRN", acquisition_channel: "other",
          acquisition_detail: "verify",
        };
        const years = [{
          starts_on: "2026-01-01", ends_on: "2026-12-31",
          periods: [1, 3, 5, 7, 9, 11].map((m) => {
            const s = new Date(Date.UTC(2026, m - 1, 1));
            const e = new Date(Date.UTC(2026, m + 1, 0));
            return { starts_on: s.toISOString().slice(0, 10), ends_on: e.toISOString().slice(0, 10) };
          }),
        }];
        const [{ create_organization: res }] = await tx`select public.create_organization(${tx.json(org)}, ${tx.json(years)})`;
        // Read back through RLS as that user.
        const [{ count: accounts }] = await tx`select count(*)::int from public.accounts where org_id = ${res.id}`;
        const [{ count: periods }] = await tx`select count(*)::int from public.accounting_periods where org_id = ${res.id}`;
        const [{ count: members }] = await tx`select count(*)::int from public.organization_members where org_id = ${res.id} and role = 'owner'`;
        const [{ count: pairs }] = await tx`select count(*)::int from public.accounts where org_id = ${res.id} and parent_id is not null`;
        check(`${type}: slug`, res.slug === `kira-verify-${type.replace("_", "-")}`, res.slug);
        check(`${type}: ${want} accounts`, accounts === want, String(accounts));
        check(`${type}: 6 periods, owner, 5 depreciation pairs`, periods === 6 && members === 1 && pairs === 5, `${periods}/${members}/${pairs}`);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  }

  // Signed out: the function refuses.
  try {
    await sql.begin(async (tx) => {
      await tx`set local role anon`;
      await tx`select public.create_organization('{}'::jsonb, '[]'::jsonb)`;
    });
    check("anonymous call refused", false);
  } catch (e) {
    check("anonymous call refused", /permission denied/i.test(e.message), e.message.slice(0, 60));
  }

  const [{ count: left }] = await sql`select count(*)::int from public.organizations where legal_name like 'Kira Verify %'`;
  check("nothing left behind", left === 0);
} finally {
  await sql.end();
}
process.exit(failed ? 1 : 0);
