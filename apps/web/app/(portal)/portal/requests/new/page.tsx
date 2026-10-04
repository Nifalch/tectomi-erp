"use client";

/**
 * "New request" page — reachable from the footer CTA and (historically)
 * the dashboard. The floating chat widget is the primary entry path
 * but this longer form route stays available for bookmarks / deep links.
 *
 * UI matches the rest of the portal (portal-card, portal-eyebrow, etc.)
 * instead of the raw bordered-form look we had before.
 */

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessagesSquare, Send, AlertCircle } from "lucide-react";
import { portalApi } from "@/lib/portal-api";

interface PortalProject { id: string; name: string }

export default function NewRequest() {
  const router = useRouter();
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    portalApi.projects.list()
      .then((rows) => setProjects(rows as PortalProject[]))
      .catch(() => undefined);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const created = await portalApi.requests.create({
        title: title.trim(),
        body: body.trim(),
        projectId: projectId || undefined,
      });
      router.push(`/portal/requests/${(created as { id: string }).id}`);
    } catch (e) {
      setErr((e as Error).message ?? "Couldn't submit the request. Try again.");
      setBusy(false);
    }
  };

  const canSubmit = title.trim().length >= 3 && body.trim().length > 0 && !busy;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/portal/requests" className="portal-eyebrow inline-flex items-center gap-1.5 hover:opacity-70">
        <ArrowLeft className="size-3" /> All requests
      </Link>

      <header>
        <h1 className="portal-title text-[22px] sm:text-[28px] md:text-[34px]">New request</h1>
        <p className="mt-2 max-w-xl text-[13px] sm:text-[14px]" style={{ color: "var(--ink-soft)" }}>
          Anything you want changed, clarified, or chased — drop it here. Your team is notified instantly.
        </p>
      </header>
      <div className="portal-hairline" />

      <form onSubmit={submit} className="portal-card space-y-5 p-5 sm:p-6">
        {/* Title */}
        <div>
          <label htmlFor="req-title" className="portal-eyebrow">Subject</label>
          <input
            id="req-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={3}
            placeholder="e.g. Question about the launch timeline"
            className="mt-2 block w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            style={{ borderColor: "var(--rule)", color: "var(--ink)", background: "var(--surface)" }}
          />
        </div>

        {/* Project (optional) */}
        <div>
          <label htmlFor="req-project" className="portal-eyebrow">Related project <span className="font-normal lowercase" style={{ color: "var(--muted-2)" }}>(optional)</span></label>
          <select
            id="req-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="mt-2 block w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            style={{ borderColor: "var(--rule)", color: "var(--ink)", background: "var(--surface)" }}
          >
            <option value="">Not project-specific</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
            Tying a request to a project routes it to that project's lead.
          </p>
        </div>

        {/* Body */}
        <div>
          <label htmlFor="req-body" className="portal-eyebrow">Message</label>
          <textarea
            id="req-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={6}
            placeholder="Tell us what's happening. Include any URLs, screenshots references, or dates that help us act faster."
            className="mt-2 block w-full resize-none rounded-lg border p-3 text-sm leading-relaxed outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            style={{ borderColor: "var(--rule)", color: "var(--ink)", background: "var(--surface)" }}
          />
        </div>

        {err && (
          <div className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12px]" style={{ borderColor: "var(--rose)", color: "var(--rose)", background: "color-mix(in srgb, var(--rose) 6%, transparent)" }}>
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--rule)" }}>
          <p className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
            <MessagesSquare className="size-3.5" />
            We typically reply within one business day.
          </p>
          <div className="flex items-center gap-2">
            <Link href="/portal/requests" className="portal-btn-ghost text-[12px]">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!canSubmit}
              className="portal-cta portal-cta-accent"
            >
              <Send className="size-3.5" />
              {busy ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
