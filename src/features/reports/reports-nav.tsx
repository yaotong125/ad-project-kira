"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/ui/cn";

/** lejar.ai's ReportsNav: the report tabs above every /reports page (observed 2026-11-22). */
const TABS = [
  ["", "Reports"],
  ["/cashbook", "Cashbook"],
  ["/general-ledger", "General ledger"],
  ["/aged-payables", "Aged payables"],
  ["/aged-receivables", "Aged receivables"],
  ["/statement-of-account", "Statement of account"],
  ["/customer-ledger", "Customer ledger"],
  ["/supplier-ledger", "Supplier ledger"],
  ["/wht-due", "WHT due"],
  ["/stock-on-hand", "Stock on hand"],
  ["/stock-movements", "Stock movements"],
] as const;

export function ReportsNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/${slug}/reports`;
  return (
    <nav aria-label="Reports" className="-mt-1 mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map(([path, label]) => {
        const active = pathname === `${base}${path}`;
        return (
          <Link
            key={path}
            href={`${base}${path}`}
            aria-current={active ? "page" : undefined}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors", active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink-2")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
