"use client";

import { useEffect, useRef, useState } from "react";
import { fromSen } from "@/features/books/money";
import type { Lang } from "@/shared/i18n";
import type { MonthPoint } from "./load";

/** Series colours: Kira teal and indigo, validated with the dataviz palette checks (light surface, all pass). */
const REV = "#00a69c";
const EXP = "#5e5be9";
const H = 190;
const PAD = { top: 10, right: 8, bottom: 24, left: 52 };

const monthLabel = (key: string, lang: Lang, long = false) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleDateString(lang === "ms" ? "ms-MY" : "en-MY", { month: long ? "long" : "short", year: long ? "numeric" : undefined, timeZone: "UTC" });

function niceMax(v: number) {
  if (v <= 0) return 100_00;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = [1, 2, 2.5, 5, 10].find((x) => x * p >= v) ?? 10;
  return n * p;
}
const short = (s: number) => {
  const rm = s / 100;
  return Math.abs(rm) >= 1_000_000 ? `${(rm / 1_000_000).toFixed(1)}m` : Math.abs(rm) >= 1000 ? `${(rm / 1000).toFixed(rm % 1000 === 0 ? 0 : 1)}k` : `${Math.round(rm)}`;
};

/**
 * "Cashflow · last 12 months — Revenue and expenses, by month" (lejar.ai dashboard). Grouped bars, one
 * axis, hover tooltip per month, a legend, and a table view for screen readers and exact numbers.
 */
export function CashflowChart({ months, lang, ariaLabel }: { months: MonthPoint[]; lang: Lang; ariaLabel: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(...months.flatMap((m) => [m.revenue, m.expenses])));
  const plotW = w - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / months.length;
  const bar = Math.max(3, Math.min(14, (slot - 10) / 2));
  const y = (v: number) => PAD.top + plotH - (Math.max(0, v) / max) * plotH;
  const ticks = [0, max / 2, max];
  const ms = lang === "ms";
  const L = { rev: ms ? "Hasil" : "Revenue", exp: ms ? "Perbelanjaan" : "Expenses", table: ms ? "Tunjuk sebagai jadual" : "Show as table", chart: ms ? "Tunjuk carta" : "Show chart", month: ms ? "Bulan" : "Month" };

  const rounded = (x: number, top: number, width: number) => {
    const base = PAD.top + plotH;
    const h = base - top;
    if (h <= 0) return "";
    const r = Math.min(4, width / 2, h);
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${base}Z`;
  };

  return (
    <div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-[12px] text-ink-2" aria-hidden={table || undefined}>
          {[
            [REV, L.rev],
            [EXP, L.exp],
          ].map(([c, t]) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />
              {t}
            </span>
          ))}
        </div>
        <button type="button" className="text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => setTable((v) => !v)}>
          {table ? L.chart : L.table}
        </button>
      </div>

      {table ? (
        <div className="mt-2 overflow-x-auto rounded-[var(--radius)] border border-border">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="bg-surface-2">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium text-muted">{L.month}</th>
                <th className="px-3 py-1.5 text-right font-medium text-muted">{L.rev}</th>
                <th className="px-3 py-1.5 text-right font-medium text-muted">{L.exp}</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key} className="border-t border-border">
                  <td className="px-3 py-1.5 text-ink-2">{monthLabel(m.key, lang, true)}</td>
                  <td className="num-sans px-3 py-1.5 text-right text-ink">RM{fromSen(m.revenue)}</td>
                  <td className="num-sans px-3 py-1.5 text-right text-ink">RM{fromSen(m.expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative mt-2" onMouseLeave={() => setHover(null)}>
          <svg width={w} height={H} role="img" aria-label={ariaLabel} className="block max-w-full">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num-sans" fontSize={11} fill="var(--color-muted)">
                  {short(t)}
                </text>
              </g>
            ))}
            {hover !== null && <rect x={PAD.left + hover * slot} y={PAD.top} width={slot} height={plotH} fill="var(--color-surface-2)" />}
            {months.map((m, i) => {
              const cx = PAD.left + i * slot + slot / 2;
              return (
                <g key={m.key}>
                  <path d={rounded(cx - bar - 1, y(m.revenue), bar)} fill={REV} />
                  <path d={rounded(cx + 1, y(m.expenses), bar)} fill={EXP} />
                  {(slot >= 34 || i % 2 === 1) && (
                    <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
                      {monthLabel(m.key, lang)}
                    </text>
                  )}
                  <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH + PAD.bottom} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-1 z-10 min-w-[170px] rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[12px] shadow-md"
              style={PAD.left + hover * slot + slot / 2 > w / 2 ? { right: w - (PAD.left + hover * slot) + 6 } : { left: PAD.left + (hover + 1) * slot + 6 }}
            >
              <div className="mb-1 font-medium text-ink">{monthLabel(months[hover].key, lang, true)}</div>
              {[
                [REV, L.rev, months[hover].revenue],
                [EXP, L.exp, months[hover].expenses],
              ].map(([c, t, v]) => (
                <div key={t as string} className="flex items-center justify-between gap-4 text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: c as string }} />
                    {t}
                  </span>
                  <span className="num-sans text-ink">RM{fromSen(v as number)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
