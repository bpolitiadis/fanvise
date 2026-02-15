import { NextResponse } from "next/server";
import { createTypedClient } from "@/utils/supabase/server";

const normalizeNextPath = (next: string | null): string => {
  if (!next) return "/dashboard";
  if (!next.startsWith("/")) return "/dashboard";
  return next;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = normalizeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createTypedClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${requestUrl.origin}${nextPath}`);
      }

      if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${nextPath}`);
      }

      return NextResponse.redirect(`${requestUrl.origin}${nextPath}`);
    }
  }

  return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_callback_failed`);
}
