"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { toggleContactActiveAction } from "./actions";
import { ct } from "./copy";

/** The list's Disable / Enable button (lejar.ai: toggleContactActiveAction). */
export function ToggleActiveButton({ orgSlug, contactId, active, lang }: { orgSlug: string; contactId: string; active: boolean; lang: Lang }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await toggleContactActiveAction(orgSlug, contactId, !active);
            if (r.ok) {
              setError(null);
              router.refresh();
            } else setError(r.error);
          })
        }
      >
        {active ? ct(lang, "contacts.list.disable") : ct(lang, "contacts.list.enable")}
      </Button>
      {error && (
        <span role="alert" className="text-[12px] text-negative">
          {error}
        </span>
      )}
    </span>
  );
}
