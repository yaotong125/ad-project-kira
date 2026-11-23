import { NextResponse, type NextRequest } from "next/server";
import { hasAcceptedTerms } from "@/shared/auth/terms-key";
import { updateSession } from "@/shared/supabase/proxy-session";

const TERMS_PAGE = "/auth/terms";

/**
 * Pages anyone can open. Everything else needs a session: lejar.ai answers a signed-out
 * request for any other path with 307 → /login?next=<path> (observed for /new-org,
 * /post-auth, /auth/verify, …). /auth/forgot, /auth/reset, /terms and /privacy are linked
 * from the auth pages and built in later slices.
 */
const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/auth/callback",
  "/auth/confirm",
  "/auth/forgot",
  "/auth/reset",
  "/terms",
  "/privacy",
]);

/**
 * `?lang=ms` / `?lang=en` on any page also sets the `kira_lang` cookie, so signed-in pages (whose
 * links do not carry `lang`) keep the language. Auth pages still read `lang` from the URL, as on lejar.ai.
 */
function rememberLang(request: NextRequest, response: NextResponse): NextResponse {
  const lang = request.nextUrl.searchParams.get("lang");
  // Only a real visit changes the language: Next.js prefetches visible links (the BM/EN switch on the
  // auth pages), and setting the cookie from a prefetch flipped the whole app to the other language.
  const h = request.headers;
  const prefetch = h.get("next-router-prefetch") === "1" || h.get("purpose") === "prefetch" || (h.get("sec-purpose") ?? "").includes("prefetch");
  if (!prefetch && (lang === "ms" || lang === "en")) {
    response.cookies.set("kira_lang", lang, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  return response;
}

export async function proxy(request: NextRequest) {
  return rememberLang(request, await route(request));
}

async function route(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  // lejar.ai's "/" is its marketing site; Kira has none yet, so "/" (the logo link) opens sign-in.
  if (pathname === "/") {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = request.nextUrl.searchParams.get("lang") === "ms" ? "?lang=ms" : "";
    return NextResponse.redirect(login, 307);
  }

  const { response, claims } = await updateSession(request);

  if (claims) {
    // One-time Terms gate (Kira addition): an account without a Terms acceptance date (Google from
    // /login, users added in the Supabase dashboard, older accounts) must accept on /auth/terms
    // before opening any other page. Page loads only (GET), so form posts are never redirected.
    const exempt = PUBLIC_PATHS.has(pathname) || pathname.startsWith("/invite/") || pathname === TERMS_PAGE;
    if (!exempt && request.method === "GET" && !hasAcceptedTerms(claims.user_metadata)) {
      const terms = request.nextUrl.clone();
      terms.pathname = TERMS_PAGE;
      terms.search = "";
      const lang = request.nextUrl.searchParams.get("lang");
      if (lang === "ms") terms.searchParams.set("lang", "ms");
      terms.searchParams.set("next", pathname + search);
      return NextResponse.redirect(terms, 307);
    }
    return response;
  }
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/invite/")) return response;

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login, 307);
}

export const config = {
  // Skip Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
