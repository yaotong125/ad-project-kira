/** Error (red) and notice (brand) boxes under an auth card's subtitle. */
export function AuthBanner({ kind, children }: { kind: "error" | "notice"; children: React.ReactNode }) {
  return kind === "error" ? (
    <p role="alert" className="mt-4 rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-[13px] text-negative">
      {children}
    </p>
  ) : (
    <p role="status" className="mt-4 rounded-md border border-brand-border bg-brand-soft px-3 py-2 text-[13px] text-brand-ink">
      {children}
    </p>
  );
}
