"use client";

import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Lang } from "@/shared/i18n";
import { buttonClass } from "@/shared/ui/button";
import { FLOW_TEXT, type FlowTextKey } from "./copy-data";
import { flowByKey } from "./flows";
import { FLOW_CHANGE, clearFlow, readFlow, writeFlow, type FlowState } from "./store";

const MARGIN = 12;
const BOX_W = 320;
const BOX_H = 210;

/** lejar.ai's placement (module 553226): below the target, above it when there is no room, beside tall targets. */
function place(r: DOMRect): CSSProperties {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (r.height > 0.5 * h) {
    return { top: Math.max(MARGIN, Math.min(r.top + 40, h - BOX_H - MARGIN)), left: Math.min(r.right + MARGIN, w - BOX_W - MARGIN) };
  }
  let top = r.bottom + MARGIN;
  if (top + BOX_H > h) top = Math.max(MARGIN, r.top - BOX_H - MARGIN);
  return { top, left: Math.max(MARGIN, Math.min(r.left, w - BOX_W - MARGIN)) };
}

const sameRect = (a: DOMRect | null, b: DOMRect | null) =>
  a === null || b === null ? a === b : a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

/**
 * lejar.ai's guided-flow card (module 591054): "{flow} · n of total", the step's title and text,
 * "Take me there" when on another page, Next / Back / Finish on the step's page, Escape or × to exit,
 * and an outline around the element the step talks about. Finish returns to Learn.
 */
export function GuidedFlow({ orgSlug, lang }: { orgSlug: string; lang: Lang }) {
  const t = (k: FlowTextKey, v?: Record<string, string | number>) => {
    const s: string = FLOW_TEXT[k][lang];
    return v ? s.replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m)) : s;
  };
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<FlowState | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // sessionStorage is browser-only: read it after hydration and whenever a flow starts or moves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(readFlow());
    const onChange = () => setState(readFlow());
    window.addEventListener(FLOW_CHANGE, onChange);
    return () => window.removeEventListener(FLOW_CHANGE, onChange);
  }, []);

  const flow = state ? flowByKey(state.flow) : null;
  const index = state?.step ?? 0;
  const current = flow?.steps[index];
  const last = flow ? index === flow.steps.length - 1 : false;
  const here = pathname === `/${orgSlug}` ? "/" : pathname.startsWith(`/${orgSlug}/`) ? pathname.slice(orgSlug.length + 1) : pathname;
  const onPage = current !== undefined && (here === current.page || here.startsWith(`${current.page}/`));

  useEffect(() => {
    if (state && flow && index >= flow.steps.length) clearFlow();
  }, [state, flow, index]);

  const exit = useCallback(() => clearFlow(), []);
  const finish = useCallback(() => {
    const section = state?.section;
    clearFlow();
    if (section) router.push(`/${orgSlug}/learn`);
  }, [state?.section, orgSlug, router]);
  const go = (n: number) => state && writeFlow({ ...state, step: n });

  useEffect(() => {
    if (!current || !onPage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(null);
      return;
    }
    const measure = () => {
      const r = document.querySelector(current.target)?.getBoundingClientRect() ?? null;
      setRect((prev) => (sameRect(prev, r) ? prev : r));
    };
    measure();
    const id = window.setInterval(measure, 500);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [current, onPage]);

  useEffect(() => {
    if (!current) return;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && e.target instanceof Node && box.current?.contains(e.target)) exit();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, exit]);

  if (!flow || !state || !current) return null;
  const style: CSSProperties = rect ? place(rect) : { bottom: MARGIN, right: MARGIN };
  const progress = { flow: t(flow.titleKey), n: index + 1, total: flow.steps.length };

  return createPortal(
    <div>
      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[80] rounded-[10px] border-2 border-brand shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand)_22%,transparent)]"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        lang={lang}
        aria-label={t("onboarding.flow.ariaLabel", progress)}
        className="fixed z-[80] w-[320px] rounded-[10px] border border-border bg-surface p-4 shadow-[var(--shadow-lg)] outline-none"
        style={style}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{t("onboarding.flow.progress", progress)}</div>
          <button type="button" aria-label={t("onboarding.flow.exit")} onClick={exit} className="-mr-1 -mt-1 rounded p-1 text-muted transition-colors hover:text-ink">
            <X size={13} />
          </button>
        </div>
        <h2 className="mt-1 text-[13.5px] font-semibold leading-snug text-ink">{t(current.titleKey)}</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{t(current.bodyKey)}</p>
        <div className="mt-3.5 flex items-center gap-2">
          {onPage ? (
            last ? (
              <button type="button" className={buttonClass("primary", "sm")} onClick={finish}>
                {t("onboarding.flow.finish")}
              </button>
            ) : (
              <button type="button" className={buttonClass("primary", "sm")} onClick={() => go(index + 1)}>
                {t("onboarding.coach.next")}
              </button>
            )
          ) : (
            <button type="button" className={buttonClass("primary", "sm")} onClick={() => router.push(`/${orgSlug}${current.page}`)}>
              {t("onboarding.flow.takeMeThere")}
            </button>
          )}
          {index > 0 && (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => go(index - 1)}>
              {t("onboarding.coach.back")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
