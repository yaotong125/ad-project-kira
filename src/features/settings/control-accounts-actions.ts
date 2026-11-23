"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type ControlPayload = { arAccountId: string; apAccountId: string; nonTradeArAccountId: string; nonTradeApAccountId: string };

const MESSAGES: Record<string, string> = {
  owner_only: "Only the owner can change control accounts.",
  ar_required: "Pick the Accounts Receivable control account.",
  ap_required: "Pick the Accounts Payable control account.",
  same_control_account: "Trade and non-trade accounts must be different accounts.",
};
const SIDE: Record<string, string> = {
  ar: "Accounts Receivable must be an active asset or contra-asset account that is not a bank or cash account.",
  non_trade_ar: "Non-trade Accounts Receivable must be an active asset or contra-asset account that is not a bank or cash account.",
  ap: "Accounts Payable must be an active liability or contra-liability account that is not a bank or cash account.",
  non_trade_ap: "Non-trade Accounts Payable must be an active liability or contra-liability account that is not a bank or cash account.",
};

/** Settings → Accounting → Control accounts: "Save" (owner-only, applies immediately). */
export async function saveControlAccountsAction(slug: string, p: ControlPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_control_accounts", { p_slug: slug, p });
  if (error) {
    const code = error.message?.trim() ?? "";
    if (code === "bad_control_account") return { ok: false, error: SIDE[error.details ?? ""] ?? "Pick a valid account." };
    return { ok: false, error: MESSAGES[code] ?? booksError(error) };
  }
  for (const path of ["settings/control-accounts", "accounts", "bills", "invoices"]) revalidatePath(`/${slug}/${path}`);
  return { ok: true };
}
