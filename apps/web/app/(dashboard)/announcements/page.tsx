"use client";

import { useState } from "react";
import { Plus, Pin, Trash2, Pencil } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useAnnouncements } from "@/lib/api/hooks";
import { useCreateAnnouncement, useUpdateAnnouncement, useDeleteAnnouncement } from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { toArray } from "@/lib/utils";

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: string;
  pinnedUntil?: string;
  publishedAt?: string;
  publisher?: { firstName?: string; lastName?: string };
}

const PRIORITY_TONE: Record<string, "neutral" | "info" | "destructive"> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "destructive",
};

export default function AnnouncementsPage() {
  const role = useAuthStore((s) => s.user?.roles[0] ?? "EMPLOYEE");
  const canManage = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"].includes(role);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  const query = useAnnouncements();
  const createMutation = useCreateAnnouncement();
  const updateMutation = useUpdateAnnouncement(editTarget?.id ?? "");
  const deleteMutation = useDeleteAnnouncement();

  if (query.isLoading) return <LoadingState label="Loading announcements..." />;
  if (query.isError) return <ErrorState label="Unable to load announcements." />;

  const announcements = toArray<Announcement>(query.data);
  const now = Date.now();

  return (
    <ListPageLayout
      module="hr"
      title="Announcements"
      description="Company-wide announcements and notices."
      primaryAction={canManage ? { label: "New Announcement", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateOpen(true) } : undefined}
      counts={[{ label: "total", value: announcements.length }]}
    >
      <div className="flex flex-col gap-4">
        {announcements.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No announcements yet.</p></Card>
        ) : announcements.map((a) => {
          const pinned = a.pinnedUntil && new Date(a.pinnedUntil).getTime() > now;
          return (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{a.title}</h3>
                    <Badge tone={PRIORITY_TONE[a.priority] ?? "neutral"} size="sm" dot>{a.priority}</Badge>
                    {pinned && <Badge tone="warning" size="sm"><Pin className="mr-1 size-3 inline" />Pinned</Badge>}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{a.content}</p>
                  <div className="mt-3 text-xs text-slate-400">
                    {a.publisher ? `${a.publisher.firstName ?? ""} ${a.publisher.lastName ?? ""}` : "—"}
                    {a.publishedAt && ` • ${new Date(a.publishedAt).toLocaleString()}`}
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditTarget(a)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(a)}><Trash2 className="size-4" /></Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <AnnouncementDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={(data) => createMutation.mutate(data, { onSuccess: () => setCreateOpen(false) })}
        saving={createMutation.isPending}
      />

      <AnnouncementDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        initial={editTarget ?? undefined}
        onSave={(data) => updateMutation.mutate(data, { onSuccess: () => setEditTarget(null) })}
        saving={updateMutation.isPending}
        editMode
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete announcement"
        description={`Delete "${deleteTarget?.title}"?`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) }); }}
        loading={deleteMutation.isPending}
      />
    </ListPageLayout>
  );
}

function AnnouncementDialog({ open, onClose, onSave, saving, initial, editMode }: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  saving: boolean;
  initial?: Announcement;
  editMode?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "MEDIUM");
  const [pinnedUntil, setPinnedUntil] = useState<Date | undefined>(
    initial?.pinnedUntil ? new Date(initial.pinnedUntil) : undefined,
  );

  const submit = () => {
    onSave({ title, content, priority, pinnedUntil: pinnedUntil?.toISOString() });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{editMode ? "Edit Announcement" : "New Announcement"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <FormField label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></FormField>
          <FormField label="Content" required><TextArea value={content} onChange={(e) => setContent(e.target.value)} rows={6} /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Priority">
              <Select value={priority} onValueChange={setPriority} options={[
                { value: "LOW", label: "Low" },
                { value: "MEDIUM", label: "Medium" },
                { value: "HIGH", label: "High" },
              ]} />
            </FormField>
            <FormField label="Pinned Until (optional)"><DatePicker value={pinnedUntil} onChange={setPinnedUntil} /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !title || !content}>
              {saving ? "Saving..." : editMode ? "Save" : "Post"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
