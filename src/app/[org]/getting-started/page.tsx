import { redirect } from "next/navigation";

/** Rendered per request. */
export const instant = false;

/** lejar.ai redirects /{slug}/getting-started to /{slug}/learn (observed 2026-11-22). */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  redirect(`/${org}/learn`);
}
