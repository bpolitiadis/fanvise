"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTypedClient } from "@/utils/supabase/client";

export function EmailAuthForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>, type: 'signin' | 'signup') {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = createTypedClient();

    try {
      if (type === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${nextPath}`,
          },
        });
        if (error) throw error;
        setMessage({ type: 'success', text: "Check your email to confirm your account." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push(nextPath);
        router.refresh();
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
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
          {/* Using standard label since I didn't see label.tsx in ui list */}
          <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Email</label>
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
          <label htmlFor="password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Password</label>
          <Input 
            id="password" 
            name="password" 
            type="password" 
            autoComplete={mode === 'signin' ? "current-password" : "new-password"}
            disabled={isLoading}
            required
            minLength={6}
          />
        </div>

        {message && (
          <div className={`p-3 rounded-md text-sm ${
            message.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-destructive/10 text-destructive'
          }`}>
            {message.text}
          </div>
        )}

        <Button className="w-full" type="submit" disabled={isLoading}>
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
