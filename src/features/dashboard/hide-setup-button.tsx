"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/shared/ui/button";
import { hideSetupAction } from "./actions";

export function HideSetupButton({ orgSlug, label }: { orgSlug: string; label: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await hideSetupAction(orgSlug);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        {label}
      </Button>
      {error && <span role="alert" className="text-[12px] text-negative">{error}</span>}
    </div>
  );
}
