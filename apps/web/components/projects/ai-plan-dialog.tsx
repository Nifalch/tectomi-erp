"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { FormField } from "@/components/ui/form";
import { Sparkles, RefreshCw, Trash2, Plus, Wand2, Users, Clock, ChevronDown } from "lucide-react";
import { apiPost } from "@/lib/api/client";
import { toast } from "@/lib/hooks/use-toast";

interface TeamMember {
  id: string;
  name: string;
  role?: string;
}

export interface PlanTask {
  title: string;
  description?: string;
  milestoneIndex: number;
  sprintIndex?: number;
  assignedToId?: string;
  estimatedHrs?: number;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate?: string;
  subtasks?: Array<{ title: string; estimatedHrs?: number }>;
}

export interface PlanMilestone {
  title: string;
  description?: string;
  dueDate?: string;
}

export interface PlanSprint {
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
}

export interface PlanTeamMember {
  id: string;
  name: string;
  role?: string;
}

interface PlanResponse {
  plan: { milestones: PlanMilestone[]; sprints: PlanSprint[]; tasks: PlanTask[] };
  team: TeamMember[];
}

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export function AiPlanDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
}) {
  const qc = useQueryClient();
  const [requirement, setRequirement] = useState("");
  const [phase, setPhase] = useState<"intake" | "preview">("intake");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [milestones, setMilestones] = useState<PlanMilestone[]>([]);
  const [sprints, setSprints] = useState<PlanSprint[]>([]);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [expandedMilestones, setExpandedMilestones] = useState<Set<number>>(new Set());

  const generateMutation = useMutation({
    mutationFn: (req: string) =>
      apiPost<PlanResponse>(`/projects/${projectId}/ai-generate-plan`, { requirement: req }),
    onSuccess: (data) => {
      setTeam(data.team);
      setMilestones(data.plan.milestones);
      setSprints(data.plan.sprints ?? []);
      setTasks(data.plan.tasks);
      setExpandedMilestones(new Set(data.plan.milestones.map((_, i) => i))); // expand all by default
      setPhase("preview");
    },
    onError: (err: Error) =>
      toast({
        variant: "error",
        title: "AI generation failed",
        description: err.message,
      }),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      apiPost<{
        milestoneCount: number;
        sprintCount: number;
        taskCount: number;
        subtaskCount: number;
        computedBudget: number | null;
        firstInvoiceId: string | null;
        proposalId: string | null;
      }>(`/projects/${projectId}/ai-apply-plan`, {
        milestones,
        sprints,
        tasks,
        // The original requirement is needed server-side for proposal
        // generation. Sending null suppresses that step explicitly.
        requirement: requirement.trim() || null,
      }),
    onSuccess: (result) => {
      const bits = [
        `${result.milestoneCount} milestones`,
        `${result.sprintCount} sprints`,
        `${result.taskCount} tasks`,
      ];
      if (result.subtaskCount > 0) bits.push(`${result.subtaskCount} subtasks`);
      if (result.computedBudget) {
        bits.push(`budget set to ₹${result.computedBudget.toLocaleString("en-IN")}`);
      }
      if (result.firstInvoiceId) bits.push("first invoice drafted");
      if (result.proposalId) bits.push("proposal drafted");
      toast({
        variant: "success",
        title: "Plan applied",
        description: bits.join(" · "),
        duration: 10_000,
      });
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["proposals"] });
      onOpenChange(false);
      reset();
    },
    onError: (err: Error) =>
      toast({
        variant: "error",
        title: "Couldn't save plan",
        description: err.message,
      }),
  });

  const reset = () => {
    setRequirement("");
    setPhase("intake");
    setMilestones([]);
    setSprints([]);
    setTasks([]);
    setTeam([]);
    setExpandedMilestones(new Set());
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  // ── Editing helpers ──
  const updateMilestone = (i: number, patch: Partial<PlanMilestone>) =>
    setMilestones((arr) => arr.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const removeMilestone = (i: number) => {
    setMilestones((arr) => arr.filter((_, idx) => idx !== i));
    // Reindex tasks: drop tasks belonging to this milestone, decrement indices for later milestones.
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

  const updateTask = (i: number, patch: Partial<PlanTask>) =>
    setTasks((arr) => arr.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const removeTask = (i: number) => setTasks((arr) => arr.filter((_, idx) => idx !== i));
  const addTask = (milestoneIndex: number) =>
    setTasks((arr) => [
      ...arr,
      { title: "New task", milestoneIndex, estimatedHrs: 4, priority: "MEDIUM" },
    ]);

  const toggleMilestone = (i: number) =>
    setExpandedMilestones((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Workload summary per team member (so the user can see if AI distributed evenly).
  const workload = team.map((m) => {
    const hrs = tasks
      .filter((t) => t.assignedToId === m.id)
      .reduce((s, t) => s + (t.estimatedHrs ?? 0), 0);
    const count = tasks.filter((t) => t.assignedToId === m.id).length;
    return { ...m, hrs, count };
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500" />
            {phase === "intake" ? "Generate project plan with AI" : "Review generated plan"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {phase === "intake" ? (
            <IntakeForm
              requirement={requirement}
              onRequirementChange={setRequirement}
              busy={generateMutation.isPending}
            />
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
              onUpdateSprint={(i, patch) =>
                setSprints((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
              }
              onUpdateTask={updateTask}
              onRemoveTask={removeTask}
              onAddTask={addTask}
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
                onClick={() => generateMutation.mutate(requirement)}
                disabled={generateMutation.isPending || requirement.trim().length < 12}
              >
                {generateMutation.isPending ? (
                  <>
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                    Thinking…
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 size-4" />
                    Generate plan
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setPhase("intake")}>
                Back
              </Button>
              <Button
                variant="ghost"
                onClick={() => generateMutation.mutate(requirement)}
                disabled={generateMutation.isPending}
              >
                <RefreshCw className={`mr-2 size-4 ${generateMutation.isPending ? "animate-spin" : ""}`} />
                Regenerate
              </Button>
              <Button
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending || tasks.length === 0}
              >
                {applyMutation.isPending
                  ? "Creating…"
                  : `Create ${milestones.length} milestone${milestones.length === 1 ? "" : "s"} & ${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IntakeForm({
  requirement,
  onRequirementChange,
  busy,
}: {
  requirement: string;
  onRequirementChange: (v: string) => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
        <p className="text-amber-900 dark:text-amber-100">
          <Sparkles className="inline size-4 align-text-bottom" /> The AI will read your requirement, look at the project&apos;s budget, dates, and team, then propose a complete plan — milestones, tasks, hour estimates, due dates, and assignments.
        </p>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          You&apos;ll be able to edit everything before it&apos;s saved.
        </p>
      </div>

      <FormField
        label="What does the client need?"
        description="The more detail, the better the plan. Mention what they're building, the tech they care about, any constraints, deadlines, must-haves."
        required
      >
        <TextArea
          value={requirement}
          onChange={(e) => onRequirementChange(e.target.value)}
          rows={9}
          placeholder={`Example: A new Shopify e-commerce store for a Kerala-based handloom brand. They want a custom theme inspired by their physical store, 4 collections (sarees, dupattas, fabrics, home), product reviews, COD + Razorpay checkout, integration with Shiprocket, and a wishlist feature. Launch target: 6 weeks. Indian + UAE market.`}
          disabled={busy}
        />
      </FormField>

      <p className="text-xs text-slate-500">
        Tip: Set the project&apos;s start/end date, budget, and add team members first — the AI uses them to size the plan and balance the workload.
      </p>
    </div>
  );
}

export function AiPlanPreviewBody({
  team,
  workload,
  milestones,
  sprints,
  tasks,
  expandedMilestones,
  onToggleMilestone,
  onUpdateMilestone,
  onRemoveMilestone,
  onAddMilestone,
  onUpdateSprint,
  onUpdateTask,
  onRemoveTask,
  onAddTask,
  hourlyRate,
  onUpdateHourlyRate,
  budget,
  onUpdateBudget,
}: {
  team: TeamMember[];
  workload: Array<TeamMember & { hrs: number; count: number }>;
  milestones: PlanMilestone[];
  sprints: PlanSprint[];
  tasks: PlanTask[];
  expandedMilestones: Set<number>;
  onToggleMilestone: (i: number) => void;
  onUpdateMilestone: (i: number, patch: Partial<PlanMilestone>) => void;
  onRemoveMilestone: (i: number) => void;
  onAddMilestone: () => void;
  onUpdateSprint: (i: number, patch: Partial<PlanSprint>) => void;
  onUpdateTask: (i: number, patch: Partial<PlanTask>) => void;
  onRemoveTask: (i: number) => void;
  onAddTask: (milestoneIndex: number) => void;
  /** Optional — when provided, renders the editable Budget summary card. */
  hourlyRate?: number;
  onUpdateHourlyRate?: (v: number) => void;
  /** Manual budget override. When null/undefined, budget is computed
   *  from total hours × hourlyRate. */
  budget?: number | null;
  onUpdateBudget?: (v: number | null) => void;
}) {
  const totalHrs = tasks.reduce((s, t) => s + (t.estimatedHrs ?? 0), 0);
  const showBudgetPanel = typeof hourlyRate === "number" && !!onUpdateHourlyRate;
  const computedBudget = Math.round(totalHrs * (hourlyRate ?? 0));
  const effectiveBudget = typeof budget === "number" ? budget : computedBudget;
  const budgetIsOverridden = typeof budget === "number" && budget !== computedBudget;

  const assigneeOptions = [
    { value: "", label: "Unassigned" },
    ...team.map((m) => ({ value: m.id, label: m.name })),
  ];
  const sprintOptions = sprints.length > 0
    ? sprints.map((s, i) => ({ value: String(i), label: s.name || `Sprint ${i + 1}` }))
    : [{ value: "", label: "No sprints" }];

  return (
    <div className="space-y-4">
      {/* Editable budget card — only shown when the caller supplies a
          rate and an updater. Lets the user tune the hourly rate or
          override the auto-budget without leaving the preview. */}
      {showBudgetPanel && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Total project hours
              </div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums">{totalHrs.toFixed(0)} hrs</div>
              <div className="text-[11px] text-slate-500">{tasks.length} tasks · edit hours inline below</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Hourly rate
              </div>
              <NumberInput
                value={hourlyRate ?? 0}
                onChange={(v) => onUpdateHourlyRate?.(v ?? 0)}
                prefix="₹"
                suffix="/hr"
                className="mt-1"
              />
              <div className="text-[11px] text-slate-500">Drives the auto-budget</div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Budget
                </span>
                {budgetIsOverridden && (
                  <button
                    type="button"
                    onClick={() => onUpdateBudget?.(null)}
                    className="text-[10px] font-medium text-slate-500 hover:text-primary"
                  >
                    Reset to auto
                  </button>
                )}
              </div>
              <NumberInput
                value={effectiveBudget}
                onChange={(v) => onUpdateBudget?.(v ?? 0)}
                prefix="₹"
                className="mt-1"
              />
              <div className="text-[11px] text-slate-500">
                {budgetIsOverridden
                  ? `Manual override · auto would be ₹${computedBudget.toLocaleString("en-IN")}`
                  : `${totalHrs.toFixed(0)} hrs × ₹${(hourlyRate ?? 0).toLocaleString("en-IN")}/hr (editable)`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top summary strip — total hours + per-person workload */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-slate-50 p-3 dark:bg-slate-900/40">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Clock className="size-3.5" /> Total effort
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums">{totalHrs.toFixed(0)} hrs</div>
          <div className="text-xs text-slate-500">across {tasks.length} tasks</div>
        </div>
        <div className="rounded-xl border border-border bg-slate-50 p-3 dark:bg-slate-900/40">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Users className="size-3.5" /> Workload split
          </div>
          {workload.length === 0 ? (
            <div className="mt-1 text-xs text-slate-400">No team members assigned to this project.</div>
          ) : (
            <div className="mt-2 space-y-1.5">
              {workload.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-slate-700 dark:text-slate-200">{m.name}</span>
                  <span className="ml-2 whitespace-nowrap text-slate-500">
                    {m.count} task{m.count === 1 ? "" : "s"} · <span className="font-mono">{m.hrs.toFixed(0)}h</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sprint timeline strip — horizontal scroll so 2-week cycles
          are visible at a glance. Each card is editable inline. */}
      {sprints.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Clock className="size-3.5" /> Sprints
            <span className="font-normal normal-case tracking-normal text-slate-400">
              {sprints.length} × 2-week cycles
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {sprints.map((s, i) => {
              const sprintTaskCount = tasks.filter((t) => t.sprintIndex === i).length;
              const sprintHrs = tasks
                .filter((t) => t.sprintIndex === i)
                .reduce((sum, t) => sum + (t.estimatedHrs ?? 0), 0);
              return (
                <div
                  key={i}
                  className="min-w-[220px] flex-shrink-0 rounded-xl border border-border bg-slate-50/40 p-3 dark:bg-slate-900/40"
                >
                  <Input
                    value={s.name}
                    onChange={(e) => onUpdateSprint(i, { name: e.target.value })}
                    className="border-none bg-transparent px-0 text-sm font-semibold focus:bg-white focus:dark:bg-slate-950"
                  />
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Input
                      type="date"
                      value={s.startDate}
                      onChange={(e) => onUpdateSprint(i, { startDate: e.target.value })}
                      className="h-7 w-[100px] text-[11px]"
                    />
                    <span>→</span>
                    <Input
                      type="date"
                      value={s.endDate}
                      onChange={(e) => onUpdateSprint(i, { endDate: e.target.value })}
                      className="h-7 w-[100px] text-[11px]"
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    {sprintTaskCount} task{sprintTaskCount === 1 ? "" : "s"} · <span className="font-mono">{sprintHrs.toFixed(0)}h</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Milestones list */}
      <div className="space-y-3">
        {milestones.map((m, mIdx) => {
          const expanded = expandedMilestones.has(mIdx);
          // Sort tasks by due date (earliest first), then by sprint
          // index, then by their original array order as a tiebreaker.
          // This puts them in execution order so the preview reads
          // top-to-bottom like a Gantt.
          const milestoneTasks = tasks
            .map((t, i) => ({ t, i }))
            .filter(({ t }) => t.milestoneIndex === mIdx)
            .sort((a, b) => {
              const ad = a.t.dueDate ?? "9999-12-31";
              const bd = b.t.dueDate ?? "9999-12-31";
              if (ad !== bd) return ad.localeCompare(bd);
              const asp = a.t.sprintIndex ?? 99;
              const bsp = b.t.sprintIndex ?? 99;
              if (asp !== bsp) return asp - bsp;
              return a.i - b.i;
            });

          const milestoneHrs = milestoneTasks.reduce(
            (s, { t }) => s + (t.estimatedHrs ?? 0),
            0,
          );

          return (
            <div key={mIdx} className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center gap-2 bg-slate-50/60 px-3 py-2 dark:bg-slate-900/40">
                <button
                  type="button"
                  onClick={() => onToggleMilestone(mIdx)}
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                >
                  <ChevronDown className={`size-4 transition ${expanded ? "" : "-rotate-90"}`} />
                </button>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                  M{mIdx + 1}
                </span>
                <Input
                  value={m.title}
                  onChange={(e) => onUpdateMilestone(mIdx, { title: e.target.value })}
                  placeholder="Milestone title"
                  className="border-none bg-transparent text-sm font-medium focus:bg-white focus:dark:bg-slate-950"
                />
                <Input
                  type="date"
                  value={m.dueDate ?? ""}
                  onChange={(e) => onUpdateMilestone(mIdx, { dueDate: e.target.value || undefined })}
                  className="w-36 text-xs"
                />
                {/* Milestone hours roll-up — quick sanity-check that the
                    work in this milestone matches what the user expects. */}
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {milestoneHrs.toFixed(0)}h · {milestoneTasks.length} {milestoneTasks.length === 1 ? "task" : "tasks"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveMilestone(mIdx)}
                  title="Delete milestone (also deletes its tasks)"
                  className="text-rose-500"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              {expanded && (
                <div className="space-y-2 p-3">
                  {milestoneTasks.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No tasks in this milestone yet.</p>
                  ) : (
                    milestoneTasks.map(({ t, i }, sortedIdx) => (
                      <div key={i} className="rounded-lg border border-border/60 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          {/* Sequence number — execution order within the
                              milestone (T1 first, T2 second, etc.). Helps
                              the user scan the plan top-to-bottom and see
                              what comes when. */}
                          <span className="inline-flex size-5 items-center justify-center rounded-md bg-slate-100 text-[10px] font-mono font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            T{sortedIdx + 1}
                          </span>
                          {t.dueDate && (
                            <span className="font-mono text-[10px] text-slate-400">
                              due {t.dueDate}
                            </span>
                          )}
                          {t.estimatedHrs != null && (
                            <span className="font-mono text-[10px] text-slate-400">
                              · {t.estimatedHrs}h
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
                          <Input
                            value={t.title}
                            onChange={(e) => onUpdateTask(i, { title: e.target.value })}
                            placeholder="Task title"
                            className="text-sm"
                          />
                          <NumberInput
                            value={t.estimatedHrs ?? null}
                            onChange={(v) => onUpdateTask(i, { estimatedHrs: v ?? undefined })}
                            placeholder="Hrs"
                            suffix="h"
                            className="w-24"
                          />
                          <Select
                            value={t.priority ?? "MEDIUM"}
                            onValueChange={(v) =>
                              onUpdateTask(i, { priority: v as PlanTask["priority"] })
                            }
                            options={PRIORITY_OPTIONS}
                            className="w-32"
                          />
                          <Select
                            value={t.assignedToId ?? ""}
                            onValueChange={(v) =>
                              onUpdateTask(i, { assignedToId: v || undefined })
                            }
                            options={assigneeOptions}
                            className="w-40"
                          />
                          {sprints.length > 0 && (
                            <Select
                              value={t.sprintIndex != null ? String(t.sprintIndex) : ""}
                              onValueChange={(v) =>
                                onUpdateTask(i, { sprintIndex: v === "" ? undefined : Number(v) })
                              }
                              options={sprintOptions}
                              className="w-36"
                            />
                          )}
                          <div className="flex items-center gap-1">
                            <Input
                              type="date"
                              value={t.dueDate ?? ""}
                              onChange={(e) => onUpdateTask(i, { dueDate: e.target.value || undefined })}
                              className="w-36 text-xs"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onRemoveTask(i)}
                              className="text-rose-500"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                        {t.description && (
                          <TextArea
                            value={t.description}
                            onChange={(e) => onUpdateTask(i, { description: e.target.value })}
                            rows={2}
                            className="mt-2 text-xs"
                          />
                        )}
                        {/* Subtasks — indented row of editable child items.
                            Hours roll up into parent estimate; assignee + due
                            date are inherited at save time. */}
                        {t.subtasks && t.subtasks.length > 0 && (
                          <div className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              Subtasks · {t.subtasks.length}
                            </div>
                            {t.subtasks.map((st, sIdx) => (
                              <div key={sIdx} className="flex items-center gap-2">
                                <Input
                                  value={st.title}
                                  onChange={(e) => {
                                    const next = [...(t.subtasks ?? [])];
                                    next[sIdx] = { ...next[sIdx], title: e.target.value };
                                    onUpdateTask(i, { subtasks: next });
                                  }}
                                  className="h-8 flex-1 text-xs"
                                  placeholder="Subtask title"
                                />
                                <NumberInput
                                  value={st.estimatedHrs ?? null}
                                  onChange={(v) => {
                                    const next = [...(t.subtasks ?? [])];
                                    next[sIdx] = { ...next[sIdx], estimatedHrs: v ?? undefined };
                                    onUpdateTask(i, { subtasks: next });
                                  }}
                                  suffix="h"
                                  className="w-20 text-xs"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const next = (t.subtasks ?? []).filter((_, idx) => idx !== sIdx);
                                    onUpdateTask(i, { subtasks: next.length ? next : undefined });
                                  }}
                                  className="text-rose-500"
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const next = [
                              ...(t.subtasks ?? []),
                              { title: "New subtask", estimatedHrs: 2 },
                            ];
                            onUpdateTask(i, { subtasks: next });
                          }}
                          className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-primary"
                        >
                          <Plus className="size-3" />
                          Add subtask
                        </button>
                      </div>
                    ))
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onAddTask(mIdx)}
                    className="w-full justify-center"
                  >
                    <Plus className="mr-1 size-3.5" /> Add task to this milestone
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        <Button variant="secondary" onClick={onAddMilestone} className="w-full justify-center">
          <Plus className="mr-1 size-4" /> Add milestone
        </Button>
      </div>
    </div>
  );
}
