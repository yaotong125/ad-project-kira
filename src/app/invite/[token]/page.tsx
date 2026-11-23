import type { Metadata } from "next";
import { InviteAcceptPage } from "@/features/team/team-page";

/** Rendered per request (invitation token & session). */
export const instant = false;

export const metadata: Metadata = { title: "Join organisation", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteAcceptPage token={token} />;
}
