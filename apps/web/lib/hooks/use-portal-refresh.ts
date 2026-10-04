"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight revalidation hook for client portal pages.
 *
 * The portal intentionally avoids React Query — pages do a one-shot
 * `useEffect(() => fetch(), [])` for simplicity. That makes data stale
 * when the tab regains focus after a staff member has updated something
 * (e.g. marked an invoice paid). This hook re-runs the loader when:
 *
 *   - the document becomes visible again (Cmd+Tab back to the tab)
 *   - the window regains focus
 *   - the route's id param changes (via the `key` argument)
 *
 * `focus` and `visibilitychange` typically fire back-to-back on tab
 * restore, so we coalesce them through a 250 ms trailing throttle —
 * one fetch per "user returns to tab" event instead of two.
 */
export function usePortalRefresh(loader: () => void | Promise<void>, key?: string) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let lastFire = 0;
    const fire = () => {
      const now = Date.now();
      // Coalesce paired focus/visibilitychange events fired within a
      // ~250ms window into a single refresh.
      if (now - lastFire < 250) return;
      lastFire = now;
      void loaderRef.current();
    };

    fire();

    const onVisible = () => {
      if (document.visibilityState === "visible") fire();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", fire);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", fire);
    };
  }, [key]);
}
