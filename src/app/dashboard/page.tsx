import { redirect } from "next/navigation";
import { homePath } from "@/shared/orgs";

/** Rendered per request (session). */
export const instant = false;

/** lejar.ai's header links to /dashboard; Kira sends the user to their first entity, or to company setup. */
export default async function DashboardPage() {
  redirect(await homePath());
}
