"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useUiStore } from "@/lib/store/ui-store";
import { Toaster } from "@/components/ui/toaster";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Short stale window — keeps quick navigation snappy (cache serves
            // instantly) but mutations + route re-entries always re-verify with
            // the server within 5s, so the UI tracks backend state tightly.
            staleTime: 5_000,
            // Re-verify on tab return — if someone edited a record in another
            // window or on their phone, you see it the moment you focus back.
            refetchOnWindowFocus: true,
            // Use cached data for the first paint, but kick off a refetch in
            // the background so any server-side changes land within ~100ms of
            // mount. This is the default React Query behavior — opting back in.
            refetchOnMount: true,
            // Also refetch when the browser reconnects to the network.
            refetchOnReconnect: true,
            // Cache in memory for 5 minutes so returning to a page is instant.
            gcTime: 5 * 60_000,
            // Retry once on failure with 500ms backoff.
            retry: 1,
            retryDelay: 500,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
