"use client";

import React from "react";
import { Sidebar } from "@/components/chat/sidebar"; // We will rename/refactor this


export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-y-auto relative">
        {children}
      </main>
    </div>
  );
}
