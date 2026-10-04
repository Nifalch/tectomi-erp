"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash2, GripVertical } from "lucide-react";
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
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useClients, useProjects, useProposal } from "@/lib/api/hooks";
import { useUpdateProposal } from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";

interface Phase {
  heading: string;
  content: string;
  durationWeeks: number | null;
}

interface Deliverable {
  kind: "INCLUDED" | "EXCLUDED";
  title: string;
  description: string;
  amount: number | null;
}

interface ProposalLoaded {
  clientId?: string;
  projectId?: string;
  projectName?: string;
  description?: string;
  projectUnderstanding?: string;
  timeline?: string;
  pricing?: string;
  paymentTermsText?: string;
  validUntil?: string;
  blocks?: Array<{ heading?: string; content?: string; durationWeeks?: number | null }>;
  deliverables?: Array<{ kind?: string; title?: string; description?: string; amount?: number | null }>;
}

/** Edit any existing proposal. No status guard — even SENT or ACCEPTED proposals
 *  can be corrected; the API accepts updates regardless. */
export default function EditProposalPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const q = useProposal(id);

  if (q.isLoading) return <LoadingState label="Loading proposal..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load proposal." />;

  return <EditProposalForm id={id} loaded={q.data as ProposalLoaded} />;
}

function EditProposalForm({ id, loaded }: { id: string; loaded: ProposalLoaded }) {
  const router = useRouter();
  const updateMutation = useUpdateProposal(id);
  const clientsQuery = useClients();
  const projectsQuery = useProjects();

  const [clientId, setClientId] = useState(loaded.clientId ?? "");
  const [projectId, setProjectId] = useState(loaded.projectId ?? "");
  const [projectName, setProjectName] = useState(loaded.projectName ?? "");
  const [validUntil, setValidUntil] = useState<Date | undefined>(
    loaded.validUntil ? new Date(loaded.validUntil) : undefined,
  );
  const [description, setDescription] = useState(loaded.description ?? "");
  const [projectUnderstanding, setProjectUnderstanding] = useState(loaded.projectUnderstanding ?? "");
  const [pricing, setPricing] = useState(loaded.pricing ?? "");
  const [paymentTermsText, setPaymentTermsText] = useState(loaded.paymentTermsText ?? "");
  const [phases, setPhases] = useState<Phase[]>(
    (loaded.blocks ?? []).map((b) => ({
      heading: b.heading ?? "",
      content: b.content ?? "",
      durationWeeks: b.durationWeeks ?? null,
    })),
  );
  const [deliverables, setDeliverables] = useState<Deliverable[]>(
    (loaded.deliverables ?? []).map((d) => ({
      kind: d.kind === "EXCLUDED" ? "EXCLUDED" : "INCLUDED",
      title: d.title ?? "",
      description: d.description ?? "",
      amount: d.amount ?? null,
    })),
  );

  const clients = toArray<{ id: string; companyName: string }>(clientsQuery.data);
  const projects = toArray<{ id: string; name: string; clientId: string }>(projectsQuery.data);
  const filteredProjects = useMemo(
    () => projects.filter((p) => !clientId || p.clientId === clientId),
    [projects, clientId],
  );

  const includedPriced = deliverables.filter((d) => d.kind === "INCLUDED" && d.amount != null && d.amount > 0);
  const subtotal = includedPriced.reduce((s, d) => s + (d.amount ?? 0), 0);
  const totalWeeks = phases.reduce((s, p) => s + (p.durationWeeks ?? 0), 0);

  const addPhase = () => setPhases([...phases, { heading: "", content: "", durationWeeks: 1 }]);
  const removePhase = (i: number) => setPhases(phases.filter((_, idx) => idx !== i));
  const updatePhase = (i: number, patch: Partial<Phase>) =>
    setPhases(phases.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const addDeliverable = (kind: "INCLUDED" | "EXCLUDED") =>
    setDeliverables([...deliverables, { kind, title: "", description: "", amount: kind === "INCLUDED" ? 0 : null }]);
  const removeDeliverable = (i: number) => setDeliverables(deliverables.filter((_, idx) => idx !== i));
  const updateDeliverable = (i: number, patch: Partial<Deliverable>) =>
    setDeliverables(deliverables.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const submit = () => {
    updateMutation.mutate(
      {
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
      },
      { onSuccess: () => router.push("/proposals") },
    );
  };

  return (
    <FormPageLayout
      module="proposals"
      title="Edit Proposal"
      breadcrumbs={[{ label: "Proposals", href: "/proposals" }, { label: "Edit" }]}
      onSubmit={submit}
      onCancel={() => router.push("/proposals")}
      submitLabel={updateMutation.isPending ? "Saving…" : "Save changes"}
      loading={updateMutation.isPending}
    >
      <div className="space-y-6">
        <Card>
          <CardTitle>Project &amp; Client</CardTitle>
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
                onValueChange={(v) => {
                  setProjectId(v);
                  const p = projects.find((pp) => pp.id === v);
                  if (p && !projectName) setProjectName(p.name);
                }}
                placeholder={clientId ? "Select project" : "Select a client first"}
                options={filteredProjects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </FormField>
            <FormField label="Project / Engagement Title" required className="col-span-2">
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </FormField>
            <FormField label="Valid Until">
              <DatePicker value={validUntil} onChange={setValidUntil} />
            </FormField>
          </div>
        </Card>

        <Card>
          <CardTitle>Narrative</CardTitle>
          <div className="mt-4 space-y-4">
            <FormField label="Executive Summary" required>
              <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </FormField>
            <FormField label="Project Understanding (optional)">
              <TextArea
                value={projectUnderstanding}
                onChange={(e) => setProjectUnderstanding(e.target.value)}
                rows={4}
              />
            </FormField>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Scope of Work · Phases</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                Each phase becomes a Gantt bar in the printed timeline.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500">Total:</span>
              <Badge tone="info" size="sm">
                {totalWeeks} {totalWeeks === 1 ? "week" : "weeks"}
              </Badge>
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
                  <FormField label={`Phase ${i + 1} — Title`} className="col-span-7">
                    <Input value={phase.heading} onChange={(e) => updatePhase(i, { heading: e.target.value })} />
                  </FormField>
                  <FormField label="Duration (weeks)" className="col-span-3">
                    <NumberInput
                      value={phase.durationWeeks}
                      onChange={(v) => updatePhase(i, { durationWeeks: v })}
                      suffix="w"
                    />
                  </FormField>
                  <div className="col-span-2 flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePhase(i)}
                      className="text-red-500"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <FormField label="Description" className="col-span-12">
                    <TextArea
                      value={phase.content}
                      onChange={(e) => updatePhase(i, { content: e.target.value })}
                      rows={2}
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

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Deliverables &amp; Exclusions</CardTitle>
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
                    <Input value={d.title} onChange={(e) => updateDeliverable(i, { title: e.target.value })} />
                  </FormField>
                  {d.kind === "INCLUDED" && (
                    <FormField label="Price (₹) — optional" className="col-span-4">
                      <NumberInput value={d.amount} onChange={(v) => updateDeliverable(i, { amount: v })} prefix="₹" />
                    </FormField>
                  )}
                  <div className={`flex items-end ${d.kind === "INCLUDED" ? "col-span-2" : "col-span-6"} justify-end`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDeliverable(i)}
                      className="text-red-500"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <FormField label="Description" className="col-span-12">
                    <Input
                      value={d.description}
                      onChange={(e) => updateDeliverable(i, { description: e.target.value })}
                    />
                  </FormField>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Investment &amp; Payment Schedule</CardTitle>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <FormField label="Pricing (headline)">
              <Input value={pricing} onChange={(e) => setPricing(e.target.value)} />
            </FormField>
            <div />
            <FormField label="Payment Schedule" className="col-span-2">
              <TextArea
                value={paymentTermsText}
                onChange={(e) => setPaymentTermsText(e.target.value)}
                rows={4}
              />
            </FormField>
          </div>
        </Card>
      </div>
    </FormPageLayout>
  );
}

