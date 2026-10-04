"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, UserPlus, Trash2, TrendingUp, Upload } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { CsvImportDialog } from "@/components/shared/csv-import-dialog";
import { LEAD_IMPORT_FIELDS } from "@/components/shared/csv-import-fields";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useLeads, useClients, useUsers } from "@/lib/api/hooks";
import { useCreateLead, useConvertLead, useDeleteLead, useConvertLeadToDeal, useImportLeadsCsv } from "@/lib/api/mutations";
import { apiPatch } from "@/lib/api/client";
import { toast } from "@/lib/hooks/use-toast";
import { formatCurrency, toArray } from "@/lib/utils";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { ChartCard, DonutChart, TrendChart, CHART_COLORS } from "@/components/charts";
import type { ColumnDef } from "@tanstack/react-table";

interface LeadRow {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  source?: string;
  status: string;
  estimatedValue?: number;
  notes?: string;
  assignedTo?: { firstName: string; lastName: string };
  createdAt?: string;
}

const leadStatusTone: Record<string, "neutral" | "info" | "warning" | "positive" | "destructive"> = {
  NEW: "info", CONTACTED: "neutral", QUALIFIED: "warning", PROPOSAL_SENT: "warning",
  NEGOTIATION: "warning", WON: "positive", LOST: "destructive",
};

const schema = z.object({
  companyName: z.string().min(1, "Company name required"),
  contactName: z.string().min(1, "Contact name required"),
  // Email no longer required — many leads come in via phone/walk-in
  // where the email isn't captured upfront. Still validated as an
  // email when provided so typos surface.
  email: z.union([z.literal(""), z.string().email("Enter a valid email")]).optional(),
  phone: z.string().optional(),
  source: z.string().optional(),
  estimatedValue: z.number().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const dealSchema = z.object({
  name: z.string().min(1, "Deal name is required"),
  clientId: z.string().min(1, "Client is required"),
  amount: z.number().optional(),
  probability: z.number().optional(),
  expectedCloseDate: z.date().optional(),
  ownerId: z.string().optional(),
  description: z.string().optional(),
});
type DealFormValues = z.infer<typeof dealSchema>;

export default function LeadsPage() {
  const qc = useQueryClient();
  const query = useLeads();
  const clientsQuery = useClients();
  const usersQuery = useUsers();
  const createMutation = useCreateLead();
  const convertMutation = useConvertLead();
  const deleteMutation = useDeleteLead();
  const importMutation = useImportLeadsCsv();
  const convertToDealMutation = useConvertLeadToDeal();
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch(`/leads/${id}`, { status }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["leads"] }); toast({ variant: "success", title: "Lead status updated" }); },
    onError: () => toast({ variant: "error", title: "Failed to update status" }),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeadRow | undefined>();
  const [detailLead, setDetailLead] = useState<LeadRow | undefined>();
  const [convertLead, setConvertLead] = useState<LeadRow | undefined>();

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const dealForm = useForm<DealFormValues>({ resolver: zodResolver(dealSchema) });

  useEffect(() => {
    if (convertLead) {
      dealForm.reset({
        name: `${convertLead.companyName} — Deal`,
        clientId: "",
        amount: convertLead.estimatedValue,
        description: convertLead.notes ?? "",
      });
    }
  }, [convertLead, dealForm]);

  if (query.isLoading) return <LoadingState label="Loading leads..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load leads." />;

  const leads = toArray<LeadRow>(query.data);
  const clients = toArray<{ id: string; companyName: string }>(clientsQuery.data);
  const users = toArray<{ id: string; firstName: string; lastName: string }>(usersQuery.data);

  const leadStatusDonut = (() => {
    const counts: Record<string, number> = {};
    leads.forEach((l) => { counts[l.status] = (counts[l.status] ?? 0) + 1; });
    const STATUS_COLOR: Record<string, string> = {
      NEW: CHART_COLORS.cyan, CONTACTED: CHART_COLORS.slate, QUALIFIED: CHART_COLORS.amber,
      PROPOSAL_SENT: CHART_COLORS.amber, NEGOTIATION: CHART_COLORS.violet,
      WON: CHART_COLORS.emerald, LOST: CHART_COLORS.red,
    };
    return Object.entries(counts).map(([label, value]) => ({
      label: label.replace("_", " "),
      value,
      color: STATUS_COLOR[label],
    }));
  })();

  const leadsTrend = (() => {
    const bucket: Record<string, number> = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      bucket[k] = 0;
    }
    leads.forEach((l) => {
      if (!l.createdAt) return;
      const d = new Date(l.createdAt);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (k in bucket) bucket[k]++;
    });
    return Object.entries(bucket).map(([k, v]) => {
      const [, m] = k.split("-");
      return { label: new Date(2000, Number(m) - 1, 1).toLocaleString("en-US", { month: "short" }), value: v };
    });
  })();

  const rowActions: RowAction<LeadRow>[] = [
    { label: "Contacted", onClick: (row) => updateStatusMutation.mutate({ id: row.id, status: "CONTACTED" }) },
    { label: "Qualified", onClick: (row) => updateStatusMutation.mutate({ id: row.id, status: "QUALIFIED" }) },
    { label: "Won", onClick: (row) => updateStatusMutation.mutate({ id: row.id, status: "WON" }) },
    { label: "Lost", onClick: (row) => updateStatusMutation.mutate({ id: row.id, status: "LOST" }), separator: true },
    {
      label: "Convert to Deal",
      icon: <TrendingUp className="size-4" />,
      onClick: (row) => { if (row.status !== "WON") setConvertLead(row); },
    },
    { label: "Convert to Client", icon: <UserPlus className="size-4" />, onClick: (row) => convertMutation.mutate(row.id) },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (row) => setDeleteTarget(row), destructive: true, separator: true },
  ];

  const columns: ColumnDef<LeadRow, unknown>[] = [
    { accessorKey: "companyName", header: "Company", cell: ({ row }) => (
      <div><div className="font-medium">{row.original.companyName}</div><div className="text-xs text-slate-500">{row.original.contactName}</div></div>
    )},
    { accessorKey: "email", header: "Email" },
    { accessorKey: "phone", header: "Phone", cell: ({ row }) => row.original.phone ?? "—" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => (
      <Badge tone={leadStatusTone[row.original.status] ?? "neutral"} size="sm" dot>{row.original.status.replace("_", " ")}</Badge>
    ), filterFn: "equals" },
    { accessorKey: "estimatedValue", header: "Value", cell: ({ row }) => row.original.estimatedValue ? formatCurrency(Number(row.original.estimatedValue)) : "—" },
    { accessorKey: "source", header: "Source", cell: ({ row }) => row.original.source ?? "—" },
    createActionsColumn(rowActions),
  ];

  const onSubmit = (values: FormValues) => {
    createMutation.mutate(values, { onSuccess: () => { setCreateOpen(false); form.reset(); } });
  };

  const onSubmitDeal = (values: DealFormValues) => {
    if (!convertLead) return;
    const payload: Record<string, unknown> & { leadId: string } = {
      leadId: convertLead.id,
      name: values.name,
      clientId: values.clientId,
    };
    if (values.amount != null) payload.amount = values.amount;
    if (values.probability != null) payload.probability = values.probability;
    if (values.expectedCloseDate) payload.expectedCloseDate = values.expectedCloseDate.toISOString();
    if (values.ownerId) payload.ownerId = values.ownerId;
    if (values.description) payload.description = values.description;

    convertToDealMutation.mutate(payload, {
      onSuccess: () => { setConvertLead(undefined); dealForm.reset(); },
    });
  };

  return (
    <ListPageLayout module="clients" title="Lead Pipeline" description="Track leads from first contact to conversion."
      primaryAction={{ label: "New Lead", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateOpen(true) }}
      secondaryActions={[
        { label: "Import CSV", icon: <Upload className="mr-1 size-4" />, onClick: () => setImportOpen(true) },
      ]}
      counts={[
        { label: "new", value: leads.filter((l) => l.status === "NEW").length, tone: "info" },
        { label: "won", value: leads.filter((l) => l.status === "WON").length, tone: "positive" },
        { label: "total", value: leads.length },
      ]}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Leads by Status" description="Current pipeline distribution">
          <DonutChart data={leadStatusDonut} total={String(leads.length)} totalLabel="leads" height={220} />
        </ChartCard>
        <ChartCard title="Leads Over Time" description="Last 12 months">
          <TrendChart data={leadsTrend} color={CHART_COLORS.primary} type="area" height={220} />
        </ChartCard>
      </div>

      <DataTable columns={columns} data={leads} searchPlaceholder="Search leads..."
        filterOptions={[{ column: "status", label: "Status", options: [
          { value: "NEW", label: "New" }, { value: "CONTACTED", label: "Contacted" },
          { value: "QUALIFIED", label: "Qualified" }, { value: "WON", label: "Won" }, { value: "LOST", label: "Lost" },
        ]}]}
        moduleColor="clients"
        onRowClick={(row) => setDetailLead(row)}
        emptyState={{ title: "No leads yet", description: "Create your first lead to start the pipeline." }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Company Name" required error={form.formState.errors.companyName?.message}>
                <Input {...form.register("companyName")} error={!!form.formState.errors.companyName} placeholder="Acme Corp" />
              </FormField>
              <FormField label="Contact Name" required error={form.formState.errors.contactName?.message}>
                <Input {...form.register("contactName")} error={!!form.formState.errors.contactName} placeholder="John Doe" />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Email" error={form.formState.errors.email?.message}>
                <Input {...form.register("email")} error={!!form.formState.errors.email} type="email" placeholder="john@acme.com (optional)" />
              </FormField>
              <FormField label="Phone"><Input {...form.register("phone")} placeholder="+91 9876543210" /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Source"><Input {...form.register("source")} placeholder="Website, Referral" /></FormField>
              <FormField label="Estimated Value">
                <NumberInput value={form.watch("estimatedValue")} onChange={(v) => form.setValue("estimatedValue", v ?? undefined)} prefix="INR" />
              </FormField>
            </div>
            <FormField label="Notes"><TextArea {...form.register("notes")} placeholder="Additional context..." /></FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Lead"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lead detail drawer */}
      <Drawer
        open={!!detailLead}
        onOpenChange={(open) => { if (!open) setDetailLead(undefined); }}
        title={detailLead?.companyName ?? "Lead"}
        description={detailLead?.contactName}
        size="lg"
      >
        {detailLead && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Status</div>
                <Badge tone={leadStatusTone[detailLead.status] ?? "neutral"} dot size="sm">
                  {detailLead.status.replace("_", " ")}
                </Badge>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Estimated Value</div>
                <div>{detailLead.estimatedValue ? formatCurrency(Number(detailLead.estimatedValue)) : "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Email</div>
                <div>{detailLead.email}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Phone</div>
                <div>{detailLead.phone ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Source</div>
                <div>{detailLead.source ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Assignee</div>
                <div>
                  {detailLead.assignedTo ? `${detailLead.assignedTo.firstName} ${detailLead.assignedTo.lastName}` : "—"}
                </div>
              </div>
            </div>
            {detailLead.notes && (
              <div>
                <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">Notes</div>
                <p className="text-sm text-slate-600 dark:text-slate-300">{detailLead.notes}</p>
              </div>
            )}

            <ActivityTimeline scope={{ leadId: detailLead.id }} />

            <div className="flex justify-end gap-3 border-t pt-4">
              {detailLead.status !== "WON" && (
                <Button onClick={() => { setConvertLead(detailLead); setDetailLead(undefined); }}>
                  <TrendingUp className="mr-2 size-4" /> Convert to Deal
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Convert to deal dialog */}
      <Dialog open={!!convertLead} onOpenChange={(open) => { if (!open) setConvertLead(undefined); }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Convert Lead to Deal</DialogTitle>
          </DialogHeader>
          <form onSubmit={dealForm.handleSubmit(onSubmitDeal)} className="space-y-4">
            <FormField label="Deal Name" required error={dealForm.formState.errors.name?.message}>
              <Input {...dealForm.register("name")} error={!!dealForm.formState.errors.name} />
            </FormField>
            <FormField label="Client" required error={dealForm.formState.errors.clientId?.message}>
              <Select
                value={dealForm.watch("clientId")}
                onValueChange={(v) => dealForm.setValue("clientId", v, { shouldValidate: true })}
                error={!!dealForm.formState.errors.clientId}
                placeholder="Select client"
                options={clients.map((c) => ({ value: c.id, label: c.companyName }))}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Amount">
                <NumberInput
                  value={dealForm.watch("amount") ?? null}
                  onChange={(v) => dealForm.setValue("amount", v ?? undefined)}
                  prefix="$"
                />
              </FormField>
              <FormField label="Probability (%)">
                <NumberInput
                  value={dealForm.watch("probability") ?? null}
                  onChange={(v) => dealForm.setValue("probability", v ?? undefined)}
                  suffix="%"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Expected Close Date">
                <DatePicker
                  value={dealForm.watch("expectedCloseDate")}
                  onChange={(d) => dealForm.setValue("expectedCloseDate", d ?? undefined)}
                />
              </FormField>
              <FormField label="Owner">
                <Select
                  value={dealForm.watch("ownerId") ?? ""}
                  onValueChange={(v) => dealForm.setValue("ownerId", v)}
                  placeholder="Assign owner"
                  options={users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
                />
              </FormField>
            </div>
            <FormField label="Description">
              <TextArea {...dealForm.register("description")} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setConvertLead(undefined)}>Cancel</Button>
              <Button type="submit" disabled={convertToDealMutation.isPending}>
                {convertToDealMutation.isPending ? "Converting..." : "Convert"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete lead" description={`Delete "${deleteTarget?.companyName}"?`} variant="destructive" confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending} />

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityLabel="Leads"
        fields={LEAD_IMPORT_FIELDS}
        mutation={importMutation}
      />
    </ListPageLayout>
  );
}
