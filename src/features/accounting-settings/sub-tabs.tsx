import Link from "next/link";
import { SettingsHeader } from "@/features/settings/settings-header";
import { cn } from "@/shared/ui/cn";

export type AccountingSubTabKey = "control-accounts" | "document-numbering" | "price-book" | "exchange-rates";

const SUB = "shrink-0 whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors";
const SUB_TABS: Array<{ key: AccountingSubTabKey; href: string; label: string }> = [
  { key: "control-accounts", href: "settings/control-accounts", label: "Control accounts" },
  { key: "document-numbering", href: "settings/document-numbering", label: "Numbering" },
  { key: "price-book", href: "settings/price-book", label: "Price book" },
  { key: "exchange-rates", href: "settings/exchange-rates", label: "Exchange rates" },
];

export function AccountingSettingsHeader({
  base,
  legalName,
  sub,
  activeSub,
}: {
  base: string;
  legalName: string;
  sub: string;
  activeSub: AccountingSubTabKey;
}) {
  return (
    <div className="flex flex-col">
      <SettingsHeader base={base} legalName={legalName} sub={sub} active="accounting" />
      <div className="flex flex-wrap gap-1 pt-1.5">
        {SUB_TABS.map((t) => (
          <Link
            key={t.key}
            aria-current={t.key === activeSub ? "page" : undefined}
            href={`${base}/${t.href}`}
            className={cn(SUB, t.key === activeSub ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink-2")}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
