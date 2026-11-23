import { redirect } from "next/navigation";
import { homePath } from "@/shared/orgs";

/** Rendered per request (session). */
export const instant = false;

/**
 * Where sign-in lands by default (lejar.ai's `next=/post-auth`). Inferred from lejar.ai: a new
 * account went from sign-in straight to /new-org; with an entity, Kira opens that entity.
 */
export default async function PostAuthPage() {
  redirect(await homePath());
}
