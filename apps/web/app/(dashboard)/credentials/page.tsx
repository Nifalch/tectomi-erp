"use client";

import { useMemo, useState } from "react";
import { Folder, FolderPlus, KeyRound, Plus, Search, ShieldAlert, Sparkles, Users2 } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import {
  useCredentialFolders,
  useCredentials,
  type CredentialFilters,
  type CredentialRow,
  type CredentialType,
} from "@/lib/api/hooks";
import { useCreateCredentialFolder } from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { cn } from "@/lib/utils";
import { CREDENTIAL_TYPE_META, CREDENTIAL_TYPE_OPTIONS, getInitials, getPlatformMeta, timeAgo } from "@/components/credentials/credential-utils";
import { CredentialEditor } from "@/components/credentials/credential-editor";
import { CredentialDetail } from "@/components/credentials/credential-detail";

export default function CredentialsPage() {
  const me = useAuthStore((s) => s.user);
  const [filters, setFilters] = useState<CredentialFilters>({ ownedBy: "all" });
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CredentialRow | null>(null);
  const [selected, setSelected] = useState<CredentialRow | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);

  // Debounce the search input — typing burst shouldn't fire on every keystroke.
  const debouncedSearch = useDebounced(search, 250);
  const credentialsQuery = useCredentials({ ...filters, search: debouncedSearch });
  const foldersQuery = useCredentialFolders();
  const credentials = credentialsQuery.data ?? [];
  const folders = foldersQuery.data ?? [];

  // After a mutation that updates the selected credential, swap its drawer
  // copy for the fresh one (otherwise the drawer would still show stale tags).
  const refreshed = useMemo(() => {
    if (!selected) return null;
    return credentials.find((c) => c.id === selected.id) ?? selected;
  }, [credentials, selected]);

  const counts = [
    { label: "Total", value: credentials.length, tone: "neutral" as const },
    { label: "Owned by me", value: credentials.filter((c) => c.ownerId === me?.id).length, tone: "info" as const },
    { label: "Shared with me", value: credentials.filter((c) => c.ownerId !== me?.id).length, tone: "positive" as const },
    {
      label: "High security",
      value: credentials.filter((c) => c.highSecurity).length,
      tone: "destructive" as const,
    },
    {
      label: "Rotation overdue",
      value: credentials.filter((c) => isRotationOverdue(c)).length,
      tone: "warning" as const,
    },
  ];

  return (
    <ListPageLayout
      module="vault"
      title="Credential vault"
      description="Encrypted store for shared passwords, API keys, SSH keys, certificates, and secure notes. Every reveal is audited."
      counts={counts}
      primaryAction={{
        label: "New credential",
        icon: <Plus className="size-4" />,
        onClick: () => {
          setEditing(null);
          setEditorOpen(true);
        },
      }}
      secondaryActions={[
        {
          label: "New folder",
          icon: <FolderPlus className="size-4" />,
          onClick: () => setFolderDialogOpen(true),
        },
      ]}
    >
      <Card className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, username, URL or description…"
              className="pl-10"
            />
          </div>
          <Select
            value={filters.type ?? ""}
            onValueChange={(v) => setFilters({ ...filters, type: (v as CredentialType) || "" })}
            options={[{ value: "", label: "All types" }, ...CREDENTIAL_TYPE_OPTIONS]}
            size="sm"
            className="w-full sm:w-44"
          />
          <Select
            value={filters.folderId ?? ""}
            onValueChange={(v) => setFilters({ ...filters, folderId: v })}
            options={[
              { value: "", label: "All folders" },
              ...folders.map((f) => ({ value: f.id, label: f.name })),
            ]}
            size="sm"
            className="w-full sm:w-44"
          />
          <Select
            value={filters.ownedBy ?? "all"}
            onValueChange={(v) => setFilters({ ...filters, ownedBy: v as "all" | "me" | "shared" })}
            options={[
              { value: "all", label: "Anyone" },
              { value: "me", label: "Owned by me" },
              { value: "shared", label: "Shared with me" },
            ]}
            size="sm"
            className="w-full sm:w-44"
          />
        </div>

        {/* Body */}
        {credentialsQuery.isLoading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : credentials.length === 0 ? (
          <EmptyState
            // Use the live `search` state (debounced into the query but not
            // merged into `filters`), not filters.search which is always
            // empty in this component.
            hasFilters={!!(search || filters.type || filters.folderId || filters.ownedBy !== "all")}
            onCreate={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          />
        ) : (
          <ul className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-white dark:bg-slate-950">
            {credentials.map((c) => (
              <CredentialRowItem
                key={c.id}
                credential={c}
                currentUserId={me?.id ?? null}
                onClick={() => setSelected(c)}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* Folder cards (only if any exist) */}
      {folders.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Folders</h3>
            <span className="text-xs text-slate-400">{folders.length} folder{folders.length === 1 ? "" : "s"}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilters({ ...filters, folderId: f.id })}
                className="group flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:shadow-sm dark:bg-slate-950"
              >
                <div
                  className="flex size-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: (f.color ?? "#475569") + "1a", color: f.color ?? "#475569" }}
                >
                  <Folder className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{f.name}</div>
                  <div className="text-xs text-slate-500">
                    {f._count.credentials} item{f._count.credentials === 1 ? "" : "s"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <CredentialEditor
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) setEditing(null);
        }}
        credential={editing}
        folders={folders}
      />

      <CredentialDetail
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        credential={refreshed}
        onEdit={(c) => {
          setEditing(c);
          setSelected(null);
          setEditorOpen(true);
        }}
      />

      <NewFolderDialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen} />
    </ListPageLayout>
  );
}

function CredentialRowItem({
  credential,
  currentUserId,
  onClick,
}: {
  credential: CredentialRow;
  currentUserId: string | null;
  onClick: () => void;
}) {
  const meta = CREDENTIAL_TYPE_META[credential.type];
  const platform =
    credential.type === "SOCIAL_MEDIA" && typeof credential.metadata?.platform === "string"
      ? getPlatformMeta(credential.metadata.platform as string)
      : null;
  const Icon = platform?.icon ?? meta.icon;
  const sharedWithCount = credential.accesses.length;
  const overdue = isRotationOverdue(credential);
  const isMine = credential.ownerId === currentUserId;

  return (
    <li>
      <button
        onClick={onClick}
        className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/60 sm:gap-4 sm:px-5 sm:py-4"
      >
        <div
          className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-xl", !platform && meta.chip)}
          style={platform ? { backgroundColor: platform.hex + "1a", color: platform.hex } : undefined}
        >
          <Icon className="size-5" />
          {credential.highSecurity && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-rose-500 text-white ring-2 ring-white dark:ring-slate-950" title="High-security credential">
              <ShieldAlert className="size-2.5" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{credential.name}</span>
            <span className={cn("hidden rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 sm:inline-flex", meta.badge)}>
              {platform?.label ?? meta.label}
            </span>
            {credential.folder && (
              <span className="hidden rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:inline-flex">
                {credential.folder.name}
              </span>
            )}
            {overdue && (
              <Badge tone="warning" size="sm">
                <ShieldAlert className="mr-1 size-3" /> rotate
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
            {credential.username && <span className="truncate">{credential.username}</span>}
            {credential.username && credential.url && <span>·</span>}
            {credential.url && <span className="truncate">{credential.url}</span>}
            {!credential.username && !credential.url && (
              <span>Updated {timeAgo(credential.updatedAt)}</span>
            )}
          </div>
        </div>

        {/* Shared avatars stack — small, optional */}
        {sharedWithCount > 0 && (
          <div className="hidden items-center -space-x-1.5 md:flex">
            {credential.accesses.slice(0, 3).map((a) => (
              <Avatar
                key={a.id}
                initials={getInitials(a.user)}
                className="size-6 ring-2 ring-white text-[10px] dark:ring-slate-950"
              />
            ))}
            {sharedWithCount > 3 && (
              <span className="flex size-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 ring-2 ring-white dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-950">
                +{sharedWithCount - 3}
              </span>
            )}
          </div>
        )}

        <span className="hidden whitespace-nowrap text-xs text-slate-400 lg:inline">
          {isMine ? "Owned" : "Shared"} · {timeAgo(credential.updatedAt)}
        </span>
      </button>
    </li>
  );
}

function EmptyState({ hasFilters, onCreate }: { hasFilters: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <KeyRound className="size-7" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          {hasFilters ? "No credentials match these filters" : "Your vault is empty"}
        </h3>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          {hasFilters
            ? "Try clearing a filter or searching for a different term."
            : "Store team passwords, API keys, SSH keys, and certificates with AES-256 encryption. Only people you share with can decrypt."}
        </p>
      </div>
      {!hasFilters && (
        <div className="mt-2 flex items-center gap-2">
          <Button onClick={onCreate}>
            <Plus className="mr-1.5 size-4" /> Add your first credential
          </Button>
          <div className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-500 sm:inline-flex dark:bg-slate-800 dark:text-slate-300">
            <Sparkles className="size-3.5" /> Built-in strong password generator
          </div>
        </div>
      )}
    </div>
  );
}

function NewFolderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateCredentialFolder();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#475569");

  const submit = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), color });
    setName("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Create folder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Folder name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. AWS production" />
          </FormField>
          <FormField label="Color">
            <div className="flex flex-wrap gap-2">
              {["#475569", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-8 rounded-lg ring-2 ring-offset-2 transition",
                    color === c ? "ring-slate-400" : "ring-transparent",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isRotationOverdue(c: CredentialRow): boolean {
  if (!c.rotationIntervalDays || !c.lastRotatedAt) return false;
  const last = new Date(c.lastRotatedAt).getTime();
  const due = last + c.rotationIntervalDays * 24 * 60 * 60 * 1000;
  return Date.now() > due;
}

// Tiny in-file debounce — avoid pulling in another util. Keeps the search
// query stable until the user pauses for `delay` ms.
import { useEffect } from "react";
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
