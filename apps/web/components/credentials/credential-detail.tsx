"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { TextArea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  useCredentialAudit,
  useCredentialShareableUsers,
  type CredentialAccessRole,
  type CredentialRow,
  type CredentialSecret,
} from "@/lib/api/hooks";
import {
  useDeleteCredential,
  useRevealCredential,
  useRevokeCredentialShare,
  useShareCredential,
  useUpdateCredentialShare,
} from "@/lib/api/mutations";
import { toast } from "@/lib/hooks/use-toast";
import { useAuthStore } from "@/lib/store/auth-store";
import { cn } from "@/lib/utils";
import {
  CREDENTIAL_TYPE_META,
  getInitials,
  getPlatformMeta,
  getRevealTtlMs,
  timeAgo,
} from "./credential-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credential: CredentialRow | null;
  onEdit: (credential: CredentialRow) => void;
}

export function CredentialDetail({ open, onOpenChange, credential, onEdit }: Props) {
  const me = useAuthStore((s) => s.user);
  const reveal = useRevealCredential();
  const remove = useDeleteCredential();
  const [secret, setSecret] = useState<CredentialSecret | null>(null);
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reasonPromptOpen, setReasonPromptOpen] = useState(false);
  const [reasonInput, setReasonInput] = useState("");

  // Auto-lock window varies by sensitivity — high-stakes credentials lock
  // faster so they don't sit decrypted in a casually-open tab.
  const REVEAL_TTL_MS = credential ? getRevealTtlMs(credential) : 60_000;

  useEffect(() => {
    if (!open) {
      setSecret(null);
      setRevealedAt(null);
      setShowSecret(false);
      setReasonInput("");
      setReasonPromptOpen(false);
      return;
    }
  }, [open, credential?.id]);

  useEffect(() => {
    if (!revealedAt) return;
    const timeout = setTimeout(() => {
      setSecret(null);
      setRevealedAt(null);
      setShowSecret(false);
      toast({ variant: "info", title: "Vault re-locked", description: "Reveal again if you still need the secret." });
    }, REVEAL_TTL_MS);
    return () => clearTimeout(timeout);
  }, [revealedAt, REVEAL_TTL_MS]);

  if (!credential) return null;

  const meta = CREDENTIAL_TYPE_META[credential.type];
  const Icon = meta.icon;
  const isOwner = me?.id === credential.ownerId;
  const myAccess = credential.accesses.find((a) => a.user.id === me?.id);
  const canEdit = isOwner || myAccess?.role === "EDITOR";
  // Look up the platform meta when this is a social-media credential, so
  // the header can use the brand icon/color instead of a generic share icon.
  const platform =
    credential.type === "SOCIAL_MEDIA" && typeof credential.metadata?.platform === "string"
      ? getPlatformMeta(credential.metadata.platform as string)
      : null;
  const HeaderIcon = platform?.icon ?? Icon;

  const doReveal = async (reason?: string) => {
    try {
      const res = await reveal.mutateAsync({ id: credential.id, reason });
      setSecret(res.secret);
      setRevealedAt(Date.now());
      setShowSecret(true);
      setReasonPromptOpen(false);
      setReasonInput("");
    } catch {
      // toast already fired
    }
  };

  const handleReveal = () => {
    if (credential.requiresReason) {
      setReasonPromptOpen(true);
    } else {
      void doReveal();
    }
  };

  const handleDelete = async () => {
    await remove.mutateAsync(credential.id);
    setConfirmDelete(false);
    onOpenChange(false);
  };

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        size="lg"
        title={credential.name}
        description={credential.description ?? meta.description}
      >
        <div className="space-y-6">
          {/* Header summary card */}
          <div className="flex items-start gap-4 rounded-2xl border border-border bg-gradient-to-br from-white to-slate-50 p-4 dark:from-slate-900 dark:to-slate-950">
            <div
              className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", !platform && meta.chip)}
              style={platform ? { backgroundColor: platform.hex + "1a", color: platform.hex } : undefined}
            >
              <HeaderIcon className="size-6" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1", meta.badge)}>
                  {platform ? platform.label : meta.label}
                </span>
                {credential.highSecurity && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/30">
                    <ShieldAlert className="size-3" /> High security
                  </span>
                )}
                {credential.requiresReason && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
                    Reveal needs reason
                  </span>
                )}
                {credential.folder && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {credential.folder.name}
                  </span>
                )}
                {credential.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700"
                  >
                    #{t}
                  </span>
                ))}
              </div>
              {credential.username && (
                <CopyableRow label="Username" value={credential.username} />
              )}
              {credential.url && (
                <CopyableRow label="URL" value={credential.url} isLink />
              )}
              <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                <Clock className="size-3" />
                <span>
                  Updated {timeAgo(credential.updatedAt)} · Owner {credential.owner.firstName} {credential.owner.lastName}
                </span>
              </div>
            </div>
          </div>

          {/* Reveal area */}
          <section className="rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Secret</h4>
                <p className="text-xs text-slate-500">
                  {revealedAt
                    ? `Revealed ${timeAgo(new Date(revealedAt).toISOString())}. Auto-locks in ~${Math.round(REVEAL_TTL_MS / 1000)} s.`
                    : credential.requiresReason
                      ? "Reveal requires a reason. Every decryption is audited."
                      : "Hidden by default. Each reveal is recorded in the audit log."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {secret && (
                  <Button variant="secondary" size="sm" onClick={() => setShowSecret((v) => !v)}>
                    {showSecret ? <EyeOff className="mr-1.5 size-4" /> : <Eye className="mr-1.5 size-4" />}
                    {showSecret ? "Hide" : "Show"}
                  </Button>
                )}
                <Button size="sm" onClick={handleReveal} disabled={reveal.isPending}>
                  {reveal.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <KeyRound className="mr-1.5 size-4" />}
                  {secret ? "Re-reveal" : "Reveal"}
                </Button>
              </div>
            </div>
            {secret && (
              <div className="mt-4 space-y-2">
                <SecretView secret={secret} show={showSecret} />
              </div>
            )}
          </section>

          {/* Tabs: Sharing / Audit / Rotation */}
          <DetailTabs credential={credential} canEdit={canEdit} />

          {/* Footer actions */}
          <div className="flex items-center justify-between border-t border-border/60 pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => setConfirmDelete(true)}
              disabled={!isOwner}
              title={isOwner ? "Delete credential" : "Only the owner can delete"}
            >
              <Trash2 className="mr-1.5 size-4" /> Delete
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onEdit(credential);
              }}
              disabled={!canEdit}
            >
              <Pencil className="mr-1.5 size-4" /> Edit
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${credential.name}"?`}
        description="The encrypted payload, all shares, and the audit log will be permanently removed. There is no undo."
        confirmLabel="Delete credential"
        variant="destructive"
        onConfirm={handleDelete}
        loading={remove.isPending}
      />

      {/* Reveal-reason prompt — only when credential.requiresReason is true */}
      <Dialog open={reasonPromptOpen} onOpenChange={(o) => { if (!o) { setReasonPromptOpen(false); setReasonInput(""); } }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Why do you need this credential?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            This account is flagged as high-stakes. Your reason will be logged
            in the audit trail next to your name, IP, and timestamp.
          </p>
          <FormField label="Reason">
            <TextArea
              rows={3}
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="e.g. Scheduling next week's brand post on Instagram"
              autoFocus
            />
          </FormField>
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setReasonPromptOpen(false); setReasonInput(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => doReveal(reasonInput.trim())}
              disabled={reveal.isPending || reasonInput.trim().length < 4}
            >
              {reveal.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Reveal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CopyableRow({ label, value, isLink = false }: { label: string; value: string; isLink?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-20 shrink-0 text-xs uppercase tracking-wider text-slate-400">{label}</span>
      {isLink ? (
        <a href={value} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
          {value}
        </a>
      ) : (
        <span className="truncate font-mono text-slate-700 dark:text-slate-200">{value}</span>
      )}
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast({ variant: "success", title: "Copied" });
          } catch {
            /* clipboard blocked */
          }
        }}
        className="ml-auto rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        title="Copy"
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

function SecretView({ secret, show }: { secret: CredentialSecret; show: boolean }) {
  const entries = useMemo(
    () =>
      Object.entries(secret).filter(([, v]) => typeof v === "string" && v.length > 0) as Array<
        [keyof CredentialSecret, string]
      >,
    [secret],
  );

  if (entries.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900/60">
        This credential has no stored secret value.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <SecretField key={key} fieldKey={key} value={val} show={show} />
      ))}
    </div>
  );
}

const SECRET_LABELS: Partial<Record<keyof CredentialSecret, string>> = {
  password: "Password",
  apiKey: "API key",
  apiSecret: "API secret",
  privateKey: "Private key",
  publicKey: "Public key",
  certificate: "Certificate",
  connectionString: "Connection string",
  host: "Host",
  port: "Port",
  database: "Database",
  envContent: ".env",
  cardNumber: "Card number",
  cardHolder: "Holder",
  cardExpiry: "Expiry",
  cardCvv: "CVV",
  pin: "PIN",
  note: "Note",
  value: "Value",
  emailAddress: "Email",
  recoveryEmail: "Recovery email",
  recoveryPhone: "Recovery phone",
  appPassword: "App password",
  twoFactorBackup: "2FA backup codes",
  handle: "Handle",
};

function SecretField({
  fieldKey,
  value,
  show,
}: {
  fieldKey: keyof CredentialSecret;
  value: string;
  show: boolean;
}) {
  const label = SECRET_LABELS[fieldKey] ?? fieldKey;
  const multiline =
    value.includes("\n") ||
    value.length > 80 ||
    fieldKey === "envContent" ||
    fieldKey === "privateKey" ||
    fieldKey === "certificate" ||
    fieldKey === "note" ||
    fieldKey === "twoFactorBackup";

  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast({ variant: "success", title: `${label} copied` });
            } catch {
              toast({ variant: "error", title: "Couldn't copy" });
            }
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-500 transition hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <Copy className="size-3" /> Copy
        </button>
      </div>
      {multiline ? (
        <pre className={cn("max-h-48 overflow-auto rounded-lg bg-white p-2 font-mono text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-200", !show && "blur-sm select-none")}>
{value}
        </pre>
      ) : (
        <div className={cn("font-mono text-sm text-slate-900 dark:text-white break-all", !show && "blur-sm select-none")}>
          {value}
        </div>
      )}
    </div>
  );
}

function SharingTab({ credential, canEdit }: { credential: CredentialRow; canEdit: boolean }) {
  const [search, setSearch] = useState("");
  const usersQuery = useCredentialShareableUsers(search);
  const share = useShareCredential(credential.id);
  const updateRole = useUpdateCredentialShare(credential.id);
  const revoke = useRevokeCredentialShare(credential.id);
  const [adding, setAdding] = useState(false);

  const existingUserIds = new Set([credential.ownerId, ...credential.accesses.map((a) => a.user.id)]);
  const suggestions = (usersQuery.data ?? []).filter((u) => !existingUserIds.has(u.id));

  return (
    <div className="space-y-4 pt-4">
      {/* Owner row */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-white p-3 dark:bg-slate-950">
        <Avatar initials={getInitials(credential.owner)} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
            {credential.owner.firstName} {credential.owner.lastName}
          </div>
          <div className="truncate text-xs text-slate-500">{credential.owner.email}</div>
        </div>
        <Badge tone="info" size="sm">OWNER</Badge>
      </div>

      {/* Shared rows */}
      {credential.accesses.length > 0 && (
        <div className="space-y-2">
          {credential.accesses.map((access) => (
            <div key={access.id} className="flex items-center gap-3 rounded-xl border border-border bg-white p-3 dark:bg-slate-950">
              <Avatar initials={getInitials(access.user)} className="size-9" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                  {access.user.firstName} {access.user.lastName}
                </div>
                <div className="truncate text-xs text-slate-500">{access.user.email}</div>
              </div>
              <Select
                value={access.role}
                onValueChange={(v) => updateRole.mutate({ accessId: access.id, role: v as CredentialAccessRole })}
                options={[
                  { value: "VIEWER", label: "Viewer" },
                  { value: "EDITOR", label: "Editor" },
                ]}
                size="sm"
                disabled={!canEdit}
                className="w-28"
              />
              {canEdit && (
                <button
                  onClick={() => revoke.mutate(access.id)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                  title="Revoke access"
                >
                  <UserMinus className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new */}
      {canEdit ? (
        <div className="rounded-xl border border-dashed border-border p-3">
          {!adding ? (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              <UserPlus className="mr-1.5 size-4" /> Share with someone
            </Button>
          ) : (
            <div className="space-y-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                autoFocus
              />
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-white dark:bg-slate-950">
                {suggestions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-slate-400">
                    {search ? "No matching users." : "Type to search teammates."}
                  </div>
                ) : (
                  suggestions.map((u) => (
                    <button
                      key={u.id}
                      onClick={async () => {
                        await share.mutateAsync({ userId: u.id, role: "VIEWER" });
                        setSearch("");
                        setAdding(false);
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <Avatar initials={getInitials(u)} className="size-8" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-900 dark:text-white">{u.firstName} {u.lastName}</div>
                        <div className="truncate text-xs text-slate-500">{u.email}</div>
                      </div>
                      <Plus className="size-4 text-slate-400" />
                    </button>
                  ))
                )}
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setSearch(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400">Only the owner or an editor can manage sharing.</p>
      )}
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  CREATED: "Created",
  UPDATED: "Updated metadata",
  REVEALED: "Revealed secret",
  SHARED: "Shared",
  UNSHARED: "Revoked access",
  ROLE_CHANGED: "Changed role",
  ROTATED: "Rotated secret",
  DELETED: "Deleted",
  RENAMED: "Renamed",
  FOLDER_MOVED: "Moved folder",
};

const ACTION_TONE: Record<string, "neutral" | "positive" | "warning" | "destructive" | "info"> = {
  REVEALED: "warning",
  ROTATED: "info",
  DELETED: "destructive",
  SHARED: "positive",
  UNSHARED: "destructive",
  CREATED: "positive",
};

function AuditTab({ credentialId }: { credentialId: string }) {
  const audit = useCredentialAudit(credentialId);
  const rows = audit.data ?? [];

  if (audit.isLoading) {
    return <div className="py-6 text-center text-sm text-slate-400">Loading audit log…</div>;
  }
  if (rows.length === 0) {
    return <div className="py-6 text-center text-sm text-slate-400">No audit events yet.</div>;
  }

  return (
    <ol className="relative space-y-0 border-l border-border/60 pt-4">
      {rows.map((row) => {
        const label = ACTION_LABEL[row.action] ?? row.action;
        const tone = ACTION_TONE[row.action] ?? "neutral";
        return (
          <li key={row.id} className="relative pl-6 pb-4">
            <span className={cn(
              "absolute -left-1.5 top-1 size-3 rounded-full ring-4 ring-white dark:ring-slate-900",
              tone === "warning" && "bg-amber-500",
              tone === "info" && "bg-blue-500",
              tone === "destructive" && "bg-red-500",
              tone === "positive" && "bg-emerald-500",
              tone === "neutral" && "bg-slate-400",
            )} />
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone} size="sm">{label}</Badge>
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {row.user.firstName} {row.user.lastName}
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">{timeAgo(row.createdAt)}</span>
            </div>
            {typeof row.metadata?.reason === "string" && row.metadata.reason && (
              <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] italic text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                “{row.metadata.reason as string}”
              </p>
            )}
            {row.ipAddress && (
              <p className="mt-1 text-[11px] text-slate-400">from {row.ipAddress}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function RotationTab({ credential }: { credential: CredentialRow }) {
  const now = Date.now();
  const lastRotated = credential.lastRotatedAt ? new Date(credential.lastRotatedAt).getTime() : null;
  const expiresAt = credential.expiresAt ? new Date(credential.expiresAt).getTime() : null;
  const interval = credential.rotationIntervalDays;
  const nextRotation = lastRotated && interval ? lastRotated + interval * 24 * 60 * 60 * 1000 : null;
  const overdue = nextRotation !== null && now > nextRotation;
  const expiringSoon = expiresAt !== null && expiresAt - now < 14 * 24 * 60 * 60 * 1000;

  return (
    <div className="space-y-3 pt-4">
      <RotationRow
        label="Last rotated"
        value={lastRotated ? new Date(lastRotated).toLocaleString() : "—"}
      />
      <RotationRow
        label="Rotation cadence"
        value={interval ? `Every ${interval} day${interval === 1 ? "" : "s"}` : "Not scheduled"}
      />
      <RotationRow
        label="Next rotation due"
        value={nextRotation ? new Date(nextRotation).toLocaleDateString() : "—"}
        tone={overdue ? "warning" : undefined}
        hint={overdue ? "Overdue — consider rotating now." : undefined}
      />
      <RotationRow
        label="Expires on"
        value={expiresAt ? new Date(expiresAt).toLocaleDateString() : "No expiry set"}
        tone={expiringSoon ? "warning" : undefined}
        hint={expiringSoon ? "Coming up in under 2 weeks." : undefined}
      />
    </div>
  );
}

function DetailTabs({ credential, canEdit }: { credential: CredentialRow; canEdit: boolean }) {
  const [tab, setTab] = useState<"sharing" | "audit" | "rotation">("sharing");
  return (
    <div className="space-y-3">
      <Tabs
        tabs={[
          { key: "sharing", label: "Sharing", count: credential.accesses.length + 1 },
          { key: "audit", label: "Audit log" },
          { key: "rotation", label: "Rotation" },
        ]}
        activeTab={tab}
        onTabChange={(k) => setTab(k as typeof tab)}
      />
      {tab === "sharing" && <SharingTab credential={credential} canEdit={canEdit} />}
      {tab === "audit" && <AuditTab credentialId={credential.id} />}
      {tab === "rotation" && <RotationTab credential={credential} />}
    </div>
  );
}

function RotationRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "warning";
  hint?: string;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 dark:bg-slate-950",
      tone === "warning" && "border-amber-200 bg-amber-50/60 dark:border-amber-700/50 dark:bg-amber-950/30",
    )}>
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">{hint}</div>}
      </div>
      <div className="text-sm font-medium text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}
