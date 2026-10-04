"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Dice5, Eye, EyeOff, Loader2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form";
import { useCreateCredential, useUpdateCredential } from "@/lib/api/mutations";
import { useRevealCredential } from "@/lib/api/mutations";
import {
  type CredentialFolderRow,
  type CredentialRow,
  type CredentialSecret,
  type CredentialType,
} from "@/lib/api/hooks";
import { toast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CREDENTIAL_TYPE_META,
  CREDENTIAL_TYPE_OPTIONS,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_OPTIONS,
  generatePassword,
  getPlatformMeta,
} from "./credential-utils";
import { ShieldAlert, Sparkles } from "lucide-react";

interface FormState {
  name: string;
  type: CredentialType;
  description: string;
  username: string;
  url: string;
  folderId: string;
  tags: string;
  expiresAt: string;
  rotationIntervalDays: string;
  // Social-media specific (lives in metadata.platform on the wire)
  platform: string;
  requiresReason: boolean;
  highSecurity: boolean;
  secret: CredentialSecret;
}

const EMPTY_FORM: FormState = {
  name: "",
  type: "PASSWORD",
  description: "",
  username: "",
  url: "",
  folderId: "",
  tags: "",
  expiresAt: "",
  rotationIntervalDays: "",
  platform: "",
  requiresReason: false,
  highSecurity: false,
  secret: {},
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an existing credential to edit it; omit to create a new one. */
  credential?: CredentialRow | null;
  folders: CredentialFolderRow[];
}

export function CredentialEditor({ open, onOpenChange, credential, folders }: Props) {
  const isEdit = !!credential;
  const create = useCreateCredential();
  const update = useUpdateCredential(credential?.id ?? "");
  const reveal = useRevealCredential();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // When editing, the secret block starts empty — user has to actively
  // press "Load existing secret" to pull the decrypted payload (which writes
  // an audit row). Lets you edit metadata without recording a reveal event.
  const [secretLoaded, setSecretLoaded] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (credential) {
      const platform =
        typeof credential.metadata?.platform === "string"
          ? (credential.metadata.platform as string)
          : "";
      setForm({
        name: credential.name,
        type: credential.type,
        description: credential.description ?? "",
        username: credential.username ?? "",
        url: credential.url ?? "",
        folderId: credential.folderId ?? "",
        tags: credential.tags.join(", "),
        expiresAt: credential.expiresAt ? credential.expiresAt.slice(0, 10) : "",
        rotationIntervalDays: credential.rotationIntervalDays?.toString() ?? "",
        platform,
        requiresReason: credential.requiresReason,
        highSecurity: credential.highSecurity,
        secret: {},
      });
      setSecretLoaded(false);
      setShowSecret(false);
    } else {
      setForm(EMPTY_FORM);
      setSecretLoaded(true); // create flow starts with empty secret fields ready to type
      setShowSecret(true);
    }
  }, [open, credential]);

  const meta = CREDENTIAL_TYPE_META[form.type];

  const folderOptions = useMemo(
    () => [{ value: "", label: "— Unfiled —" }, ...folders.map((f) => ({ value: f.id, label: f.name }))],
    [folders],
  );

  const setSecret = (patch: CredentialSecret) =>
    setForm((s) => ({ ...s, secret: { ...s.secret, ...patch } }));

  // When the user picks SOCIAL_MEDIA / EMAIL_ACCOUNT for a fresh credential,
  // turn on the strict defaults (reason on reveal + high-security relock).
  // Editing keeps whatever was previously set so we don't silently flip
  // policies behind a user's back.
  const handleTypeChange = (next: CredentialType) => {
    setForm((s) => {
      if (credential) return { ...s, type: next };
      const isSensitive = next === "SOCIAL_MEDIA" || next === "EMAIL_ACCOUNT";
      return {
        ...s,
        type: next,
        requiresReason: isSensitive,
        highSecurity: isSensitive,
      };
    });
  };

  const handleLoadSecret = async () => {
    if (!credential) return;
    // If the credential requires a reason, ask for it before loading so the
    // audit trail captures the editing context too. We piggy-back on the
    // window prompt for brevity here; the detail drawer has a nicer modal
    // for end-user reveals.
    let reason: string | undefined;
    if (credential.requiresReason) {
      const supplied = typeof window !== "undefined"
        ? window.prompt("Why are you opening this credential? (logged in the audit trail)")
        : null;
      if (!supplied || supplied.trim().length < 4) return;
      reason = supplied.trim();
    }
    const res = await reveal.mutateAsync({ id: credential.id, reason });
    setForm((s) => ({ ...s, secret: res.secret }));
    setSecretLoaded(true);
    setShowSecret(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ variant: "error", title: "Name is required" });
      return;
    }
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    // For SOCIAL_MEDIA, fold the platform pick into the metadata bag so it
    // round-trips. For other types we leave metadata untouched (server keeps
    // whatever the row already had via the partial update).
    const metadata =
      form.type === "SOCIAL_MEDIA" && form.platform
        ? { platform: form.platform }
        : undefined;

    const basePayload = {
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim() || undefined,
      username: form.username.trim() || undefined,
      url: form.url.trim() || undefined,
      folderId: form.folderId || null,
      tags,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      rotationIntervalDays: form.rotationIntervalDays
        ? Number(form.rotationIntervalDays)
        : null,
      requiresReason: form.requiresReason,
      highSecurity: form.highSecurity,
      ...(metadata ? { metadata } : {}),
    };

    try {
      if (isEdit) {
        // Only include `secret` on update when the user actually loaded /
        // typed one — leaves the existing ciphertext untouched otherwise.
        const updatePayload =
          secretLoaded && hasAnySecret(form.secret)
            ? { ...basePayload, secret: form.secret, markRotated: true }
            : basePayload;
        await update.mutateAsync(updatePayload);
      } else {
        await create.mutateAsync({ ...basePayload, secret: form.secret });
      }
      onOpenChange(false);
    } catch {
      // toast already fired inside the mutation
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={isEdit ? "Edit credential" : "Add credential"}
      description={
        isEdit
          ? "Update metadata, rotate the secret, or change visibility. Every reveal is audited."
          : "Stored encrypted with AES-256-GCM. Only the people you share with can decrypt."
      }
    >
      <div className="space-y-5">
        <FormField label="Name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. AWS root account — production"
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Type">
            <Select
              value={form.type}
              onValueChange={(v) => handleTypeChange(v as CredentialType)}
              options={CREDENTIAL_TYPE_OPTIONS}
            />
          </FormField>
          <FormField label="Folder">
            <Select
              value={form.folderId}
              onValueChange={(v) => setForm({ ...form, folderId: v })}
              options={folderOptions}
            />
          </FormField>
        </div>

        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900/60">
          <span className="font-medium text-slate-700 dark:text-slate-200">{meta.label}.</span>{" "}
          {meta.description}
        </p>

        <FormField label="Description (optional)">
          <TextArea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What is this for? Anything to watch out for?"
          />
        </FormField>

        {/* Platform picker — SOCIAL_MEDIA only. Auto-fills the URL hint. */}
        {form.type === "SOCIAL_MEDIA" && (
          <FormField label="Platform">
            <PlatformGrid
              value={form.platform}
              onChange={(p) => {
                const meta = getPlatformMeta(p);
                setForm((s) => ({
                  ...s,
                  platform: p,
                  // Pre-fill URL the first time so the row is searchable;
                  // user can still override.
                  url: s.url || (meta?.domain ? `https://${meta.domain}` : s.url),
                  // Pre-fill a friendly name when blank.
                  name: s.name || (meta ? `${meta.label} — company account` : s.name),
                }));
              }}
            />
          </FormField>
        )}

        {/* Plain (searchable) fields — kept outside the encrypted blob */}
        {form.type !== "NOTE" && form.type !== "ENV_FILE" && form.type !== "CARD" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label={
                form.type === "SOCIAL_MEDIA"
                  ? "Handle / username (optional, searchable)"
                  : form.type === "EMAIL_ACCOUNT"
                    ? "Email address (searchable)"
                    : "Username / login (optional)"
              }
            >
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder={
                  form.type === "SOCIAL_MEDIA"
                    ? "@tectomi"
                    : form.type === "EMAIL_ACCOUNT"
                      ? "social@tectomi.com"
                      : "admin@tectomi.com"
                }
              />
            </FormField>
            <FormField label="URL / host (optional)">
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://console.aws.amazon.com"
              />
            </FormField>
          </div>
        )}

        {/* Security policy toggles — auto-on for SOCIAL_MEDIA / EMAIL_ACCOUNT
            but exposed here so anyone can apply them to other types too. */}
        <SecurityToggles
          requiresReason={form.requiresReason}
          highSecurity={form.highSecurity}
          onChange={(patch) => setForm((s) => ({ ...s, ...patch }))}
        />

        {/* Secret block — collapsed for edits until user loads or replaces */}
        <SecretSection
          type={form.type}
          secret={form.secret}
          setSecret={setSecret}
          show={showSecret}
          onToggleShow={() => setShowSecret((v) => !v)}
          isEdit={isEdit}
          secretLoaded={secretLoaded}
          onLoadSecret={handleLoadSecret}
          loadingSecret={reveal.isPending}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Tags (comma-separated)">
            <Input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="prod, aws, billing"
            />
          </FormField>
          <FormField label="Expires on (optional)">
            <Input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </FormField>
        </div>

        <FormField label="Rotate every N days (optional)">
          <Input
            type="number"
            min={1}
            placeholder="e.g. 90 for a quarterly rotation"
            value={form.rotationIntervalDays}
            onChange={(e) => setForm({ ...form, rotationIntervalDays: e.target.value })}
          />
        </FormField>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create credential"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

function hasAnySecret(s: CredentialSecret): boolean {
  return Object.values(s).some((v) => typeof v === "string" && v.length > 0);
}

interface SecretSectionProps {
  type: CredentialType;
  secret: CredentialSecret;
  setSecret: (patch: CredentialSecret) => void;
  show: boolean;
  onToggleShow: () => void;
  isEdit: boolean;
  secretLoaded: boolean;
  onLoadSecret: () => void;
  loadingSecret: boolean;
}

function SecretSection({
  type,
  secret,
  setSecret,
  show,
  onToggleShow,
  isEdit,
  secretLoaded,
  onLoadSecret,
  loadingSecret,
}: SecretSectionProps) {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-slate-50/60 p-4 dark:bg-slate-900/40">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Secret payload</h4>
          <p className="text-xs text-slate-500">
            Encrypted at rest with AES-256-GCM. Never logged or returned in list responses.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleShow}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {show ? "Hide" : "Show"}
        </button>
      </header>

      {isEdit && !secretLoaded ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-white px-4 py-5 text-sm dark:bg-slate-950">
          <p className="text-slate-600 dark:text-slate-300">
            The current secret is encrypted. Load it to edit, or leave it untouched to update only the metadata.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onLoadSecret}
            disabled={loadingSecret}
          >
            {loadingSecret ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Load existing secret (audited)
          </Button>
        </div>
      ) : (
        <SecretFields type={type} secret={secret} setSecret={setSecret} show={show} />
      )}
    </section>
  );
}

function SecretFields({
  type,
  secret,
  setSecret,
  show,
}: {
  type: CredentialType;
  secret: CredentialSecret;
  setSecret: (patch: CredentialSecret) => void;
  show: boolean;
}) {
  const inputType = show ? "text" : "password";

  if (type === "PASSWORD") {
    return (
      <FormField label="Password">
        <PasswordInput
          value={secret.password ?? ""}
          onChange={(v) => setSecret({ password: v })}
          inputType={inputType}
        />
      </FormField>
    );
  }

  if (type === "API_KEY") {
    return (
      <div className="space-y-3">
        <FormField label="API key">
          <PasswordInput
            value={secret.apiKey ?? ""}
            onChange={(v) => setSecret({ apiKey: v })}
            inputType={inputType}
          />
        </FormField>
        <FormField label="API secret (optional)">
          <PasswordInput
            value={secret.apiSecret ?? ""}
            onChange={(v) => setSecret({ apiSecret: v })}
            inputType={inputType}
          />
        </FormField>
      </div>
    );
  }

  if (type === "SSH_KEY") {
    return (
      <div className="space-y-3">
        <FormField label="Private key">
          <TextArea
            rows={6}
            value={secret.privateKey ?? ""}
            onChange={(e) => setSecret({ privateKey: e.target.value })}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            className={cn(!show && "[-webkit-text-security:disc] [text-security:disc]")}
          />
        </FormField>
        <FormField label="Public key (optional, unencrypted)">
          <TextArea
            rows={2}
            value={secret.publicKey ?? ""}
            onChange={(e) => setSecret({ publicKey: e.target.value })}
            placeholder="ssh-ed25519 AAAA…"
          />
        </FormField>
      </div>
    );
  }

  if (type === "DATABASE") {
    return (
      <div className="space-y-3">
        <FormField label="Connection string">
          <PasswordInput
            value={secret.connectionString ?? ""}
            onChange={(v) => setSecret({ connectionString: v })}
            inputType={inputType}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Host"><Input value={secret.host ?? ""} onChange={(e) => setSecret({ host: e.target.value })} /></FormField>
          <FormField label="Port"><Input value={secret.port ?? ""} onChange={(e) => setSecret({ port: e.target.value })} /></FormField>
          <FormField label="Database"><Input value={secret.database ?? ""} onChange={(e) => setSecret({ database: e.target.value })} /></FormField>
          <FormField label="Password">
            <PasswordInput
              value={secret.password ?? ""}
              onChange={(v) => setSecret({ password: v })}
              inputType={inputType}
            />
          </FormField>
        </div>
      </div>
    );
  }

  if (type === "CERTIFICATE") {
    return (
      <div className="space-y-3">
        <FormField label="Certificate (PEM)">
          <TextArea rows={5} value={secret.certificate ?? ""} onChange={(e) => setSecret({ certificate: e.target.value })} />
        </FormField>
        <FormField label="Private key (PEM)">
          <TextArea rows={5} value={secret.privateKey ?? ""} onChange={(e) => setSecret({ privateKey: e.target.value })} />
        </FormField>
      </div>
    );
  }

  if (type === "ENV_FILE") {
    return (
      <FormField label=".env contents">
        <TextArea
          rows={10}
          value={secret.envContent ?? ""}
          onChange={(e) => setSecret({ envContent: e.target.value })}
          placeholder={"DATABASE_URL=postgres://...\nSTRIPE_KEY=sk_live_..."}
          className="font-mono text-xs"
        />
      </FormField>
    );
  }

  if (type === "CARD") {
    return (
      <div className="space-y-3">
        <FormField label="Card number">
          <PasswordInput value={secret.cardNumber ?? ""} onChange={(v) => setSecret({ cardNumber: v })} inputType={inputType} />
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Holder">
            <Input value={secret.cardHolder ?? ""} onChange={(e) => setSecret({ cardHolder: e.target.value })} />
          </FormField>
          <FormField label="Expiry">
            <Input placeholder="MM/YY" value={secret.cardExpiry ?? ""} onChange={(e) => setSecret({ cardExpiry: e.target.value })} />
          </FormField>
          <FormField label="CVV">
            <PasswordInput value={secret.cardCvv ?? ""} onChange={(v) => setSecret({ cardCvv: v })} inputType={inputType} />
          </FormField>
        </div>
        <FormField label="PIN (optional)">
          <PasswordInput value={secret.pin ?? ""} onChange={(v) => setSecret({ pin: v })} inputType={inputType} />
        </FormField>
      </div>
    );
  }

  if (type === "NOTE") {
    return (
      <FormField label="Secure note">
        <TextArea
          rows={8}
          value={secret.note ?? ""}
          onChange={(e) => setSecret({ note: e.target.value })}
          placeholder="Recovery codes, PINs, anything that needs to stay private."
        />
      </FormField>
    );
  }

  if (type === "SOCIAL_MEDIA") {
    return (
      <div className="space-y-3">
        <FormField label="Account email (used to sign in)">
          <Input
            value={secret.emailAddress ?? ""}
            onChange={(e) => setSecret({ emailAddress: e.target.value })}
            placeholder="social@tectomi.com"
          />
        </FormField>
        <FormField label="Password">
          <PasswordInput
            value={secret.password ?? ""}
            onChange={(v) => setSecret({ password: v })}
            inputType={inputType}
          />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Recovery email">
            <Input
              value={secret.recoveryEmail ?? ""}
              onChange={(e) => setSecret({ recoveryEmail: e.target.value })}
              placeholder="recovery@tectomi.com"
            />
          </FormField>
          <FormField label="Recovery phone">
            <Input
              value={secret.recoveryPhone ?? ""}
              onChange={(e) => setSecret({ recoveryPhone: e.target.value })}
              placeholder="+91 90000 00000"
            />
          </FormField>
        </div>
        <FormField label="2FA backup codes (one per line)">
          <TextArea
            rows={4}
            value={secret.twoFactorBackup ?? ""}
            onChange={(e) => setSecret({ twoFactorBackup: e.target.value })}
            placeholder={"abcd-1234\nefgh-5678\nijkl-9012"}
            className={cn("font-mono text-xs", !show && "[-webkit-text-security:disc] [text-security:disc]")}
          />
        </FormField>
        <FormField label="App password (if the platform issues one)">
          <PasswordInput
            value={secret.appPassword ?? ""}
            onChange={(v) => setSecret({ appPassword: v })}
            inputType={inputType}
          />
        </FormField>
      </div>
    );
  }

  if (type === "EMAIL_ACCOUNT") {
    return (
      <div className="space-y-3">
        <FormField label="Password">
          <PasswordInput
            value={secret.password ?? ""}
            onChange={(v) => setSecret({ password: v })}
            inputType={inputType}
          />
        </FormField>
        <FormField label="App password (for IMAP / SMTP clients)">
          <PasswordInput
            value={secret.appPassword ?? ""}
            onChange={(v) => setSecret({ appPassword: v })}
            inputType={inputType}
          />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Recovery email">
            <Input
              value={secret.recoveryEmail ?? ""}
              onChange={(e) => setSecret({ recoveryEmail: e.target.value })}
            />
          </FormField>
          <FormField label="Recovery phone">
            <Input
              value={secret.recoveryPhone ?? ""}
              onChange={(e) => setSecret({ recoveryPhone: e.target.value })}
            />
          </FormField>
        </div>
        <FormField label="2FA backup codes (one per line)">
          <TextArea
            rows={4}
            value={secret.twoFactorBackup ?? ""}
            onChange={(e) => setSecret({ twoFactorBackup: e.target.value })}
            className={cn("font-mono text-xs", !show && "[-webkit-text-security:disc] [text-security:disc]")}
          />
        </FormField>
      </div>
    );
  }

  return (
    <FormField label="Value">
      <PasswordInput
        value={secret.value ?? ""}
        onChange={(v) => setSecret({ value: v })}
        inputType={inputType}
      />
    </FormField>
  );
}

function PlatformGrid({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {SOCIAL_PLATFORMS.map((p) => {
        const Icon = p.icon;
        const active = value === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key)}
            className={cn(
              "group flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition",
              active
                ? "border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900"
                : "border-border bg-white hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900",
            )}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg ring-1",
                active ? "bg-white/10 ring-white/20 dark:bg-slate-900/10 dark:ring-slate-900/10" : "ring-slate-200 dark:ring-slate-800",
              )}
              style={!active ? { color: p.hex } : undefined}
            >
              <Icon className="size-4" />
            </span>
            <span className="truncate">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SecurityToggles({
  requiresReason,
  highSecurity,
  onChange,
}: {
  requiresReason: boolean;
  highSecurity: boolean;
  onChange: (patch: { requiresReason?: boolean; highSecurity?: boolean }) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-gradient-to-br from-rose-50/40 via-white to-amber-50/40 p-4 dark:from-rose-950/20 dark:via-slate-950 dark:to-amber-950/20">
      <header className="mb-3 flex items-center gap-2">
        <ShieldAlert className="size-4 text-rose-500" />
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Security policy</h4>
      </header>
      <div className="space-y-2">
        <SecurityToggleRow
          checked={requiresReason}
          onChange={(v) => onChange({ requiresReason: v })}
          title="Require a reason on every reveal"
          hint="The reason is stored on the audit row alongside who/when/IP."
        />
        <SecurityToggleRow
          checked={highSecurity}
          onChange={(v) => onChange({ highSecurity: v })}
          title="High-stakes credential"
          hint="Auto-relocks the revealed secret in ~30 seconds and flags the row in the list."
          icon={<Sparkles className="size-3.5 text-amber-500" />}
        />
      </div>
    </section>
  );
}

function SecurityToggleRow({
  checked,
  onChange,
  title,
  hint,
  icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint: string;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-white p-3 transition hover:border-slate-300 dark:bg-slate-950">
      <input
        type="checkbox"
        className="mt-0.5 size-4 cursor-pointer accent-rose-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-white">
          {title} {icon}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      </div>
    </label>
  );
}

function PasswordInput({
  value,
  onChange,
  inputType,
}: {
  value: string;
  onChange: (v: string) => void;
  inputType: "text" | "password";
}) {
  return (
    <div className="flex items-stretch gap-2">
      <Input
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          onChange(generatePassword(20));
        }}
        title="Generate a strong 20-char password"
      >
        <Dice5 className="size-4" />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast({ variant: "success", title: "Copied" });
          } catch {
            toast({ variant: "error", title: "Couldn't copy" });
          }
        }}
        title="Copy to clipboard"
        disabled={!value}
      >
        <Copy className="size-4" />
      </Button>
    </div>
  );
}
