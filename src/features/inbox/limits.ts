import type { Lang } from "@/shared/i18n";
import { INBOX_TEXT, type InboxTextKey } from "./copy-data";

/** lejar.ai's AI Inbox limits (upload module 977778, observed 2026-11-22): images or PDFs, 10 MB each, 20 at a time. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 20;
export const BUCKET = "source-documents";
export const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
export type AllowedType = (typeof ALLOWED_TYPES)[number];
/** The file picker also offers GIF, as on lejar.ai, but GIFs are refused as the wrong type. */
export const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,application/pdf";

const BY_EXTENSION: Record<string, AllowedType> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
export const EXTENSION: Record<AllowedType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** The file's type from its MIME type, or from its name when the browser gives none. */
export function fileType(name: string, mime: string): AllowedType | null {
  const m = mime.trim().toLowerCase().split(";")[0];
  if (m) return (ALLOWED_TYPES as readonly string[]).includes(m) ? (m as AllowedType) : null;
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return BY_EXTENSION[ext] ?? null;
}

export function isSha256(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
}

/** Per-file refusal codes, named as on lejar.ai. */
export type UploadFailure =
  | "empty"
  | "wrong_type"
  | "file_too_large"
  | "exists_in_inbox"
  | "compress_failed"
  | "image_unreadable"
  | "mismatch"
  | "network";

export function it(lang: Lang, key: InboxTextKey, vars?: Record<string, string | number>): string {
  const s: string = INBOX_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export function failureText(lang: Lang, reason: UploadFailure): string {
  switch (reason) {
    case "empty":
      return it(lang, "inbox.uploadRows.empty");
    case "wrong_type":
      return it(lang, "inbox.uploadRows.wrongType");
    case "file_too_large":
      return it(lang, "inbox.uploadRows.tooLarge", { max: MAX_FILE_BYTES / 1048576 });
    case "exists_in_inbox":
      return it(lang, "inbox.uploadRows.exists");
    case "compress_failed":
      return it(lang, "inbox.uploadRows.compressFailed");
    case "image_unreadable":
      return it(lang, "inbox.uploadRows.imageUnreadable");
    case "mismatch":
      return it(lang, "chat.upload.incomplete");
    default:
      return it(lang, "inbox.uploadRows.failed");
  }
}
