import type { Metadata } from "next";
import { ChatPage } from "@/features/chat/chat-page";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Ask Kira", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <ChatPage slug={org} conversationId={null} />;
}
