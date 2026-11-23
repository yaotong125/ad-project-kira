import { signOut } from "@/features/sign-in/sign-out";
import { loadOrgContext } from "@/shared/org-context";
import { AppShell } from "@/shared/shell/app-shell";
import { st } from "@/shared/shell/copy";

/** Rendered per request (session, entity). */
export const instant = false;

/** Lejar's role names; Kira's "member" is Lejar's "bookkeeper". */
const ROLE_KEY = {
  owner: "shell.role.owner",
  admin: "shell.role.admin",
  member: "shell.role.bookkeeper",
  viewer: "shell.role.viewer",
} as const;

/** Every workspace page (/{slug}/…) sits inside the app frame. */
export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  return (
    <AppShell
      slug={ctx.org.slug}
      orgName={ctx.org.legal_name}
      orgs={ctx.orgs}
      roleLabel={st(ctx.lang, ROLE_KEY[ctx.role])}
      email={ctx.email}
      lang={ctx.lang}
      signOut={signOut}
    >
      {children}
    </AppShell>
  );
}
