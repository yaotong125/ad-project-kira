"use client";

import { useId, useMemo, useState } from "react";
import { Input } from "@/shared/ui/form-controls";
import type { AccountOption } from "./load";

export const accountLabel = (a: Pick<AccountOption, "code" | "name">) => `${a.code} · ${a.name}`;

/**
 * lejar.ai's account picker ("700-0000 · Cost of Sales", "Find account by name..."): a text box
 * with suggestions. Kira uses the browser's own suggestion list; typing a code or picking a
 * suggestion selects the account, anything else leaves it unset.
 */
export function AccountCombobox({
  accounts,
  value,
  onChange,
  placeholder,
  id,
  ariaLabel,
  invalid,
}: {
  accounts: AccountOption[];
  value: string;
  onChange: (code: string) => void;
  placeholder: string;
  id?: string;
  ariaLabel?: string;
  invalid?: boolean;
}) {
  const listId = useId();
  const byCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const current = byCode.get(value);
  const [text, setText] = useState(current ? accountLabel(current) : value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // The parent changed the account (e.g. a reset): show it.
    setLastValue(value);
    setText(current ? accountLabel(current) : value);
  }
  return (
    <>
      <Input
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        list={listId}
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const code = t.split("·")[0].trim();
          const hit = byCode.get(code);
          const next = hit ? hit.code : "";
          setLastValue(next);
          onChange(next);
        }}
        onBlur={() => {
          const hit = byCode.get(text.split("·")[0].trim());
          if (hit) setText(accountLabel(hit));
        }}
      />
      <datalist id={listId}>
        {accounts.map((a) => (
          <option key={a.code} value={accountLabel(a)} />
        ))}
      </datalist>
    </>
  );
}
