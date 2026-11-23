"use client";

import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Input, Select } from "@/shared/ui/form-controls";
import {
  createAccountAction,
  createFixedAssetPairAction,
  deleteAccountAction,
  updateAccountAction,
} from "./actions";
import {
  ACCOUNT_GROUPS,
  SECTIONS_BY_TYPE,
  SUBTYPE_LABELS,
  TYPE_LABELS,
  defaultNormalBalance,
  hasSubtype,
  type AccountRow,
  type AccountType,
} from "./types";

const TH =
  "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted max-sm:text-[12.5px] pointer-coarse:text-[12.5px]";
const TD =
  "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";

/** Orders accounts within a group so child accounts (e.g. Accumulated Depreciation) sit right below their parent. */
function orderWithChildren(
  rows: AccountRow[],
): (AccountRow & { isChild: boolean })[] {
  const ids = new Set(rows.map((r) => r.id));
  const children = new Map<string, AccountRow[]>();
  const roots: AccountRow[] = [];
  for (const r of rows) {
    if (r.parentId && ids.has(r.parentId)) {
      const list = children.get(r.parentId) ?? [];
      list.push(r);
      children.set(r.parentId, list);
    } else {
      roots.push(r);
    }
  }
  const out: (AccountRow & { isChild: boolean })[] = [];
  for (const r of roots) {
    out.push({ ...r, isChild: false });
    for (const c of children.get(r.id) ?? []) out.push({ ...c, isChild: true });
  }
  return out;
}

function AccountTableRow({
  orgSlug,
  account,
  isChild,
  canEdit,
}: {
  orgSlug: string;
  account: AccountRow;
  isChild: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [editCode, setEditCode] = useState(false);
  const [codeVal, setCodeVal] = useState(account.code);
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState(account.name);

  const [reclassifying, setReclassifying] = useState(false);
  const [reType, setReType] = useState<AccountType>(account.type);
  const [reSub, setReSub] = useState<string>(
    account.subtype ?? (hasSubtype(account.type) ? "current" : ""),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sectionOpts = SECTIONS_BY_TYPE[account.type] ?? [];

  const run = (
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    onOk?: () => void,
  ) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        onOk?.();
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <tr
      className={cn(
        "border-t border-border transition-colors hover:bg-surface-2",
        account.status === "disabled" && "opacity-60",
      )}
    >
      <td
        className={cn(
          TD,
          "whitespace-nowrap text-left text-ink",
          isChild ? "pl-10" : "pl-6",
        )}
      >
        {editCode ? (
          <div className="flex items-center gap-1.5">
            <Input
              aria-label="Account code"
              value={codeVal}
              onChange={(e) => setCodeVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !pending)
                  run(
                    () =>
                      updateAccountAction(orgSlug, account.id, {
                        code: codeVal,
                      }),
                    () => setEditCode(false),
                  );
                if (e.key === "Escape") {
                  setCodeVal(account.code);
                  setEditCode(false);
                  setError(null);
                }
              }}
              className="h-7 w-24 px-2 text-[12px]"
              autoFocus
            />
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    updateAccountAction(orgSlug, account.id, { code: codeVal }),
                  () => setEditCode(false),
                )
              }
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setCodeVal(account.code);
                setEditCode(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {isChild && (
              <span aria-hidden="true" className="text-muted">
                ↳
              </span>
            )}
            <span className="num whitespace-nowrap text-[12.5px] text-ink-2">
              {account.code}
            </span>
            {account.system && (
              <span
                className="chip"
                title="Kira posts to this account automatically: its code and type stay fixed and it cannot be disabled or deleted."
              >
                System
              </span>
            )}
            {canEdit && !account.system && (
              <button
                type="button"
                className="text-[11.5px] text-brand hover:underline"
                onClick={() => {
                  setCodeVal(account.code);
                  setEditCode(true);
                }}
              >
                Edit
              </button>
            )}
          </div>
        )}
      </td>

      <td className={cn(TD, "text-left text-[12.5px] text-ink")}>
        {editName ? (
          <div className="flex items-center gap-1.5">
            <Input
              aria-label="Account name"
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !pending)
                  run(
                    () =>
                      updateAccountAction(orgSlug, account.id, {
                        name: nameVal,
                      }),
                    () => setEditName(false),
                  );
                if (e.key === "Escape") {
                  setNameVal(account.name);
                  setEditName(false);
                  setError(null);
                }
              }}
              className="h-7 min-w-[200px] px-2 text-[12px]"
              autoFocus
            />
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    updateAccountAction(orgSlug, account.id, { name: nameVal }),
                  () => setEditName(false),
                )
              }
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setNameVal(account.name);
                setEditName(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[12.5px]">{account.name}</span>
            {canEdit && (
              <button
                type="button"
                className="text-[11.5px] text-brand hover:underline"
                onClick={() => {
                  setNameVal(account.name);
                  setEditName(true);
                }}
              >
                Edit
              </button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="m-0 mt-1 text-[11.5px] text-negative">
            {error}
          </p>
        )}
      </td>

      <td
        className={cn(
          TD,
          "whitespace-nowrap text-left text-[12.5px] text-muted",
        )}
      >
        {account.subtype
          ? (SUBTYPE_LABELS[account.subtype] ?? account.subtype)
          : "–"}
      </td>

      <td className={cn(TD, "text-left text-ink")}>
        <select
          aria-label="Statement section"
          className="rounded-[var(--radius)] border border-border bg-surface px-1.5 py-1 text-[12px] text-ink outline-none focus:border-ink disabled:opacity-50"
          value={account.section}
          disabled={!canEdit || pending}
          onChange={(e) =>
            run(() =>
              updateAccountAction(orgSlug, account.id, {
                section: e.target.value,
              }),
            )
          }
        >
          <option value="">Auto</option>
          {sectionOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>

      <td className={cn(TD, "whitespace-nowrap text-left text-[12.5px]")}>
        <span className="text-muted">MYR</span>
      </td>

      <td
        className={cn(
          TD,
          "whitespace-nowrap text-left text-[12.5px] text-ink-2",
        )}
      >
        {account.normalBalance === "debit" ? "Debit" : "Credit"}
      </td>

      <td className={cn(TD, "whitespace-nowrap text-left")}>
        <span className={account.status === "active" ? "chip pos" : "chip"}>
          {account.status === "active" ? "Active" : "Disabled"}
        </span>
      </td>

      <td className={cn(TD, "whitespace-nowrap text-right")}>
        {canEdit && (
          <div className="flex flex-nowrap items-center justify-end gap-1">
            {reclassifying ? (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <select
                  aria-label="New account type"
                  className="rounded-[var(--radius)] border border-border-strong bg-surface px-2 py-1 text-[12px] text-ink"
                  value={reType}
                  onChange={(e) => {
                    const next = e.target.value as AccountType;
                    setReType(next);
                    setReSub(hasSubtype(next) ? "current" : "");
                  }}
                >
                  {(Object.keys(TYPE_LABELS) as AccountType[]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                {hasSubtype(reType) && (
                  <select
                    aria-label="New account subtype"
                    className="rounded-[var(--radius)] border border-border-strong bg-surface px-2 py-1 text-[12px] text-ink"
                    value={reSub}
                    onChange={(e) => setReSub(e.target.value)}
                  >
                    <option value="current">Current</option>
                    <option value="non_current">Non-current</option>
                    {reType === "asset" && (
                      <option value="cash">Cash / bank</option>
                    )}
                  </select>
                )}
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        updateAccountAction(orgSlug, account.id, {
                          type: reType,
                          subtype: hasSubtype(reType) ? reSub : "",
                          normalBalance: defaultNormalBalance(reType),
                        }),
                      () => setReclassifying(false),
                    )
                  }
                >
                  Apply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setReType(account.type);
                    setReSub(account.subtype ?? "");
                    setReclassifying(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                {!account.system && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setReType(account.type);
                      setReSub(
                        account.subtype ??
                          (hasSubtype(account.type) ? "current" : ""),
                      );
                      setReclassifying(true);
                    }}
                  >
                    Reclassify
                  </Button>
                )}
                {account.type === "asset" && !isChild && !account.system && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    title={
                      account.isCash
                        ? "Remove this account from bank and cash payment selectors"
                        : "Mark this account as a bank or cash account so it shows up in payment selectors"
                    }
                    onClick={() =>
                      run(() =>
                        updateAccountAction(orgSlug, account.id, {
                          isCash: !account.isCash,
                        }),
                      )
                    }
                  >
                    {account.isCash ? "Unmark cash" : "Mark as cash"}
                  </Button>
                )}
                {!account.system && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        updateAccountAction(orgSlug, account.id, {
                          status:
                            account.status === "active" ? "disabled" : "active",
                        }),
                      )
                    }
                  >
                    {account.status === "active" ? "Disable" : "Enable"}
                  </Button>
                )}
                {account.system ? null : confirmDelete ? (
                  <div className="inline-flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => deleteAccountAction(orgSlug, account.id),
                          () => setConfirmDelete(false),
                        )
                      }
                    >
                      Confirm delete
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function AccountsClient({
  orgSlug,
  accounts,
  canEdit,
}: {
  orgSlug: string;
  accounts: AccountRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [openFa, setOpenFa] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Add account state
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("asset");
  const [subtype, setSubtype] = useState("current");
  const [addErr, setAddErr] = useState<string | null>(null);
  const [addOk, setAddOk] = useState<string | null>(null);
  const [addPending, startAdd] = useTransition();

  // Fixed-asset pair state
  const [faName, setFaName] = useState("");
  const [faErr, setFaErr] = useState<string | null>(null);
  const [faOk, setFaOk] = useState<string | null>(null);
  const [faPending, startFa] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const grouped = useMemo(() => {
    return ACCOUNT_GROUPS.map((g) => ({
      ...g,
      rows: orderWithChildren(filtered.filter((a) => a.type === g.type)),
    })).filter((g) => g.rows.length > 0 || !query.trim());
  }, [filtered, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-72">
          <Input
            type="search"
            aria-label="Filter accounts"
            placeholder="Filter by code or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              aria-expanded={openAdd}
              aria-controls="add-account-panel"
              onClick={() => {
                setOpenAdd((v) => !v);
                setOpenFa(false);
                setAddErr(null);
              }}
            >
              New account
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-expanded={openFa}
              aria-controls="add-fixed-asset-panel"
              onClick={() => {
                setOpenFa((v) => !v);
                setOpenAdd(false);
                setFaErr(null);
              }}
            >
              New fixed-asset account
            </Button>
          </div>
        )}
      </div>

      {addOk && (
        <p role="status" className="m-0 text-[13px] font-medium text-positive">
          {addOk}
        </p>
      )}
      {faOk && (
        <p role="status" className="m-0 text-[13px] font-medium text-positive">
          {faOk}
        </p>
      )}

      {canEdit && openAdd && (
        <div
          id="add-account-panel"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="m-0 text-[13.5px] font-semibold text-ink">
              Add account
            </h2>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpenAdd(false)}
            >
              <X size={13} aria-hidden="true" /> Close
            </Button>
          </div>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setAddErr(null);
              setAddOk(null);
              startAdd(async () => {
                const r = await createAccountAction(orgSlug, {
                  code,
                  name,
                  type,
                  subtype: hasSubtype(type) ? subtype : "",
                  normalBalance: defaultNormalBalance(type),
                });
                if (r.ok) {
                  setAddOk(`Added ${code.trim()} · ${name.trim()}.`);
                  setCode("");
                  setName("");
                  setOpenAdd(false);
                  router.refresh();
                } else {
                  setAddErr(r.error);
                }
              });
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="accountCode"
                  className="text-[13px] font-medium text-ink-2"
                >
                  Code
                  <span className="ml-0.5 text-negative" aria-hidden="true">
                    *
                  </span>
                </label>
                <Input
                  id="accountCode"
                  name="accountCode"
                  required
                  placeholder="6100"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label
                  htmlFor="accountName"
                  className="text-[13px] font-medium text-ink-2"
                >
                  Name
                  <span className="ml-0.5 text-negative" aria-hidden="true">
                    *
                  </span>
                </label>
                <Input
                  id="accountName"
                  name="accountName"
                  required
                  placeholder="e.g. Marketing Expenses"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="accountType"
                  className="text-[13px] font-medium text-ink-2"
                >
                  Type
                </label>
                <Select
                  id="accountType"
                  name="accountType"
                  value={type}
                  onChange={(e) => {
                    const next = e.target.value as AccountType;
                    setType(next);
                    setSubtype(hasSubtype(next) ? "current" : "");
                  }}
                >
                  {(Object.keys(TYPE_LABELS) as AccountType[]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {hasSubtype(type) && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="accountSubtype"
                  className="text-[13px] font-medium text-ink-2"
                >
                  Subtype
                </label>
                <Select
                  id="accountSubtype"
                  name="accountSubtype"
                  aria-describedby="accountSubtype-message"
                  value={subtype}
                  onChange={(e) => setSubtype(e.target.value)}
                >
                  <option value="current">
                    Current (due within 12 months)
                  </option>
                  <option value="non_current">
                    Non-current (PPE, intangibles, due after 12 months)
                  </option>
                  {type === "asset" && (
                    <option value="cash">Bank or cash account</option>
                  )}
                </Select>
                <p
                  id="accountSubtype-message"
                  className="m-0 text-[13px] text-muted"
                >
                  MPERS balance-sheet classification. A bank or cash account
                  appears in the &quot;Paid from&quot; and &quot;Received
                  into&quot; payment selectors.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              {addErr ? (
                <p role="alert" className="m-0 text-[12.5px] text-negative">
                  {addErr}
                </p>
              ) : (
                <span />
              )}
              <Button type="submit" size="sm" disabled={addPending}>
                {addPending ? "Adding…" : "Add account"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {canEdit && openFa && (
        <div
          id="add-fixed-asset-panel"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="m-0 text-[13.5px] font-semibold text-ink">
              New fixed-asset account
            </h2>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpenFa(false)}
            >
              <X size={13} aria-hidden="true" /> Close
            </Button>
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setFaErr(null);
              setFaOk(null);
              startFa(async () => {
                const r = await createFixedAssetPairAction(orgSlug, faName);
                if (r.ok) {
                  setFaOk(
                    `Created ${r.assetCode} (${faName.trim()}) and ${r.depCode} (Accumulated Depreciation).`,
                  );
                  setFaName("");
                  setOpenFa(false);
                  router.refresh();
                } else {
                  setFaErr(r.error);
                }
              });
            }}
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                <label
                  htmlFor="faName"
                  className="text-[13px] font-medium text-ink-2"
                >
                  Fixed-asset class name
                  <span className="ml-0.5 text-negative" aria-hidden="true">
                    *
                  </span>
                </label>
                <Input
                  id="faName"
                  name="faName"
                  required
                  placeholder="e.g. Plant and Machinery"
                  value={faName}
                  onChange={(e) => setFaName(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" disabled={faPending}>
                {faPending ? "Creating…" : "Add fixed-asset account"}
              </Button>
            </div>
            <p className="m-0 text-[12.5px] text-muted">
              Creates the asset account plus its paired accumulated-depreciation
              account under Property, Plant and Equipment.
            </p>
            {faErr && (
              <p role="alert" className="m-0 text-[12.5px] text-negative">
                {faErr}
              </p>
            )}
          </form>
        </div>
      )}

      <div className="flex flex-col gap-4" data-testid="accounts-groups">
        {grouped.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-[13px] text-muted">
            No accounts match &quot;{query}&quot;.
          </div>
        ) : (
          grouped.map((g) => {
            const isOpen = !collapsed[g.type];
            return (
              <section
                key={g.type}
                className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setCollapsed((prev) => ({
                      ...prev,
                      [g.type]: !prev[g.type],
                    }))
                  }
                  className="flex w-full items-center justify-between gap-2 bg-surface px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    {isOpen ? (
                      <ChevronDown
                        size={14}
                        aria-hidden="true"
                        className="text-muted"
                      />
                    ) : (
                      <ChevronRight
                        size={14}
                        aria-hidden="true"
                        className="text-muted"
                      />
                    )}
                    {g.label}
                    <span className="num rounded-full bg-surface-2 px-1.5 py-px text-[11.5px] font-semibold text-muted">
                      {g.rows.length}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[13px] max-sm:text-[14px] pointer-coarse:text-[14px]">
                      <thead className="bg-surface">
                        <tr className="border-t border-border">
                          <th className={cn(TH, "w-[136px] text-left")}>
                            Code
                          </th>
                          <th className={cn(TH, "text-left")}>Name</th>
                          <th className={cn(TH, "text-left")}>Subtype</th>
                          <th className={cn(TH, "text-left")}>Section</th>
                          <th className={cn(TH, "text-left")}>Currency</th>
                          <th className={cn(TH, "text-left")}>Normal</th>
                          <th className={cn(TH, "text-left")}>Status</th>
                          <th className={cn(TH, "text-right")}>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((a) => (
                          <AccountTableRow
                            key={a.id}
                            orgSlug={orgSlug}
                            account={a}
                            isChild={a.isChild}
                            canEdit={canEdit}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
