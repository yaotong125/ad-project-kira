import { rm } from "./money";

/** lejar.ai's high-confidence threshold (module 248783: F = .75). */
export const HIGH_CONFIDENCE = 0.75;

/**
 * lejar.ai's "AI drafted" strip on a review form (chunk 3--xjje9ff3dj): confidence, or what to check
 * when the drafted lines do not add up to the total printed on the document.
 */
export function AiDraftBanner({ confidence, linesSen, printedTotalSen }: { confidence: number | null; linesSen: number; printedTotalSen: number | null }) {
  const mismatch = printedTotalSen !== null && printedTotalSen !== linesSen;
  const high = confidence !== null && confidence >= HIGH_CONFIDENCE && !mismatch;
  const label = mismatch
    ? `Lines sum to ${rm(linesSen)}, the document prints ${rm(printedTotalSen)}`
    : high
      ? "High confidence"
      : "Check the amounts before posting";
  return (
    <div
      className={
        high
          ? "flex flex-wrap items-center gap-2 rounded-[10px] border border-ai-soft bg-ai-soft/40 px-3 py-2"
          : "flex flex-wrap items-center gap-2 rounded-[10px] border border-warning/40 bg-warning-soft px-3 py-2"
      }
    >
      <span className="inline-flex h-[22px] items-center rounded-full border border-ai-soft bg-ai-soft px-2 text-[11.5px] font-medium text-ai-ink">AI drafted</span>
      <span className="text-[13px] text-ink-2">{label}</span>
      {printedTotalSen !== null && (
        <span className="basis-full text-[12.5px] text-ink-2">
          <span className="font-medium">Printed on the document</span> <span className="num">Total {rm(printedTotalSen)}</span>
          {!mismatch && <span className="text-positive"> Matches the draft</span>}
        </span>
      )}
    </div>
  );
}
