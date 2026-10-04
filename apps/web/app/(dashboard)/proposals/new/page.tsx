"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, GripVertical, Sparkles, Loader2 } from "lucide-react";
import { FormPageLayout } from "@/components/layouts/form-page-layout";
import { Card, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClients, useProjects } from "@/lib/api/hooks";
import { useCreateProposal, useGenerateProposalAi } from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";
import { toast } from "@/lib/hooks/use-toast";

interface Phase {
  heading: string;
  content: string;
  durationWeeks: number | null;
  /** Effort estimate in hours — drives pricing via hours × org default hourly rate. */
  hoursEstimate?: number | null;
  /** AI-only metadata used to render the "extracted from your brief" review chips. */
  summary?: string;
  deliverables?: string[];
  acceptance?: string;
  traceFrom?: string;
}

interface Deliverable {
  kind: "INCLUDED" | "EXCLUDED";
  title: string;
  description: string;
  amount: number | null;
}

const DEFAULT_PHASES: Phase[] = [
  { heading: "Discovery & Strategy", content: "Stakeholder interviews, audit, and a written 1-pager.", durationWeeks: 1 },
  { heading: "Design", content: "High-fidelity Figma mockups with two rounds of revisions.", durationWeeks: 2 },
  { heading: "Development", content: "Implementation, code reviews, and weekly demos.", durationWeeks: 2 },
  { heading: "Testing & Launch", content: "QA, accessibility audit, performance pass, and launch.", durationWeeks: 1 },
];

const DEFAULT_DELIVERABLES: Deliverable[] = [
  { kind: "INCLUDED", title: "Source code & documentation", description: "Full Git access + README + handover walkthrough.", amount: 0 },
  { kind: "INCLUDED", title: "Design files", description: "All editable source files handed over.", amount: 0 },
  { kind: "INCLUDED", title: "1 week post-launch warranty", description: "Free fixes for any bugs reported within 7 days of launch.", amount: 0 },
  { kind: "EXCLUDED", title: "Hosting & domain", description: "Paid directly by client.", amount: null },
  { kind: "EXCLUDED", title: "Third-party app subscriptions", description: "Billed by respective vendors.", amount: null },
  { kind: "EXCLUDED", title: "Content writing & photography", description: "Client provides all copy and images.", amount: null },
];

export default function NewProposalPage() {
  const router = useRouter();
  const createMutation = useCreateProposal();
  const aiMutation = useGenerateProposalAi();
  const clientsQuery = useClients();
  const projectsQuery = useProjects();

  // AI brief (shown in the top card). Free-text — the model fills the rest.
  const [aiRequirement, setAiRequirement] = useState("");

  // ── Project & Client section ──
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [validUntil, setValidUntil] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  });

  // ── Narrative ──
  const [description, setDescription] = useState("");
  const [projectUnderstanding, setProjectUnderstanding] = useState("");

  // ── Phases (Scope of Work / Timeline) ──
  const [phases, setPhases] = useState<Phase[]>(DEFAULT_PHASES);

  // ── Deliverables (Inclusions / Exclusions, with optional prices) ──
  const [deliverables, setDeliverables] = useState<Deliverable[]>(DEFAULT_DELIVERABLES);

  // ── Investment ──
  const [pricing, setPricing] = useState("");
  const [paymentTermsText, setPaymentTermsText] = useState(
    "50% Advance — Project kick-off\n30% Mid-project — End of design phase\n20% Final — On launch & handoff",
  );

  // ── AI metadata · shown above the form after a successful generation ──
  //  - keyOutcomes  : outcome statements the AI extracted from the brief
  //  - aiSourceBrief: the requirement string the result was generated from
  //    (kept around even after the user edits the textarea, so the chips
  //    correctly reflect "extracted from" the actual generation call).
  const [keyOutcomes, setKeyOutcomes] = useState<string[]>([]);
  const [aiSourceBrief, setAiSourceBrief] = useState("");

  const clients = toArray<{ id: string; companyName: string }>(clientsQuery.data);
  const projects = toArray<{ id: string; name: string; clientId: string }>(projectsQuery.data);

  // Filter projects by chosen client (if any)
  const filteredProjects = useMemo(
    () => (clientId ? projects.filter((p) => p.clientId === clientId) : projects),
    [clientId, projects],
  );

  // Auto-prefill projectName when an existing project is picked
  const onProjectIdChange = (id: string) => {
    setProjectId(id);
    if (id) {
      const p = projects.find((x) => x.id === id);
      if (p && !projectName) setProjectName(p.name);
    }
  };

  // Calculated totals
  const includedPriced = deliverables.filter((d) => d.kind === "INCLUDED" && d.amount != null && d.amount > 0);
  const subtotal = includedPriced.reduce((s, d) => s + (d.amount ?? 0), 0);
  const totalWeeks = phases.reduce((s, p) => s + (p.durationWeeks ?? 0), 0);
  const totalHours = phases.reduce((s, p) => s + (p.hoursEstimate ?? 0), 0);

  // ── Phase handlers ──
  const addPhase = () =>
    setPhases([...phases, { heading: "", content: "", durationWeeks: 1 }]);
  const removePhase = (i: number) => setPhases(phases.filter((_, idx) => idx !== i));
  const updatePhase = (i: number, patch: Partial<Phase>) =>
    setPhases(phases.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  // ── Deliverable handlers ──
  const addDeliverable = (kind: "INCLUDED" | "EXCLUDED") =>
    setDeliverables([...deliverables, { kind, title: "", description: "", amount: kind === "INCLUDED" ? 0 : null }]);
  const removeDeliverable = (i: number) => setDeliverables(deliverables.filter((_, idx) => idx !== i));
  const updateDeliverable = (i: number, patch: Partial<Deliverable>) =>
    setDeliverables(deliverables.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const canSubmit =
    !!clientId.trim() &&
    !!projectName.trim() &&
    !!description.trim() &&
    phases.some((p) => p.heading.trim());

  /** Resolve the selected client's display name (used as a hint for the AI). */
  const selectedClientName =
    clients.find((c) => c.id === clientId)?.companyName ?? undefined;

  /** Generate full proposal content from the requirement and prefill every field. */
  const generateWithAi = () => {
    const req = aiRequirement.trim();
    if (req.length < 12) {
      toast({
        variant: "error",
        title: "Add more detail",
        description: "Describe what the client needs in at least a sentence or two.",
      });
      return;
    }
    aiMutation.mutate(
      {
        requirement: req,
        clientName: selectedClientName,
        projectName: projectName.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          if (!projectName.trim() && data.projectName) setProjectName(data.projectName);
          if (data.description) setDescription(data.description);
          if (data.projectUnderstanding) setProjectUnderstanding(data.projectUnderstanding);
          if (data.pricing) setPricing(data.pricing);
          if (data.paymentTermsText) setPaymentTermsText(data.paymentTermsText);
          if (Array.isArray(data.blocks) && data.blocks.length > 0) {
            setPhases(
              data.blocks.map((b) => ({
                heading: b.heading ?? "",
                content: b.content ?? "",
                durationWeeks: b.durationWeeks ?? 1,
                hoursEstimate: b.hoursEstimate ?? null,
                summary: b.summary,
                deliverables: b.deliverables,
                acceptance: b.acceptance,
                traceFrom: b.traceFrom,
              })),
            );
          }
          if (Array.isArray(data.deliverables) && data.deliverables.length > 0) {
            setDeliverables(
              data.deliverables.map((d) => ({
                kind: d.kind === "EXCLUDED" ? "EXCLUDED" : "INCLUDED",
                title: d.title ?? "",
                description: d.description ?? "",
                amount: d.amount ?? null,
              })),
            );
          }
          setKeyOutcomes(Array.isArray(data.keyOutcomes) ? data.keyOutcomes : []);
          setAiSourceBrief(req);
          toast({
            variant: "success",
            title: "Draft generated",
            description: `${data.blocks?.length ?? 0} phases · ${data.totalHours ?? 0}h · ${data.deliverables?.length ?? 0} deliverables. Review and edit anything before saving.`,
          });
        },
      },
    );
  };

  const submit = () => {
    if (!canSubmit) return;
    const payload = {
      clientId,
      projectId: projectId || undefined,
      projectName: projectName.trim(),
      description: description.trim(),
      projectUnderstanding: projectUnderstanding.trim() || undefined,
      timeline: phases
        .filter((p) => p.heading.trim())
        .map((p) => `${p.heading}${p.durationWeeks ? ` — ${p.durationWeeks}w` : ""}`)
        .join("\n"),
      pricing: pricing.trim() || (subtotal > 0 ? `₹${subtotal.toLocaleString("en-IN")}` : ""),
      paymentTermsText: paymentTermsText.trim() || undefined,
      validUntil: validUntil ? validUntil.toISOString() : undefined,
      blocks: phases
        .filter((p) => p.heading.trim())
        .map((p) => ({
          heading: p.heading.trim(),
          content: p.content.trim(),
          durationWeeks: p.durationWeeks ?? undefined,
        })),
      deliverables: deliverables
        .filter((d) => d.title.trim())
        .map((d) => ({
          kind: d.kind,
          title: d.title.trim(),
          description: d.description.trim() || undefined,
          amount: d.amount != null && d.amount > 0 ? d.amount : undefined,
        })),
    };

    createMutation.mutate(payload, {
      onSuccess: (created) => {
        const id = (created as { id?: string })?.id;
        if (id) router.push(`/proposals/${id}/print`);
        else router.push("/proposals");
      },
    });
  };

  return (
    <FormPageLayout
      module="proposals"
      title="New Proposal"
      breadcrumbs={[{ label: "Proposals", href: "/proposals" }, { label: "New" }]}
      onSubmit={submit}
      onCancel={() => router.push("/proposals")}
      submitLabel={createMutation.isPending ? "Creating…" : "Create Proposal"}
      loading={createMutation.isPending}
    >
      <div className="space-y-6">
        {/* ── AI Generate · top of form ──
            Free-text requirement → auto-fills every section below.
            The user can still edit anything after the model fills it in. */}
        <Card className="border-2 border-dashed border-slate-300 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/30">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-zinc-900 text-white">
              <Sparkles className="size-5" />
            </div>
            <div className="flex-1">
              <CardTitle className="!mb-0">Generate with AI</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                Describe the client requirement in plain English. The AI will draft a complete proposal —
                scope, deliverables, timeline, pricing, payment schedule. You can edit every field afterwards.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <TextArea
              value={aiRequirement}
              onChange={(e) => setAiRequirement(e.target.value)}
              rows={4}
              placeholder="e.g. The client (Bmado) runs a Shopify store on Dawn theme — slow on mobile, leaky checkout. They want a custom Liquid theme, streamlined cart/checkout, and 2–3 small custom apps (Klaviyo, Yotpo, OMS). Budget is around ₹1.5–2L, target 6 weeks."
              disabled={aiMutation.isPending}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                Tip: include the client's current state, the goal, any tech constraints, and a rough budget or timeline.
              </p>
              <Button
                type="button"
                onClick={generateWithAi}
                disabled={aiMutation.isPending || aiRequirement.trim().length < 12}
              >
                {aiMutation.isPending ? (
                  <><Loader2 className="mr-2 size-4 animate-spin" /> Drafting…</>
                ) : (
                  <><Sparkles className="mr-2 size-4" /> Generate Draft</>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* ── AI Review Banner · only shown once the model has populated the form ──
            Shows the salesperson WHAT the AI pulled out of the brief so they can
            verify the proposal actually mirrors what the client asked for, not
            generic agency boilerplate. */}
        {(keyOutcomes.length > 0 || aiSourceBrief) && (
          <Card className="border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-900/10">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <Sparkles className="size-4" />
              </div>
              <div className="flex-1">
                <CardTitle className="!mb-0 text-sm">Generated from your brief</CardTitle>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Review the outcomes and per-phase scope the AI extracted. If anything's wrong or missing, edit the fields below.
                </p>
              </div>
            </div>
            {keyOutcomes.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700/80 dark:text-emerald-300/80">
                  Key outcomes
                </div>
                <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                  {keyOutcomes.map((o, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-slate-700 dark:text-slate-200">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {phases.some((p) => p.traceFrom) && (
              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700/80 dark:text-emerald-300/80">
                  Phase ↔ brief trace
                </div>
                <ul className="mt-1.5 space-y-1">
                  {phases
                    .filter((p) => p.traceFrom)
                    .map((p, i) => (
                      <li key={i} className="text-[12px] text-slate-700 dark:text-slate-200">
                        <span className="font-semibold">{p.heading || `Phase ${i + 1}`}</span>
                        <span className="mx-1 text-slate-400">←</span>
                        <span className="italic text-slate-500">"{p.traceFrom}"</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        {/* ── Section 1 · Project & Client ── */}
        <Card>
          <CardTitle>Project &amp; Client</CardTitle>
          <p className="mt-1 text-xs text-slate-500">Who is this proposal for, and what's the working title?</p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <FormField label="Client" required>
              <Select
                value={clientId}
                onValueChange={(v) => {
                  setClientId(v);
                  if (projectId && !projects.find((p) => p.id === projectId && p.clientId === v)) {
                    setProjectId("");
                  }
                }}
                placeholder="Select client"
                options={clients.map((c) => ({ value: c.id, label: c.companyName }))}
              />
            </FormField>
            <FormField label="Linked Project (optional)">
              <Select
                value={projectId}
                onValueChange={onProjectIdChange}
                placeholder={clientId ? "Select project" : "Select a client first"}
                options={filteredProjects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </FormField>
            <FormField label="Project / Engagement Title" required className="col-span-2">
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Shopify Storefront Redesign — Acme" />
            </FormField>
            <FormField label="Valid Until">
              <DatePicker value={validUntil} onChange={setValidUntil} />
            </FormField>
          </div>
        </Card>

        {/* ── Section 2 · Narrative ── */}
        <Card>
          <CardTitle>Narrative</CardTitle>
          <p className="mt-1 text-xs text-slate-500">Tell the client what this engagement is and why it matters.</p>
          <div className="mt-4 space-y-4">
            <FormField label="Executive Summary" required>
              <TextArea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="A short paragraph describing the engagement, scope, and expected outcome."
              />
            </FormField>
            <FormField label="Project Understanding (optional)">
              <TextArea
                value={projectUnderstanding}
                onChange={(e) => setProjectUnderstanding(e.target.value)}
                rows={4}
                placeholder="Why the client needs this work — the problem, current state, opportunity."
              />
            </FormField>
          </div>
        </Card>

        {/* ── Section 3 · Phases ── */}
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Scope of Work · Phases</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                Each phase becomes a numbered section in the proposal and a Gantt bar in the Timeline.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500">Total:</span>
              <Badge tone="info" size="sm">{totalWeeks} {totalWeeks === 1 ? "week" : "weeks"}</Badge>
              {totalHours > 0 && (
                <Badge tone="info" size="sm">{totalHours} hours</Badge>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={addPhase}>
                <Plus className="mr-1 size-4" /> Add Phase
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {phases.map((phase, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                <GripVertical className="mt-2 size-4 shrink-0 text-slate-300" />
                <div className="grid flex-1 grid-cols-12 gap-3">
                  <FormField label={`Phase ${i + 1} — Title`} className="col-span-6">
                    <Input value={phase.heading} onChange={(e) => updatePhase(i, { heading: e.target.value })} placeholder="e.g. Design" />
                  </FormField>
                  <FormField label="Hours" className="col-span-2">
                    <NumberInput
                      value={phase.hoursEstimate}
                      onChange={(v) => updatePhase(i, { hoursEstimate: v })}
                      suffix="h"
                    />
                  </FormField>
                  <FormField label="Weeks" className="col-span-2">
                    <NumberInput
                      value={phase.durationWeeks}
                      onChange={(v) => updatePhase(i, { durationWeeks: v })}
                      suffix="w"
                    />
                  </FormField>
                  <div className="col-span-2 flex items-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => removePhase(i)} className="text-red-500">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <FormField label="Description" className="col-span-12">
                    <TextArea
                      value={phase.content}
                      onChange={(e) => updatePhase(i, { content: e.target.value })}
                      rows={2}
                      placeholder="What happens in this phase?"
                    />
                  </FormField>
                </div>
              </div>
            ))}
            {phases.length === 0 && (
              <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                No phases yet. Click "Add Phase" to start.
              </div>
            )}
          </div>
        </Card>

        {/* ── Section 4 · Deliverables ── */}
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Deliverables &amp; Exclusions</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                List what the client will receive (with optional per-item prices) and what's out of scope.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500">Subtotal:</span>
              <Badge tone="positive" size="sm">{formatCurrency(subtotal)}</Badge>
              <Button type="button" variant="secondary" size="sm" onClick={() => addDeliverable("INCLUDED")}>
                <Plus className="mr-1 size-4" /> Included
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => addDeliverable("EXCLUDED")}>
                <Plus className="mr-1 size-4" /> Excluded
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {deliverables.map((d, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-xl border p-3 ${
                  d.kind === "INCLUDED" ? "border-emerald-200 bg-emerald-50/30" : "border-rose-200 bg-rose-50/30"
                }`}
              >
                <Badge tone={d.kind === "INCLUDED" ? "positive" : "destructive"} size="sm">
                  {d.kind === "INCLUDED" ? "✓" : "✗"}
                </Badge>
                <div className="grid flex-1 grid-cols-12 gap-3">
                  <FormField label="Title" className="col-span-6">
                    <Input value={d.title} onChange={(e) => updateDeliverable(i, { title: e.target.value })} placeholder="e.g. Custom Shopify theme" />
                  </FormField>
                  {d.kind === "INCLUDED" && (
                    <FormField label="Price (₹) — optional" className="col-span-4">
                      <NumberInput
                        value={d.amount}
                        onChange={(v) => updateDeliverable(i, { amount: v })}
                        prefix="₹"
                      />
                    </FormField>
                  )}
                  <div className={`flex items-end ${d.kind === "INCLUDED" ? "col-span-2" : "col-span-6"} justify-end`}>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeDeliverable(i)} className="text-red-500">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <FormField label="Description" className="col-span-12">
                    <Input
                      value={d.description}
                      onChange={(e) => updateDeliverable(i, { description: e.target.value })}
                      placeholder="Short description shown under the title"
                    />
                  </FormField>
                </div>
              </div>
            ))}
            {deliverables.length === 0 && (
              <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                No items yet. Add inclusions and exclusions.
              </div>
            )}
          </div>
        </Card>

        {/* ── Section 5 · Investment ── */}
        <Card>
          <CardTitle>Investment &amp; Payment Schedule</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            The headline pricing line and how the client should pay (50/30/20 by default).
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <FormField label="Pricing (headline)" required={false}>
              <Input
                value={pricing}
                onChange={(e) => setPricing(e.target.value)}
                placeholder={subtotal > 0 ? `Auto: ₹${subtotal.toLocaleString("en-IN")}` : "e.g. ₹1,80,000 (fixed scope)"}
              />
            </FormField>
            <div />
            <FormField label="Payment Schedule" className="col-span-2">
              <TextArea
                value={paymentTermsText}
                onChange={(e) => setPaymentTermsText(e.target.value)}
                rows={4}
              />
              <p className="mt-1 text-xs text-slate-400">
                One milestone per line. The proposal extracts the percentage from each line for the visual schedule.
              </p>
            </FormField>
          </div>
        </Card>

        {/* ── Footer hint ── */}
        <Card className="bg-slate-50 dark:bg-slate-800/40">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold">Note:</span> The "About Us" and "Terms &amp; Conditions" sections come from
            <a href="/settings/organization" className="ml-1 text-primary underline">Organization Settings</a>.
            They appear automatically on every proposal — edit them once, applied everywhere.
          </p>
        </Card>
      </div>
    </FormPageLayout>
  );
}
