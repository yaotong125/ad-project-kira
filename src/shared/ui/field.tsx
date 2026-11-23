import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Label + input pair with lejar.ai's field classes (34px input, 13px text, ink focus ring).
 * `hint` renders the help line under the input (lejar.ai /signup: "At least 8 characters.").
 */
export function Field({
  id,
  label,
  hint,
  className,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string }) {
  const hintId = hint ? `${id}-message` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hintId}
        className={cn(
          "h-[34px] w-full rounded-[var(--radius)] border border-border-strong bg-surface px-3 text-[13px] text-ink outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-muted disabled:opacity-50 focus:border-ink focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ink)_10%,transparent)]",
          className,
        )}
        {...input}
      />
      {hint && (
        <p id={hintId} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
