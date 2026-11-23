import { ExternalLink } from "lucide-react";
import type { SourcePreview } from "./load";

/** lejar.ai's "Source document" panel beside an AI-drafted form: "Open full size" link and the file itself. */
export function SourceDocument({ source, label }: { source: SourcePreview; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 self-end text-[11.5px] text-brand hover:underline">
        Open full size
        <ExternalLink size={11} aria-hidden="true" />
      </a>
      {source.isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, shown as uploaded
        <img src={source.url} alt={label} className="max-h-[28rem] w-full rounded-[10px] border border-border object-contain" />
      ) : (
        <iframe src={source.url} title={source.name} className="h-[28rem] w-full rounded-[10px] border border-border" />
      )}
    </div>
  );
}
