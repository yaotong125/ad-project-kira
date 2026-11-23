import { ComingSoon } from "@/features/coming-soon/coming-soon";
import { loadOrgContext } from "@/shared/org-context";

/** Rendered per request (session, entity). */
export const instant = false;

/** Any workspace link whose feature is not built yet. */
export default async function Page({ params }: { params: Promise<{ org: string; rest: string[] }> }) {
  const { org, rest } = await params;
  const ctx = await loadOrgContext(org);
  return <ComingSoon slug={ctx.org.slug} path={rest.join("/")} lang={ctx.lang} />;
}
