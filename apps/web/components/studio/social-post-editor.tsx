"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Send, Trash2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import {
  useMarketingIdeas,
  type SocialPlatform,
  type SocialPostRow,
  type SocialPostStatus,
} from "@/lib/api/hooks";
import {
  useCreateSocialPost,
  useDeleteSocialPost,
  usePublishSocialPost,
  useUpdateSocialPost,
} from "@/lib/api/mutations";
import { cn } from "@/lib/utils";
import {
  SOCIAL_PLATFORM_META,
  SOCIAL_STATUS_META,
  SOCIAL_STATUS_OPTIONS,
} from "./studio-utils";

interface FormState {
  title: string;
  content: string;
  platform: SocialPlatform;
  status: SocialPostStatus;
  scheduledAt: string; // "YYYY-MM-DDTHH:mm" for input[type=datetime-local]
  link: string;
  notes: string;
  marketingIdeaId: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  content: "",
  platform: "INSTAGRAM",
  status: "DRAFT",
  scheduledAt: "",
  link: "",
  notes: "",
  marketingIdeaId: "",
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  // Strip seconds + timezone to match the input value format. We use the
  // user's local timezone for editing convenience.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: SocialPostRow | null;
  /** Pre-fill the scheduled date when creating a new post from a calendar cell. */
  defaultDate?: Date | null;
}

export function SocialPostEditor({ open, onOpenChange, post, defaultDate }: Props) {
  const isEdit = !!post;
  const create = useCreateSocialPost();
  const update = useUpdateSocialPost(post?.id ?? "");
  const publish = usePublishSocialPost();
  const remove = useDeleteSocialPost();
  const ideas = useMarketingIdeas();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (post) {
      setForm({
        title: post.title ?? "",
        content: post.content,
        platform: post.platform,
        status: post.status,
        scheduledAt: toLocalInput(post.scheduledAt),
        link: post.link ?? "",
        notes: post.notes ?? "",
        marketingIdeaId: post.marketingIdeaId ?? "",
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        scheduledAt: defaultDate ? toLocalInput(defaultDate.toISOString()) : "",
        status: defaultDate ? "SCHEDULED" : "DRAFT",
      });
    }
  }, [open, post, defaultDate]);

  const submit = async () => {
    const payload = {
      title: form.title.trim() || undefined,
      content: form.content.trim(),
      platform: form.platform,
      status: form.status,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
      link: form.link.trim() || null,
      notes: form.notes.trim() || null,
      marketingIdeaId: form.marketingIdeaId || null,
    };
    if (isEdit) {
      await update.mutateAsync(payload);
    } else {
      if (!payload.content) return;
      await create.mutateAsync({ ...payload, content: payload.content });
    }
    onOpenChange(false);
  };

  const handleMarkPublished = async () => {
    if (!post) return;
    await publish.mutateAsync({ id: post.id, link: form.link || undefined });
    onOpenChange(false);
  };

  const meta = SOCIAL_PLATFORM_META[form.platform];
  const PlatformIcon = meta.icon;

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        size="lg"
        title={isEdit ? "Edit social post" : "Schedule social post"}
        description="Draft now, schedule for later, and publish when it's live."
      >
        <div className="space-y-5">
          {/* Platform picker */}
          <FormField label="Platform">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {(Object.keys(SOCIAL_PLATFORM_META) as SocialPlatform[]).map((p) => {
                const m = SOCIAL_PLATFORM_META[p];
                const Icon = m.icon;
                const active = form.platform === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm({ ...form, platform: p })}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-medium transition",
                      active
                        ? "border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900"
                        : "border-border bg-white hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900",
                    )}
                  >
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-md"
                      style={!active ? { backgroundColor: m.hex + "1a", color: m.hex } : { backgroundColor: "rgba(255,255,255,0.1)" }}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </FormField>

          <FormField label="Caption / content">
            <TextArea
              rows={8}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Write the post copy as it should go live…"
              className="text-sm leading-relaxed"
            />
            <p className="mt-1 text-[11px] text-slate-400">{form.content.length} chars</p>
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Title (internal)">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Short label for the planner"
              />
            </FormField>
            <FormField label="Status">
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as SocialPostStatus })}
                options={SOCIAL_STATUS_OPTIONS}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Scheduled for">
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              />
            </FormField>
            <FormField label="Linked marketing idea">
              <Select
                value={form.marketingIdeaId}
                onValueChange={(v) => setForm({ ...form, marketingIdeaId: v })}
                options={[
                  { value: "", label: "— None —" },
                  ...((ideas.data ?? []).map((i) => ({ value: i.id, label: i.title }))),
                ]}
              />
            </FormField>
          </div>

          <FormField label="Published link (once it's live)">
            <Input
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder={meta.domain ? `https://${meta.domain}/…` : "https://…"}
            />
          </FormField>

          <FormField label="Notes (internal — never published)">
            <TextArea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Angle, hashtags to add, who's posting, etc."
            />
          </FormField>

          <div className="rounded-2xl border border-border bg-slate-50 p-3 dark:bg-slate-900/60">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-500">
              <PlatformIcon className="size-3.5" style={{ color: meta.hex }} />
              <span className="font-medium uppercase tracking-wider">{meta.label} preview</span>
            </div>
            <div className="rounded-xl bg-white p-3 text-sm leading-relaxed text-slate-800 shadow-sm dark:bg-slate-950 dark:text-slate-200">
              {form.content || <span className="text-slate-400">Start typing to see your draft…</span>}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-4">
            {isEdit ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-1.5 size-4" /> Delete
              </Button>
            ) : <span />}
            <div className="flex items-center gap-2">
              {isEdit && form.status !== "PUBLISHED" && (
                <Button variant="secondary" size="sm" onClick={handleMarkPublished} disabled={publish.isPending}>
                  <CheckCircle2 className="mr-1.5 size-4" /> Mark published
                </Button>
              )}
              <Button onClick={submit} disabled={!form.content.trim() || create.isPending || update.isPending} size="sm">
                {(create.isPending || update.isPending) && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isEdit ? <>Save</> : <><Send className="mr-1.5 size-4" /> Save post</>}
              </Button>
            </div>
          </div>

          {isEdit && post?.link && (
            <a
              href={post.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <ExternalLink className="size-3" /> Open live post
            </a>
          )}

          {/* Status meta strip */}
          {isEdit && post && (
            <div className="rounded-xl border border-border p-2 text-[11px] text-slate-500">
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", SOCIAL_STATUS_META[post.status].chip)}>
                <span className={cn("size-1.5 rounded-full", SOCIAL_STATUS_META[post.status].dot)} />
                {SOCIAL_STATUS_META[post.status].label}
              </span>
            </div>
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this post?"
        description="It will disappear from the planner and any linked marketing idea."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          if (post) {
            await remove.mutateAsync(post.id);
            setConfirmDelete(false);
            onOpenChange(false);
          }
        }}
        loading={remove.isPending}
      />

    </>
  );
}
