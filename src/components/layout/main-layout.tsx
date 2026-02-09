"use client";

import React, { useState } from "react";
import { Sidebar } from "@/components/chat/sidebar"; // We will rename/refactor this
import { ChatHistoryProvider } from "@/components/chat/chat-history-context";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";


export function MainLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <ChatHistoryProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <div className="hidden md:flex">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          />
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-background/70 backdrop-blur-sm"
              aria-label="Close sidebar"
              onClick={() => setMobileOpen(false)}
            />
            <Sidebar
              className="relative z-50 h-full shadow-2xl shadow-black/30"
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        )}

        <main className="relative flex flex-1 flex-col overflow-y-auto">
          <div className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-background/90 px-3 backdrop-blur md:hidden">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
            <span className="ml-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">FanVise</span>
          </div>
          {children}
        </main>
      </div>
    </ChatHistoryProvider>
  );
}
