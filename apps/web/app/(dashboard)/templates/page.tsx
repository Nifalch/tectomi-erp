"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Mail } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiDelete } from "@/lib/api/client";
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
import { useEmailTemplates } from "@/lib/api/hooks";
import { toast } from "@/lib/hooks/use-toast";
import { toArray } from "@/lib/utils";

interface TemplateRow {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
}

const schema = z.object({
  name: z.string().min(1, "Name required"),
  subject: z.string().min(1, "Subject required"),
  body: z.string().min(1, "Body required"),
  category: z.string().min(1, "Category required"),
});
type FormValues = z.infer<typeof schema>;

const categories = ["Onboarding", "Invoice", "Proposal", "Follow-up", "Notification", "General"];

export default function TemplatesPage() {
  const query = useEmailTemplates();
  const qc = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/templates", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["templates"] }); toast({ variant: "success", title: "Template created" }); },
    onError: () => toast({ variant: "error", title: "Failed to create template" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/templates/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["templates"] }); toast({ variant: "success", title: "Template deleted" }); },
    onError: () => toast({ variant: "error", title: "Failed to delete template" }),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | undefined>();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { category: "General" } });

  if (query.isLoading) return <LoadingState label="Loading templates..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load templates." />;

  const templates = toArray<TemplateRow>(query.data);

  const onSubmit = (values: FormValues) => {
    createMutation.mutate(values, { onSuccess: () => { setCreateOpen(false); form.reset({ category: "General" }); } });
  };

  return (
    <div className="flex flex-col gap-8">
      <ModuleHeader module="documents" title="Email Templates" description="Reusable email templates for communications."
        primaryAction={{ label: "New Template", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateOpen(true) }}
        counts={[{ label: "templates", value: templates.length }]}
      />

      {templates.length === 0 ? (
        <Card><div className="py-12 text-center text-sm text-slate-400">No templates yet. Create your first email template.</div></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="cursor-pointer transition hover:shadow-md" onClick={() => setSelectedTemplate(template)}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-slate-400" />
                  <CardTitle className="text-base">{template.name}</CardTitle>
                </div>
                <Badge tone="neutral" size="sm">{template.category}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-500">Subject: {template.subject}</p>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{template.body}</p>
            </Card>
          ))}
        </div>
      )}

      {selectedTemplate && (
        <Dialog open={!!selectedTemplate} onOpenChange={(open) => { if (!open) setSelectedTemplate(null); }}>
          <DialogContent size="lg">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1"><Badge tone="neutral" size="sm">{selectedTemplate.category}</Badge></div>
              <DialogTitle>{selectedTemplate.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm"><span className="font-medium text-slate-700 dark:text-slate-300">Subject:</span> {selectedTemplate.subject}</div>
              <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300 whitespace-pre-wrap rounded-md border p-4 bg-slate-50 dark:bg-slate-900">{selectedTemplate.body}</div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => { setDeleteTarget(selectedTemplate); setSelectedTemplate(null); }}>Delete</Button>
              <Button variant="secondary" onClick={() => setSelectedTemplate(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>New Template</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Name" required error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} error={!!form.formState.errors.name} placeholder="Welcome Email" />
            </FormField>
            <FormField label="Subject" required error={form.formState.errors.subject?.message}>
              <Input {...form.register("subject")} error={!!form.formState.errors.subject} placeholder="Welcome to the team!" />
            </FormField>
            <FormField label="Category" required>
              <Select value={form.watch("category")} onValueChange={(v) => form.setValue("category", v)}
                options={categories.map((c) => ({ value: c, label: c }))} />
            </FormField>
            <FormField label="Body" required error={form.formState.errors.body?.message}>
              <TextArea {...form.register("body")} error={!!form.formState.errors.body} placeholder="Write your email template content here..." className="min-h-[200px]" />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Template"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete template" description={`Delete "${deleteTarget?.name}"?`} variant="destructive" confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending} />
    </div>
  );
}
