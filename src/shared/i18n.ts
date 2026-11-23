/**
 * Language handling, as observed on lejar.ai's auth pages:
 * - the language is chosen per URL with `?lang=ms` (Bahasa Melayu); no `lang` means English;
 * - the BM / EN switch keeps every other query parameter (next, error, notice);
 * - forms carry a hidden `lang` input so redirects after a Server Action stay in the same language.
 */
export type Lang = "en" | "ms";

export type SearchParams = Record<string, string | string[] | undefined>;

export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveLang(value: unknown): Lang {
  const v = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  return v === "ms" ? "ms" : "en";
}

/** Builds `path?query` from the given parameters, dropping empty values. */
export function href(path: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/** The same page in the other language: copies the current query, then sets or removes `lang`. */
export function switchLangHref(path: string, searchParams: SearchParams, to: Lang): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    const value = first(v);
    if (k !== "lang" && value) qs.set(k, value);
  }
  const params = Object.fromEntries(qs);
  return to === "ms" ? href(path, { lang: "ms", ...params }) : href(path, params);
}
