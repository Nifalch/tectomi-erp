"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { FormField } from "@/components/ui/form";
import { apiPost } from "@/lib/api/client";
import { useClients, useUsers } from "@/lib/api/hooks";
import { toast } from "@/lib/hooks/use-toast";
import { staffOnly, toArray } from "@/lib/utils";
import {
  AiPlanPreviewBody,
  type PlanMilestone,
  type PlanSprint,
  type PlanTask,
  type PlanTeamMember,
} from "./ai-plan-dialog";

interface CreateResponse {
  project: { id: string; name: string };
  plan: { milestones: PlanMilestone[]; sprints: PlanSprint[]; tasks: PlanTask[] };
  team: PlanTeamMember[];
  aiError?: string;
}

interface ApplyResponse {
  milestoneCount: number;
  sprintCount: number;
  taskCount: number;
  subtaskCount: number;
  computedBudget: number | null;
  firstInvoiceId: string | null;
  proposalId: string | null;
}

export function CreateWithAiDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const clientsQuery = useClients();
  const usersQuery = useUsers();

  // ── Intake state ──
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [hourlyRate, setHourlyRate] = useState<number>(900);
  const [requirement, setRequirement] = useState("");

  // ── Preview state — populated after AI generation succeeds ──
  const [phase, setPhase] = useState<"intake" | "preview">("intake");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [team, setTeam] = useState<PlanTeamMember[]>([]);
  const [milestones, setMilestones] = useState<PlanMilestone[]>([]);
  const [sprints, setSprints] = useState<PlanSprint[]>([]);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [expandedMilestones, setExpandedMilestones] = useState<Set<number>>(new Set());
  // Manual budget override — null means "auto = totalHrs × hourlyRate".
  // When the user touches the budget input we capture their value here.
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);

  const clients = toArray<{ id: string; companyName?: string; name?: string }>(clientsQuery.data);
  const users = useMemo(() => staffOnly(toArray<Record<string, unknown>>(usersQuery.data)), [usersQuery.data]);
  const clientOptions = clients.map((c) => ({ value: c.id, label: c.companyName ?? c.name ?? "Unnamed" }));
  const userOptions = users.map((u) => ({
    value: u.id as string,
    label: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || (u.email as string),
  }));

  const generateMutation = useMutation({
    mutationFn: () =>
      apiPost<CreateResponse>(`/projects/ai-create`, {
        name,
        clientId,
        managerId: managerId || undefined,
        memberIds: memberIds.length ? memberIds : undefined,
        startDate,
        // Project schema requires a budget on create; the AI flow
        // computes the real value after planning, so seed with 0
        // and let the apply step overwrite it.
        budget: 0,
        requirement,
        hourlyRate,
      }),
    onSuccess: (data) => {
      setProjectId(data.project.id);
      setTeam(data.team);
      setMilestones(data.plan.milestones);
      setSprints(data.plan.sprints ?? []);
      setTasks(data.plan.tasks);
      setExpandedMilestones(new Set(data.plan.milestones.map((_, i) => i)));
      setPhase("preview");
      if (data.aiError) {
        toast({
          variant: "info",
          title: "Project created, AI plan failed",
          description: `${data.aiError}. You can retry from the project page.`,
        });
      }
    },
    onError: (err: Error) =>
      toast({
        variant: "error",
        title: "Couldn't create project",
        description: err.message,
      }),
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error("No project id — generate first.");
      return apiPost<ApplyResponse>(`/projects/${projectId}/ai-apply-plan`, {
        milestones,
        sprints,
        tasks,
        requirement,
        hourlyRate,
        // budgetOverride == null means "let the server compute from
        // totalHrs × hourlyRate". A number means the user typed an
        // explicit value and we should respect it.
        budget: budgetOverride,
      });
    },
    onSuccess: (result) => {
      const bits = [
        `${result.milestoneCount} milestones`,
        `${result.sprintCount} sprints`,
        `${result.taskCount} tasks`,
      ];
      if (result.subtaskCount > 0) bits.push(`${result.subtaskCount} subtasks`);
      if (result.computedBudget) bits.push(`budget ₹${result.computedBudget.toLocaleString("en-IN")}`);
      if (result.firstInvoiceId) bits.push("first invoice drafted");
      if (result.proposalId) bits.push("proposal drafted");
      toast({
        variant: "success",
        title: "Project created with AI",
        description: bits.join(" · "),
        duration: 12_000,
      });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      reset();
      if (projectId) router.push(`/projects/${projectId}`);
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Couldn't save plan", description: err.message }),
  });

  const reset = () => {
    setName("");
    setClientId("");
    setManagerId("");
    setMemberIds([]);
    setStartDate(new Date().toISOString().slice(0, 10));
    setHourlyRate(900);
    setRequirement("");
    setPhase("intake");
    setProjectId(null);
    setTeam([]);
    setMilestones([]);
    setSprints([]);
    setTasks([]);
    setExpandedMilestones(new Set());
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  // ── Editing helpers (mirror AiPlanDialog) ──
  const toggleMilestone = (i: number) =>
    setExpandedMilestones((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const updateMilestone = (i: number, patch: Partial<PlanMilestone>) =>
    setMilestones((arr) => arr.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const removeMilestone = (i: number) => {
    setMilestones((arr) => arr.filter((_, idx) => idx !== i));
    setTasks((arr) =>
      arr
        .filter((t) => t.milestoneIndex !== i)
        .map((t) => (t.milestoneIndex > i ? { ...t, milestoneIndex: t.milestoneIndex - 1 } : t)),
    );
  };
  const addMilestone = () => {
    setMilestones((arr) => [...arr, { title: "New milestone" }]);
    setExpandedMilestones((s) => new Set([...s, milestones.length]));
  };
  const updateSprint = (i: number, patch: Partial<PlanSprint>) =>
    setSprints((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const updateTask = (i: number, patch: Partial<PlanTask>) =>
    setTasks((arr) => arr.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const removeTask = (i: number) => setTasks((arr) => arr.filter((_, idx) => idx !== i));
  const addTask = (milestoneIndex: number) =>
    setTasks((arr) => [
      ...arr,
      { title: "New task", milestoneIndex, estimatedHrs: 4, priority: "MEDIUM" },
    ]);

  const workload = team.map((m) => {
    const memberTasks = tasks.filter((t) => t.assignedToId === m.id);
    return {
      ...m,
      hrs: memberTasks.reduce((s, t) => s + (t.estimatedHrs ?? 0), 0),
      count: memberTasks.length,
    };
  });

  const canGenerate =
    name.trim().length > 0 &&
    clientId &&
    requirement.trim().length >= 12 &&
    hourlyRate > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500" />
            {phase === "intake" ? "Create project with AI" : `Review plan — ${name}`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {phase === "intake" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
                <p className="text-amber-900 dark:text-amber-100">
                  <Sparkles className="inline size-4 align-text-bottom" /> Fill the project basics + describe what the client needs. The AI plans the full delivery — milestones, sprints, tasks, hour estimates, assignments, due dates — and computes the budget from <span className="font-mono">total hours × hourly rate</span>. Everything is editable in the next step.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Project name" required>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Acme Shopify rebuild"
                  />
                </FormField>
                <FormField label="Client" required>
                  <Select
                    value={clientId}
                    onValueChange={setClientId}
                    placeholder="Select client"
                    options={clientOptions}
                  />
                </FormField>
                <FormField label="Project Manager">
                  <Select
                    value={managerId}
                    onValueChange={setManagerId}
                    placeholder="Pick a PM (optional)"
                    options={userOptions}
                  />
                </FormField>
                <FormField label="Start date">
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </FormField>
                <FormField
                  label="Hourly rate (₹)"
                  description="Used to compute the project budget from total task hours."
                  required
                >
                  <NumberInput value={hourlyRate} onChange={(v) => setHourlyRate(v ?? 0)} prefix="₹" suffix="/hr" />
                </FormField>
                <FormField label="Team members">
                  <MultiPicker
                    options={userOptions}
                    value={memberIds}
                    onChange={setMemberIds}
                  />
                </FormField>
              </div>

              <FormField
                label="What does the client need?"
                description="The more detail, the better. Mention what they're building, the tech they care about, constraints, must-haves."
                required
              >
                <TextArea
                  rows={9}
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                  placeholder={`Example: A new Shopify e-commerce store for a Kerala-based handloom brand. Custom theme, 4 collections, COD + Razorpay, Shiprocket integration, wishlist. Launch in 6 weeks. India + UAE.`}
                />
              </FormField>
            </div>
          ) : (
            <AiPlanPreviewBody
              team={team}
              workload={workload}
              milestones={milestones}
              sprints={sprints}
              tasks={tasks}
              expandedMilestones={expandedMilestones}
              onToggleMilestone={toggleMilestone}
              onUpdateMilestone={updateMilestone}
              onRemoveMilestone={removeMilestone}
              onAddMilestone={addMilestone}
              onUpdateSprint={updateSprint}
              onUpdateTask={updateTask}
              onRemoveTask={removeTask}
              onAddTask={addTask}
              hourlyRate={hourlyRate}
              onUpdateHourlyRate={setHourlyRate}
              budget={budgetOverride}
              onUpdateBudget={setBudgetOverride}
            />
          )}
        </div>

        <DialogFooter>
          {phase === "intake" ? (
            <>
              <Button variant="secondary" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || !canGenerate}
              >
                {generateMutation.isPending ? (
                  <>
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                    Creating & planning…
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 size-4" />
                    Create project & generate plan
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setPhase("intake")}>
                Back to basics
              </Button>
              <Button
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending || tasks.length === 0}
              >
                {applyMutation.isPending
                  ? "Saving…"
                  : `Save plan & open project`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Bare-bones multi-select: a row of toggle chips. We don't need a full
 * combobox here since member rosters are small (~20 people).
 */
function MultiPicker({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border p-2">
      {options.length === 0 && <span className="text-xs text-slate-400">No users available</span>}
      {options.map((o) => {
        const selected = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              selected
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
