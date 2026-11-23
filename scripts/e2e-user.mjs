// Creates or deletes a confirmed test user directly in Supabase Auth (no email is sent),
// for browser tests against the real project.
// Usage: node scripts/e2e-user.mjs create <email> <password>
//        node scripts/e2e-user.mjs delete <email>   (also deletes the entities it created)
import { readFileSync } from "node:fs";
import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const [cmd, email, password] = process.argv.slice(2);
if (!email || !email.endsWith("@example.com")) {
  console.error("Use a test address @example.com");
  process.exit(1);
}
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1, onnotice: () => {} });

try {
  if (cmd === "create") {
    await sql.begin(async (tx) => {
      const [u] = await tx`
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change)
        values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', ${email},
          extensions.crypt(${password}, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
        returning id`;
      await tx`
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), ${u.id}, ${u.id}::text,
          ${sql.json({ sub: u.id, email, email_verified: true })}, 'email', now(), now(), now())`;
      console.log("created", email, u.id);
    });
  } else if (cmd === "delete") {
    const users = await sql`select id from auth.users where email = ${email}`;
    for (const u of users) {
      const ids = (await sql`select id from public.organizations where created_by = ${u.id}`).map((o) => o.id);
      for (const id of ids) {
        // Uploaded source documents (Storage blocks plain deletes unless this setting is on).
        await sql.begin(async (tx) => {
          await tx`select set_config('storage.allow_delete_query', 'true', true)`;
          await tx`delete from storage.objects where bucket_id in ('source-documents', 'org-assets') and name like ${id + "/%"}`;
        });
      }
      const orgs = await sql`delete from public.organizations where created_by = ${u.id} returning slug`;
      await sql`delete from auth.users where id = ${u.id}`;
      console.log("deleted", email, "and entities:", orgs.map((o) => o.slug).join(", ") || "none");
    }
    if (!users.length) console.log("no such user");
  } else {
    console.error("create | delete");
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
