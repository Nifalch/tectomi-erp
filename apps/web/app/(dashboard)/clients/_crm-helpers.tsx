"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { X } from "lucide-react";

export interface CustomFieldDef {
  id: string;
  entity: string;
  key: string;
  label: string;
  type: "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT" | "MULTI_SELECT" | "URL";
  options?: string[] | null;
  required?: boolean;
  sortOrder?: number;
}

export interface SavedView {
  id: string;
  name: string;
  isDefault?: boolean;
  filters?: Record<string, unknown> | null;
}

// ── Custom field renderer ──
export function CustomFieldInput({
  def,
  value,
  onChange,
}: {
  def: CustomFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const opts = (def.options ?? []).map((o) => ({ value: o, label: o }));
  switch (def.type) {
    case "TEXT":
      return (
        <Input
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.label}
        />
      );
    case "TEXTAREA":
      return (
        <TextArea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      );
    case "NUMBER":
      return (
        <Input
          type="number"
          value={(value as number | string | undefined) ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? null : Number(raw));
          }}
        />
      );
    case "URL":
      return (
        <Input
          type="url"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
        />
      );
    case "DATE": {
      const d = value ? new Date(value as string) : undefined;
      return (
        <DatePicker
          value={d ?? undefined}
          onChange={(nd) => onChange(nd ? nd.toISOString() : null)}
        />
      );
    }
    case "BOOLEAN":
      return (
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4 rounded border-slate-300"
          />
          <span>{def.label}</span>
        </label>
      );
    case "SELECT":
      return (
        <Select
          value={(value as string) ?? ""}
          onValueChange={(v) => onChange(v)}
          options={[{ value: "", label: "—" }, ...opts]}
        />
      );
    case "MULTI_SELECT": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (opt: string) => {
        if (arr.includes(opt)) onChange(arr.filter((x) => x !== opt));
        else onChange([...arr, opt]);
      };
      return (
        <div className="flex flex-wrap gap-2">
          {(def.options ?? []).map((o) => (
            <label
              key={o}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/80 px-2.5 py-1 text-xs dark:bg-slate-950/60"
            >
              <input
                type="checkbox"
                checked={arr.includes(o)}
                onChange={() => toggle(o)}
                className="size-3.5 rounded border-slate-300"
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

export function CustomFieldsSection({
  defs,
  values,
  onChange,
}: {
  defs: CustomFieldDef[];
  values: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  if (!defs.length) return null;
  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Custom Fields</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {defs.map((def) => (
          <FormField key={def.id} label={def.label} required={def.required}>
            <CustomFieldInput
              def={def}
              value={values[def.key]}
              onChange={(v) => onChange({ ...values, [def.key]: v })}
            />
          </FormField>
        ))}
      </div>
    </div>
  );
}

// ── Merge duplicates dialog ──
interface MergeRow {
  id: string;
  companyName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
}

export function MergeClientsDialog({
  open,
  onOpenChange,
  rows,
  onMerge,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: MergeRow[];
  onMerge: (primaryId: string, duplicateId: string) => void;
  loading?: boolean;
}) {
  const [primaryId, setPrimaryId] = useState<string>(rows[0]?.id ?? "");
  const duplicate = rows.find((r) => r.id !== primaryId);

  // reset when rows change
  useMemo(() => {
    if (rows[0]?.id) setPrimaryId(rows[0].id);
  }, [rows.map((r) => r.id).join(",")]);

  if (rows.length !== 2) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Merge duplicates</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {rows.map((r) => {
              const chosen = primaryId === r.id;
              return (
                <label
                  key={r.id}
                  className={`cursor-pointer space-y-1 rounded-xl border p-3 text-sm ${
                    chosen ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="primary"
                      checked={chosen}
                      onChange={() => setPrimaryId(r.id)}
                      className="size-4"
                    />
                    <span className="font-semibold">Keep {r.companyName}</span>
                  </div>
                  <div className="pl-6 text-xs text-slate-500">
                    <div>{r.contactPerson ?? "—"}</div>
                    <div>{r.email ?? "—"}</div>
                    <div>{r.phone ?? "—"}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            The other client will be deleted. All their projects, invoices, contacts, deals, documents, activities, and tags
            will be moved to the chosen primary.
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => duplicate && onMerge(primaryId, duplicate.id)}
            disabled={loading || !duplicate}
          >
            {loading ? "Merging…" : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Saved views strip ──
export function SavedViewsStrip({
  views,
  activeId,
  onApply,
  onDelete,
  onSaveClick,
}: {
  views: SavedView[];
  activeId?: string | null;
  onApply: (v: SavedView) => void;
  onDelete: (id: string) => void;
  onSaveClick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Views</span>
      {views.length === 0 && <span className="text-[11px] italic text-slate-400">none</span>}
      {views.map((v) => {
        const active = activeId === v.id;
        return (
          <span
            key={v.id}
            className={`group inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition ${
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <button type="button" onClick={() => onApply(v)}>
              {v.name}
              {v.isDefault && <span className="ml-1 text-[10px] text-slate-400">★</span>}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(v.id);
              }}
              className="hidden text-slate-400 hover:text-rose-600 group-hover:inline-flex"
              aria-label="Delete view"
            >
              <X className="size-3" />
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={onSaveClick}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 text-[11px] font-medium text-slate-500 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
      >
        + Save current
      </button>
    </div>
  );
}

// ── Save view dialog ──
export function SaveViewDialog({
  open,
  onOpenChange,
  onSave,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, isDefault: boolean) => void;
  loading?: boolean;
}) {
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  useMemo(() => {
    if (!open) {
      setName("");
      setIsDefault(false);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Save current view</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FormField label="Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. VIPs with outstanding"
              autoFocus
            />
          </FormField>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="size-4"
            />
            Set as default
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={loading || !name.trim()} onClick={() => onSave(name.trim(), isDefault)}>
            {loading ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
