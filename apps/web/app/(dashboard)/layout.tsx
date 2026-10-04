"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { RunningTimerPill } from "@/components/layout/running-timer-pill";
import { ChatWidget } from "@/components/chat/chat-widget";
import { SessionGuard } from "@/components/providers/session-guard";
import { useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const closeSidebar = () => useUiStore.getState().setSidebarOpen(false);

  return (
    <SessionGuard>
      {/* Print-only stylesheet: hide all app chrome and let the document occupy
          the full A4 page. Each print template still controls its own canvas. */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white !important; }
          .app-chrome { display: none !important; }
          .app-content { margin: 0 !important; padding: 0 !important; background: white !important; }
          .app-content > main { padding: 0 !important; background: white !important; }
        }
      `}</style>
      <div className="min-h-screen">
        {/* ── Desktop sidebar (static, always visible) ── */}
        <div className={cn("app-chrome fixed inset-y-0 left-0 z-30 hidden md:block transition-[width] duration-300", sidebarOpen ? "w-64" : "w-[68px]")}>
          <AppSidebar />
        </div>

        {/* ── Mobile sidebar (overlay) ── */}
        {sidebarOpen && (
          <>
            <div className="app-chrome fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden" onClick={closeSidebar} />
            <div className="app-chrome fixed inset-y-0 left-0 z-50 w-64 animate-in slide-in-from-left duration-300 md:hidden">
              <AppSidebar />
            </div>
          </>
        )}

        {/* ── Main area ── */}
        <div className={cn("app-content min-h-screen transition-[margin] duration-300", sidebarOpen ? "md:ml-64" : "md:ml-[68px]")}>
          <div className="app-chrome"><Topbar /></div>
          <main className="bg-grid bg-[size:28px_28px] px-3.5 py-4 pb-24 sm:px-6 sm:py-6 sm:pb-12 max-w-[1600px] mx-auto w-full">{children}</main>
        </div>
      </div>
      <div className="app-chrome"><RunningTimerPill /></div>
      <div className="app-chrome"><ChatWidget /></div>
    </SessionGuard>
  );
}
