/** Statement file types: lejar.ai's picker accepts CSV, PDF and photos (PNG, JPEG, WebP). */
export const STATEMENT_TYPES = {
  "text/csv": "csv",
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
export type StatementType = keyof typeof STATEMENT_TYPES;

const BY_EXT: Record<string, StatementType> = { csv: "text/csv", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export function statementType(name: string, mime: string): StatementType | null {
  const m = mime.trim().toLowerCase().split(";")[0];
  if (m === "text/csv" || m === "application/vnd.ms-excel" || m === "text/plain" || m === "application/csv") {
    return name.toLowerCase().endsWith(".csv") || m === "text/csv" ? "text/csv" : null;
  }
  if (m && m in STATEMENT_TYPES) return m as StatementType;
  return BY_EXT[name.slice(name.lastIndexOf(".") + 1).toLowerCase()] ?? null;
}
