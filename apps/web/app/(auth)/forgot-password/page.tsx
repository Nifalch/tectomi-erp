"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiBaseUrl } from "@/lib/api/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // We deliberately do NOT branch on response — the API returns 200
      // whether or not the email exists, so we don't leak account presence.
      await fetch(`${getApiBaseUrl()}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } catch {
      setError("Couldn't reach the server. Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 px-6 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-md rounded-[2rem] border border-border/70 bg-white/85 p-8 shadow-panel backdrop-blur dark:bg-slate-950/70">
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft className="size-3.5" /> Back to sign in
        </Link>

        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
              <CheckCircle2 className="size-7" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Check your inbox</h2>
            <p className="mt-3 text-sm text-slate-500">
              If an account exists for <span className="font-medium text-slate-700 dark:text-slate-200">{email}</span>,
              we&apos;ve sent a password reset link. The link expires in 60 minutes.
            </p>
            <p className="mt-6 text-xs text-slate-400">
              Didn&apos;t get the email? Check spam, then{" "}
              <button
                onClick={() => {
                  setDone(false);
                  setError(null);
                }}
                className="font-medium text-primary hover:underline"
              >
                try again
              </button>
              .
            </p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Mail className="size-6" />
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Reset your password
            </h2>
            <p className="mt-3 text-sm text-slate-500">
              Enter the email tied to your Tectomi ERP account and we&apos;ll send a one-time link to set a new password.
            </p>

            <form className="mt-6 flex flex-col gap-3" onSubmit={handleSubmit}>
              <Input
                type="email"
                placeholder="you@tectomi.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" disabled={submitting || !email} className="w-full">
                {submitting ? "Sending…" : "Send reset link"}
              </Button>
            </form>
            {error && <p className="mt-4 text-sm text-rose-500">{error}</p>}
            <p className="mt-6 text-xs text-slate-400">
              For your security, we don&apos;t confirm whether an account exists for this email.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
