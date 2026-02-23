"use client";

import { useState } from "react";
import { Loader2, Terminal } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createTypedClient } from "@/utils/supabase/client";

export function DevLoginButton() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Only render in development
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const handleDevLogin = async () => {
    setIsLoading(true);
    const supabase = createTypedClient();
    
    // Hardcoded test credentials for development convenience
    // Ideally these should be environment variables, but for local dev shortcuts
    // consistent values are often preferred.
    // Ensure this user exists in your local/dev Supabase project!
    const email = "test@example.com";
    const password = "password123";

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      router.refresh();
      router.push("/dashboard"); // Or check query params for 'next'
    } catch (error) {
      console.error("Dev login failed:", error);
      alert("Dev login failed. Check console and ensure test user exists.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-lg border-2 border-dashed border-yellow-500/50 bg-yellow-500/10 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
        <Terminal className="h-4 w-4" />
        Development Mode Only
      </div>
      <Button 
        variant="outline" 
        onClick={handleDevLogin} 
        disabled={isLoading}
        className="w-full border-yellow-500/50 hover:bg-yellow-500/20"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Logging in as Dev...
          </>
        ) : (
          "Quick Login (test@example.com)"
        )}
      </Button>
    </div>
  );
}
