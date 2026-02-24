"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTypedClient } from "@/utils/supabase/client";

/** Sanitize auth errors for safe display. Avoids leaking internal details. */
function sanitizeAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("stack") || msg.length > 200) return "Authentication failed. Please try again.";
  return msg;
}

export function EmailAuthForm() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>, type: "signin" | "signup") {
    event.preventDefault();
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = createTypedClient();

    try {
      if (type === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
          },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in successfully.");
        router.push(nextPath);
        router.refresh();
      }
    } catch (err) {
      toast.error(sanitizeAuthError(err));
    } finally {
      setIsLoading(false);
    }
  }

  // Simplified view with tabs-like behavior using local state if Tabs component isn't available, 
  // but looking at list_dir output for ui, I don't see tabs.tsx. I will use simple state.
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  return (
    <div className="w-full space-y-4">
      <div className="flex w-full items-center justify-center space-x-4 pb-4">
        <button
          onClick={() => setMode('signin')}
          className={`text-sm font-medium transition-colors ${
            mode === 'signin' ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-primary"
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => setMode('signup')}
          className={`text-sm font-medium transition-colors ${
            mode === 'signup' ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-primary"
          }`}
        >
          Sign Up
        </button>
      </div>

      <form onSubmit={(e) => onSubmit(e, mode)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            placeholder="m@example.com"
            type="email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            disabled={isLoading}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            disabled={isLoading}
            required
            minLength={6}
          />
        </div>

        <Button className="w-full" type="submit" disabled={isLoading} aria-busy={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}
          {mode === 'signin' ? 'Sign In with Email' : 'Sign Up with Email'}
        </Button>
      </form>
    </div>
  );
}
