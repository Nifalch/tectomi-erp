"use client";

import { useEffect, useState } from "react";

/**
 * Fallback verify page for any old magic links that landed on the SPA
 * instead of the API. New links point straight at the API (which sets
 * the session cookie and redirects). When someone hits this page anyway
 * — say from a screenshot or an older share — we forward the token to
 * the API verify endpoint so the flow still completes.
 */
export default function VerifyPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = new URL(window.location.href).searchParams.get("token");
    if (!token) {
      setError("missing");
      return;
    }
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
    // Same-page navigation so the cookie set by the API on its origin is
    // available when the redirect finally lands us back on /portal.
    window.location.replace(`${apiBase}/client-portal/auth/verify?token=${encodeURIComponent(token)}`);
  }, []);

  return (
    <div className="mx-auto mt-24 max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
      {error === "missing" ? (
        <>
          <p className="font-medium">Link is missing a token.</p>
          <p className="mt-1 text-sm text-neutral-500">Ask the team to send you a fresh sign-in link.</p>
        </>
      ) : (
        <p>Signing you in…</p>
      )}
    </div>
  );
}
