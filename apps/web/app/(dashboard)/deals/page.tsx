"use client";

import { useState, useMemo } from "react";
import { Plus, LayoutGrid, List } from "lucide-react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
} from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ModuleHeader } from "@/components/layout/module-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/ui/date-picker";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useDeals, useClients, useContacts, useUsers } from "@/lib/api/hooks";
import { useCreateDeal } from "@/lib/api/mutations";
import { apiPatch } from "@/lib/api/client";
import { toast } from "@/lib/hooks/use-toast";
import { formatCurrency, toArray, cn } from "@/lib/utils";
import { DealDetailDrawer } from "@/components/deals/deal-detail-drawer";
import { ChartCard, BarChart, CHART_COLORS } from "@/components/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import type { ColumnDef } from "@tanstack/react-table";

const STAGES = ["PROSPECTING", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"] as const;
type Stage = typeof STAGES[number];

const stageColor: Record<string, string> = {
  PROSPECTING: "bg-slate-500",
  QUALIFICATION: "bg-blue-500",
  PROPOSAL: "bg-amber-500",
  NEGOTIATION: "bg-purple-500",
  CLOSED_WON: "bg-emerald-500",
  CLOSED_LOST: "bg-red-500",
};

const stageTone: Record<string, "info" | "neutral" | "warning" | "positive" | "destructive"> = {
  PROSPECTING: "info",
  QUALIFICATION: "info",
  PROPOSAL: "warning",
  NEGOTIATION: "warning",
  CLOSED_WON: "positive",
  CLOSED_LOST: "destructive",
};

interface Deal {
  id: string;
  name: string;
  stage: Stage | string;
  amount?: number | null;
  probability?: number | null;
  expectedCloseDate?: string | null;
  clientId?: string;
  contactId?: string | null;
  ownerId?: string | null;
  source?: string | null;
  description?: string | null;
  client?: { companyName?: string };
  owner?: { firstName?: string; lastName?: string } | null;
}

interface Client { id: string; companyName: string }
interface Contact { id: string; firstName: string; lastName: string; clientId: string }
interface User { id: string; firstName: string; lastName: string }

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  clientId: z.string().min(1, "Client is required"),
  contactId: z.string().optional(),
  amount: z.number().optional(),
  probability: z.number().optional(),
  expectedCloseDate: z.date().optional(),
  ownerId: z.string().optional(),
  description: z.string().optional(),
  source: z.string().optional(),
});
type CreateFormValues = z.infer<typeof createSchema>;

export default function DealsPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const filters = useMemo(() => {
    const f: { ownerId?: string; clientId?: string } = {};
    if (ownerFilter) f.ownerId = ownerFilter;
    if (clientFilter) f.clientId = clientFilter;
    return f;
  }, [ownerFilter, clientFilter]);

  const query = useDeals(filters);
  const clientsQuery = useClients();
  const usersQuery = useUsers();
  const createMutation = useCreateDeal();

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => apiPatch(`/deals/${id}`, { stage }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["deals"] }); },
    onError: () => toast({ variant: "error", title: "Failed to move deal" }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", clientId: "", contactId: "", description: "", source: "" },
  });
  const watchedClientId = form.watch("clientId");
  const contactsQuery = useContacts(watchedClientId || undefined);
  const contacts = toArray<Contact>(contactsQuery.data);

  if (query.isLoading) return <LoadingState label="Loading deals..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load deals." />;

  const deals = toArray<Deal>(query.data);
  const clients = toArray<Client>(clientsQuery.data);
  const users = toArray<User>(usersQuery.data);

  const handleDragStart = (event: DragStartEvent) => {
    const deal = deals.find((d) => d.id === event.active.id);
    setActiveDeal(deal ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over) return;
    const deal = deals.find((d) => d.id === active.id);
    if (!deal) return;

    let newStage: string | null = null;
    if (typeof over.id === "string" && over.id.startsWith("deal-col-")) {
      newStage = over.id.replace("deal-col-", "");
    } else {
      const overDeal = deals.find((d) => d.id === over.id);
      if (overDeal) newStage = overDeal.stage;
    }

    if (newStage && newStage !== deal.stage && (STAGES as readonly string[]).includes(newStage)) {
      qc.setQueryData(["deals", new URLSearchParams({
        ...(filters.ownerId && { ownerId: filters.ownerId }),
        ...(filters.clientId && { clientId: filters.clientId }),
      }).toString()], (old: unknown) => {
        const data = old as { data: Deal[] } | undefined;
        if (!data?.data) return old;
        return { ...data, data: data.data.map((d) => d.id === deal.id ? { ...d, stage: newStage as Stage } : d) };
      });
      stageMutation.mutate({ id: deal.id, stage: newStage });
    }
  };

  const onSubmit = (values: CreateFormValues) => {
    const payload: Record<string, unknown> = {
      name: values.name,
      clientId: values.clientId,
    };
    if (values.contactId) payload.contactId = values.contactId;
    if (values.amount != null) payload.amount = values.amount;
    if (values.probability != null) payload.probability = values.probability;
    if (values.expectedCloseDate) payload.expectedCloseDate = values.expectedCloseDate.toISOString();
    if (values.ownerId) payload.ownerId = values.ownerId;
    if (values.description) payload.description = values.description;
    if (values.source) payload.source = values.source;

    createMutation.mutate(payload, {
      onSuccess: () => {
        setCreateOpen(false);
        form.reset({ name: "", clientId: "", contactId: "", description: "", source: "" });
      },
    });
  };

  const totals = {
    total: deals.length,
    won: deals.filter((d) => d.stage === "CLOSED_WON").length,
    pipeline: deals
      .filter((d) => d.stage !== "CLOSED_WON" && d.stage !== "CLOSED_LOST")
      .reduce((sum, d) => sum + Number(d.amount ?? 0), 0),
  };

  const weightedPipeline = deals
    .filter((d) => d.stage !== "CLOSED_WON" && d.stage !== "CLOSED_LOST")
    .reduce((sum, d) => sum + (Number(d.amount ?? 0) * Number(d.probability ?? 0) / 100), 0);

  const now = new Date();
  const wonThisMonth = deals.filter((d) => {
    if (d.stage !== "CLOSED_WON" || !d.expectedCloseDate) return false;
    const ed = new Date(d.expectedCloseDate);
    return ed.getFullYear() === now.getFullYear() && ed.getMonth() === now.getMonth();
  }).length;

  const closedTotal = deals.filter((d) => d.stage === "CLOSED_WON" || d.stage === "CLOSED_LOST").length;
  const winRate = closedTotal > 0 ? Math.round((totals.won / closedTotal) * 100) : 0;

  const dealsByStage = STAGES.map((stage) => ({
    label: stage.replace("_", " "),
    value: deals.filter((d) => d.stage === stage).reduce((s, d) => s + Number(d.amount ?? 0), 0),
  }));

  // List view columns
  const columns: ColumnDef<Deal, unknown>[] = [
    { accessorKey: "name", header: "Deal", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "client", header: "Client", cell: ({ row }) => row.original.client?.companyName ?? "—" },
    { accessorKey: "stage", header: "Stage", cell: ({ row }) => <Badge tone={stageTone[row.original.stage] ?? "neutral"} dot size="sm">{row.original.stage.replace("_", " ")}</Badge> },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => row.original.amount != null ? formatCurrency(Number(row.original.amount)) : "—" },
    { accessorKey: "probability", header: "Probability", cell: ({ row }) => row.original.probability != null ? `${row.original.probability}%` : "—" },
    { id: "expectedCloseDate", header: "Close", cell: ({ row }) => row.original.expectedCloseDate ? new Date(row.original.expectedCloseDate).toLocaleDateString() : "—" },
    { id: "owner", header: "Owner", cell: ({ row }) => row.original.owner ? `${row.original.owner.firstName ?? ""} ${row.original.owner.lastName ?? ""}` : "—" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ModuleHeader
        module="clients"
        title="Deals Pipeline"
        description="Track deals through the sales pipeline. Drag between columns to update stage."
        primaryAction={{
          label: "New Deal",
          icon: <Plus className="mr-1 size-4" />,
          onClick: () => setCreateOpen(true),
        }}
        counts={[
          { label: "pipeline", value: Math.round(totals.pipeline), tone: "info" },
          { label: "won", value: totals.won, tone: "positive" },
          { label: "total", value: totals.total },
        ]}
      />

      {/* Stat row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Pipeline" value={formatCurrency(totals.pipeline)} />
        <StatCard title="Weighted Pipeline" value={formatCurrency(Math.round(weightedPipeline))} />
        <StatCard title="Won This Month" value={String(wonThisMonth)} />
        <StatCard title="Win Rate" value={`${winRate}%`} />
      </section>

      <ChartCard title="Deals by Stage" description="Total deal value per pipeline stage">
        <BarChart data={dealsByStage} color={CHART_COLORS.violet} height={240} formatValue={(n) => formatCurrency(n)} />
      </ChartCard>

      {/* View toggle + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border p-1">
          <button
            onClick={() => setView("kanban")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              view === "kanban" ? "bg-slate-900 text-white dark:bg-white/10" : "text-slate-500 hover:text-slate-700",
            )}
          >
            <LayoutGrid className="size-3.5" /> Kanban
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              view === "list" ? "bg-slate-900 text-white dark:bg-white/10" : "text-slate-500 hover:text-slate-700",
            )}
          >
            <List className="size-3.5" /> List View
          </button>
        </div>

        <div className="w-56">
          <Select
            value={ownerFilter}
            onValueChange={setOwnerFilter}
            placeholder="All owners"
            options={[{ value: "", label: "All owners" }, ...users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))]}
          />
        </div>
        <div className="w-56">
          <Select
            value={clientFilter}
            onValueChange={setClientFilter}
            placeholder="All clients"
            options={[{ value: "", label: "All clients" }, ...clients.map((c) => ({ value: c.id, label: c.companyName }))]}
          />
        </div>
      </div>

      {view === "kanban" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4 sm:gap-4 [&>*]:min-w-[280px] [&>*]:sm:min-w-[300px]">
            {STAGES.map((stage) => {
              const stageDeals = deals.filter((d) => d.stage === stage);
              return (
                <DealKanbanColumn
                  key={stage}
                  stage={stage}
                  deals={stageDeals}
                  onSelectDeal={(id) => setSelectedDealId(id)}
                />
              );
            })}
          </div>
          <DragOverlay>
            {activeDeal && <DealCardContent deal={activeDeal} />}
          </DragOverlay>
        </DndContext>
      ) : (
        <DataTable
          columns={columns}
          data={deals}
          searchPlaceholder="Search deals..."
          moduleColor="clients"
          onRowClick={(row) => setSelectedDealId(row.id)}
          emptyState={{ title: "No deals", description: "Create your first deal to start the pipeline." }}
        />
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>New Deal</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Deal Name" required error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} error={!!form.formState.errors.name} placeholder="Acme — Q2 Expansion" />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Client" required error={form.formState.errors.clientId?.message}>
                <Select
                  value={form.watch("clientId")}
                  onValueChange={(v) => { form.setValue("clientId", v, { shouldValidate: true }); form.setValue("contactId", ""); }}
                  error={!!form.formState.errors.clientId}
                  placeholder="Select client"
                  options={clients.map((c) => ({ value: c.id, label: c.companyName }))}
                />
              </FormField>
              <FormField label="Contact">
                <Select
                  value={form.watch("contactId") ?? ""}
                  onValueChange={(v) => form.setValue("contactId", v)}
                  placeholder={watchedClientId ? "Select contact" : "Pick a client first"}
                  options={contacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))}
                  disabled={!watchedClientId}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Amount">
                <NumberInput
                  value={form.watch("amount") ?? null}
                  onChange={(v) => form.setValue("amount", v ?? undefined)}
                  prefix="$"
                />
              </FormField>
              <FormField label="Probability (%)">
                <NumberInput
                  value={form.watch("probability") ?? null}
                  onChange={(v) => form.setValue("probability", v ?? undefined)}
                  suffix="%"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Expected Close Date">
                <DatePicker
                  value={form.watch("expectedCloseDate")}
                  onChange={(d) => form.setValue("expectedCloseDate", d ?? undefined)}
                />
              </FormField>
              <FormField label="Owner">
                <Select
                  value={form.watch("ownerId") ?? ""}
                  onValueChange={(v) => form.setValue("ownerId", v)}
                  placeholder="Assign owner"
                  options={users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
                />
              </FormField>
            </div>

            <FormField label="Source">
              <Input {...form.register("source")} placeholder="Referral, Website, Outbound..." />
            </FormField>
            <FormField label="Description">
              <TextArea {...form.register("description")} placeholder="Additional context..." />
            </FormField>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Deal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DealDetailDrawer dealId={selectedDealId} onClose={() => setSelectedDealId(null)} />
    </div>
  );
}

function DealKanbanColumn({
  stage,
  deals,
  onSelectDeal,
}: {
  stage: string;
  deals: Deal[];
  onSelectDeal: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `deal-col-${stage}`, data: { stage } });
  const total = deals.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const colorClass = stageColor[stage] ?? "bg-slate-500";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-2xl bg-slate-50/80 transition-colors dark:bg-slate-800/30",
        isOver && "ring-2 ring-primary ring-offset-2 bg-primary/5",
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <span className={`size-2 rounded-full ${colorClass}`} />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{stage.replace("_", " ")}</span>
        <span className="ml-auto text-[10px] text-slate-400">
          {deals.length} · {formatCurrency(total)}
        </span>
      </div>

      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: "calc(100vh - 320px)", minHeight: 200 }}>
          {deals.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-400">Drop deals here</div>
          )}
          {deals.map((deal) => (
            <SortableDealCard key={deal.id} deal={deal} onClick={() => onSelectDeal(deal.id)} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableDealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-xl border border-border/70 bg-white p-3 text-sm shadow-sm transition dark:bg-slate-900/80",
        isDragging ? "cursor-grabbing shadow-lg ring-2 ring-primary" : "hover:shadow-md",
      )}
    >
      <DealCardContent deal={deal} />
    </div>
  );
}

function DealCardContent({ deal }: { deal: Deal }) {
  const initials = deal.owner ? `${deal.owner.firstName?.[0] ?? ""}${deal.owner.lastName?.[0] ?? ""}` : "";
  return (
    <>
      <div className="font-medium leading-snug">{deal.name}</div>
      <div className="mt-1 text-xs text-slate-500">{deal.client?.companyName ?? "—"}</div>
      <div className="mt-2 flex items-center justify-between">
        <div className="text-sm font-semibold">
          {deal.amount != null ? formatCurrency(Number(deal.amount)) : "—"}
        </div>
        {deal.probability != null && (
          <span className="text-[10px] text-slate-400">{deal.probability}%</span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-slate-400">
          {deal.expectedCloseDate
            ? new Date(deal.expectedCloseDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            : ""}
        </span>
        {initials && (
          <span className="flex size-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {initials}
          </span>
        )}
      </div>
    </>
  );
}
