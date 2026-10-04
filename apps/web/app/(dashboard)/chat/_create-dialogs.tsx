"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import {
  useCreateDirectChannel,
  useCreateGlobalChannel,
  useCreateGroupChannel,
  useCreateProjectChannel,
} from "@/lib/api/mutations";
import { useUsers } from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/store/auth-store";
import { cn, staffOnly, toArray } from "@/lib/utils";

interface UserRow {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  roles?: unknown;
}

function initials(u: UserRow) {
  const f = u.firstName?.[0] ?? "";
  const l = u.lastName?.[0] ?? "";
  return (f + l).toUpperCase() || "?";
}

function fullName(u: UserRow) {
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || (u.email ?? "Unknown");
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateChannelDialog (GLOBAL) — moved here from chat/page.tsx to consolidate.
// ─────────────────────────────────────────────────────────────────────────────
export function CreateChannelDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateGlobalChannel();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, description: description.trim() || undefined },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>New channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.replace(/\s+/g, "-").toLowerCase())}
              placeholder="e.g. engineering"
              autoFocus
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Lowercase, no spaces. Everyone on the team is added automatically.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Description (optional)
            </label>
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What's this channel about?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateDirectMessageDialog — pick one user, ensure DM channel, navigate.
// ─────────────────────────────────────────────────────────────────────────────
export function CreateDirectMessageDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (channelId: string) => void;
}) {
  const usersQuery = useUsers();
  const create = useCreateDirectChannel();
  const myId = useAuthStore((s) => s.user?.id);
  const [q, setQ] = useState("");

  const users = useMemo(() => {
    const all = staffOnly(toArray<UserRow>((usersQuery.data as any)?.data ?? []));
    return all.filter((u) => u.id !== myId);
  }, [usersQuery.data, myId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (u) =>
        fullName(u).toLowerCase().includes(needle) ||
        (u.email ?? "").toLowerCase().includes(needle),
    );
  }, [users, q]);

  const pickUser = (userId: string) => {
    create.mutate(
      { userId },
      {
        onSuccess: (res: any) => {
          if (res?.id) onCreated(res.id);
          setQ("");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>New direct message</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              className="pl-8"
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
            {filtered.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-slate-400">No people found.</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => pickUser(u.id)}
                      disabled={create.isPending}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-800"
                    >
                      <Avatar initials={initials(u)} className="size-7" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-800 dark:text-slate-100">
                          {fullName(u)}
                        </div>
                        {u.email && (
                          <div className="truncate text-[11px] text-slate-400">{u.email}</div>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateGroupChannelDialog — name + multi-user picker.
// ─────────────────────────────────────────────────────────────────────────────
export function CreateGroupChannelDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (channelId: string) => void;
}) {
  const usersQuery = useUsers();
  const create = useCreateGroupChannel();
  const myId = useAuthStore((s) => s.user?.id);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const users = useMemo(() => {
    const all = staffOnly(toArray<UserRow>((usersQuery.data as any)?.data ?? []));
    return all.filter((u) => u.id !== myId);
  }, [usersQuery.data, myId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (u) =>
        fullName(u).toLowerCase().includes(needle) ||
        (u.email ?? "").toLowerCase().includes(needle),
    );
  }, [users, q]);

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reset = () => {
    setName("");
    setDescription("");
    setPicked(new Set());
    setQ("");
  };

  const canSubmit = name.trim().length > 0 && picked.size >= 2;

  const handleSubmit = () => {
    if (!canSubmit) return;
    create.mutate(
      {
        name: name.trim(),
        memberIds: [...picked],
        description: description.trim() || undefined,
      },
      {
        onSuccess: (res: any) => {
          if (res?.id) onCreated(res.id);
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Group name
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Launch squad"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Description (optional)
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this group for?"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Members
              </label>
              <span className="text-[11px] text-slate-400">
                {picked.size} selected{picked.size < 2 ? " (min 2)" : ""}
              </span>
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search people…"
                className="pl-8"
              />
            </div>
            <div className="max-h-[260px] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
              {filtered.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-slate-400">No people found.</div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((u) => {
                    const on = picked.has(u.id);
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => toggle(u.id)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded border",
                              on
                                ? "border-primary bg-primary text-white"
                                : "border-slate-300 dark:border-slate-600",
                            )}
                          >
                            {on && <Check className="size-3" />}
                          </span>
                          <Avatar initials={initials(u)} className="size-7" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-slate-800 dark:text-slate-100">
                              {fullName(u)}
                            </div>
                            {u.email && (
                              <div className="truncate text-[11px] text-slate-400">{u.email}</div>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateProjectChannelDialog — extra channels for an existing project.
// ─────────────────────────────────────────────────────────────────────────────
export function CreateProjectChannelDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (channelId: string) => void;
}) {
  const create = useCreateProjectChannel(projectId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, description: description.trim() || undefined },
      {
        onSuccess: (res: any) => {
          if (res?.id) onCreated?.(res.id);
          setName("");
          setDescription("");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>New project channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Name
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.replace(/\s+/g, "-").toLowerCase())}
              placeholder="e.g. design-review"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Description (optional)
            </label>
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What's this channel about?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
