"use client";
import { useState } from "react";
import { Plus, Trash2, Tag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { useLabels } from "@/lib/api/hooks";
import { useCreateLabel, useDeleteLabel } from "@/lib/api/mutations";
import { toArray, cn } from "@/lib/utils";

const COLORS = [
  { name: "Slate", value: "#64748b" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#22c55e" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
];

interface Label { id: string; name: string; color: string }

export function ProjectLabelsTab({ projectId }: { projectId: string }) {
  const query = useLabels(projectId);
  const createMutation = useCreateLabel();
  const deleteMutation = useDeleteLabel();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0].value);

  const labels = toArray<Label>(query.data);

  const handleCreate = () => {
    if (!name.trim()) return;
    createMutation.mutate({ name, color, projectId }, {
      onSuccess: () => { setCreateOpen(false); setName(""); setColor(COLORS[0].value); },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Labels</h3>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" /> New Label
        </Button>
      </div>

      {labels.length === 0 ? (
        <Card><div className="py-8 text-center text-sm text-slate-400">No labels yet. Create labels to categorize tasks.</div></Card>
      ) : (
        <Card>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <div key={label.id}
                className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm"
                style={{ backgroundColor: `${label.color}20`, color: label.color }}
              >
                <Tag className="size-3" />
                <span className="font-medium">{label.name}</span>
                <button
                  onClick={() => deleteMutation.mutate(label.id)}
                  className="ml-1 rounded-full opacity-0 transition group-hover:opacity-100 hover:bg-black/10"
                  title="Delete label"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>New Label</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bug, Feature, Urgent..." autoFocus />
            </FormField>
            <FormField label="Color">
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={cn(
                      "size-8 rounded-full transition",
                      color === c.value && "ring-2 ring-offset-2 ring-slate-900 dark:ring-white",
                    )}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </FormField>
            {name && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Preview:</span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm" style={{ backgroundColor: `${color}20`, color }}>
                  <Tag className="size-3" />{name}
                </span>
              </div>
            )}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !name.trim()}>
                {createMutation.isPending ? "Creating..." : "Create Label"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
