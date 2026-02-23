"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createTypedClient } from "@/utils/supabase/client";

const GoogleIcon = () => (
  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.55-.21-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.16 3.57-8.64Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.87-3A7.16 7.16 0 0 1 12 19.28c-3.09 0-5.7-2.08-6.64-4.88H1.36v3.09A12 12 0 0 0 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.36 14.4A7.2 7.2 0 0 1 4.98 12c0-.83.14-1.64.38-2.4V6.5H1.36a12 12 0 0 0 0 11l4-3.1Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.73c1.76 0 3.35.6 4.6 1.78l3.44-3.44C17.94 1.12 15.24 0 12 0A12 12 0 0 0 1.36 6.5l4 3.1c.93-2.8 3.55-4.87 6.64-4.87Z"
    />
  </svg>
);

import { Suspense } from "react";

import { EmailAuthForm } from "@/components/auth/email-auth-form";
import { DevLoginButton } from "@/components/auth/dev-login-button";

function LoginContent() {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const nextPath = useMemo(() => {
    const candidate = searchParams.get("next");
    if (!candidate || !candidate.startsWith("/")) return "/dashboard";
    return candidate;
  }, [searchParams]);

  const startGoogleSignIn = async () => {
    setIsRedirecting(true);
    setErrorMessage(null);

    const supabase = createTypedClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      setIsRedirecting(false);
      setErrorMessage(error.message);
    }
  };

  return (
    <section className="w-full max-w-md space-y-6">
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to FanVise</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to launch your real-time fantasy intelligence cockpit.
          </p>
        </div>

        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full gap-2 bg-background hover:bg-accent"
            onClick={startGoogleSignIn}
            disabled={isRedirecting}
          >
            {isRedirecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <GoogleIcon />
                Sign in with Google
              </>
            )}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <EmailAuthForm />
        </div>

        {(searchParams.get("error") || errorMessage) && (
          <p className="mt-4 text-center text-sm text-destructive">
            {errorMessage ??
              "Authentication failed. Please try again or check your Supabase redirect URLs."}
          </p>
        )}
      </div>

      <DevLoginButton />
    </section>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={<div className="h-32 w-32 animate-pulse rounded-full bg-muted" />}>
        <LoginContent />
      </Suspense>
    </main>
  );
}
