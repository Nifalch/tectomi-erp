"use client";
import { useState, useEffect, useMemo } from "react";
import { Plus, FileText, Trash2, Save } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { useWikiPages } from "@/lib/api/hooks";
import { useCreateWikiPage, useUpdateWikiPage, useDeleteWikiPage } from "@/lib/api/mutations";
import { toArray, cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface WikiPage {
  id: string;
  title: string;
  content: string;
  parentId?: string | null;
  author: { firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

export function ProjectWikiTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const pagesQuery = useWikiPages(projectId);
  const createMutation = useCreateWikiPage();
  const deleteMutation = useDeleteWikiPage();

  const pages = toArray<WikiPage>(pagesQuery.data);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WikiPage | undefined>();

  // Auto-select first page
  useEffect(() => {
    if (!selectedId && pages.length > 0) setSelectedId(pages[0].id);
  }, [pages, selectedId]);

  const selected = pages.find((p) => p.id === selectedId);
  const updateMutation = useUpdateWikiPage(selected?.id ?? "");

  // Local state for editing
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setContent(selected.content);
      setDirty(false);
    }
  }, [selected?.id]);

  // Build tree structure
  const tree = useMemo(() => {
    const rootPages = pages.filter((p) => !p.parentId);
    const byParent = pages.reduce((acc, p) => {
      if (p.parentId) {
        if (!acc[p.parentId]) acc[p.parentId] = [];
        acc[p.parentId].push(p);
      }
      return acc;
    }, {} as Record<string, WikiPage[]>);
    return { rootPages, byParent };
  }, [pages]);

  const handleSave = () => {
    if (!selected) return;
    updateMutation.mutate({ title, content }, {
      onSuccess: () => setDirty(false),
    });
  };

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createMutation.mutate(
      { projectId, title: newTitle, content: "" },
      {
        onSuccess: (data: any) => {
          setSelectedId(data.id);
          setCreateOpen(false);
          setNewTitle("");
        },
      },
    );
  };

  const renderNode = (page: WikiPage, depth = 0) => {
    const children = tree.byParent[page.id] || [];
    return (
      <div key={page.id}>
        <button
          onClick={() => setSelectedId(page.id)}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition",
            selectedId === page.id
              ? "bg-primary/10 text-primary"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
          )}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate">{page.title}</span>
        </button>
        {children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  if (pagesQuery.isLoading) {
    return <div className="py-8 text-center text-sm text-slate-400">Loading wiki...</div>;
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-[240px_1fr] min-h-[500px]">
        {/* Sidebar */}
        <Card className="p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pages</span>
            <Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
            </Button>
          </div>
          {pages.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">No pages yet</p>
          ) : (
            <div className="space-y-0.5">
              {tree.rootPages.map((p) => renderNode(p))}
            </div>
          )}
        </Card>

        {/* Main editor */}
        {selected ? (
          <Card>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Input
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
                  className="text-lg font-semibold border-0 px-0 focus:ring-0"
                />
                <div className="flex items-center gap-2 shrink-0">
                  {dirty && (
                    <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                      <Save className="mr-1 size-3.5" /> Save
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(selected)}>
                    <Trash2 className="size-4 text-red-500" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>By {selected.author.firstName} {selected.author.lastName}</span>
                <span>·</span>
                <span>Updated {new Date(selected.updatedAt).toLocaleDateString()}</span>
              </div>

              <TextArea
                value={content}
                onChange={(e) => { setContent(e.target.value); setDirty(true); }}
                placeholder="Start writing... Supports plain text and line breaks."
                className="min-h-[400px] resize-y font-sans text-base leading-relaxed"
              />
            </div>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="size-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">Select a page or create a new one to start.</p>
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 size-4" /> New Page
              </Button>
            </div>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>New Page</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Page Title" required>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Getting Started" onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} autoFocus />
            </FormField>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !newTitle.trim()}>
                {createMutation.isPending ? "Creating..." : "Create Page"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(undefined)}
        title="Delete page"
        description={`Delete "${deleteTarget?.title}" and all its content?`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id, {
              onSuccess: () => {
                setDeleteTarget(undefined);
                if (selectedId === deleteTarget.id) setSelectedId(null);
              },
            });
          }
        }}
        loading={deleteMutation.isPending}
      />
    </>
  );
}
