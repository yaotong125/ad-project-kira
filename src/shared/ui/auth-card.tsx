/**
 * The auth card (lejar.ai's classes) sitting on Digits' glow: the glow is a blurred layer
 * behind the card, so it shows around the card's edges on the white page.
 */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div aria-hidden="true" className="auth-glow" />
      <div className="relative z-[1] rounded-2xl border border-border bg-surface p-7 shadow-[0_1px_2px_rgba(34,51,88,0.04),0_16px_36px_-18px_rgba(34,51,88,0.16)]">
        {children}
      </div>
    </div>
  );
}
