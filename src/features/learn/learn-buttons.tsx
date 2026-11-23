"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Lang } from "@/shared/i18n";
import { SECTION_FLOW } from "@/shared/guided-flow/flows";
import { writeFlow } from "@/shared/guided-flow/store";
import { Button, buttonClass, type ButtonVariant } from "@/shared/ui/button";
import { setLearnHiddenAction, skipLearnSectionAction, startLearnSectionAction, type LearnResult } from "./actions";
import { lt } from "./sections";

/** lejar.ai's small action button (module 700379 `x`): "Saving..." while running, error text under it. */
function ActionButton({
  label,
  lang,
  run,
  variant = "secondary",
}: {
  label: string;
  lang: Lang;
  run: () => Promise<LearnResult>;
  variant?: ButtonVariant;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await run();
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        {pending ? lt(lang, "learn.action.saving") : label}
      </Button>
      {error ? (
        <span role="alert" className="text-[12px] text-negative">
          {error}
        </span>
      ) : null}
    </span>
  );
}

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

export function LearnVisibilityButton({ orgSlug, hidden, lang }: { orgSlug: string; hidden: boolean; lang: Lang }) {
  return (
    <ActionButton
      label={lt(lang, hidden ? "learn.action.show" : "learn.action.hide")}
      lang={lang}
      run={() => setLearnHiddenAction(form({ orgSlug, hidden: hidden ? "false" : "true" }))}
    />
  );
}

export function SkipSectionButton({ orgSlug, section, lang }: { orgSlug: string; section: string; lang: Lang }) {
  return (
    <ActionButton
      label={lt(lang, "learn.action.skip")}
      lang={lang}
      variant="ghost"
      run={() => skipLearnSectionAction(form({ orgSlug, section }))}
    />
  );
}

/** "Start": records progress, then opens the section's page even if recording failed (lejar.ai: catch → finally push). */
export function StartSectionLink({
  orgSlug,
  section,
  href,
  label,
  variant,
}: {
  orgSlug: string;
  section: string;
  href: string;
  label: string;
  variant: ButtonVariant;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Link
      href={href}
      aria-disabled={busy || undefined}
      className={buttonClass(variant, "sm")}
      onClick={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        // lejar.ai opens the section's guided flow at step 1 (flow_started).
        const flow = SECTION_FLOW[section];
        if (flow) writeFlow({ flow, step: 0, section });
        startLearnSectionAction(form({ orgSlug, section }))
          .catch(() => undefined)
          .finally(() => router.push(href));
      }}
    >
      {label}
    </Link>
  );
}
