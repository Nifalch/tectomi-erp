"use client";

/**
 * /portfolio is now merged into /projects as a tab toggle. This stub redirects
 * any old bookmarks or inbound links to the unified page.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/ui/state";

export default function PortfolioRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/projects?view=health");
  }, [router]);
  return <LoadingState label="Redirecting to Projects…" />;
}
