import { redirect } from "next/navigation";

/** Rendered per request. */
export const instant = false;

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  redirect(`/${org}/settings/profile`);
}
