import { Children, cloneElement, forwardRef, isValidElement, type InputHTMLAttributes, type ReactElement, type SelectHTMLAttributes } from "react";
import { cn } from "./cn";

/** lejar.ai's Input (module 793479). */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-[34px] w-full rounded-[var(--radius)] border border-border-strong bg-surface px-3",
        "text-[13px] text-ink outline-none transition-[border-color,box-shadow] duration-100",
        "placeholder:text-muted disabled:opacity-50",
        "focus:border-ink focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ink)_10%,transparent)]",
        className,
      )}
      {...rest}
    />
  );
});

/** lejar.ai's Select (module 967489). */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "kira-select h-[34px] w-full min-w-0 rounded-[var(--radius)] border border-border-strong bg-surface px-2.5",
        "text-[13px] text-ink outline-none transition-[border-color,box-shadow] duration-100",
        "focus:border-ink focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ink)_10%,transparent)]",
        "disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

/**
 * lejar.ai's form field (module 542450): label with a red "*" when required, the control, and a
 * hint line linked by aria-describedby. The control receives the id and aria attributes.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactElement;
}) {
  const messageId = `${htmlFor}-message`;
  const child = Children.only(children);
  const control = isValidElement(child)
    ? cloneElement(child as ReactElement<Record<string, unknown>>, {
        id: htmlFor,
        ...(hint ? { "aria-describedby": messageId } : {}),
        ...(required ? { "aria-required": true } : {}),
      })
    : child;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
        {required ? (
          <span className="ml-0.5 text-negative" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {control}
      {hint ? (
        <p id={messageId} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
