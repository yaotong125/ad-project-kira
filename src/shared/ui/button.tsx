import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

/** Button variants and sizes copied from lejar.ai's Button module (chunk 519455); colours come from Kira's tokens. */
const VARIANTS = {
  // Lejar's primary is near-black; Kira's is turquoise with navy text (white on turquoise is too faint).
  primary: "bg-turquoise text-ink border-turquoise-2 hover:bg-turquoise-2",
  brand: "bg-brand text-white border-brand-2 hover:bg-brand-2",
  ai: "bg-ai text-white border-ai-2 hover:bg-ai-2",
  "ai-soft": "bg-ai-soft text-ai-ink border-ai/30 hover:border-ai/50",
  secondary: "bg-surface text-ink border-border-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink border-transparent shadow-none hover:bg-surface-2",
  danger: "bg-negative text-white border-negative hover:brightness-95",
} as const;

const SIZES = {
  sm: "h-[26px] px-[9px] text-[11.5px] rounded-md",
  default: "h-[30px] px-3 text-[12.5px]",
  lg: "h-9 px-3.5 text-[13.5px]",
  icon: "h-[30px] w-[30px] p-0",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "default", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius)] font-medium whitespace-nowrap shadow-[var(--shadow-xs)] border transition-[background-color,border-color,transform] duration-100 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, className, type = "button", ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest} />;
});
