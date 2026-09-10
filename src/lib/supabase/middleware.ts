import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/_next", "/icons", "/api/health"];
const PUBLIC_FILES = ["/manifest.json", "/sw.js", "/favicon.ico"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and the auth call.
  //
  // getClaims() rather than getUser(): this runs on every navigation and every
  // server-action POST, and getUser() means a round trip to the Auth server each
  // time. This project signs JWTs with an asymmetric key (ES256), so getClaims()
  // verifies the token locally with WebCrypto against a cached JWKS — no network
  // hop — while still refreshing an expiring session and writing the refreshed
  // cookies through the plumbing above. It falls back to getUser() on its own if
  // the project ever moves to a symmetric secret or WebCrypto is unavailable.
  //
  // This only decides redirects. Anything that renders or mutates data still
  // establishes identity authoritatively via getAuthUser() (getUser()) in
  // src/lib/auth.ts, and RLS remains the backstop on every query.
  const {
    data: claims,
  } = await supabase.auth.getClaims();
  const signedIn = !!claims?.claims?.sub;

  const path = request.nextUrl.pathname;
  const isPublic =
    PUBLIC_PREFIXES.some((p) => path.startsWith(p)) || PUBLIC_FILES.includes(path);

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Already signed in but visiting /login → send home.
  if (signedIn && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
