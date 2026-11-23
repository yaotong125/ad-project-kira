"use client";

import {
  ArrowLeftRight, ArrowRightLeft, Bell, BookOpen, Boxes, Building2, CalendarCheck, CalendarClock, ChartColumn,
  ChevronDown, CircleHelp, ClipboardCheck, Coins, CreditCard, FileCheckCorner, FileMinus, FilePenLine, FileText,
  FileUp, GraduationCap, HandCoins, House, Inbox, Landmark, LifeBuoy, List, LogOut, Menu, MessageSquare,
  PanelLeft, Percent, Plus, Receipt, Repeat, ScrollText, Search, Settings, TrendingUp, Truck, UserCog, Users,
  Warehouse, Zap, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Lang } from "@/shared/i18n";
import { GuidedFlow } from "@/shared/guided-flow/guided-flow";
import { cn } from "@/shared/ui/cn";
import { KiraMark } from "@/shared/ui/kira-logo";
import { navText, st } from "./copy";
import { CHAT_PATH, NAV, VISIBLE_IN_GROUP, type NavIcon, type NavItem } from "./nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  House, Zap, Inbox, FileUp, ArrowRightLeft, FileText, HandCoins, Users, FileCheckCorner, FilePenLine, Truck,
  FileMinus, Coins, Repeat, Receipt, Building2, Boxes, Warehouse, ClipboardCheck, Landmark, ArrowLeftRight,
  ChartColumn, TrendingUp, List, ScrollText, BookOpen, Percent, CalendarClock, CalendarCheck, CreditCard, Settings,
};

const ICON_BUTTON =
  "flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius)] text-ink transition-colors hover:bg-surface-2";
const MENU_ITEM =
  "flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left text-[12.5px] text-ink transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none";
const COLLAPSED_KEY = "kira.sidebar.collapsed";

export type ShellProps = {
  slug: string;
  orgName: string;
  orgs: { slug: string; legal_name: string }[];
  roleLabel: string;
  email: string;
  lang: Lang;
  signOut: () => Promise<void>;
  children: ReactNode;
};

/** Kira's mark + wordmark at sidebar size (lejar.ai: 22px mark, 16px wordmark). */
function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <>
      <span className={cn("inline-flex items-center gap-[9px]", collapsed && "md:hidden")}>
        <KiraMark size={22} />
        <span className="font-display text-[17px] leading-none font-normal tracking-[-0.01em] text-ink-2">Kira</span>
      </span>
      <span className={cn("hidden", collapsed && "md:flex")}>
        <KiraMark size={22} />
      </span>
    </>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** lejar.ai's dropdown menu (module 32332): a button and a panel of menu items, closed by Escape or an outside click. */
function DropMenu({
  label,
  width = 224,
  trigger,
  children,
}: {
  label: string;
  width?: number;
  trigger: (s: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          style={{ width }}
          className="absolute right-0 top-[calc(100%+6px)] z-50 flex flex-col rounded-[var(--radius)] border border-border bg-surface p-1 shadow-[var(--shadow-lg)]"
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{children}</div>;
}

function MenuLink({ href, icon, hint, close, children }: { href: string; icon?: ReactNode; hint?: ReactNode; close: () => void; children: ReactNode }) {
  return (
    <Link role="menuitem" href={href} onClick={close} className={MENU_ITEM}>
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="text-[11.5px] text-muted">{hint}</span>}
    </Link>
  );
}

function Kbd({ k }: { k: string }) {
  return <span className="kbd">Ctrl {k}</span>;
}

/** The app frame of every workspace page: lejar.ai's AppShell (chunk 2hpoxq_pb7spa) with Kira's logo and colours. */
export function AppShell({ slug, orgName, orgs, roleLabel, email, lang, signOut, children }: ShellProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const base = `/${slug}`;
  const t = (k: Parameters<typeof st>[1], v?: Record<string, string | number>) => st(lang, k, v);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    // Restore the sidebar width after hydration (localStorage is browser-only).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);
  useEffect(() => {
    // Close the mobile drawer and reset expanded groups after every navigation (as lejar.ai does).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
    setExpanded({});
  }, [pathname, search]);

  const toggleSidebar = () =>
    setCollapsed((c) => {
      window.localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      return !c;
    });

  // Ctrl/⌘ K opens search, Ctrl/⌘ J opens Ask Kira (lejar.ai's shortcuts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        router.push(`${base}/search`);
      } else if (k === "j") {
        e.preventDefault();
        router.push(`${base}/${CHAT_PATH}`);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, base]);

  // lejar.ai's rule: among items whose path matches the URL, only the longest path is active
  // (on /bills/notes, "Supplier notes" not "Bills"); "?type=" items also need the query to match.
  // Hash items (Profit & Loss = reports#…) are never highlighted, since the hash is not visible here.
  const split = (item: NavItem) => {
    const [pathPart, query] = item.path.split("#")[0].split("?");
    return { pathPart, query, hash: item.path.includes("#") };
  };
  const onPath = (pathPart: string) => {
    const href = pathPart ? `${base}/${pathPart}` : base;
    return pathPart ? pathname === href || pathname.startsWith(`${href}/`) : pathname === base;
  };
  const longest = Math.max(
    -1,
    ...NAV.flatMap((g) => g.items.map(split).filter((s) => !s.hash && onPath(s.pathPart)).map((s) => s.pathPart.length)),
  );
  const isActive = (item: NavItem) => {
    const { pathPart, query, hash } = split(item);
    if (hash || !onPath(pathPart) || pathPart.length !== longest) return false;
    return !query || Array.from(new URLSearchParams(query)).every(([k, v]) => search.get(k) === v);
  };

  const chatActive = pathname === `${base}/${CHAT_PATH}` || pathname.startsWith(`${base}/${CHAT_PATH}/`);

  const itemClass = (active: boolean) =>
    cn(
      "relative flex h-11 md:h-[30px] items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] font-medium transition-colors",
      collapsed && "md:w-10 md:justify-center md:px-0",
      active ? "border border-border bg-surface text-ink shadow-[var(--shadow-xs)]" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
    );

  const renderItem = (item: NavItem) => {
    const Icon = ICONS[item.icon];
    const active = isActive(item);
    const label = navText(lang, item.label);
    return (
      <Link
        key={item.path}
        href={item.path ? `${base}/${item.path}` : base}
        title={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={itemClass(active)}
      >
        <Icon size={16} className={item.ai ? "text-ai" : "text-current"} style={{ flexShrink: 0 }} />
        <span className={cn("flex-1 truncate", collapsed && "md:hidden")}>{label}</span>
        {item.ai && <span className={cn("chip ai h-[18px] px-1.5 text-[11.5px]", collapsed && "md:hidden")}>AI</span>}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh bg-bg">
      <div data-app-shell="true" className="flex h-dvh overflow-hidden bg-bg">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus:rounded-md focus:border focus:border-border focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-ink focus:shadow-[var(--shadow-lg)]"
        >
          {lang === "ms" ? "Langkau ke kandungan" : "Skip to content"}
        </a>

        {mobileOpen && <div className="fixed inset-0 z-40 bg-ink/30 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

        <aside
          lang={lang}
          aria-label={t("shell.sidebar.ariaLabel")}
          className={cn(
            "flex h-full flex-col gap-1.5 overflow-hidden border-r border-border bg-bg px-3 py-2.5",
            "fixed inset-y-0 left-0 z-50 w-[232px] transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
            "md:relative md:z-auto md:translate-x-0 md:shrink-0 md:transition-[width]",
            collapsed ? "md:w-14 md:px-2" : "md:w-[232px]",
          )}
        >
          <div className="flex items-center justify-between px-1 pb-2.5 pt-1.5">
            <SidebarLogo collapsed={collapsed} />
          </div>

          <details data-testid="org-switcher" className={cn("group relative", collapsed && "md:hidden")}>
            <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-[9px] border border-border bg-surface px-2 shadow-[var(--shadow-xs)] [&::-webkit-details-marker]:hidden">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-brand text-[11.5px] font-bold tracking-[0.02em] text-white">
                {initials(orgName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold leading-[1.15] tracking-[-0.01em] text-ink">{orgName}</span>
                <span className="mt-0.5 block text-[11.5px] text-muted">{t("shell.sidebar.roleView", { role: roleLabel })}</span>
              </span>
              <ChevronDown size={14} className="text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="absolute left-0 right-0 top-[48px] z-20 rounded-[10px] border border-border bg-surface p-1.5 shadow-[var(--shadow-lg)]">
              {orgs.map((o) => (
                <Link
                  key={o.slug}
                  href={`/${o.slug}`}
                  className={cn(
                    "flex items-center rounded-md px-2 py-1.5 text-[12px] pointer-coarse:min-h-11",
                    o.slug === slug ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <span className="truncate">{o.legal_name}</span>
                </Link>
              ))}
              <Link
                href="/new-org"
                className="mt-1 block rounded-md border-t border-border px-2 py-1.5 pt-2 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center"
              >
                {t("shell.sidebar.newEntity")}
              </Link>
            </div>
          </details>

          <nav className="scroll mt-1 flex-1 overflow-y-auto overflow-x-hidden pr-0.5">
            <div className="mb-3">
              <Link
                href={`${base}/${CHAT_PATH}`}
                title={collapsed ? t("shell.nav.chat") : undefined}
                aria-current={chatActive ? "page" : undefined}
                className={itemClass(chatActive)}
              >
                <MessageSquare size={16} className="text-ai" style={{ flexShrink: 0 }} />
                <span className={cn("flex-1 truncate", collapsed && "md:hidden")}>{t("shell.nav.chat")}</span>
                <span aria-hidden="true" className={cn("chip ai h-[18px] px-1.5 text-[11.5px]", collapsed && "md:hidden")}>
                  AI
                </span>
              </Link>
            </div>

            {NAV.map((group, gi) => {
              const activeHidden = group.items.slice(VISIBLE_IN_GROUP).find(isActive);
              const open = !group.collapsible || (collapsed && !mobileOpen) || (expanded[gi] ?? Boolean(activeHidden));
              const visible = group.items.slice(0, VISIBLE_IN_GROUP);
              const shown = open ? group.items : activeHidden ? [...visible, activeHidden] : visible;
              const more = group.items.length - shown.length;
              const groupLabel = group.label ? navText(lang, group.label) : "";
              return (
                <div key={gi} className="mb-3">
                  {group.label &&
                    (group.collapsible ? (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`nav-group-${gi}`}
                        onClick={() => setExpanded((e) => (open ? { ...e, [gi]: false } : { [gi]: true }))}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-1 rounded-[7px] px-2.5 pb-1 pt-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:text-ink-2 md:min-h-0",
                          collapsed && "md:hidden",
                        )}
                      >
                        <span className="flex-1 text-left">{groupLabel}</span>
                        <ChevronDown size={12} aria-hidden="true" className={cn("shrink-0 transition-transform", !open && "-rotate-90")} />
                      </button>
                    ) : (
                      <div className={cn("px-2.5 pb-1 pt-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted", collapsed && "md:hidden")}>
                        {groupLabel}
                      </div>
                    ))}
                  <div id={group.collapsible ? `nav-group-${gi}` : undefined}>{shown.map(renderItem)}</div>
                  {group.collapsible && !open && more > 0 && (
                    <button
                      type="button"
                      aria-label={t("shell.sidebar.showMore", { count: more, group: groupLabel })}
                      onClick={() => setExpanded({ [gi]: true })}
                      className={cn(
                        "flex h-11 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink-2 md:h-[30px]",
                        collapsed && "md:hidden",
                      )}
                    >
                      <span className="w-4 shrink-0" aria-hidden="true" />
                      {t("shell.sidebar.moreCount", { count: more })}
                    </button>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div lang={lang} className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-bg px-3 sm:gap-2.5 sm:px-4">
            <button type="button" onClick={() => setMobileOpen(true)} aria-label={t("shell.topbar.openNav")} className={`${ICON_BUTTON} md:hidden`}>
              <Menu size={17} strokeWidth={1.7} />
            </button>
            <span className="relative hidden md:inline-flex">
              <button type="button" onClick={toggleSidebar} aria-label={t("shell.topbar.toggleSidebar")} title={t("shell.topbar.toggleSidebar")} className={ICON_BUTTON}>
                <PanelLeft size={15} strokeWidth={1.7} />
              </button>
            </span>
            <Link
              href={`${base}/search`}
              aria-label={t("shell.topbar.search")}
              className="flex h-8 w-11 shrink-0 items-center justify-center gap-2 rounded-[var(--radius)] border border-border bg-surface text-muted shadow-[var(--shadow-xs)] transition-colors hover:border-border-strong sm:w-auto sm:min-w-0 sm:max-w-[440px] sm:flex-1 sm:shrink sm:justify-start sm:px-3 sm:pl-2.5"
            >
              <Search size={14} strokeWidth={1.6} className="shrink-0" />
              <span className="hidden flex-1 truncate text-left text-[12.5px] sm:block">{t("shell.topbar.searchPlaceholder")}</span>
              <span className="kbd hidden sm:inline-flex">Ctrl K</span>
            </Link>
            <div className="flex-1" />

            <DropMenu
              label={t("shell.topbar.create")}
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  className={cn("flex h-[30px] items-center gap-1.5 rounded-[var(--radius)] px-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-2", open && "bg-surface-2")}
                >
                  <Plus size={14} strokeWidth={1.8} /> {t("shell.topbar.new")}
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuLabel>{t("shell.topbar.create")}</MenuLabel>
                  <MenuLink href={`${base}/invoices?new=1`} icon={<FileText size={14} />} close={close}>
                    {t("shell.topbar.createInvoice")}
                  </MenuLink>
                  <MenuLink href={`${base}/bills?new=1`} icon={<Receipt size={14} />} close={close}>
                    {t("shell.topbar.createBill")}
                  </MenuLink>
                  <MenuLink href={`${base}/expenses?new=1`} icon={<Coins size={14} />} close={close}>
                    {t("shell.topbar.createPaymentVoucher")}
                  </MenuLink>
                  <MenuLink href={`${base}/contacts?new=1`} icon={<Users size={14} />} close={close}>
                    {t("shell.topbar.createContact")}
                  </MenuLink>
                  <MenuLink href={`${base}/ledger`} icon={<ScrollText size={14} />} close={close}>
                    {t("shell.topbar.createJournalEntry")}
                  </MenuLink>
                </>
              )}
            </DropMenu>

            <DropMenu
              label={t("shell.topbar.help")}
              width={236}
              trigger={({ open, toggle }) => (
                <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={t("shell.topbar.help")} className={cn(ICON_BUTTON, open && "bg-surface-2")}>
                  <CircleHelp size={15} />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuLabel>{t("shell.topbar.helpAndShortcuts")}</MenuLabel>
                  <MenuLink href={`${base}/learn`} icon={<GraduationCap size={14} />} close={close}>
                    {t("shell.topbar.learnLejar")}
                  </MenuLink>
                  <MenuLink href={`${base}/search`} icon={<Search size={14} />} hint={<Kbd k="K" />} close={close}>
                    {t("shell.topbar.searchEverything")}
                  </MenuLink>
                  <MenuLink href={`${base}/${CHAT_PATH}`} icon={<MessageSquare size={14} className="text-ai" />} hint={<Kbd k="J" />} close={close}>
                    {t("shell.nav.chat")}
                  </MenuLink>
                  <MenuLink href={`${base}/help`} icon={<LifeBuoy size={14} />} close={close}>
                    {t("shell.topbar.helpArticles")}
                  </MenuLink>
                  <div className="my-1 h-px bg-border" />
                  <MenuLink href={`${base}/reports`} icon={<ChartColumn size={14} />} close={close}>
                    {t("shell.topbar.reportsStatements")}
                  </MenuLink>
                  <MenuLink href={`${base}/settings/profile`} icon={<Settings size={14} />} close={close}>
                    {t("shell.topbar.businessSettings")}
                  </MenuLink>
                </>
              )}
            </DropMenu>

            <DropMenu
              label={t("shell.topbar.notifications")}
              width={300}
              trigger={({ open, toggle }) => (
                <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={t("shell.topbar.notifications")} className={cn("relative", ICON_BUTTON, open && "bg-surface-2")}>
                  <Bell size={15} />
                </button>
              )}
            >
              {() => (
                <>
                  <MenuLabel>{t("shell.topbar.notifications")}</MenuLabel>
                  <p className="px-2 py-3 text-[12px] text-muted">{t("shell.topbar.notificationsEmpty")}</p>
                </>
              )}
            </DropMenu>

            {!chatActive && (
              <Link
                href={`${base}/${CHAT_PATH}`}
                className="hidden h-[30px] items-center gap-1.5 rounded-[var(--radius)] border border-border bg-transparent pl-2 pr-2.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2 sm:inline-flex"
              >
                <MessageSquare size={14} className="text-ai" />
                <span className="hidden md:inline">{t("shell.nav.chat")}</span>
                <span className="kbd ml-0.5 hidden md:inline-flex">Ctrl J</span>
              </Link>
            )}
            <div className="mx-1 hidden h-[22px] w-px bg-border sm:block" />

            <DropMenu
              label={t("shell.topbar.accountMenu")}
              width={240}
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  aria-label={t("shell.topbar.accountMenu")}
                  title={email}
                  className={cn(
                    "flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border-strong bg-surface-3 text-[11.5px] font-semibold text-ink-2 transition-colors hover:bg-surface-2",
                    open && "bg-surface-2",
                  )}
                >
                  {(email[0] ?? "?").toUpperCase()}
                </button>
              )}
            >
              {(close) => (
                <>
                  <div className="px-2 pb-1.5 pt-1.5">
                    <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{t("shell.topbar.signedInAs")}</p>
                    <p className="truncate text-[12.5px] text-ink" title={email}>
                      {email}
                    </p>
                  </div>
                  <div className="my-1 h-px bg-border" />
                  <MenuLink href={`${base}/settings/account`} icon={<UserCog size={14} />} close={close}>
                    {t("shell.topbar.accountSecurity")}
                  </MenuLink>
                  <MenuLink href={`${base}/settings/profile`} icon={<Settings size={14} />} close={close}>
                    {t("shell.topbar.businessSettings")}
                  </MenuLink>
                  <div className="my-1 h-px bg-border" />
                  <form action={signOut}>
                    <button type="submit" role="menuitem" className={MENU_ITEM}>
                      <span className="text-muted">
                        <LogOut size={14} />
                      </span>
                      <span className="flex-1 truncate">{t("shell.topbar.signOut")}</span>
                    </button>
                  </form>
                </>
              )}
            </DropMenu>
          </div>

          {chatActive ? (
            // lejar.ai's ChatShell replaces the page area with its own header, conversation list and <main>.
            <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
          ) : (
            <main id="main-content" tabIndex={-1} className="scroll min-w-0 flex-1 overflow-y-auto bg-bg outline-none">
              <div className="mx-auto max-w-[1320px] px-4 py-5 pb-28 sm:px-6 sm:pb-24">{children}</div>
            </main>
          )}
          <GuidedFlow orgSlug={slug} lang={lang} />
        </div>
      </div>
    </div>
  );
}
