import Link from "next/link";
import { cn } from "@/shared/ui/cn";

/** lejar.ai's Settings tabs (observed 2026-11-22). */
export const SETTINGS_TABS = [
  { key: "profile", href: "settings/profile", label: "Profile" },
  { key: "team", href: "settings/team", label: "Team & activity" },
  { key: "accounting", href: "settings/control-accounts", label: "Accounting" },
  { key: "tax", href: "settings/sst", label: "Tax & e-Invois" },
  { key: "api", href: "settings/api-keys", label: "API & webhooks" },
  { key: "data", href: "settings/data", label: "Data & AI" },
  { key: "account", href: "settings/account", label: "Account & security" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

/** "Settings", "<sub> · <entity>", and the tab bar. Usable from server and client components. */
export function SettingsHeader({ base, legalName, sub, active }: { base: string; legalName: string; sub: string; active: SettingsTab }) {
  return (
    <>
      <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">Settings</h1>
          <div className="mt-1.5 text-[12.5px] text-muted">
            {sub} · <span className="text-ink">{legalName}</span>
          </div>
        </div>
      </div>
      <nav aria-label="Settings">
        <div className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SETTINGS_TABS.map((t) => (
            <Link
              key={t.key}
              href={`${base}/${t.href}`}
              aria-current={t.key === active ? "page" : undefined}
              className={cn(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors",
                t.key === active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink-2",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
