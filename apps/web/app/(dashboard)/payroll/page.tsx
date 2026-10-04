"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Tabs } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { FormField } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import {
  usePayrollRuns, usePaySlips, useSalaryStructures, useMyPaySlips, useUsers,
} from "@/lib/api/hooks";
import {
  useCreatePayrollRun, useProcessPayrollRun, useMarkPayrollPaid, useUpsertSalaryStructure,
} from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { ChartCard, BarChart, CHART_COLORS } from "@/components/charts";

interface ProcessedByUser { id?: string; firstName?: string; lastName?: string; email?: string }

interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: string;
  totalGross?: number | string;
  totalNet?: number | string;
  totalDeductions?: number | string;
  processedAt?: string;
  processedBy?: ProcessedByUser | null;
  _count?: { slips?: number };
}

interface EmployeeWithUser {
  id?: string;
  designation?: string | null;
  department?: string | null;
  user?: { firstName?: string; lastName?: string; email?: string };
}

interface PaySlip {
  id: string;
  employee?: EmployeeWithUser;
  basic?: number | string;
  hra?: number | string;
  allowances?: number | string;
  grossSalary?: number | string;
  pfDeduction?: number | string;
  taxDeduction?: number | string;
  otherDeductions?: number | string;
  netSalary?: number | string;
  status?: string;
  paidAt?: string;
  month?: number;
  year?: number;
}

interface SalaryStructure {
  id: string;
  employeeId?: string;
  employee?: EmployeeWithUser;
  basic?: number | string;
  hra?: number | string;
  conveyance?: number | string;
  medical?: number | string;
  specialAllowance?: number | string;
  otherAllowance?: number | string;
  pfDeduction?: number | string;
  taxDeduction?: number | string;
  otherDeductions?: number | string;
  effectiveFrom?: string;
}

const MONTHS = [
  { value: "1", label: "January" }, { value: "2", label: "February" },
  { value: "3", label: "March" }, { value: "4", label: "April" },
  { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" },
  { value: "9", label: "September" }, { value: "10", label: "October" },
  { value: "11", label: "November" }, { value: "12", label: "December" },
];

function monthName(m: number) {
  return MONTHS[m - 1]?.label ?? String(m);
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  return Number(v ?? 0) || 0;
}

function fullName(u?: { firstName?: string; lastName?: string }): string {
  if (!u) return "—";
  const s = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return s || "—";
}

function structureNet(s: SalaryStructure): number {
  const earnings = num(s.basic) + num(s.hra) + num(s.conveyance) + num(s.medical) + num(s.specialAllowance) + num(s.otherAllowance);
  const deductions = num(s.pfDeduction) + num(s.taxDeduction) + num(s.otherDeductions);
  return earnings - deductions;
}

interface UserRow {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  employeeProfile?: { id: string };
}

export default function PayrollPage() {
  const [tab, setTab] = useState("runs");
  const [createOpen, setCreateOpen] = useState(false);
  const [runDrawer, setRunDrawer] = useState<PayrollRun | null>(null);
  const [editStructure, setEditStructure] = useState<SalaryStructure | null>(null);
  const [createStructureOpen, setCreateStructureOpen] = useState(false);
  const [month, setMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [year, setYear] = useState<number | null>(new Date().getFullYear());

  const runsQuery = usePayrollRuns();
  const structuresQuery = useSalaryStructures();
  const mySlipsQuery = useMyPaySlips();
  const usersQuery = useUsers();
  const drawerSlips = usePaySlips(runDrawer ? { runId: runDrawer.id } : undefined);

  const createRun = useCreatePayrollRun();
  const processRun = useProcessPayrollRun();
  const markPaid = useMarkPayrollPaid();
  const upsertStructure = useUpsertSalaryStructure();

  const runs = toArray<PayrollRun>(runsQuery.data?.data ?? runsQuery.data);
  const structures = toArray<SalaryStructure>(structuresQuery.data?.data ?? structuresQuery.data);
  const mySlips = toArray<PaySlip>(mySlipsQuery.data?.data ?? mySlipsQuery.data);
  const allUsers = toArray<UserRow>(usersQuery.data?.data ?? usersQuery.data);

  // Employees that have a profile (i.e. can have a salary structure)
  const employeesAll = allUsers.filter((u) => !!u.employeeProfile?.id);
  const structuredEmployeeIds = new Set(structures.map((s) => s.employeeId ?? s.employee?.id).filter(Boolean) as string[]);
  // For "create new structure" picker — only employees who don't have one yet
  const employeesWithoutStructure = employeesAll.filter((u) => !structuredEmployeeIds.has(u.employeeProfile!.id));

  const runActions: RowAction<PayrollRun>[] = [
    { label: "View Details", onClick: (row) => setRunDrawer(row) },
    {
      label: "Process",
      onClick: (row) => processRun.mutate(row.id),
      hidden: (row) => row.status !== "DRAFT",
    },
    {
      label: "Mark Paid",
      onClick: (row) => markPaid.mutate(row.id),
      hidden: (row) => row.status !== "PROCESSED",
    },
  ];

  const runColumns: ColumnDef<PayrollRun, unknown>[] = [
    {
      accessorKey: "month",
      header: "Period",
      cell: ({ row }) => `${monthName(row.original.month)} ${row.original.year}`,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} dot size="sm" />,
    },
    { id: "slipCount", header: "Slips", cell: ({ row }) => row.original._count?.slips ?? 0 },
    { accessorKey: "totalGross", header: "Total Gross", cell: ({ row }) => formatCurrency(num(row.original.totalGross)) },
    { accessorKey: "totalDeductions", header: "Deductions", cell: ({ row }) => formatCurrency(num(row.original.totalDeductions)) },
    { accessorKey: "totalNet", header: "Total Net", cell: ({ row }) => formatCurrency(num(row.original.totalNet)) },
    {
      accessorKey: "processedBy", header: "Processed By",
      cell: ({ row }) => row.original.processedBy ? fullName(row.original.processedBy) : "—",
    },
    createActionsColumn(runActions),
  ];

  const structureColumns: ColumnDef<SalaryStructure, unknown>[] = [
    {
      accessorKey: "employee", header: "Employee",
      cell: ({ row }) => fullName(row.original.employee?.user),
    },
    { accessorKey: "basic", header: "Basic", cell: ({ row }) => formatCurrency(num(row.original.basic)) },
    {
      id: "allowances", header: "Allowances",
      cell: ({ row }) => formatCurrency(
        num(row.original.hra) + num(row.original.conveyance) + num(row.original.medical) +
        num(row.original.specialAllowance) + num(row.original.otherAllowance),
      ),
    },
    {
      id: "deductions", header: "Deductions",
      cell: ({ row }) => formatCurrency(num(row.original.pfDeduction) + num(row.original.taxDeduction) + num(row.original.otherDeductions)),
    },
    { id: "net", header: "Net", cell: ({ row }) => formatCurrency(structureNet(row.original)) },
    {
      id: "edit", header: "", cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => setEditStructure(row.original)}>Edit</Button>
      ),
    },
  ];

  const mySlipColumns: ColumnDef<PaySlip, unknown>[] = [
    {
      accessorKey: "month", header: "Period",
      cell: ({ row }) => `${monthName(Number(row.original.month ?? 0))} ${row.original.year ?? ""}`,
    },
    { accessorKey: "grossSalary", header: "Gross", cell: ({ row }) => formatCurrency(num(row.original.grossSalary)) },
    {
      id: "deductions", header: "Deductions",
      cell: ({ row }) => formatCurrency(num(row.original.pfDeduction) + num(row.original.taxDeduction) + num(row.original.otherDeductions)),
    },
    { accessorKey: "netSalary", header: "Net", cell: ({ row }) => formatCurrency(num(row.original.netSalary)) },
    {
      accessorKey: "status", header: "Status",
      cell: ({ row }) => row.original.status ? <StatusBadge status={row.original.status} dot size="sm" /> : "—",
    },
    {
      id: "download", header: "", cell: ({ row }) => (
        <Link href={`/payroll/slips/${row.original.id}/print`} target="_blank" className="text-primary text-xs font-medium">Download</Link>
      ),
    },
  ];

  if (runsQuery.isLoading) return <LoadingState label="Loading payroll..." />;
  if (runsQuery.isError) return <ErrorState label="Unable to load payroll." />;

  const handleCreateRun = () => {
    if (!month || !year) return;
    createRun.mutate({ month: Number(month), year: Number(year) }, {
      onSuccess: () => setCreateOpen(false),
    });
  };

  return (
    <ListPageLayout
      module="hr"
      title="Payroll"
      description="Manage pay runs, salary structures, and pay slips."
      primaryAction={
        tab === "runs"
          ? { label: "New Pay Run", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateOpen(true) }
          : tab === "structures"
            ? { label: "New Salary Structure", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateStructureOpen(true) }
            : undefined
      }
      counts={[{ label: "runs", value: runs.length }]}
    >
      <Tabs
        tabs={[
          { key: "runs", label: "Pay Runs", count: runs.length },
          { key: "structures", label: "Salary Structures", count: structures.length },
          { key: "my-slips", label: "My Pay Slips", count: mySlips.length },
        ]}
        activeTab={tab}
        onTabChange={setTab}
      />

      {tab === "runs" && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard title="Payroll Cost by Month" description="Total net across processed runs">
              <BarChart
                data={(() => {
                  const bucket: Record<string, number> = {};
                  runs.forEach((r) => {
                    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
                    bucket[key] = (bucket[key] ?? 0) + num(r.totalNet);
                  });
                  return Object.entries(bucket)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .slice(-12)
                    .map(([k, v]) => {
                      const [, m] = k.split("-");
                      return { label: monthName(Number(m)).slice(0, 3), value: v };
                    });
                })()}
                color={CHART_COLORS.primary}
                height={220}
                formatValue={(n) => formatCurrency(n)}
              />
            </ChartCard>
            <ChartCard title="Salary Distribution" description="Employees per net pay band">
              <BarChart
                data={(() => {
                  const bands = [
                    { label: "<25k", min: 0, max: 25000 },
                    { label: "25–50k", min: 25000, max: 50000 },
                    { label: "50–100k", min: 50000, max: 100000 },
                    { label: "100–200k", min: 100000, max: 200000 },
                    { label: ">200k", min: 200000, max: Infinity },
                  ];
                  return bands.map((b) => ({
                    label: b.label,
                    value: structures.filter((s) => {
                      const n = structureNet(s);
                      return n >= b.min && n < b.max;
                    }).length,
                  }));
                })()}
                color={CHART_COLORS.emerald}
                height={220}
              />
            </ChartCard>
          </div>
          <DataTable
            columns={runColumns}
            data={runs}
            searchPlaceholder="Search runs..."
            moduleColor="hr"
            emptyState={{ title: "No pay runs yet", description: "Create your first pay run to get started." }}
          />
        </>
      )}

      {tab === "structures" && (
        <>
          {employeesAll.length > 0 && (
            <div className="rounded-xl border border-border bg-white p-3 text-sm dark:bg-slate-900/80">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-medium">{structures.length}</span>
                  <span className="text-slate-500"> of </span>
                  <span className="font-medium">{employeesAll.length}</span>
                  <span className="text-slate-500"> employees have a salary structure</span>
                  {employeesWithoutStructure.length > 0 && (
                    <span className="ml-2 text-xs text-amber-600">
                      ({employeesWithoutStructure.length} without — they will be skipped on payroll runs)
                    </span>
                  )}
                </div>
                {employeesWithoutStructure.length > 0 && (
                  <Button size="sm" onClick={() => setCreateStructureOpen(true)}>
                    <Plus className="mr-1 size-4" /> Add Structure
                  </Button>
                )}
              </div>
            </div>
          )}
          <DataTable
            columns={structureColumns}
            data={structures}
            searchPlaceholder="Search employees..."
            moduleColor="hr"
            emptyState={{
              title: "No salary structures",
              description: "Configure a salary structure for each employee. Without one, they're skipped on payroll runs.",
              action: employeesAll.length > 0 ? (
                <Button size="sm" onClick={() => setCreateStructureOpen(true)}>
                  <Plus className="mr-1 size-4" /> Add First Structure
                </Button>
              ) : undefined,
            }}
          />
        </>
      )}

      {tab === "my-slips" && (
        <DataTable
          columns={mySlipColumns}
          data={mySlips}
          searchPlaceholder="Search pay slips..."
          moduleColor="hr"
          emptyState={{ title: "No pay slips yet" }}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New Pay Run</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Month" required>
              <Select value={month} onValueChange={setMonth} options={MONTHS} />
            </FormField>
            <FormField label="Year" required>
              <NumberInput value={year ?? undefined} onChange={(v) => setYear(v ?? null)} />
            </FormField>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateRun} disabled={createRun.isPending}>
                {createRun.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Drawer
        open={!!runDrawer}
        onOpenChange={(open) => !open && setRunDrawer(null)}
        title={runDrawer ? `${monthName(runDrawer.month)} ${runDrawer.year}` : "Pay Run"}
        description="Pay slips in this run"
        size="lg"
      >
        {drawerSlips.isLoading ? (
          <LoadingState label="Loading slips..." />
        ) : (
          <div className="space-y-2">
            {toArray<PaySlip>(drawerSlips.data?.data ?? drawerSlips.data).map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <div>
                  <div className="font-medium">{fullName(s.employee?.user)}</div>
                  <div className="text-xs text-slate-500">
                    Gross {formatCurrency(num(s.grossSalary))} • Net {formatCurrency(num(s.netSalary))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {s.status && <Badge size="sm" tone="neutral">{s.status}</Badge>}
                  {s.paidAt && <span className="text-xs text-slate-400">{new Date(s.paidAt).toLocaleDateString()}</span>}
                  <Link
                    href={`/payroll/slips/${s.id}/print`}
                    target="_blank"
                    className="text-[11px] font-medium text-primary"
                  >
                    Download
                  </Link>
                </div>
              </div>
            ))}
            {toArray<PaySlip>(drawerSlips.data?.data ?? drawerSlips.data).length === 0 && (
              <div className="py-8 text-center text-sm text-slate-400">
                No pay slips yet. Process this run to generate slips.
              </div>
            )}
          </div>
        )}
      </Drawer>

      <StructureEditDialog
        open={!!editStructure}
        mode="edit"
        structure={editStructure}
        onClose={() => setEditStructure(null)}
        onSave={(data) => upsertStructure.mutate(data, { onSuccess: () => setEditStructure(null) })}
        saving={upsertStructure.isPending}
      />

      <StructureEditDialog
        open={createStructureOpen}
        mode="create"
        availableEmployees={employeesWithoutStructure}
        onClose={() => setCreateStructureOpen(false)}
        onSave={(data) => upsertStructure.mutate(data, { onSuccess: () => setCreateStructureOpen(false) })}
        saving={upsertStructure.isPending}
      />
    </ListPageLayout>
  );
}

function StructureEditDialog({
  open,
  mode,
  structure,
  availableEmployees,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  mode: "create" | "edit";
  structure?: SalaryStructure | null;
  availableEmployees?: UserRow[];
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  saving: boolean;
}) {
  // Reset state every time the dialog opens with new context
  const dialogKey = mode === "edit" ? structure?.id ?? "edit" : "create";

  const [pickedEmployeeId, setPickedEmployeeId] = useState<string>("");
  const [basic, setBasic] = useState<number | null>(null);
  const [hra, setHra] = useState<number | null>(null);
  const [conveyance, setConveyance] = useState<number | null>(null);
  const [medical, setMedical] = useState<number | null>(null);
  const [specialAllowance, setSpecialAllowance] = useState<number | null>(null);
  const [otherAllowance, setOtherAllowance] = useState<number | null>(null);
  const [pfDeduction, setPfDeduction] = useState<number | null>(null);
  const [taxDeduction, setTaxDeduction] = useState<number | null>(null);
  const [otherDeductions, setOtherDeductions] = useState<number | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState<Date | undefined>(undefined);

  // Re-seed state whenever the dialog opens (or switches to edit a different structure)
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && structure) {
      setPickedEmployeeId(structure.employeeId ?? structure.employee?.id ?? "");
      setBasic(Number(structure.basic ?? 0));
      setHra(Number(structure.hra ?? 0));
      setConveyance(Number(structure.conveyance ?? 0));
      setMedical(Number(structure.medical ?? 0));
      setSpecialAllowance(Number(structure.specialAllowance ?? 0));
      setOtherAllowance(Number(structure.otherAllowance ?? 0));
      setPfDeduction(Number(structure.pfDeduction ?? 0));
      setTaxDeduction(Number(structure.taxDeduction ?? 0));
      setOtherDeductions(Number(structure.otherDeductions ?? 0));
      setEffectiveFrom(structure.effectiveFrom ? new Date(structure.effectiveFrom) : new Date());
    } else {
      setPickedEmployeeId("");
      setBasic(null); setHra(null); setConveyance(null); setMedical(null);
      setSpecialAllowance(null); setOtherAllowance(null);
      setPfDeduction(null); setTaxDeduction(null); setOtherDeductions(null);
      setEffectiveFrom(new Date());
    }
  }, [dialogKey, open, mode, structure]);

  if (!open) return null;
  const employeeId = mode === "edit"
    ? (structure?.employeeId ?? structure?.employee?.id ?? "")
    : pickedEmployeeId;

  const totalEarnings = num(basic) + num(hra) + num(conveyance) + num(medical) + num(specialAllowance) + num(otherAllowance);
  const totalDeductions = num(pfDeduction) + num(taxDeduction) + num(otherDeductions);
  const net = totalEarnings - totalDeductions;
  const canSubmit = !!employeeId && num(basic) > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSave({
      employeeId,
      basic: basic ?? 0,
      hra: hra ?? 0,
      conveyance: conveyance ?? 0,
      medical: medical ?? 0,
      specialAllowance: specialAllowance ?? 0,
      otherAllowance: otherAllowance ?? 0,
      pfDeduction: pfDeduction ?? 0,
      taxDeduction: taxDeduction ?? 0,
      otherDeductions: otherDeductions ?? 0,
      effectiveFrom: (effectiveFrom ?? new Date()).toISOString(),
    });
  };

  const employeeOptions = (availableEmployees ?? []).map((u) => ({
    value: u.employeeProfile!.id,
    label: `${fullName(u)}${u.email ? ` — ${u.email}` : ""}`,
  }));

  const title = mode === "edit"
    ? `Edit Salary Structure — ${fullName(structure?.employee?.user)}`
    : "New Salary Structure";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {mode === "create" && (
            <FormField label="Employee" required>
              {employeeOptions.length === 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
                  All employees already have a salary structure. To change one, edit it from the table.
                </div>
              ) : (
                <Select
                  value={pickedEmployeeId}
                  onValueChange={setPickedEmployeeId}
                  options={employeeOptions}
                  placeholder="Select an employee…"
                />
              )}
            </FormField>
          )}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Earnings</div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Basic" required><NumberInput value={basic} onChange={setBasic} prefix="INR" /></FormField>
              <FormField label="HRA"><NumberInput value={hra} onChange={setHra} prefix="INR" /></FormField>
              <FormField label="Conveyance"><NumberInput value={conveyance} onChange={setConveyance} prefix="INR" /></FormField>
              <FormField label="Medical"><NumberInput value={medical} onChange={setMedical} prefix="INR" /></FormField>
              <FormField label="Special Allowance"><NumberInput value={specialAllowance} onChange={setSpecialAllowance} prefix="INR" /></FormField>
              <FormField label="Other Allowance"><NumberInput value={otherAllowance} onChange={setOtherAllowance} prefix="INR" /></FormField>
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Deductions</div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="PF"><NumberInput value={pfDeduction} onChange={setPfDeduction} prefix="INR" /></FormField>
              <FormField label="Tax"><NumberInput value={taxDeduction} onChange={setTaxDeduction} prefix="INR" /></FormField>
              <FormField label="Other"><NumberInput value={otherDeductions} onChange={setOtherDeductions} prefix="INR" /></FormField>
            </div>
          </div>
          <FormField label="Effective From" required>
            <DatePicker value={effectiveFrom} onChange={setEffectiveFrom} />
          </FormField>

          <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Gross</div>
                <div className="mt-1 font-semibold tabular-nums">{formatCurrency(totalEarnings)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Deductions</div>
                <div className="mt-1 font-semibold tabular-nums text-rose-600">{formatCurrency(totalDeductions)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Net</div>
                <div className="mt-1 font-semibold tabular-nums text-emerald-600">{formatCurrency(net)}</div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !canSubmit}>
            {saving ? "Saving..." : mode === "create" ? "Create Structure" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
