"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store/auth-store";

export function SessionGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (hydrated && !token && pathname !== "/login") {
      router.replace("/login");
    }
  }, [hydrated, pathname, router, token]);

  if (!hydrated) {
    return <div className="px-6 py-10 text-sm text-slate-500">Restoring workspace session...</div>;
  }

  if (!token) {
    return null;
  }

  return <>{children}</>;
}
