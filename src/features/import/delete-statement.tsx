"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { deleteStatementAction } from "./actions";
import { bt } from "./banks";

/** "Delete" on a recent statement upload (only when nothing from it is recorded). */
export function DeleteStatementButton({ orgSlug, id, lang }: { orgSlug: string; id: string; lang: Lang }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await deleteStatementAction(orgSlug, id);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        {pending ? bt(lang, "bankImport.delete.deleting") : bt(lang, "bankImport.delete.delete")}
      </Button>
      {error && <span role="alert" className="text-[12px] text-negative">{error}</span>}
    </span>
  );
}
