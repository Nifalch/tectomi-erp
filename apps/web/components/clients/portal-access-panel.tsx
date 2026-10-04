"use client";

import { FormEvent, useEffect, useState } from "react";
import { Mail, Shield, Trash2, Copy, Link2, MessageCircle, RefreshCw, ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { toast } from "@/lib/hooks/use-toast";

type Contact = {
  id: string;
  email: string;
  name: string | null;
  status: "ACTIVE" | "DISABLED";
  // Live count of un-revoked, un-expired sessions for this contact.
  // Backend computes via groupBy on ClientPortalSession.
  activeSessionCount?: number;
};
type InviteResponse = Contact & { magicLink: string | null; magicLinkExpiresAt: string | null };
type ResendResponse = { magicLink: string | null; magicLinkExpiresAt: string | null };
type RevokeResponse = { ok: boolean; revoked: number };

/**
 * Single source of truth for client-portal access. Each row is a
 * ClientContact (separate from the legacy `client.portalUser` table);
 * contacts log in via emailed magic links. The latest minted link is
 * surfaced inline so staff can copy/share it manually — useful when
 * SMTP isn't configured or the client prefers WhatsApp.
 */
export function PortalAccessPanel({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Contact[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // The freshly-minted magic link surfaced after invite or resend. Keyed
  // by contact id so each row can render its own pill independently.
  const [linkByContact, setLinkByContact] = useState<Record<string, { link: string; expiresAt: string | null }>>({});
  const [resending, setResending] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Contact | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const base = `/clients/${clientId}/portal-contacts`;

  const load = async () => {
    try {
      const data = await apiFetch<Contact[]>(base).catch(() => [] as Contact[]);
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast({ variant: "error", title: "Valid email required" });
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<InviteResponse>(base, {
        method: "POST",
        body: JSON.stringify({ email: value, name: name.trim() || undefined }),
      });
      setEmail(""); setName("");
      toast({ variant: "success", title: "Portal invite created" });
      if (res.magicLink) {
        setLinkByContact((m) => ({ ...m, [res.id]: { link: res.magicLink!, expiresAt: res.magicLinkExpiresAt } }));
      }
      await load();
    } catch (err) {
      toast({ variant: "error", title: "Failed to invite", description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: "ACTIVE" | "DISABLED") => {
    try {
      await apiFetch(`${base}/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast({ variant: "success", title: status === "ACTIVE" ? "Access enabled" : "Access paused" });
      await load();
    } catch (err) {
      toast({ variant: "error", title: "Failed to update", description: (err as Error).message });
    }
  };

  const revoke = async (contact: Contact) => {
    setRevokeBusy(true);
    try {
      const res = await apiFetch<RevokeResponse>(`${base}/${contact.id}/sessions`, { method: "DELETE" });
      const count = res?.revoked ?? 0;
      const who = contact.name || contact.email;
      // Tell the user exactly what happened — "0 sessions revoked" is
      // surprising but valid (contact never logged in), and previously
      // the toast looked identical for "killed 5 live logins" and
      // "they were already signed out".
      toast({
        variant: "success",
        title: count > 0
          ? `Signed ${who} out of ${count} ${count === 1 ? "device" : "devices"}`
          : `${who} had no active sessions`,
      });
      setRevokeTarget(null);
      await load();
    } catch (err) {
      toast({ variant: "error", title: "Failed to revoke", description: (err as Error).message });
    } finally {
      setRevokeBusy(false);
    }
  };

  const resend = async (id: string) => {
    setResending(id);
    try {
      const res = await apiFetch<ResendResponse>(`${base}/${id}/resend`, { method: "POST" });
      if (!res.magicLink) {
        toast({ variant: "error", title: "Could not mint a link" });
        return;
      }
      setLinkByContact((m) => ({ ...m, [id]: { link: res.magicLink!, expiresAt: res.magicLinkExpiresAt } }));
      toast({ variant: "success", title: "New magic link generated", description: "Share it below." });
    } catch (err) {
      toast({ variant: "error", title: "Failed to refresh link", description: (err as Error).message });
    } finally {
      setResending(null);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ variant: "success", title: "Link copied" });
    } catch {
      toast({ variant: "error", title: "Copy failed", description: "Select and copy manually." });
    }
  };

  return (
    <Card>
      <CardTitle>Client Portal</CardTitle>
      <CardDescription>
        Invite client contacts to the self-serve portal. They log in via a magic link — emailed automatically, plus shown here so you can share it via WhatsApp or any other channel.
      </CardDescription>

      {/* Invite form */}
      <form onSubmit={invite} className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormField label="Email" required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              autoComplete="email"
              required
            />
          </FormField>
          <FormField label="Name (optional)">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nina Shah"
              autoComplete="name"
            />
          </FormField>
        </div>
        <Button type="submit" disabled={busy || !email.trim()}>
          <Mail className="mr-1 size-4" />
          {busy ? "Inviting…" : "Invite to portal"}
        </Button>
      </form>

      {/* Contacts list */}
      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Portal contacts {rows.length > 0 && <span className="ml-1 text-slate-400">({rows.length})</span>}
        </div>
        {loading ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-slate-50/60 p-4 text-center text-sm text-slate-500 dark:bg-slate-900/40">
            No portal contacts yet. Invite the first one above.
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {rows.map((c) => {
              const fresh = linkByContact[c.id];
              return (
                <li key={c.id} className="px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 dark:text-white">{c.name || c.email}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        {c.name && <span>{c.email}</span>}
                        {c.name && <span aria-hidden>·</span>}
                        <span className={c.activeSessionCount && c.activeSessionCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}>
                          {c.activeSessionCount && c.activeSessionCount > 0
                            ? `${c.activeSessionCount} active ${c.activeSessionCount === 1 ? "session" : "sessions"}`
                            : "No active sessions"}
                        </span>
                      </div>
                    </div>
                    <Badge tone={c.status === "ACTIVE" ? "positive" : "neutral"} size="sm">
                      {c.status === "ACTIVE" ? "Active" : "Paused"}
                    </Badge>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => resend(c.id)}
                        disabled={resending === c.id || c.status !== "ACTIVE"}
                        title="Generate a fresh magic link for this contact"
                      >
                        <RefreshCw className={`mr-1 size-3.5 ${resending === c.id ? "animate-spin" : ""}`} />
                        {resending === c.id ? "Generating…" : "New link"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setStatus(c.id, c.status === "ACTIVE" ? "DISABLED" : "ACTIVE")}
                        title={c.status === "ACTIVE" ? "Pause portal access" : "Resume portal access"}
                      >
                        <Shield className="mr-1 size-3.5" />
                        {c.status === "ACTIVE" ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevokeTarget(c)}
                        disabled={!c.activeSessionCount}
                        title={
                          c.activeSessionCount
                            ? "Sign this contact out of every active session"
                            : "No active sessions to revoke"
                        }
                        className="text-rose-600 hover:text-rose-700 disabled:text-slate-400"
                      >
                        <Trash2 className="mr-1 size-3.5" />
                        Revoke sessions
                      </Button>
                    </div>
                  </div>

                  {/* Fresh magic link callout — only visible right after a
                      successful invite/resend. Includes Copy, WhatsApp,
                      and Open affordances so the staff member can deliver
                      it via whichever channel works. */}
                  {fresh && (
                    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-900 dark:border-sky-700/40 dark:bg-sky-900/20 dark:text-sky-100">
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                        <Link2 className="size-3.5" />
                        Magic link
                        {fresh.expiresAt && (
                          <span className="ml-2 font-normal opacity-80">
                            expires {new Date(fresh.expiresAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 break-all rounded-lg border border-sky-300/60 bg-white px-2 py-1.5 font-mono text-[11px] dark:bg-slate-900/60">
                        {fresh.link}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button type="button" size="sm" variant="ghost" onClick={() => copy(fresh.link)}>
                          <Copy className="mr-1 size-3.5" /> Copy
                        </Button>
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(`Sign in to your Tectomi ERP portal: ${fresh.link}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium hover:bg-sky-100 dark:hover:bg-sky-900/40"
                        >
                          <MessageCircle className="size-3.5" /> WhatsApp
                        </a>
                        <a
                          href={fresh.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium hover:bg-sky-100 dark:hover:bg-sky-900/40"
                        >
                          <ExternalLink className="size-3.5" /> Open
                        </a>
                      </div>
                      <p className="mt-2 text-[10px] opacity-80">
                        Single-use. Share via the channel your client uses — works even when email delivery is off.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && !revokeBusy && setRevokeTarget(null)}
        title="Revoke portal sessions?"
        description={
          revokeTarget
            ? `${revokeTarget.name || revokeTarget.email} will be signed out of all devices currently logged into the portal. They can log back in with a new magic link if their account is still active.`
            : ""
        }
        variant="destructive"
        confirmLabel={revokeBusy ? "Revoking…" : "Revoke sessions"}
        onConfirm={() => {
          if (revokeTarget) void revoke(revokeTarget);
        }}
        loading={revokeBusy}
      />
    </Card>
  );
}
