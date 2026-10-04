"use client";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { portalApi } from "@/lib/portal-api";

function LoginForm() {
  const sp = useSearchParams();
  const error = sp.get("e");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await portalApi.auth.requestLink(email);
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error === "invalid" && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>That link is invalid or expired. Request a new one below.</span>
        </div>
      )}

      {sent ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-4" /> Link sent
          </div>
          <p className="mt-1">If we have <span className="font-mono">{email}</span> on file, you&apos;ll receive a sign-in link within a minute. It expires in 15 minutes.</p>
          <button
            onClick={() => { setSent(false); setEmail(""); }}
            className="mt-3 text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
          >
            Try a different email
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            autoFocus
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            <Mail className="size-4" />
            {busy ? "Sending link…" : "Send sign-in link"}
          </button>
        </form>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Sign in to your portal</h1>
      <p className="mt-1 text-sm text-slate-500">
        We&apos;ll email you a one-time link — no password to remember.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-center text-[11px] text-slate-400">
        Trouble signing in? Reach out to your account manager.
      </p>
    </div>
  );
}
