"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form";
import { useChangeOwnPassword } from "@/lib/api/mutations";
import { cn } from "@/lib/utils";

/**
 * Tiny self-serve password change card embedded in /profile. Calls the
 * auth/change-password endpoint which verifies the current password and
 * revokes other refresh tokens server-side.
 */
export function ChangePasswordCard() {
  const change = useChangeOwnPassword();
  const [show, setShow] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = !!confirm && confirm !== next;
  const tooShort = next.length > 0 && next.length < 8;
  const same = current.length > 0 && next.length > 0 && current === next;
  const disabled =
    !current ||
    next.length < 8 ||
    confirm !== next ||
    same ||
    change.isPending;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      // toast handled by mutation
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="size-5" />
        </div>
        <div>
          <CardTitle>Password</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Pick a fresh password. Other devices will be signed out so a leaked session can&apos;t outlive the change.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <FormField label="Current password">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={show ? "Hide" : "Show"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="New password">
            <Input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              error={tooShort || same}
            />
          </FormField>
          <FormField label="Confirm new password">
            <Input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={mismatch}
            />
          </FormField>
        </div>

        {(tooShort || mismatch || same) && (
          <p className={cn("text-xs", "text-rose-500")}>
            {tooShort && "Password must be at least 8 characters."}
            {!tooShort && mismatch && "Passwords don't match."}
            {!tooShort && !mismatch && same && "New password must differ from the current one."}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="size-3.5" /> Hashed server-side with bcrypt
          </span>
          <Button type="submit" disabled={disabled} size="sm">
            {change.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}
