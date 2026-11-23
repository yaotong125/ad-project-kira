"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/shared/ui/button";
import { addEarlierYearAction, setYearLockedAction } from "./actions";

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) router.refresh();
      else setError(r.error ?? null);
    });
  return { error, pending, run };
}

/** "Add this year" (primary, like lejar.ai's ink button). */
export function AddYearButton({ slug, label, busy }: { slug: string; label: string; busy: string }) {
  const { error, pending, run } = useAction();
  return (
    <div className="flex flex-col items-end gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => addEarlierYearAction(slug))} data-testid="add-earlier-year">
        {pending ? busy : label}
      </Button>
      {error && (
        <p role="alert" className="max-w-[48ch] text-right text-[12px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

/** "Lock year" / "Unlock year". */
export function LockYearButton({ slug, yearId, locked, label }: { slug: string; yearId: string; locked: boolean; label: string }) {
  const { error, pending, run } = useAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setYearLockedAction(slug, yearId, !locked))}>
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-[12px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
