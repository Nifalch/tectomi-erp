"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Lock, Pencil, Search, ShieldCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { TextArea } from "@/components/ui/textarea";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useUserAccessMatrix, type AccessOverride } from "@/lib/api/hooks";
import { useClearUserAccess, useSetUserAccess } from "@/lib/api/mutations";
import { navigationItems, type AppRole, type ModuleKey } from "@nuro7/contracts";
import { cn } from "@/lib/utils";

interface UserAccessRow {
  moduleKey: string;
  titles: string[];
  roleAllowed: boolean;
  override: AccessOverride | null;
  effective: boolean;
}

interface Props {
  userId: string;
}

export function AccessTab({ userId }: Props) {
  const matrixQuery = useUserAccessMatrix(userId);
  const setAccess = useSetUserAccess(userId);
  const clearAccess = useClearUserAccess(userId);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UserAccessRow | null>(null);

  // Combine the user's roles + override list with the contracts
  // navigationItems baseline to render the full module matrix.
  const rows: UserAccessRow[] = useMemo(() => {
    if (!matrixQuery.data) return [];
    const userRoles = matrixQuery.data.roles as AppRole[];
    const overrideMap = new Map<string, AccessOverride>(
      matrixQuery.data.overrides.map((o) => [o.moduleKey, o.override]),
    );
    // Group navigationItems by moduleKey so each module shows once.
    const moduleMap = new Map<ModuleKey, { titles: string[]; roleAllowed: boolean }>();
    for (const item of navigationItems) {
      const allowed = item.roles.some((r) => userRoles.includes(r));
      const existing = moduleMap.get(item.moduleKey);
      if (existing) {
        existing.titles.push(item.title);
        existing.roleAllowed = existing.roleAllowed || allowed;
      } else {
        moduleMap.set(item.moduleKey, { titles: [item.title], roleAllowed: allowed });
      }
    }
    return Array.from(moduleMap.entries())
      .map(([moduleKey, { titles, roleAllowed }]) => {
        const override = overrideMap.get(moduleKey) ?? null;
        const effective =
          override === "GRANT" ? true : override === "DENY" ? false : roleAllowed;
        return { moduleKey, titles, roleAllowed, override, effective };
      })
      .sort((a, b) => a.moduleKey.localeCompare(b.moduleKey));
  }, [matrixQuery.data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.moduleKey.toLowerCase().includes(needle) ||
        r.titles.some((t) => t.toLowerCase().includes(needle)),
    );
  }, [rows, search]);

  if (matrixQuery.isLoading) return <LoadingState label="Loading access matrix…" />;
  if (matrixQuery.isError) return <ErrorState label="Unable to load access matrix." />;

  const totals = {
    granted: rows.filter((r) => r.override === "GRANT").length,
    denied: rows.filter((r) => r.override === "DENY").length,
    inherited: rows.filter((r) => r.override === null).length,
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Per-user access overrides</h3>
            </div>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              Grant or deny individual modules for this user. By default everyone with the same role sees the
              same modules — overrides let you stretch or narrow that baseline without inventing new roles.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge tone="positive" size="sm">{totals.granted} granted</Badge>
            <Badge tone="destructive" size="sm">{totals.denied} denied</Badge>
            <Badge tone="neutral" size="sm">{totals.inherited} role default</Badge>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter modules by name or key…"
            className="h-9 pl-10 text-sm"
          />
        </div>
      </Card>

      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-border">
          {filtered.length === 0 && (
            <li className="px-6 py-10 text-center text-sm text-slate-400">No modules match this search.</li>
          )}
          {filtered.map((row) => (
            <AccessRow
              key={row.moduleKey}
              row={row}
              onGrant={() => setAccess.mutate({ moduleKey: row.moduleKey, override: "GRANT" })}
              onDeny={() => setAccess.mutate({ moduleKey: row.moduleKey, override: "DENY" })}
              onInherit={() => clearAccess.mutate(row.moduleKey)}
              onEdit={() => setEditing(row)}
              pending={setAccess.isPending || clearAccess.isPending}
            />
          ))}
        </ul>
      </Card>

      <NoteDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        row={editing}
        onSave={(override, note) => {
          if (!editing) return;
          setAccess.mutate(
            { moduleKey: editing.moduleKey, override, note },
            { onSettled: () => setEditing(null) },
          );
        }}
      />
    </div>
  );
}

function AccessRow({
  row,
  onGrant,
  onDeny,
  onInherit,
  onEdit,
  pending,
}: {
  row: UserAccessRow;
  onGrant: () => void;
  onDeny: () => void;
  onInherit: () => void;
  onEdit: () => void;
  pending: boolean;
}) {
  // Visual treatment depends on the effective access (what the user actually
  // sees in the sidebar), not just the override state.
  const stateBadge = row.override === "GRANT"
    ? { tone: "positive" as const, text: "Granted" }
    : row.override === "DENY"
      ? { tone: "destructive" as const, text: "Denied" }
      : row.effective
        ? { tone: "neutral" as const, text: "Role default · on" }
        : { tone: "neutral" as const, text: "Role default · off" };

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{row.titles.join(" · ")}</span>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            {row.moduleKey}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <Badge tone={stateBadge.tone} size="sm">{stateBadge.text}</Badge>
          {row.effective ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3" /> visible in sidebar
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Lock className="size-3" /> hidden
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          onClick={onGrant}
          disabled={pending || row.override === "GRANT"}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition",
            row.override === "GRANT"
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-border bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-emerald-950/30",
          )}
        >
          Grant
        </button>
        <button
          onClick={onDeny}
          disabled={pending || row.override === "DENY"}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition",
            row.override === "DENY"
              ? "border-red-500 bg-red-500 text-white"
              : "border-border bg-white text-slate-600 hover:border-red-300 hover:bg-red-50 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-red-950/30",
          )}
        >
          Deny
        </button>
        <button
          onClick={onInherit}
          disabled={pending || row.override === null}
          className={cn(
            "rounded-full border border-border px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800",
            row.override === null && "opacity-50",
          )}
          title="Remove override and use the role default"
        >
          <X className="inline size-3" /> Inherit
        </button>
        <button
          onClick={onEdit}
          className="rounded-full border border-border p-1 text-slate-500 transition hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800"
          title="Add a note explaining this override"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

function NoteDialog({
  open,
  onOpenChange,
  row,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  row: UserAccessRow | null;
  onSave: (override: AccessOverride, note: string) => void;
}) {
  const [override, setOverride] = useState<AccessOverride>("GRANT");
  const [note, setNote] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{row ? `Access for ${row.titles[0]}` : "Set access"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setOverride("GRANT")}
              className={cn(
                "flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition",
                override === "GRANT"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
                  : "border-border bg-white text-slate-600 hover:border-slate-300 dark:bg-slate-950 dark:text-slate-300",
              )}
            >
              Grant
            </button>
            <button
              onClick={() => setOverride("DENY")}
              className={cn(
                "flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition",
                override === "DENY"
                  ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200"
                  : "border-border bg-white text-slate-600 hover:border-slate-300 dark:bg-slate-950 dark:text-slate-300",
              )}
            >
              Deny
            </button>
          </div>
          <FormField label="Note (optional)">
            <TextArea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Granted for the Diwali campaign cycle. Re-evaluate Jan 2027."
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(override, note)}>Save override</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
