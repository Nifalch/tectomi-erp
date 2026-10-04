"use client";

import type { FormEvent } from "react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, ShieldCheck, Sparkles, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginRequest } from "@/lib/api/client";
import { useAuthStore, setRememberPreference } from "@/lib/store/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const accessToken = useAuthStore((state) => state.accessToken);
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    if (accessToken) {
      router.replace("/dashboard");
    }
  }, [accessToken, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        setRememberPreference(remember);
        const session = await loginRequest(email.trim(), password);
        setSession(session);
        router.replace("/dashboard");
      } catch (submissionError) {
        setError(submissionError instanceof Error ? submissionError.message : "Invalid email or password.");
      }
    });
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      {/* Left Brand Showcase Panel */}
      <section className="relative hidden overflow-hidden bg-slate-950 text-white lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(249,115,22,0.30),transparent_45%),radial-gradient(ellipse_at_bottom_right,rgba(14,165,233,0.30),transparent_40%),radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.15),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-white-inverted.png"
              alt="Tectomi ERP"
              style={{ height: 32, width: "auto", maxWidth: 160 }}
            />
            <p className="text-xs uppercase tracking-[0.25em] text-orange-400 font-semibold">Enterprise Operations Platform</p>
          </div>

          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur-md mb-6">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              Tectomi ERP v2.0
            </div>
            <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-white leading-tight">
              Unified delivery, people, and business operations.
            </h1>
            <p className="mt-6 max-w-lg text-base text-white/70 leading-relaxed">
              Enterprise management suite engineered for modern technology organizations, agencies, and high-performance teams.
            </p>
          </div>

          <div className="flex flex-wrap gap-8 text-sm text-white/70 border-t border-white/10 pt-8">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-4 text-orange-400" />
              <span>Enterprise Grade Security</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Sparkles className="size-4 text-sky-400" />
              <span>Real-Time Performance Engine</span>
            </div>
          </div>
        </div>
      </section>

      {/* Right Secure Login Form */}
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-3xl border border-border/80 bg-card/90 p-8 shadow-panel backdrop-blur-xl sm:p-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.png" alt="Tectomi" className="size-10 object-contain select-none drop-shadow-sm" />
              <div>
                <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white block leading-tight">TECTOMI ERP</span>
                <span className="text-[11px] text-slate-400 block leading-tight">Internal Workspace</span>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              System Online
            </span>
          </div>

          <div className="mt-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Sign in to your account
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Enter your work credentials to access the platform.
            </p>
          </div>

          <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 block mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <Input
                  type="email"
                  placeholder="name@tectomi.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 rounded-xl pl-10"
                />
                <Mail className="size-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                  Password
                </label>
                <a href="/forgot-password" className="text-xs text-primary hover:underline font-medium">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 rounded-xl pl-10 pr-10"
                />
                <Lock className="size-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-start gap-2.5 select-none pt-1 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-0.5 size-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">Keep me signed in on this computer</span>
            </label>

            <Button
              type="submit"
              className="mt-2 w-full h-11 rounded-xl font-medium shadow-md shadow-orange-500/20 hover:shadow-orange-500/30 transition-all gap-2"
              disabled={isPending || !email || !password}
            >
              {isPending ? "Authenticating..." : "Sign in to Workspace"}
              <ArrowRight className="size-4" />
            </Button>
          </form>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-rose-500 dark:text-rose-400">
              {error}
            </div>
          ) : null}

          <div className="mt-8 flex items-center justify-between text-xs text-slate-400 border-t border-border/60 pt-4">
            <span>Tectomi ERP Platform</span>
            <span>Secure SSL Encrypted</span>
          </div>
        </div>
      </section>
    </main>
  );
}
