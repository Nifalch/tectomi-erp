"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useProjectStatuses } from "@/lib/api/hooks";
import {
  useCreateProjectStatus,
  useUpdateProjectStatus,
  useDeleteProjectStatus,
} from "@/lib/api/mutations";
import { toArray, cn } from "@/lib/utils";

const COLOR_CHOICES = [
  "#64748b", "#ef4444", "#f97316", "#f59e0b", "#22c55e",
  "#06b6d4", "#3b82f6", "#a855f7", "#ec4899",
];

type StatusCategory = "TODO" | "IN_PROGRESS" | "DONE";

const CATEGORY_OPTIONS: Array<{ value: StatusCategory; label: string }> = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];

interface StatusRow {
  id: string;
  name: string;
  color?: string;
  isDone?: boolean;
  isDefault?: boolean;
  order?: number;
  sortOrder?: number;
  category?: StatusCategory;
}

function StatusRowEditor({ row }: { row: StatusRow }) {
  const update = useUpdateProjectStatus(row.id);
  const del = useDeleteProjectStatus();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-white/40 p-2 dark:bg-slate-950/40">
      <div
        className="size-5 shrink-0 rounded-full border"
        style={{ backgroundColor: row.color ?? "#64748b" }}
      />
      <Input
        defaultValue={row.name}
        onBlur={(e) => {
          if (e.target.value !== row.name) update.mutate({ name: e.target.value });
        }}
        className="h-8 flex-1"
      />
      <div
        className="w-32"
        title="Determines how reports count this status"
      >
        <Select
          value={row.category ?? "TODO"}
          onValueChange={(v) => update.mutate({ category: v })}
          options={CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </div>
      <div className="flex items-center gap-1">
        {COLOR_CHOICES.map((c) => (
          <button
            key={c}
            type="button"
            className={cn(
              "size-5 rounded-full border border-white/50",
              row.color === c && "ring-2 ring-slate-800 dark:ring-white",
            )}
            style={{ backgroundColor: c }}
            onClick={() => update.mutate({ color: c })}
            title={c}
          />
        ))}
      </div>
      <label className="flex items-center gap-1 text-xs text-slate-500">
        <input
          type="checkbox"
          checked={!!row.isDone}
          onChange={(e) => update.mutate({ isDone: e.target.checked })}
        />
        Done
      </label>
      <label className="flex items-center gap-1 text-xs text-slate-500">
        <input
          type="radio"
          name="default-status"
          checked={!!row.isDefault}
          onChange={() => update.mutate({ isDefault: true })}
        />
        Default
      </label>
      <Button size="sm" variant="ghost" onClick={() => del.mutate(row.id)}>
        <Trash2 className="size-3.5 text-red-500" />
      </Button>
    </div>
  );
}

export function ProjectSettingsTab({ projectId }: { projectId: string }) {
  const query = useProjectStatuses(projectId);
  const create = useCreateProjectStatus();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLOR_CHOICES[0]);
  const [newCategory, setNewCategory] = useState<StatusCategory>("TODO");

  const rows = toArray<StatusRow>(query.data).sort(
    (a, b) => (a.sortOrder ?? a.order ?? 0) - (b.sortOrder ?? b.order ?? 0),
  );

  const handleAdd = () => {
    if (!newName.trim()) return;
    create.mutate(
      { projectId, name: newName, color: newColor, category: newCategory },
      {
        onSuccess: () => {
          setNewName("");
          setNewColor(COLOR_CHOICES[0]);
          setNewCategory("TODO");
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Task Statuses</h3>
            <p className="mt-1 text-xs text-slate-500">
              Define custom status columns for this project. Tasks will use these instead of the defaults.
            </p>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 py-6 text-center text-xs text-slate-400">
              No custom statuses yet.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <StatusRowEditor key={r.id} row={r} />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <div className="flex items-center gap-1">
              {COLOR_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    "size-5 rounded-full border border-white/50",
                    newColor === c && "ring-2 ring-slate-800 dark:ring-white",
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <Input
              placeholder="New status name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 flex-1"
            />
            <div className="w-32" title="Determines how reports count this status">
              <Select
                value={newCategory}
                onValueChange={(v) => setNewCategory(v as StatusCategory)}
                options={CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>
            <Button size="sm" onClick={handleAdd} disabled={create.isPending || !newName.trim()}>
              <Plus className="mr-1 size-4" /> Add status
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
