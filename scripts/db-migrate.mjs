// Applies supabase/migrations/*.sql to the database in SUPABASE_DB_URL (from .env.local), in
// name order, each in its own transaction. Applied files are recorded in public.kira_migrations.
// Usage: npm run db:migrate          (apply pending migrations)
//        npm run db:migrate -- --list (show status only)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnv(".env.local");
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set. Add it to .env.local (Supabase → Connect → Session pooler URI).");
  process.exit(1);
}

const dir = join("supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });

try {
  await sql`create table if not exists public.kira_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public.kira_migrations enable row level security`;
  const done = new Set((await sql`select name from public.kira_migrations`).map((r) => r.name));
  const listOnly = process.argv.includes("--list");
  for (const f of files) {
    if (done.has(f)) {
      console.log(`applied   ${f}`);
      continue;
    }
    if (listOnly) {
      console.log(`pending   ${f}`);
      continue;
    }
    const body = readFileSync(join(dir, f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public.kira_migrations (name) values (${f})`;
    });
    console.log(`APPLIED   ${f}`);
  }
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
