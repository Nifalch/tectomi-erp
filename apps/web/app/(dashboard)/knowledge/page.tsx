"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, BookOpen } from "lucide-react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useKnowledgeArticles } from "@/lib/api/hooks";
import { useCreateArticle, useDeleteArticle } from "@/lib/api/mutations";
import { toArray } from "@/lib/utils";

interface Article { id: string; title: string; content: string; category: string; published: boolean; author: { firstName: string; lastName: string }; createdAt: string; updatedAt: string }

const schema = z.object({
  title: z.string().min(1, "Title required"),
  content: z.string().min(1, "Content required"),
  category: z.string().min(1, "Category required"),
});
type FormValues = z.infer<typeof schema>;

const categories = ["Engineering", "HR", "Finance", "Operations", "Onboarding", "General"];

export default function KnowledgePage() {
  const query = useKnowledgeArticles();
  const createMutation = useCreateArticle();
  const deleteMutation = useDeleteArticle();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Article | undefined>();
  const [filterCategory, setFilterCategory] = useState("all");
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { category: "General" } });

  if (query.isLoading) return <LoadingState label="Loading knowledge base..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load articles." />;

  const articles = toArray<Article>(query.data);
  const filtered = filterCategory === "all" ? articles : articles.filter((a) => a.category === filterCategory);
  const uniqueCategories = [...new Set(articles.map((a) => a.category))];

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({ ...values, published: true }, { onSuccess: () => { setCreateOpen(false); form.reset({ category: "General" }); } });
  };

  return (
    <div className="flex flex-col gap-8">
      <ModuleHeader module="documents" title="Knowledge Base" description="Internal wiki, guides, and documentation."
        primaryAction={{ label: "New Article", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateOpen(true) }}
        counts={[{ label: "articles", value: articles.length }]}
      />

      <div className="flex gap-2 flex-wrap">
        <Button variant={filterCategory === "all" ? "default" : "secondary"} size="sm" onClick={() => setFilterCategory("all")}>All</Button>
        {uniqueCategories.map((cat) => (
          <Button key={cat} variant={filterCategory === cat ? "default" : "secondary"} size="sm" onClick={() => setFilterCategory(cat)}>{cat}</Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card><div className="py-12 text-center text-sm text-slate-400">No articles found. Create your first article.</div></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((article) => (
            <Card key={article.id} className="cursor-pointer transition hover:shadow-md" onClick={() => setSelectedArticle(article)}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4 text-slate-400" />
                  <CardTitle className="text-base">{article.title}</CardTitle>
                </div>
                <Badge tone="neutral" size="sm">{article.category}</Badge>
              </div>
              <p className="mt-3 line-clamp-3 text-sm text-slate-600 dark:text-slate-400">{article.content}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <span>{article.author?.firstName} {article.author?.lastName}</span>
                <span>{new Date(article.updatedAt).toLocaleDateString()}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedArticle && (
        <Dialog open={!!selectedArticle} onOpenChange={(open) => { if (!open) setSelectedArticle(null); }}>
          <DialogContent size="lg">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1"><Badge tone="neutral" size="sm">{selectedArticle.category}</Badge></div>
              <DialogTitle>{selectedArticle.title}</DialogTitle>
            </DialogHeader>
            <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{selectedArticle.content}</div>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
              <span>By {selectedArticle.author?.firstName} {selectedArticle.author?.lastName}</span>
              <span>Updated {new Date(selectedArticle.updatedAt).toLocaleDateString()}</span>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => { setDeleteTarget(selectedArticle); setSelectedArticle(null); }}>Delete</Button>
              <Button variant="secondary" onClick={() => setSelectedArticle(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>New Article</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Title" required error={form.formState.errors.title?.message}>
              <Input {...form.register("title")} error={!!form.formState.errors.title} placeholder="How to onboard new engineers" />
            </FormField>
            <FormField label="Category" required>
              <Select value={form.watch("category")} onValueChange={(v) => form.setValue("category", v)}
                options={categories.map((c) => ({ value: c, label: c }))} />
            </FormField>
            <FormField label="Content" required error={form.formState.errors.content?.message}>
              <TextArea {...form.register("content")} error={!!form.formState.errors.content} placeholder="Write your article content here..." className="min-h-[200px]" />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Publish Article"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete article" description={`Delete "${deleteTarget?.title}"?`} variant="destructive" confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending} />
    </div>
  );
}
