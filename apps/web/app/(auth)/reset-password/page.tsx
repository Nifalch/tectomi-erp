"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>}>
      <ResetPasswordView />
    </Suspense>
  );
}

function ResetPasswordView() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError("This reset link is missing or invalid. Request a new one from the login screen.");
  }, [token]);

  const strength = scorePassword(password);
  const mismatch = !!confirm && confirm !== password;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${baseUrl}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? body?.message ?? "Reset failed");
      }
      setDone(true);
      // Send them back to the login screen after a short pause so they can
      // read the confirmation.
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed. Try again.");
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
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Password updated</h2>
            <p className="mt-3 text-sm text-slate-500">Redirecting you to sign in…</p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <KeyRound className="size-6" />
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Set a new password</h2>
            <p className="mt-3 text-sm text-slate-500">
              Pick something memorable to you and hard for everyone else to guess. Minimum 8 characters.
            </p>

            <form className="mt-6 flex flex-col gap-3" onSubmit={handleSubmit}>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="New password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              {/* Strength meter — purely visual, the server still has the
                  final word on what's accepted. */}
              {password.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`h-1 flex-1 rounded-full ${
                          i < strength.score
                            ? strength.score >= 3
                              ? "bg-emerald-500"
                              : strength.score === 2
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            : "bg-slate-200 dark:bg-slate-800"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">{strength.label}</span>
                </div>
              )}

              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm new password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                error={mismatch}
              />
              {mismatch && (
                <p className="text-xs text-rose-500">Passwords don&apos;t match yet.</p>
              )}

              <Button
                type="submit"
                disabled={submitting || !token || !password || password !== confirm || password.length < 8}
                className="mt-2 w-full"
              >
                {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Set new password
              </Button>
            </form>
            {error && <p className="mt-4 text-sm text-rose-500">{error}</p>}
          </>
        )}
      </div>
    </main>
  );
}

function scorePassword(p: string): { score: number; label: string } {
  if (p.length < 8) return { score: 0, label: "Too short" };
  let score = 1;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (p.length >= 14) score = Math.min(4, score + 1);
  const labels = ["Too short", "Weak", "OK", "Strong", "Excellent"];
  return { score, label: labels[score] };
}
