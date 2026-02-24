import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/utils/supabase/env";

/** Routes requiring authenticated user. Unauthenticated requests redirect to /login. */
export const PROTECTED_PATH_PREFIXES = ["/", "/dashboard", "/settings", "/chat", "/optimize", "/league"] as const;

/** Paths that should redirect to home when user is already authenticated (e.g. login). */
const AUTH_PATHS = ["/login"] as const;

/**
 * Refreshes the Supabase session (if needed) and enforces route protection.
 * Must return the response object that may have updated cookies from token refresh.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new Response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute =
    pathname === "/" ||
    PROTECTED_PATH_PREFIXES.some((p) => p !== "/" && pathname.startsWith(p));
  if (!user && isProtectedRoute) {
    const loginUrl = new URL("/login", request.url);
    const nextTarget = `${pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set("next", nextTarget);
    return NextResponse.redirect(loginUrl);
  }

  if (user && AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return supabaseResponse;
}
