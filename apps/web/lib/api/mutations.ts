"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiPatch, apiDelete, apiFetch, apiFetchForm } from "./client";
import { toast } from "@/lib/hooks/use-toast";
import type { LoginResponse } from "@/lib/auth";

// ── Projects ──

interface CreateProjectData {
  name: string;
  clientId: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  status?: string;
  managerId?: string;
  memberIds?: string[];
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectData) => apiPost("/projects", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ variant: "success", title: "Project created" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to create project" });
    },
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateProjectData>) => apiPatch(`/projects/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["project", id] });
      toast({ variant: "success", title: "Project updated" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to update project" });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/projects/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ variant: "success", title: "Project deleted" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to delete project" });
    },
  });
}

// ── Tasks ──

interface CreateTaskData {
  projectId: string;
  title: string;
  description?: string;
  assignedToId?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  startDate?: string;
  milestoneId?: string;
  sprintId?: string;
  storyPoints?: number;
  estimatedHrs?: number;
  progressPercent?: number;
  force?: boolean;
}

// Shared invalidator: refresh board (`project-tasks`), global lists (`tasks`),
// and the detail drawer (`task`) so any sub-resource change reflects immediately.
function invalidateAllTaskQueries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["tasks"] });
  void qc.invalidateQueries({ queryKey: ["project-tasks"] });
  void qc.invalidateQueries({ queryKey: ["task"] });
  void qc.invalidateQueries({ queryKey: ["task-history"] });
  void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
  // Task status transitions auto-start/stop timers on the server, which
  // produces/updates time entries. Refresh the related queries so the
  // Time page, Project → Time tab, and the topbar timer pill update
  // immediately instead of waiting for the next render.
  void qc.invalidateQueries({ queryKey: ["time-entries"] });
  void qc.invalidateQueries({ queryKey: ["project-time-summary"] });
  void qc.invalidateQueries({ queryKey: ["project-workload"] });
  void qc.invalidateQueries({ queryKey: ["active-timer"] });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTaskData) => apiPost("/tasks", data),
    onSuccess: () => {
      invalidateAllTaskQueries(qc);
      toast({ variant: "success", title: "Task created" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to create task" });
    },
  });
}

export function useUpdateTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateTaskData>) => apiPatch(`/tasks/${id}`, data),
    onSuccess: () => {
      invalidateAllTaskQueries(qc);
      toast({ variant: "success", title: "Task updated" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to update task" });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/tasks/${id}`),
    onSuccess: () => {
      invalidateAllTaskQueries(qc);
      toast({ variant: "success", title: "Task deleted" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to delete task" });
    },
  });
}

export function useAddTaskComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { content: string }) => apiPost(`/tasks/${taskId}/comments`, data),
    onSuccess: () => {
      invalidateAllTaskQueries(qc);
      toast({ variant: "success", title: "Comment added" });
    },
    onError: () => {
      toast({ variant: "error", title: "Failed to add comment" });
    },
  });
}

// ── Attendance ──

// Shared attendance/leave invalidations — clock-in can trigger auto-leave
// deductions, so leave balances / monthly usage / leave list all need
// refresh.
function invalidateAttendanceAndLeave(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["attendance"] });
  void qc.invalidateQueries({ queryKey: ["attendance-today"] });
  void qc.invalidateQueries({ queryKey: ["attendance-hr-summary"] });
  void qc.invalidateQueries({ queryKey: ["leave"] });
  void qc.invalidateQueries({ queryKey: ["leave-balances"] });
  void qc.invalidateQueries({ queryKey: ["leave-monthly-usage"] });
}

interface ClockResponse {
  attendance?: { status?: string; lateMinutes?: number };
  autoLeave?: { days: number; isPaid: boolean; source: string } | null;
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { timestamp: string; latitude?: number; longitude?: number }) =>
      apiPost<ClockResponse>("/attendance/clock-in", data),
    onSuccess: (res) => {
      invalidateAttendanceAndLeave(qc);
      const status = res?.attendance?.status;
      const lateMinutes = res?.attendance?.lateMinutes ?? 0;
      if (status === "HALF_DAY") {
        toast({
          variant: "warning",
          title: "Half-day applied",
          description: res?.autoLeave?.isPaid
            ? "0.5 paid leave deducted (check-in after 12 PM)."
            : "0.5 unpaid leave logged (monthly cap exhausted).",
        });
      } else if (status === "LATE") {
        const penaltyMsg = res?.autoLeave
          ? ` · Late-streak penalty: ${res.autoLeave.days} day${res.autoLeave.days === 1 ? "" : "s"} ${res.autoLeave.isPaid ? "paid" : "unpaid"} leave deducted.`
          : "";
        toast({
          variant: "warning",
          title: `Clocked in (late by ${lateMinutes} min)`,
          description: `Marked LATE.${penaltyMsg}`,
        });
      } else {
        toast({ variant: "success", title: "Clocked in", description: "On time." });
      }
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to clock in", description: err.message }),
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { timestamp: string; latitude?: number; longitude?: number }) =>
      apiPost("/attendance/clock-out", data),
    onSuccess: () => {
      invalidateAttendanceAndLeave(qc);
      toast({ variant: "success", title: "Clocked out" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to clock out", description: err.message }),
  });
}

export function useUpdateAttendancePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      officeStartHour?: number;
      officeStartMinute?: number;
      officeEndHour?: number;
      officeEndMinute?: number;
      graceMinutes?: number;
      halfDayCutoffHour?: number;
      halfDayCutoffMinute?: number;
      requiredDailyHours?: number;
      lateStreakThreshold?: number;
      monthlyPaidLeaveCap?: number;
      workingDaysMask?: number;
    }) => apiPatch("/attendance/policy", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["attendance-policy"] });
      void qc.invalidateQueries({ queryKey: ["attendance-today"] });
      toast({ variant: "success", title: "Attendance policy updated" });
    },
    onError: () => toast({ variant: "error", title: "Failed to update policy" }),
  });
}

export function useUpdateOfficeSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; latitude?: number; longitude?: number; radiusMeters?: number; geofenceEnabled?: boolean; allowedIpAddresses?: string | null }) =>
      apiPatch("/attendance/office-settings", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["office-settings"] });
      void qc.invalidateQueries({ queryKey: ["attendance-today"] });
      toast({ variant: "success", title: "Office settings updated" });
    },
    onError: () => toast({ variant: "error", title: "Failed to update office settings" }),
  });
}

// ── Biometric / ESSL device admin ──

export function useUpdateBiometricDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name?: string; approved?: boolean }) =>
      apiPatch(`/biometric/devices/${input.id}`, {
        name: input.name,
        approved: input.approved,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["biometric"] });
      toast({ variant: "success", title: "Device updated" });
    },
    onError: () => toast({ variant: "error", title: "Failed to update device" }),
  });
}

export function useDeleteBiometricDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/biometric/devices/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["biometric"] });
      toast({ variant: "success", title: "Device removed" });
    },
    onError: () => toast({ variant: "error", title: "Failed to remove device" }),
  });
}

export function useReprocessBiometricDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/biometric/devices/${id}/reprocess`, {}),
    onSuccess: (res: unknown) => {
      void qc.invalidateQueries({ queryKey: ["biometric"] });
      void qc.invalidateQueries({ queryKey: ["attendance"] });
      const n = (res as { replayed?: number })?.replayed ?? 0;
      toast({
        variant: "success",
        title: "Reprocessed",
        description: `${n} punch${n === 1 ? "" : "es"} synced to attendance`,
      });
    },
    onError: () => toast({ variant: "error", title: "Failed to reprocess punches" }),
  });
}

export function useSetUserEnrollId() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; enrollId: string | null }) =>
      apiPatch(`/biometric/users/${input.userId}/enroll-id`, {
        enrollId: input.enrollId,
      }),
    onSuccess: (res: unknown) => {
      void qc.invalidateQueries({ queryKey: ["biometric"] });
      void qc.invalidateQueries({ queryKey: ["attendance"] });
      const linked = (res as { linkedLogs?: number })?.linkedLogs ?? 0;
      const replayed = (res as { replayed?: number })?.replayed ?? 0;
      toast({
        variant: "success",
        title: "Mapping saved",
        description:
          linked > 0
            ? `${linked} historical punch${linked === 1 ? "" : "es"} linked, ${replayed} applied to attendance.`
            : "Future punches from this enroll ID will sync automatically.",
      });
    },
    onError: () => toast({ variant: "error", title: "Failed to update mapping" }),
  });
}

// ── Leave ──

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      leaveType: string;
      startDate: string;
      endDate: string;
      reason?: string;
      isHalfDay?: boolean;
    }) => apiPost<{ isPaid: boolean }>("/leave", data),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["leave"] });
      void qc.invalidateQueries({ queryKey: ["leave-balances"] });
      void qc.invalidateQueries({ queryKey: ["leave-monthly-usage"] });
      toast({
        variant: res?.isPaid === false ? "warning" : "success",
        title: "Leave request submitted",
        description:
          res?.isPaid === false
            ? "Monthly paid-leave cap exhausted — logged as unpaid."
            : undefined,
      });
    },
    onError: (err: any) => toast({ variant: "error", title: "Failed to submit leave request", description: err?.message }),
  });
}

export function useUpdateLeaveStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch(`/leave/${id}/status`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leave"] });
      void qc.invalidateQueries({ queryKey: ["leave-all"] });
      void qc.invalidateQueries({ queryKey: ["leave-balances"] });
      void qc.invalidateQueries({ queryKey: ["leave-monthly-usage"] });
      toast({ variant: "success", title: "Leave status updated" });
    },
    onError: () => toast({ variant: "error", title: "Failed to update leave status" }),
  });
}

// ── HR ──

export function useUpdateEmployee(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/hr/employees/${userId}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["hr-overview"] });
      void qc.invalidateQueries({ queryKey: ["employee-profile"] });
      toast({ variant: "success", title: "Employee updated" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to update employee", description: err?.message }),
  });
}

export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  department: string;
  designation: string;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
  joinDate: string;
  salary: number;
  hourlyRate?: number;
  managerId?: string;
  roles: string[];
  sendOnboardingChecklist?: boolean;
  onboardingChecklistId?: string;
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEmployeeInput) =>
      apiPost<{ user: { id: string }; tempPassword: string }>("/hr/employees", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["hr-overview"] });
      toast({ variant: "success", title: "Employee added" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to add employee", description: err?.message }),
  });
}

// ── Finance ──

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; amount: number; category: string; spentAt: string; notes?: string }) =>
      apiPost("/finance/expenses", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["finance-summary"] });
      toast({ variant: "success", title: "Expense recorded" });
    },
    onError: () => toast({ variant: "error", title: "Failed to record expense" }),
  });
}

export function useCreateRevenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; amount: number; source: string; receivedAt: string; notes?: string }) =>
      apiPost("/finance/revenues", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["finance-summary"] });
      toast({ variant: "success", title: "Revenue recorded" });
    },
    onError: () => toast({ variant: "error", title: "Failed to record revenue" }),
  });
}

// ── Invoices ──

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { clientId: string; projectId?: string; dueDate: string; items: Array<{ description: string; duration?: string; quantity: number; price: number }>; tax?: number; leadNote?: string; referenceNumber?: string }) =>
      apiPost("/invoices", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["finance-summary"] });
      toast({ variant: "success", title: "Invoice created" });
    },
    onError: () => toast({ variant: "error", title: "Failed to create invoice" }),
  });
}

export function useUpdateInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      clientId?: string;
      projectId?: string;
      dueDate?: string;
      notes?: string;
      leadNote?: string;
      referenceNumber?: string;
      discountAmount?: number;
      items?: Array<{ description: string; duration?: string; quantity: number; price: number; taxRateId?: string }>;
    }) => apiPatch(`/invoices/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["invoice", id] });
      toast({ variant: "success", title: "Invoice updated" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update invoice", description: e.message }),
  });
}

export function useSendInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/invoices/${id}/send`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      toast({ variant: "success", title: "Invoice sent" });
    },
    onError: () => toast({ variant: "error", title: "Failed to send invoice" }),
  });
}

export function useMarkInvoicePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/invoices/${id}/pay`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["finance-summary"] });
      // Milestones may have auto-synced to PAID — refresh any project schedule view
      void qc.invalidateQueries({ queryKey: ["project-payment-milestones"] });
      // Project detail's `invoices` array is also stale now — broadly
      // invalidate so the Overview totals and project-scoped finance
      // widgets pick up the PAID flip.
      void qc.invalidateQueries({ queryKey: ["project"] });
      toast({ variant: "success", title: "Invoice marked as paid" });
    },
    onError: () => toast({ variant: "error", title: "Failed to update invoice" }),
  });
}

// ── Clients ──

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { companyName: string; contactPerson?: string; email?: string; phone?: string; address?: string; website?: string }) =>
      apiPost("/clients", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ variant: "success", title: "Client created" });
    },
    onError: () => toast({ variant: "error", title: "Failed to create client" }),
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { companyName: string; contactName?: string; email?: string; phone?: string; category?: string }) =>
      apiPost("/vendors", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendors"] });
      toast({ variant: "success", title: "Vendor created" });
    },
    onError: () => toast({ variant: "error", title: "Failed to create vendor" }),
  });
}

export function useUpdateClient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/clients/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ variant: "success", title: "Client updated" });
    },
    onError: () => toast({ variant: "error", title: "Failed to update client" }),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/clients/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ variant: "success", title: "Client deleted" });
    },
    onError: (err: any) =>
      toast({
        variant: "error",
        title: "Failed to delete client",
        description: err?.message,
      }),
  });
}

interface BulkUpdateClientsInput {
  ids: string[];
  priority?: string;
  status?: string;
  accountManagerId?: string;
  addTags?: string[];
  removeTags?: string[];
}

export function useBulkUpdateClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkUpdateClientsInput) => apiPost("/clients/bulk-update", data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["clients"] });
      vars.ids.forEach((id) => void qc.invalidateQueries({ queryKey: ["client", id] }));
      toast({ variant: "success", title: `Updated ${vars.ids.length} client(s)` });
    },
    onError: (err: any) => toast({ variant: "error", title: "Bulk update failed", description: err?.message }),
  });
}

export function useBulkDeleteClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { ids: string[] }) => apiPost("/clients/bulk-delete", data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ variant: "success", title: `Deleted ${vars.ids.length} client(s)` });
    },
    onError: (err: any) => toast({ variant: "error", title: "Bulk delete failed", description: err?.message }),
  });
}

export function useImportClientsCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { rows: Array<Record<string, string>> }) =>
      apiPost<{ createdCount: number; skippedCount: number; skipped: Array<{ row: number; reason: string }> }>(
        "/clients/import",
        data,
      ),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["clients"] });
      toast({
        variant: "success",
        title: `Imported ${data?.createdCount ?? 0} client(s)`,
        description: data?.skippedCount ? `${data.skippedCount} skipped` : undefined,
      });
    },
    onError: (err: any) => toast({ variant: "error", title: "Import failed", description: err?.message }),
  });
}

export function useInvitePortal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ user: Record<string, unknown>; tempPassword?: string; alreadyInvited?: boolean }>(
        `/clients/${id}/invite-portal`,
        {},
      ),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ["clients"] });
      void qc.invalidateQueries({ queryKey: ["client", id] });
      toast({ variant: "success", title: "Portal invite sent" });
    },
    onError: (err: any) => toast({ variant: "error", title: "Failed to invite to portal", description: err?.message }),
  });
}

export function useRevokePortal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/clients/${id}/revoke-portal`, {}),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ["clients"] });
      void qc.invalidateQueries({ queryKey: ["client", id] });
      toast({ variant: "success", title: "Portal access revoked" });
    },
    onError: (err: any) => toast({ variant: "error", title: "Failed to revoke portal", description: err?.message }),
  });
}

export function useUploadClientDocument(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiFetchForm("/documents/upload", form);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client-documents", clientId] });
      void qc.invalidateQueries({ queryKey: ["documents"] });
      toast({ variant: "success", title: "Document uploaded" });
    },
    onError: (err: any) => toast({ variant: "error", title: "Upload failed", description: err?.message }),
  });
}

// ── Leads ──
export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    // Email is optional now — phone/walk-in leads often don't have one
    // captured upfront. Backend accepts undefined or empty-string and
    // stores "" in the (non-null) column.
    mutationFn: (data: { companyName: string; contactName: string; email?: string; phone?: string; source?: string; estimatedValue?: number; notes?: string }) =>
      apiPost("/leads", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["leads"] }); toast({ variant: "success", title: "Lead created" }); },
    onError: () => toast({ variant: "error", title: "Failed to create lead" }),
  });
}
export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/leads/${id}/convert`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["leads"] }); void qc.invalidateQueries({ queryKey: ["clients"] }); toast({ variant: "success", title: "Lead converted to client" }); },
    onError: () => toast({ variant: "error", title: "Failed to convert lead" }),
  });
}

/** CSV import for leads. Frontend has already mapped CSV columns to our
 *  field names — backend just validates per-row and inserts the good ones. */
export function useImportLeadsCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { rows: Array<Record<string, string>> }) =>
      apiPost<{ createdCount: number; skippedCount: number; skipped: Array<{ row: number; reason: string }> }>(
        "/leads/import",
        data,
      ),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      toast({
        variant: data.createdCount > 0 ? "success" : "error",
        title: `Imported ${data.createdCount} lead${data.createdCount === 1 ? "" : "s"}`,
        description: data.skippedCount > 0 ? `${data.skippedCount} row${data.skippedCount === 1 ? "" : "s"} skipped — see details.` : undefined,
      });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to import leads", description: err.message }),
  });
}
export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/leads/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["leads"] }); toast({ variant: "success", title: "Lead deleted" }); },
    onError: () => toast({ variant: "error", title: "Failed to delete lead" }),
  });
}

// ── Holidays ──
export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; date: string; type?: string; description?: string }) =>
      apiPost("/holidays", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["holidays"] }); toast({ variant: "success", title: "Holiday added" }); },
    onError: () => toast({ variant: "error", title: "Failed to add holiday" }),
  });
}
export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/holidays/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["holidays"] }); toast({ variant: "success", title: "Holiday removed" }); },
    onError: () => toast({ variant: "error", title: "Failed to remove holiday" }),
  });
}

// ── Knowledge Base ──
export function useCreateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; content: string; category: string; published?: boolean }) =>
      apiPost("/knowledge", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["knowledge"] }); toast({ variant: "success", title: "Article created" }); },
    onError: () => toast({ variant: "error", title: "Failed to create article" }),
  });
}
export function useDeleteArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/knowledge/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["knowledge"] }); toast({ variant: "success", title: "Article deleted" }); },
    onError: () => toast({ variant: "error", title: "Failed to delete article" }),
  });
}

// ── Sprints ──
export function useCreateSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { projectId: string; name: string; goal?: string; startDate: string; endDate: string; status?: string }) => apiPost("/sprints", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["sprints"] }); toast({ variant: "success", title: "Sprint created" }); },
    onError: () => toast({ variant: "error", title: "Failed to create sprint" }),
  });
}

export function useUpdateSprint(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/sprints/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["sprints"] }); toast({ variant: "success", title: "Sprint updated" }); },
  });
}

export function useDeleteSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/sprints/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["sprints"] }); toast({ variant: "success", title: "Sprint deleted" }); },
  });
}

// ── Labels ──
export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color?: string; projectId?: string }) => apiPost("/labels", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["labels"] }); toast({ variant: "success", title: "Label created" }); },
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/labels/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["labels"] }); },
  });
}

// ── Task labels/dependencies ──
export function useAddTaskLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, labelId }: { taskId: string; labelId: string }) => apiPost(`/tasks/${taskId}/labels`, { labelId }),
    onSuccess: () => invalidateAllTaskQueries(qc),
  });
}

export function useRemoveTaskLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, labelId }: { taskId: string; labelId: string }) => apiDelete(`/tasks/${taskId}/labels/${labelId}`),
    onSuccess: () => invalidateAllTaskQueries(qc),
  });
}

export function useAddTaskDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, blockingId }: { taskId: string; blockingId: string }) => apiPost(`/tasks/${taskId}/dependencies`, { blockingId }),
    onSuccess: () => {
      invalidateAllTaskQueries(qc);
      toast({ variant: "success", title: "Dependency added" });
    },
  });
}

// ── Wiki ──
export function useCreateWikiPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { projectId: string; title: string; content: string; parentId?: string }) => apiPost("/wiki", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["wiki"] }); toast({ variant: "success", title: "Page created" }); },
  });
}

export function useUpdateWikiPage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/wiki/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["wiki"] }); toast({ variant: "success", title: "Page saved" }); },
  });
}

export function useDeleteWikiPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/wiki/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["wiki"] }); toast({ variant: "success", title: "Page deleted" }); },
  });
}

// ── Contacts ──
export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { clientId: string; firstName: string; lastName: string; email?: string; phone?: string; title?: string; isPrimary?: boolean; notes?: string }) =>
      apiPost("/contacts", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["contacts"] }); toast({ variant: "success", title: "Contact created" }); },
    onError: () => toast({ variant: "error", title: "Failed to create contact" }),
  });
}
export function useUpdateContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/contacts/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["contacts"] }); void qc.invalidateQueries({ queryKey: ["contact", id] }); toast({ variant: "success", title: "Contact updated" }); },
    onError: () => toast({ variant: "error", title: "Failed to update contact" }),
  });
}
export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/contacts/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["contacts"] }); toast({ variant: "success", title: "Contact deleted" }); },
    onError: () => toast({ variant: "error", title: "Failed to delete contact" }),
  });
}

// ── Deals ──
export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/deals", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["deals"] }); toast({ variant: "success", title: "Deal created" }); },
    onError: () => toast({ variant: "error", title: "Failed to create deal" }),
  });
}
export function useUpdateDeal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/deals/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["deals"] }); void qc.invalidateQueries({ queryKey: ["deal", id] }); toast({ variant: "success", title: "Deal updated" }); },
    onError: () => toast({ variant: "error", title: "Failed to update deal" }),
  });
}
export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/deals/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["deals"] }); toast({ variant: "success", title: "Deal deleted" }); },
    onError: () => toast({ variant: "error", title: "Failed to delete deal" }),
  });
}
export function useConvertLeadToDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown> & { leadId: string }) => apiPost("/deals/convert-from-lead", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deals"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ variant: "success", title: "Lead converted to deal" });
    },
    onError: () => toast({ variant: "error", title: "Failed to convert lead" }),
  });
}

// ── Activities ──
export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/activities", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["activities"] }); toast({ variant: "success", title: "Activity logged" }); },
    onError: () => toast({ variant: "error", title: "Failed to log activity" }),
  });
}
export function useUpdateActivity(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/activities/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["activities"] }); },
    onError: () => toast({ variant: "error", title: "Failed to update activity" }),
  });
}
export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/activities/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["activities"] }); toast({ variant: "success", title: "Activity deleted" }); },
    onError: () => toast({ variant: "error", title: "Failed to delete activity" }),
  });
}

// ── ACCOUNTING ──
// Items
export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/items", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["items"] }); toast({ variant: "success", title: "Item created" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create item", description: e.message }),
  });
}
export function useUpdateItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/items/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["items"] }); toast({ variant: "success", title: "Item updated" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update item", description: e.message }),
  });
}
export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/items/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["items"] }); toast({ variant: "success", title: "Item deleted" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete item", description: e.message }),
  });
}

// Tax rates
export function useCreateTaxRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/tax-rates", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["tax-rates"] }); toast({ variant: "success", title: "Tax rate created" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create tax rate", description: e.message }),
  });
}
export function useUpdateTaxRate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/tax-rates/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["tax-rates"] }); toast({ variant: "success", title: "Tax rate updated" }); },
  });
}
export function useDeleteTaxRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/tax-rates/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["tax-rates"] }); toast({ variant: "success", title: "Tax rate deleted" }); },
  });
}
export function useSeedDefaultTaxRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost("/tax-rates/seed-defaults", {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["tax-rates"] }); toast({ variant: "success", title: "Default GST rates seeded" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to seed tax rates", description: e.message }),
  });
}

// Chart Accounts
export function useCreateChartAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/chart-accounts", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chart-accounts"] });
      void qc.invalidateQueries({ queryKey: ["chart-accounts-tree"] });
      toast({ variant: "success", title: "Account created" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create account", description: e.message }),
  });
}
export function useUpdateChartAccount(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/chart-accounts/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chart-accounts"] });
      void qc.invalidateQueries({ queryKey: ["chart-accounts-tree"] });
      toast({ variant: "success", title: "Account updated" });
    },
  });
}
export function useDeleteChartAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/chart-accounts/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chart-accounts"] });
      void qc.invalidateQueries({ queryKey: ["chart-accounts-tree"] });
      toast({ variant: "success", title: "Account deleted" });
    },
  });
}
export function useSeedDefaultAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost("/chart-accounts/seed-defaults", {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chart-accounts"] });
      void qc.invalidateQueries({ queryKey: ["chart-accounts-tree"] });
      toast({ variant: "success", title: "Default accounts seeded" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to seed accounts", description: e.message }),
  });
}

// Estimates
export function useCreateEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/estimates", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["estimates"] }); toast({ variant: "success", title: "Estimate created" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create estimate", description: e.message }),
  });
}
export function useUpdateEstimate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/estimates/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["estimates"] });
      void qc.invalidateQueries({ queryKey: ["estimate", id] });
      toast({ variant: "success", title: "Estimate updated" });
    },
  });
}
export function useDeleteEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/estimates/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["estimates"] }); toast({ variant: "success", title: "Estimate deleted" }); },
  });
}
export function useConvertEstimateToInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/estimates/${id}/convert-to-invoice`, {}),
    onSuccess: (data: unknown) => {
      void qc.invalidateQueries({ queryKey: ["estimates"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      const result = data as { invoices?: { id: string }[] } | null;
      const count = result?.invoices?.length ?? 1;
      toast({
        variant: "success",
        title: count > 1 ? `Converted to ${count} invoices` : "Converted to invoice",
        description: count > 1 ? "Advance, Milestone, and Final drafts created." : undefined,
      });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Conversion failed", description: e.message }),
  });
}
export function useSendEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/estimates/${id}/send`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["estimates"] }); toast({ variant: "success", title: "Estimate sent" }); },
  });
}
export function useAcceptEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/estimates/${id}/accept`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["estimates"] }); toast({ variant: "success", title: "Estimate accepted" }); },
  });
}
export function useDeclineEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/estimates/${id}/decline`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["estimates"] }); toast({ variant: "success", title: "Estimate declined" }); },
  });
}

// Bills
export function useCreateBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/bills", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bills"] }); toast({ variant: "success", title: "Bill created" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create bill", description: e.message }),
  });
}
export function useUpdateBill(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/bills/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bills"] });
      void qc.invalidateQueries({ queryKey: ["bill", id] });
      toast({ variant: "success", title: "Bill updated" });
    },
  });
}
export function useDeleteBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/bills/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bills"] }); toast({ variant: "success", title: "Bill deleted" }); },
  });
}
export function useMarkBillOpen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/bills/${id}/open`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bills"] }); toast({ variant: "success", title: "Bill opened" }); },
  });
}
export function useVoidBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/bills/${id}/void`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bills"] }); toast({ variant: "success", title: "Bill voided" }); },
  });
}

// Payments
export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/payments", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["bills"] });
      invalidateFinanceMain(qc);
      toast({ variant: "success", title: "Payment recorded" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to record payment", description: e.message }),
  });
}
export function useUpdatePayment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/payments/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments"] });
      invalidateFinanceMain(qc);
      toast({ variant: "success", title: "Payment updated" });
    },
  });
}
export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/payments/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments"] });
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      invalidateFinanceMain(qc);
      toast({ variant: "success", title: "Payment deleted" });
    },
  });
}

// Calendar events
function invalidateCalendar(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["calendar"] });
}
export function useCreateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/calendar", data),
    onSuccess: () => { invalidateCalendar(qc); toast({ variant: "success", title: "Event created" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create event", description: e.message }),
  });
}
export function useUpdateCalendarEvent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/calendar/${id}`, data),
    onSuccess: () => { invalidateCalendar(qc); toast({ variant: "success", title: "Event updated" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update event", description: e.message }),
  });
}
export function useDeleteCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/calendar/${id}`),
    onSuccess: () => { invalidateCalendar(qc); toast({ variant: "success", title: "Event deleted" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete event", description: e.message }),
  });
}

// Recurring Expenses — templates that auto-generate Payment(type=MADE) rows.
function invalidateRecurringExpenses(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["recurring-expenses"] });
  void qc.invalidateQueries({ queryKey: ["expenses"] });
  void qc.invalidateQueries({ queryKey: ["payments"] });
  invalidateFinanceMain(qc);
}
export function useCreateRecurringExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/recurring-expenses", data),
    onSuccess: () => { invalidateRecurringExpenses(qc); toast({ variant: "success", title: "Recurring expense added" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to add", description: e.message }),
  });
}
export function useUpdateRecurringExpense(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/recurring-expenses/${id}`, data),
    onSuccess: () => { invalidateRecurringExpenses(qc); toast({ variant: "success", title: "Recurring expense updated" }); },
  });
}
export function useDeleteRecurringExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/recurring-expenses/${id}`),
    onSuccess: () => { invalidateRecurringExpenses(qc); toast({ variant: "success", title: "Recurring expense removed" }); },
  });
}
export function useGenerateDueExpenses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost("/recurring-expenses/generate-due", {}),
    onSuccess: (data: unknown) => {
      invalidateRecurringExpenses(qc);
      const count = (data as { generated?: number } | null)?.generated ?? 0;
      toast({
        variant: count > 0 ? "success" : "info",
        title: count > 0 ? `Generated ${count} expense${count === 1 ? "" : "s"}` : "Nothing due yet",
      });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to generate", description: e.message }),
  });
}

// Credit Notes
export function useCreateCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/credit-notes", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["credit-notes"] }); toast({ variant: "success", title: "Credit note created" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create credit note", description: e.message }),
  });
}
export function useUpdateCreditNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/credit-notes/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["credit-notes"] }); toast({ variant: "success", title: "Credit note updated" }); },
  });
}
export function useDeleteCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/credit-notes/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["credit-notes"] }); toast({ variant: "success", title: "Credit note deleted" }); },
  });
}
export function useApplyCreditToInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, invoiceId, amount }: { id: string; invoiceId: string; amount: number }) =>
      apiPost(`/credit-notes/${id}/apply`, { invoiceId, amount }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["credit-notes"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      toast({ variant: "success", title: "Credit applied" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to apply credit", description: e.message }),
  });
}

// Bank Accounts
export function useCreateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/bank-accounts", data),
    onSuccess: () => { invalidateFinanceMain(qc); toast({ variant: "success", title: "Bank account added" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to add bank account", description: e.message }),
  });
}
export function useUpdateBankAccount(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/bank-accounts/${id}`, data),
    onSuccess: () => { invalidateFinanceMain(qc); toast({ variant: "success", title: "Bank account updated" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update bank account", description: e.message }),
  });
}
export function useDeleteBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      apiDelete(`/bank-accounts/${id}${force ? "?force=true" : ""}`),
    onSuccess: () => {
      invalidateFinanceMain(qc);
      void qc.invalidateQueries({ queryKey: ["payments"] });
      toast({ variant: "success", title: "Bank account deleted" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete bank account", description: e.message }),
  });
}
export function useCreateBankTransaction(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost(`/bank-accounts/${accountId}/transactions`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      void qc.invalidateQueries({ queryKey: ["bank-transactions", accountId] });
      toast({ variant: "success", title: "Transaction added" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to add transaction", description: e.message }),
  });
}
export function useReconcileBankTxn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, txnId }: { accountId: string; txnId: string }) =>
      apiPatch(`/bank-accounts/${accountId}/transactions/${txnId}/reconcile`, {}),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["bank-transactions", vars.accountId] });
      toast({ variant: "success", title: "Transaction reconciled" });
    },
  });
}

// Journal Entries
export function useCreateJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/journal-entries", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["journal-entries"] }); toast({ variant: "success", title: "Journal entry created" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create journal entry", description: e.message }),
  });
}
export function useUpdateJournalEntry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/journal-entries/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["journal-entries"] }); toast({ variant: "success", title: "Journal entry updated" }); },
  });
}
export function useDeleteJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/journal-entries/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["journal-entries"] }); toast({ variant: "success", title: "Journal entry deleted" }); },
  });
}

// Recurring Invoices
export function useCreateRecurringInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/recurring-invoices", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["recurring-invoices"] }); toast({ variant: "success", title: "Recurring invoice created" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create recurring invoice", description: e.message }),
  });
}
export function useUpdateRecurringInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/recurring-invoices/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["recurring-invoices"] }); toast({ variant: "success", title: "Recurring invoice updated" }); },
  });
}
export function useDeleteRecurringInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/recurring-invoices/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["recurring-invoices"] }); toast({ variant: "success", title: "Recurring invoice deleted" }); },
  });
}
export function usePauseRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/recurring-invoices/${id}/pause`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["recurring-invoices"] }); toast({ variant: "success", title: "Paused" }); },
  });
}
export function useResumeRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/recurring-invoices/${id}/resume`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["recurring-invoices"] }); toast({ variant: "success", title: "Resumed" }); },
  });
}
export function useEndRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/recurring-invoices/${id}/end`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["recurring-invoices"] }); toast({ variant: "success", title: "Ended" }); },
  });
}
export function useRunDueRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost("/recurring-invoices/run-due", {}),
    onSuccess: (data: unknown) => {
      void qc.invalidateQueries({ queryKey: ["recurring-invoices"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      const count = (data as { generated?: number })?.generated ?? 0;
      toast({ variant: "success", title: `${count} invoice(s) generated` });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to run recurring", description: e.message }),
  });
}

// Org Settings
export function useSaveOrgSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch("/org-settings", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["org-settings"] }); toast({ variant: "success", title: "Organization settings saved" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to save settings", description: e.message }),
  });
}

// ── HRM ──
// Payroll
export function useUpsertSalaryStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/payroll/salary-structures", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["salary-structures"] }); toast({ variant: "success", title: "Salary structure saved" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to save salary structure", description: e.message }),
  });
}
export function useCreatePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { month: number; year: number }) => apiPost("/payroll/runs", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["payroll-runs"] }); toast({ variant: "success", title: "Payroll run created" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create payroll run", description: e.message }),
  });
}
export function useProcessPayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/payroll/runs/${id}/process`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      void qc.invalidateQueries({ queryKey: ["pay-slips"] });
      toast({ variant: "success", title: "Payroll processed" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to process payroll", description: e.message }),
  });
}
export function useMarkPayrollPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/payroll/runs/${id}/mark-paid`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      void qc.invalidateQueries({ queryKey: ["pay-slips"] });
      void qc.invalidateQueries({ queryKey: ["my-pay-slips"] });
      invalidateFinanceMain(qc);
      toast({ variant: "success", title: "Marked as paid" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to mark paid", description: e.message }),
  });
}

// Performance
export function useCreateReviewCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/performance-reviews/cycles", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["review-cycles"] }); toast({ variant: "success", title: "Review cycle created" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create cycle", description: e.message }),
  });
}
export function useActivateReviewCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/performance-reviews/cycles/${id}/activate`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["review-cycles"] });
      void qc.invalidateQueries({ queryKey: ["reviews"] });
      toast({ variant: "success", title: "Cycle activated" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to activate cycle", description: e.message }),
  });
}
export function useCompleteReviewCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/performance-reviews/cycles/${id}/complete`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["review-cycles"] }); toast({ variant: "success", title: "Cycle completed" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to complete cycle", description: e.message }),
  });
}
export function useSubmitSelfReview(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost(`/performance-reviews/${id}/self-review`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reviews"] });
      void qc.invalidateQueries({ queryKey: ["review", id] });
      void qc.invalidateQueries({ queryKey: ["my-reviews-self"] });
      toast({ variant: "success", title: "Self-review submitted" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to submit self-review", description: e.message }),
  });
}
export function useSubmitManagerReview(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost(`/performance-reviews/${id}/manager-review`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reviews"] });
      void qc.invalidateQueries({ queryKey: ["review", id] });
      void qc.invalidateQueries({ queryKey: ["my-reviews-to-review"] });
      toast({ variant: "success", title: "Manager review submitted" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to submit manager review", description: e.message }),
  });
}
export function useSubmit360Feedback(reviewId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Endpoint lives at `/performance-reviews/reviews/:id/feedback360` —
    // the controller mounts review actions under `performance-reviews/
    // reviews/` and the feedback verb is `feedback360`. The old path
    // `/performance-reviews/:id/feedback` was a 404 in disguise: it
    // bounced off the route table before the DTO ever ran.
    mutationFn: (data: Record<string, unknown>) =>
      apiPost(`/performance-reviews/reviews/${reviewId}/feedback360`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["feedback-360", reviewId] });
      toast({ variant: "success", title: "Feedback submitted" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to submit feedback", description: e.message }),
  });
}

// Founder deferred-compensation — sets what the founder actually drew this
// month on a given slip. Invalidates the employee-profile cache so the
// payroll tab + Deferred Comp card refresh with the new totals.
export function useSetDrawnAmount(slipId: string, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (drawnAmount: number) =>
      apiPatch(`/payroll/slips/${slipId}/drawn`, { drawnAmount }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["employee-profile", userId] });
      void qc.invalidateQueries({ queryKey: ["pay-slips"] });
      void qc.invalidateQueries({ queryKey: ["founder-summary"] });
      invalidateFinanceMain(qc);
      toast({ variant: "success", title: "Drawn amount updated" });
    },
    onError: (e: Error) =>
      toast({ variant: "error", title: "Failed to update drawn amount", description: e.message }),
  });
}

// Assets
export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/assets", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["assets"] }); toast({ variant: "success", title: "Asset created" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create asset", description: e.message }),
  });
}
export function useUpdateAsset(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/assets/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["assets"] }); toast({ variant: "success", title: "Asset updated" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update asset", description: e.message }),
  });
}
export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/assets/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["assets"] }); toast({ variant: "success", title: "Asset deleted" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete asset", description: e.message }),
  });
}
export function useAssignAsset(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { userId: string }) => apiPost(`/assets/${id}/assign`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["assets"] }); toast({ variant: "success", title: "Asset assigned" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to assign asset", description: e.message }),
  });
}
export function useUnassignAsset(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/assets/${id}/unassign`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["assets"] }); toast({ variant: "success", title: "Asset unassigned" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to unassign asset", description: e.message }),
  });
}

// Announcements
export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/announcements", data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["announcements"] }); toast({ variant: "success", title: "Announcement posted" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to post announcement", description: e.message }),
  });
}
export function useUpdateAnnouncement(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/announcements/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["announcements"] }); toast({ variant: "success", title: "Announcement updated" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update announcement", description: e.message }),
  });
}
export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/announcements/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["announcements"] }); toast({ variant: "success", title: "Announcement deleted" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete announcement", description: e.message }),
  });
}

// Timesheets
export function useCreateTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { weekStart: string }) => apiPost("/timesheets", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["timesheets"] });
      void qc.invalidateQueries({ queryKey: ["my-timesheets"] });
      toast({ variant: "success", title: "Timesheet created" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create timesheet", description: e.message }),
  });
}
export function useSubmitTimesheet(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/timesheets/${id}/submit`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["timesheets"] });
      void qc.invalidateQueries({ queryKey: ["my-timesheets"] });
      void qc.invalidateQueries({ queryKey: ["timesheet", id] });
      toast({ variant: "success", title: "Timesheet submitted" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to submit timesheet", description: e.message }),
  });
}
export function useApproveTimesheet(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/timesheets/${id}/approve`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["timesheets"] });
      void qc.invalidateQueries({ queryKey: ["timesheet", id] });
      toast({ variant: "success", title: "Timesheet approved" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to approve timesheet", description: e.message }),
  });
}
export function useRejectTimesheet(id: string) {
  const qc = useQueryClient();
  return useMutation({
    // API DTO is RejectTimesheetDto({ comments: string }) — note plural.
    // Caller passes a non-empty comments string; the API requires it.
    mutationFn: (data: { comments: string }) => apiPost(`/timesheets/${id}/reject`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["timesheets"] });
      void qc.invalidateQueries({ queryKey: ["timesheet", id] });
      toast({ variant: "success", title: "Timesheet rejected" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to reject timesheet", description: e.message }),
  });
}

// ── ROLE MANAGEMENT ──
export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/users/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      toast({ variant: "success", title: "User updated" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update user", description: e.message }),
  });
}

export function useSetUserRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: string[] }) => apiPost(`/users/${id}/roles`, { roles }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["roles-matrix"] });
      toast({ variant: "success", title: "Roles updated" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update roles", description: e.message }),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      apiPost(`/users/${id}/reset-password`, { newPassword }),
    onSuccess: () => {
      toast({ variant: "success", title: "Password reset" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to reset password", description: e.message }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/users/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      toast({ variant: "success", title: "User deleted" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete user", description: e.message }),
  });
}

export function useImpersonateUser() {
  return useMutation({
    mutationFn: (id: string) => apiPost<LoginResponse>(`/users/${id}/impersonate`, {}),
    onError: (e: Error) => toast({ variant: "error", title: "Impersonation failed", description: e.message }),
  });
}

export function useSeedDefaultPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost("/roles/permissions/seed-defaults", {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["roles-matrix"] });
      void qc.invalidateQueries({ queryKey: ["permissions-all"] });
      toast({ variant: "success", title: "Default permissions seeded" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to seed permissions", description: e.message }),
  });
}

export function useSetRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, permissions }: { code: string; permissions: Array<{ resource: string; action: string; granted: boolean }> }) =>
      apiFetch(`/roles/${code}/permissions`, { method: "PUT", body: JSON.stringify({ permissions }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["roles-matrix"] });
      toast({ variant: "success", title: "Permissions updated" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update permissions", description: e.message }),
  });
}

// ── TASK TIMER ──
export function useStartTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { taskId?: string; projectId?: string; notes?: string }) =>
      apiPost("/time-entries/start", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["active-timer"] });
      void qc.invalidateQueries({ queryKey: ["time-entries"] });
      void qc.invalidateQueries({ queryKey: ["task-time-summary"] });
      toast({ variant: "success", title: "Timer started" });
    },
    onError: (e: any) => toast({ variant: "error", title: "Could not start timer", description: e?.message }),
  });
}
export function useStopTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data?: { notes?: string }) => apiPost("/time-entries/stop", data ?? {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["active-timer"] });
      void qc.invalidateQueries({ queryKey: ["time-entries"] });
      void qc.invalidateQueries({ queryKey: ["task-time-summary"] });
      toast({ variant: "success", title: "Timer stopped" });
    },
    onError: (e: any) => toast({ variant: "error", title: "Could not stop timer", description: e?.message }),
  });
}
export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/time-entries/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["time-entries"] });
      void qc.invalidateQueries({ queryKey: ["task-time-summary"] });
      void qc.invalidateQueries({ queryKey: ["active-timer"] });
      toast({ variant: "success", title: "Time entry deleted" });
    },
    onError: (e: any) => toast({ variant: "error", title: "Could not delete entry", description: e?.message }),
  });
}

// ── CRM Polish: Merge / Saved Views / Custom Fields ──

export function useMergeClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { primaryId: string; duplicateId: string }) =>
      apiPost("/clients/merge", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ variant: "success", title: "Merged successfully" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to merge", description: e.message }),
  });
}

export function useSaveView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { module: string; name: string; filters: Record<string, unknown>; isDefault?: boolean }) =>
      apiPost("/saved-views", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["saved-views"] });
      toast({ variant: "success", title: "View saved" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to save view", description: e.message }),
  });
}

export function useUpdateSavedView(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<{ name: string; filters: Record<string, unknown>; isDefault: boolean }>) =>
      apiPatch(`/saved-views/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["saved-views"] });
      toast({ variant: "success", title: "View updated" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update view", description: e.message }),
  });
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/saved-views/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["saved-views"] });
      toast({ variant: "success", title: "View deleted" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete view", description: e.message }),
  });
}

export function useCreateCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      entity: string;
      key: string;
      label: string;
      type: string;
      options?: string[];
      required?: boolean;
      sortOrder?: number;
    }) => apiPost("/custom-fields", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["custom-fields"] });
      toast({ variant: "success", title: "Custom field created" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create field", description: e.message }),
  });
}

export function useUpdateCustomField(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<{ label: string; type: string; options: string[]; required: boolean; sortOrder: number }>) =>
      apiPatch(`/custom-fields/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["custom-fields"] });
      toast({ variant: "success", title: "Custom field updated" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update field", description: e.message }),
  });
}

export function useDeleteCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/custom-fields/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["custom-fields"] });
      toast({ variant: "success", title: "Custom field deleted" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete field", description: e.message }),
  });
}

// ── TASK — clone / comment edit-delete / bulk ──
export function useCloneTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiPost(`/tasks/${taskId}/clone`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["project-tasks"] });
      toast({ variant: "success", title: "Task cloned" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to clone task", description: e.message }),
  });
}

export function useUpdateTaskComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      apiPatch(`/tasks/comments/${commentId}`, { content }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["task"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to edit comment", description: e.message }),
  });
}

export function useDeleteTaskComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => apiDelete(`/tasks/comments/${commentId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["task"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete comment", description: e.message }),
  });
}

export function useBulkUpdateTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      ids: string[];
      status?: string;
      priority?: string;
      assignedToId?: string | null;
      sprintId?: string | null;
    }) => apiPost("/tasks/bulk-update", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["project-tasks"] });
      toast({ variant: "success", title: "Tasks updated" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Bulk update failed", description: e.message }),
  });
}

export function useBulkDeleteTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => apiPost("/tasks/bulk-delete", { ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["project-tasks"] });
      toast({ variant: "success", title: "Tasks deleted" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Bulk delete failed", description: e.message }),
  });
}

// ── ADVANCED PM ──

// Recurring tasks
export function useCreateRecurringTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/recurring-tasks", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring-tasks"] });
      toast({ variant: "success", title: "Recurring task created" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to create recurring task", description: err?.message }),
  });
}
export function useUpdateRecurringTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/recurring-tasks/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring-tasks"] });
      toast({ variant: "success", title: "Recurring task updated" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to update recurring task", description: err?.message }),
  });
}
export function useDeleteRecurringTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/recurring-tasks/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring-tasks"] });
      toast({ variant: "success", title: "Recurring task deleted" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to delete", description: err?.message }),
  });
}
export function usePauseRecurringTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/recurring-tasks/${id}/pause`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring-tasks"] });
      toast({ variant: "success", title: "Paused" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to pause", description: err?.message }),
  });
}
export function useResumeRecurringTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/recurring-tasks/${id}/resume`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring-tasks"] });
      toast({ variant: "success", title: "Resumed" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to resume", description: err?.message }),
  });
}
export function useEndRecurringTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/recurring-tasks/${id}/end`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring-tasks"] });
      toast({ variant: "success", title: "Ended" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to end", description: err?.message }),
  });
}
export function useRunDueRecurringTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ created?: number }>("/recurring-tasks/run-due", {}),
    onSuccess: (res: any) => {
      void qc.invalidateQueries({ queryKey: ["recurring-tasks"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["project-tasks"] });
      toast({ variant: "success", title: "Recurring tasks run", description: res?.created != null ? `Created ${res.created} tasks` : undefined });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to run due tasks", description: err?.message }),
  });
}

// Project statuses
export function useCreateProjectStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/project-statuses", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project-statuses"] });
      toast({ variant: "success", title: "Status created" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to create status", description: err?.message }),
  });
}
export function useUpdateProjectStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/project-statuses/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project-statuses"] });
      toast({ variant: "success", title: "Status updated" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to update status", description: err?.message }),
  });
}
export function useDeleteProjectStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/project-statuses/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project-statuses"] });
      toast({ variant: "success", title: "Status deleted" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to delete status", description: err?.message }),
  });
}

// Sprint snapshot
export function useCaptureSprintSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sprintId: string) => apiPost(`/sprints/${sprintId}/snapshot`, {}),
    onSuccess: (_res, sprintId) => {
      void qc.invalidateQueries({ queryKey: ["burndown", sprintId] });
      toast({ variant: "success", title: "Snapshot captured" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to capture snapshot", description: err?.message }),
  });
}

// Time entry approvals
export function useApproveTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/time-entries/${id}/approve`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["time-approvals"] });
      void qc.invalidateQueries({ queryKey: ["time-entries"] });
      toast({ variant: "success", title: "Time entry approved" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to approve", description: err?.message }),
  });
}
export function useRejectTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiPost(`/time-entries/${id}/reject`, { reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["time-approvals"] });
      void qc.invalidateQueries({ queryKey: ["time-entries"] });
      toast({ variant: "success", title: "Time entry rejected" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to reject", description: err?.message }),
  });
}
export function useBulkApproveTimeEntries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => apiPost("/time-entries/bulk-approve", { ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["time-approvals"] });
      void qc.invalidateQueries({ queryKey: ["time-entries"] });
      toast({ variant: "success", title: "Entries approved" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Bulk approve failed", description: err?.message }),
  });
}
export function useBulkRejectTimeEntries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason?: string }) =>
      apiPost("/time-entries/bulk-reject", { ids, reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["time-approvals"] });
      void qc.invalidateQueries({ queryKey: ["time-entries"] });
      toast({ variant: "success", title: "Entries rejected" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Bulk reject failed", description: err?.message }),
  });
}

// ── ADVANCED PM 2 ──
export function useRunTaskReminders() {
  return useMutation({
    mutationFn: () => apiPost("/tasks/run-reminders", {}),
    onSuccess: () => toast({ variant: "success", title: "Reminders dispatched" }),
    onError: (err: Error) => toast({ variant: "error", title: "Failed to run reminders", description: err?.message }),
  });
}

export function useWatchTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiPost(`/tasks/${taskId}/watch`, {}),
    onSuccess: (_res, taskId) => {
      void qc.invalidateQueries({ queryKey: ["task-watchers", taskId] });
      void qc.invalidateQueries({ queryKey: ["task", taskId] });
      toast({ variant: "success", title: "Watching task" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to watch", description: err?.message }),
  });
}

export function useUnwatchTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiDelete(`/tasks/${taskId}/watch`),
    onSuccess: (_res, taskId) => {
      void qc.invalidateQueries({ queryKey: ["task-watchers", taskId] });
      void qc.invalidateQueries({ queryKey: ["task", taskId] });
      toast({ variant: "success", title: "Unwatched task" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to unwatch", description: err?.message }),
  });
}

interface CloneProjectOptions {
  name: string;
  cloneMembers?: boolean;
  cloneStatuses?: boolean;
  cloneLabels?: boolean;
  cloneRecurring?: boolean;
  cloneMilestones?: boolean;
}

export function useCloneProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, options }: { id: string; options: CloneProjectOptions }) =>
      apiPost<{ id: string }>(`/projects/${id}/clone`, options),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ variant: "success", title: "Project cloned" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to clone project", description: err?.message }),
  });
}

export function useSaveRetrospective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sprintId, data }: { sprintId: string; data: Record<string, unknown> }) =>
      apiFetch(`/sprints/${sprintId}/retrospective`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: (_res, vars) => {
      void qc.invalidateQueries({ queryKey: ["retro", vars.sprintId] });
      toast({ variant: "success", title: "Retrospective saved" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to save retrospective", description: err?.message }),
  });
}

export function useDeleteRetrospective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sprintId: string) => apiDelete(`/sprints/${sprintId}/retrospective`),
    onSuccess: (_res, sprintId) => {
      void qc.invalidateQueries({ queryKey: ["retro", sprintId] });
      toast({ variant: "success", title: "Retrospective deleted" });
    },
    onError: (err: Error) => toast({ variant: "error", title: "Failed to delete retrospective", description: err?.message }),
  });
}

// ── CHAT ──
function invalidateChat(qc: ReturnType<typeof useQueryClient>, channelId?: string) {
  void qc.invalidateQueries({ queryKey: ["channels"] });
  if (channelId) {
    void qc.invalidateQueries({ queryKey: ["messages", channelId] });
    void qc.invalidateQueries({ queryKey: ["channel", channelId] });
  }
}

export function useSendMessage(channelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { content: string }) =>
      apiPost(`/chat/channels/${channelId}/messages`, data),
    onSuccess: () => {
      invalidateChat(qc, channelId);
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to send", description: err?.message }),
  });
}

export function useEditMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content, channelId }: { id: string; content: string; channelId?: string }) =>
      apiPatch(`/chat/messages/${id}`, { content }).then((r) => {
        return { ...(r as object), channelId };
      }),
    onSuccess: (data: any) => {
      invalidateChat(qc, data?.channelId);
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to edit message", description: err?.message }),
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, channelId }: { id: string; channelId?: string }) =>
      apiDelete(`/chat/messages/${id}`).then((r) => ({ ...(r as object), channelId })),
    onSuccess: (data: any) => {
      invalidateChat(qc, data?.channelId);
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to delete message", description: err?.message }),
  });
}

export function useMarkChannelRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) =>
      apiPost(`/chat/channels/${channelId}/read`, {}).then(() => channelId),
    onSuccess: (channelId: string) => {
      invalidateChat(qc, channelId);
    },
    // Swallow errors silently — mark-read is background noise.
    onError: () => {},
  });
}

export function useAddReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, emoji, channelId }: { id: string; emoji: string; channelId?: string }) =>
      apiPost(`/chat/messages/${id}/reactions`, { emoji }).then((r) => ({ ...(r as object), channelId })),
    onSuccess: (data: any) => {
      invalidateChat(qc, data?.channelId);
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to react", description: err?.message }),
  });
}

export function useRemoveReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, emoji, channelId }: { id: string; emoji: string; channelId?: string }) =>
      apiDelete(`/chat/messages/${id}/reactions/${encodeURIComponent(emoji)}`).then((r) => ({
        ...(r as object),
        channelId,
      })),
    onSuccess: (data: any) => {
      invalidateChat(qc, data?.channelId);
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to remove reaction", description: err?.message }),
  });
}

export function useCreateGlobalChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) => apiPost("/chat/channels", data),
    onSuccess: () => {
      invalidateChat(qc);
      toast({ variant: "success", title: "Channel created" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to create channel", description: err?.message }),
  });
}

export function useCreateDirectChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { userId: string }) =>
      apiPost<{ id: string }>("/chat/channels/direct", data),
    onSuccess: (res: any) => {
      invalidateChat(qc);
      return res;
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to open direct message", description: err?.message }),
  });
}

export function useCreateGroupChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; memberIds: string[]; description?: string }) =>
      apiPost<{ id: string }>("/chat/channels/group", data),
    onSuccess: () => {
      invalidateChat(qc);
      toast({ variant: "success", title: "Group created" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to create group", description: err?.message }),
  });
}

export function useCreateProjectChannel(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      apiPost<{ id: string }>(`/chat/channels/project/${projectId}`, data),
    onSuccess: () => {
      invalidateChat(qc);
      toast({ variant: "success", title: "Channel created" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to create channel", description: err?.message }),
  });
}

// ── Notifications ──
function invalidateNotifications(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["notifications"] });
  void qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/notifications/${id}/read`, {}),
    onSuccess: () => invalidateNotifications(qc),
    onError: () => {
      // Silent — toast would be noisy for notification reads.
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/notifications/read-all`, {}),
    onSuccess: () => invalidateNotifications(qc),
    onError: () => {
      // Silent — toast would be noisy for notification reads.
    },
  });
}

// ── Project Expenses ──

function invalidateBudget(qc: ReturnType<typeof useQueryClient>, projectId?: string) {
  void qc.invalidateQueries({ queryKey: ["project-expenses"] });
  void qc.invalidateQueries({ queryKey: ["project-expense-summary"] });
  void qc.invalidateQueries({ queryKey: ["project-burn-rate"] });
  void qc.invalidateQueries({ queryKey: ["project-pnl"] });
  if (projectId) {
    void qc.invalidateQueries({ queryKey: ["project", projectId] });
  }
}

interface CreateProjectExpenseData {
  projectId: string;
  description: string;
  category?: string;
  amount: number;
  incurredAt: string;
  recurring?: boolean;
  recurrenceMonths?: number;
  notes?: string;
  vendorId?: string;
}

export function useCreateProjectExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectExpenseData) => apiPost("/project-expenses", data),
    onSuccess: (_res, vars) => {
      invalidateBudget(qc, vars.projectId);
      toast({ variant: "success", title: "Expense logged" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to log expense", description: err?.message }),
  });
}

export function useUpdateProjectExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateProjectExpenseData> }) =>
      apiPatch(`/project-expenses/${id}`, data),
    onSuccess: (_res, vars) => {
      invalidateBudget(qc, vars.data?.projectId);
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to update expense", description: err?.message }),
  });
}

export function useDeleteProjectExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; projectId?: string }) => apiDelete(`/project-expenses/${id}`),
    onSuccess: (_res, vars) => {
      invalidateBudget(qc, vars.projectId);
      toast({ variant: "success", title: "Expense removed" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to remove expense", description: err?.message }),
  });
}

// ── Payment milestones (50/30/20-style invoice schedule per project) ──

function invalidateMilestones(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  void qc.invalidateQueries({ queryKey: ["project-payment-milestones", projectId] });
  void qc.invalidateQueries({ queryKey: ["project", projectId] });
  void qc.invalidateQueries({ queryKey: ["invoices"] });
}

export function useCreatePaymentMilestone(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { label: string; percentage: number; isExtra?: boolean; amount?: number; sortOrder?: number; dueDate?: string; notes?: string }) =>
      apiPost(`/projects/${projectId}/payment-milestones`, data),
    onSuccess: (_data, vars) => {
      invalidateMilestones(qc, projectId);
      toast({ variant: "success", title: vars.isExtra ? "Extra added" : "Milestone added" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to add", description: e.message }),
  });
}

export function useUpdatePaymentMilestone(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; label?: string; percentage?: number; amount?: number | null; sortOrder?: number; dueDate?: string | null; notes?: string | null; status?: string }) =>
      apiPatch(`/projects/${projectId}/payment-milestones/${id}`, data),
    onSuccess: () => { invalidateMilestones(qc, projectId); toast({ variant: "success", title: "Updated" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update", description: e.message }),
  });
}

export function useDeletePaymentMilestone(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/projects/${projectId}/payment-milestones/${id}`),
    onSuccess: () => { invalidateMilestones(qc, projectId); toast({ variant: "success", title: "Milestone removed" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to remove milestone", description: e.message }),
  });
}

export function useGenerateMilestoneInvoice(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dueDate }: { id: string; dueDate?: string }) =>
      apiPost(`/projects/${projectId}/payment-milestones/${id}/generate-invoice`, dueDate ? { dueDate } : {}),
    onSuccess: () => { invalidateMilestones(qc, projectId); toast({ variant: "success", title: "Invoice generated" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to generate invoice", description: e.message }),
  });
}

/**
 * Void the milestone's stale invoice and create a fresh one at the
 * current expected amount. Used when the milestone percentage or
 * project budget changed after the invoice was issued and the row
 * now flags as "Issued amount differs".
 */
export function useReissueMilestoneInvoice(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost(`/projects/${projectId}/payment-milestones/${id}/reissue-invoice`, {}),
    onSuccess: () => {
      invalidateMilestones(qc, projectId);
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      toast({ variant: "success", title: "Invoice reissued" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to reissue", description: e.message }),
  });
}

/**
 * Recompute the milestone's percentage so it matches the issued
 * invoice amount. Used to clean up PAID milestones with stale drift
 * (can't void a paid invoice — but can make the milestone match it).
 */
export function useSnapMilestoneToInvoice(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost(`/projects/${projectId}/payment-milestones/${id}/snap-to-invoice`, {}),
    onSuccess: () => {
      invalidateMilestones(qc, projectId);
      toast({ variant: "success", title: "Milestone synced to invoice amount" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to sync", description: e.message }),
  });
}

// ── Proposals — create + status workflow ──

function invalidateProposals(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["proposals"] });
  void qc.invalidateQueries({ queryKey: ["proposal"] });
}

export function useCreateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPost("/proposals", data),
    onSuccess: () => { invalidateProposals(qc); toast({ variant: "success", title: "Proposal created" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create proposal", description: e.message }),
  });
}

/** Shape returned by POST /ai/generate-proposal. Matches the form fields 1:1.
 *
 *  Per-phase fields:
 *   • content   — pre-composed bullet list (used as-is in the form + printed proposal).
 *   • summary, deliverables[], acceptance, traceFrom — structured originals
 *     from the model; surfaced as review chips so the salesperson can see what
 *     the AI pulled out of the brief and edit per-bullet rather than fixing prose.
 */
export interface GeneratedProposalPayload {
  projectName: string;
  description: string;
  projectUnderstanding: string;
  pricing: string;
  paymentTermsText: string;
  totalHours?: number;
  hourlyRate?: number;
  keyOutcomes?: string[];
  blocks: Array<{
    heading: string;
    content: string;
    summary?: string;
    deliverables?: string[];
    acceptance?: string;
    traceFrom?: string;
    durationWeeks: number;
    hoursEstimate?: number;
  }>;
  deliverables: Array<{
    kind: "INCLUDED" | "EXCLUDED";
    title: string;
    description: string;
    amount?: number;
  }>;
}

/** Calls the AI service to generate a full proposal payload from a free-text requirement. */
export function useGenerateProposalAi() {
  return useMutation({
    mutationFn: (data: {
      requirement: string;
      projectName?: string;
      clientName?: string;
      durationWeeks?: number;
      hourlyRate?: number;
    }): Promise<GeneratedProposalPayload> =>
      apiPost("/ai/generate-proposal", data) as Promise<GeneratedProposalPayload>,
    onError: (e: Error) =>
      toast({ variant: "error", title: "AI generation failed", description: e.message }),
  });
}

export function useUpdateProposal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiPatch(`/proposals/${id}`, data),
    onSuccess: () => { invalidateProposals(qc); toast({ variant: "success", title: "Proposal updated" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update proposal", description: e.message }),
  });
}

export function useSendProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/proposals/${id}/send`, {}),
    onSuccess: () => { invalidateProposals(qc); toast({ variant: "success", title: "Proposal sent" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to send proposal", description: e.message }),
  });
}

export function useAcceptProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/proposals/${id}/accept`, {}),
    onSuccess: () => { invalidateProposals(qc); toast({ variant: "success", title: "Proposal accepted" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to accept proposal", description: e.message }),
  });
}

export function useRejectProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/proposals/${id}/reject`, {}),
    onSuccess: () => { invalidateProposals(qc); toast({ variant: "success", title: "Proposal rejected" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to reject proposal", description: e.message }),
  });
}

export function useExpireProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/proposals/${id}/expire`, {}),
    onSuccess: () => { invalidateProposals(qc); toast({ variant: "success", title: "Proposal expired" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to expire proposal", description: e.message }),
  });
}

/** Clears the rejection and flips status back to SENT so the client
 *  sees the proposal as pending again. Available to PM-and-above. */
export function useResendProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/proposals/${id}/resend`, {}),
    onSuccess: () => { invalidateProposals(qc); toast({ variant: "success", title: "Proposal resent to client" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to resend", description: e.message }),
  });
}

/** Admin override — force-accept from any status without making the
 *  client click through the portal. Used when approval lands by phone
 *  or email and we want the project to proceed. */
export function useForceAcceptProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/proposals/${id}/force-accept`, {}),
    onSuccess: () => { invalidateProposals(qc); toast({ variant: "success", title: "Proposal accepted" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to force-accept", description: e.message }),
  });
}

export function useDeleteProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/proposals/${id}`),
    onSuccess: () => { invalidateProposals(qc); toast({ variant: "success", title: "Proposal deleted" }); },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete proposal", description: e.message }),
  });
}

// Every cash-affecting mutation has to bust this so /finance/main and
// /journal-entries reflect new state without a hard reload. Anything that
// creates / updates / deletes a Payment, BankAccount, PaySlip,
// FounderLedgerEntry, BankTransaction, or JournalEntry needs to call this.
function invalidateFinanceMain(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["finance-main-account"] });
  void qc.invalidateQueries({ queryKey: ["journal-entries"] });
  void qc.invalidateQueries({ queryKey: ["bank-transactions"] });
  void qc.invalidateQueries({ queryKey: ["bank-accounts"] });
  // Top-of-app dashboard reads Revenue/Expenses from the GL too — keep
  // the metric cards and the profit-loss panel in sync with every cash
  // event so the numbers visibly update right after the user records one.
  void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
  void qc.invalidateQueries({ queryKey: ["report-pl"] });
}

// ── Founders / capital account / equity ──
function invalidateFounderBundle(qc: ReturnType<typeof useQueryClient>, userId?: string) {
  void qc.invalidateQueries({ queryKey: ["founder-dashboard"] });
  void qc.invalidateQueries({ queryKey: ["cap-table"] });
  void qc.invalidateQueries({ queryKey: ["equity-grants"] });
  // Founder ledger entries post to the GL, so the finance dashboard has
  // to refresh too. Cheap to over-invalidate.
  void qc.invalidateQueries({ queryKey: ["finance-main-account"] });
  void qc.invalidateQueries({ queryKey: ["journal-entries"] });
  if (userId) {
    void qc.invalidateQueries({ queryKey: ["founder-capital", userId] });
    void qc.invalidateQueries({ queryKey: ["employee-profile", userId] });
  } else {
    void qc.invalidateQueries({ queryKey: ["founder-capital"] });
  }
}

// Mark an arbitrary employee as / not-a co-founder. Used by the inline
// "Add co-founder" picker on the Founders page so HR doesn't have to
// navigate to every employee profile to flip the flag.
export function useMarkFounder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, isFounder }: { userId: string; isFounder: boolean }) =>
      apiPatch(`/hr/employees/${userId}`, { isFounder }),
    onSuccess: (_data, vars) => {
      invalidateFounderBundle(qc, vars.userId);
      void qc.invalidateQueries({ queryKey: ["hr-directory"] });
      toast({
        variant: "success",
        title: vars.isFounder ? "Marked as co-founder" : "Removed founder flag",
      });
    },
    onError: (e: Error) =>
      toast({ variant: "error", title: "Failed to update founder status", description: e.message }),
  });
}

export function useAddFounderLedgerEntry(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      date: string;
      direction: "CREDIT" | "DEBIT";
      kind: "LOAN_IN" | "EXPENSE_REIMBURSEMENT" | "DISTRIBUTION" | "REPAYMENT" | "OTHER";
      amount: number;
      description?: string;
      reference?: string;
    }) => apiPost(`/founders/${userId}/capital/entries`, data),
    onSuccess: () => {
      invalidateFounderBundle(qc, userId);
      toast({ variant: "success", title: "Capital entry added" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to add entry", description: e.message }),
  });
}

export function useDeleteFounderLedgerEntry(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => apiDelete(`/founders/${userId}/capital/entries/${entryId}`),
    onSuccess: () => {
      invalidateFounderBundle(qc, userId);
      toast({ variant: "success", title: "Capital entry deleted" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete entry", description: e.message }),
  });
}

export function useCreateEquityGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      // Internal: pass employeeId. External: pass holderName.
      employeeId?: string;
      holderName?: string;
      holderEmail?: string;
      organization?: string;
      investmentAmount?: number;
      investmentDate?: string;
      type?: "FOUNDER_SHARES" | "ESOP" | "INVESTOR" | "ADVISOR" | "OTHER";
      shares: number;
      grantDate: string;
      vestingMonths?: number;
      cliffMonths?: number;
      notes?: string;
    }) => apiPost("/founders/grants", data),
    onSuccess: () => {
      invalidateFounderBundle(qc);
      toast({ variant: "success", title: "Equity grant created" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to create grant", description: e.message }),
  });
}

export function useUpdateEquityGrant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type?: "FOUNDER_SHARES" | "ESOP" | "INVESTOR" | "ADVISOR" | "OTHER";
      shares?: number;
      grantDate?: string;
      vestingMonths?: number;
      cliffMonths?: number;
      status?: "ACTIVE" | "CANCELLED" | "EXERCISED";
      notes?: string;
      holderName?: string;
      holderEmail?: string;
      organization?: string;
      investmentAmount?: number;
      investmentDate?: string;
    }) => apiPatch(`/founders/grants/${id}`, data),
    onSuccess: () => {
      invalidateFounderBundle(qc);
      toast({ variant: "success", title: "Grant updated" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update grant", description: e.message }),
  });
}

export function useDeleteEquityGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/founders/grants/${id}`),
    onSuccess: () => {
      invalidateFounderBundle(qc);
      toast({ variant: "success", title: "Grant deleted" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete grant", description: e.message }),
  });
}

export function useCreateCompanyValuation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { totalShares: number; sharePrice: number; asOf: string; notes?: string }) =>
      apiPost("/founders/valuations", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["company-valuations"] });
      invalidateFounderBundle(qc);
      toast({ variant: "success", title: "Valuation recorded" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to record valuation", description: e.message }),
  });
}

export function useUpdateCompanyValuation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { totalShares?: number; sharePrice?: number; asOf?: string; notes?: string }) =>
      apiPatch(`/founders/valuations/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["company-valuations"] });
      invalidateFounderBundle(qc);
      toast({ variant: "success", title: "Valuation updated" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to update valuation", description: e.message }),
  });
}

// ── Finance auto-post ──
export function useSetPrimaryBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bankAccountId: string) =>
      apiPost(`/finance/banks/${bankAccountId}/make-primary`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["finance-main-account"] });
      toast({ variant: "success", title: "Primary bank updated" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to set primary bank", description: e.message }),
  });
}

export function useFinanceBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<{ paymentsPosted: number; paySlipsPosted: number; ledgerPosted: number }>(
        "/finance/backfill",
        {},
      ),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["finance-main-account"] });
      void qc.invalidateQueries({ queryKey: ["journal-entries"] });
      toast({
        variant: "success",
        title: "Backfill complete",
        description: `${data.paymentsPosted} payments, ${data.paySlipsPosted} payslips, ${data.ledgerPosted} founder entries posted.`,
      });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Backfill failed", description: e.message }),
  });
}

export function useDeleteCompanyValuation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/founders/valuations/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["company-valuations"] });
      invalidateFounderBundle(qc);
      toast({ variant: "success", title: "Valuation deleted" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to delete valuation", description: e.message }),
  });
}

// ── Credential vault ──

import type {
  CredentialAccessRole,
  CredentialRow,
  CredentialSecret,
  CredentialType,
} from "./hooks";

interface CredentialPayload {
  name: string;
  type: CredentialType;
  description?: string;
  username?: string;
  url?: string;
  secret: CredentialSecret;
  metadata?: Record<string, unknown>;
  tags?: string[];
  folderId?: string | null;
  expiresAt?: string | null;
  rotationIntervalDays?: number | null;
  markRotated?: boolean;
  requiresReason?: boolean;
  highSecurity?: boolean;
}

function invalidateCredentials(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["credentials"] });
  void qc.invalidateQueries({ queryKey: ["credential-folders"] });
}

export function useCreateCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CredentialPayload) => apiPost<CredentialRow>("/credentials", data),
    onSuccess: () => {
      invalidateCredentials(qc);
      toast({ variant: "success", title: "Credential saved" });
    },
    onError: (e: Error) =>
      toast({ variant: "error", title: "Could not save credential", description: e.message }),
  });
}

export function useUpdateCredential(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CredentialPayload>) =>
      apiPatch<CredentialRow>(`/credentials/${id}`, data),
    onSuccess: () => {
      invalidateCredentials(qc);
      void qc.invalidateQueries({ queryKey: ["credential-audit", id] });
      toast({ variant: "success", title: "Credential updated" });
    },
    onError: (e: Error) =>
      toast({ variant: "error", title: "Could not update credential", description: e.message }),
  });
}

export function useDeleteCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/credentials/${id}`),
    onSuccess: () => {
      invalidateCredentials(qc);
      toast({ variant: "success", title: "Credential deleted" });
    },
    onError: (e: Error) =>
      toast({ variant: "error", title: "Could not delete credential", description: e.message }),
  });
}

/**
 * Revealing a credential is itself a side-effectful API call (it writes an
 * audit row), so this is modeled as a mutation even though the payload is
 * read-only. Returns the decrypted secret. When the credential's
 * `requiresReason` flag is on, callers must pass a non-empty reason — the
 * server rejects empty strings in that case.
 */
export function useRevealCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; reason?: string }) =>
      apiPost<{ id: string; secret: CredentialSecret; revealedAt: string }>(
        `/credentials/${args.id}/reveal`,
        { reason: args.reason },
      ),
    onSuccess: (_data, args) => {
      void qc.invalidateQueries({ queryKey: ["credential-audit", args.id] });
    },
    onError: (e: Error) =>
      toast({ variant: "error", title: "Reveal failed", description: e.message }),
  });
}

export function useShareCredential(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { userId: string; role: CredentialAccessRole }) =>
      apiPost(`/credentials/${id}/shares`, data),
    onSuccess: () => {
      invalidateCredentials(qc);
      void qc.invalidateQueries({ queryKey: ["credential-audit", id] });
      toast({ variant: "success", title: "Access granted" });
    },
    onError: (e: Error) =>
      toast({ variant: "error", title: "Could not share", description: e.message }),
  });
}

export function useUpdateCredentialShare(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { accessId: string; role: CredentialAccessRole }) =>
      apiPatch(`/credentials/${id}/shares/${data.accessId}`, { role: data.role }),
    onSuccess: () => {
      invalidateCredentials(qc);
      void qc.invalidateQueries({ queryKey: ["credential-audit", id] });
      toast({ variant: "success", title: "Role updated" });
    },
    onError: (e: Error) =>
      toast({ variant: "error", title: "Could not update role", description: e.message }),
  });
}

export function useRevokeCredentialShare(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accessId: string) => apiDelete(`/credentials/${id}/shares/${accessId}`),
    onSuccess: () => {
      invalidateCredentials(qc);
      void qc.invalidateQueries({ queryKey: ["credential-audit", id] });
      toast({ variant: "success", title: "Access removed" });
    },
    onError: (e: Error) =>
      toast({ variant: "error", title: "Could not revoke", description: e.message }),
  });
}

interface FolderPayload {
  name: string;
  description?: string;
  parentId?: string | null;
  color?: string | null;
}

export function useCreateCredentialFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FolderPayload) => apiPost("/credentials/folders", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["credential-folders"] });
      toast({ variant: "success", title: "Folder created" });
    },
    onError: (e: Error) =>
      toast({ variant: "error", title: "Could not create folder", description: e.message }),
  });
}

export function useUpdateCredentialFolder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<FolderPayload>) => apiPatch(`/credentials/folders/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["credential-folders"] });
    },
  });
}

export function useDeleteCredentialFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/credentials/folders/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["credential-folders"] });
      void qc.invalidateQueries({ queryKey: ["credentials"] });
      toast({ variant: "success", title: "Folder deleted" });
    },
  });
}

// ── Studio: Marketing ideas ──

import type {
  MarketingIdeaPriority,
  MarketingIdeaStage,
  ProductIdeaStatus,
  SocialPlatform,
  SocialPostStatus,
  TeamToolCategory,
} from "./hooks";

interface MarketingIdeaPayload {
  title: string;
  description?: string;
  content?: string;
  stage?: MarketingIdeaStage;
  priority?: MarketingIdeaPriority;
  targetDate?: string | null;
  tags?: string[];
}

function invalidateMarketing(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["marketing-ideas"] });
  void qc.invalidateQueries({ queryKey: ["marketing-idea"] });
}

export function useCreateMarketingIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MarketingIdeaPayload) => apiPost("/marketing-ideas", data),
    onSuccess: () => {
      invalidateMarketing(qc);
      toast({ variant: "success", title: "Idea saved" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Could not save idea", description: e.message }),
  });
}

export function useUpdateMarketingIdea(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<MarketingIdeaPayload>) => apiPatch(`/marketing-ideas/${id}`, data),
    onSuccess: () => {
      invalidateMarketing(qc);
    },
    onError: (e: Error) => toast({ variant: "error", title: "Could not update idea", description: e.message }),
  });
}

export function useDeleteMarketingIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/marketing-ideas/${id}`),
    onSuccess: () => {
      invalidateMarketing(qc);
      toast({ variant: "success", title: "Idea deleted" });
    },
  });
}

interface ChecklistTaskPayload {
  title: string;
  assignedToId?: string | null;
  dueDate?: string | null;
  sortOrder?: number;
  completed?: boolean;
}

export function useAddMarketingIdeaTask(ideaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ChecklistTaskPayload) => apiPost(`/marketing-ideas/${ideaId}/tasks`, data),
    onSuccess: () => invalidateMarketing(qc),
  });
}

export function useUpdateMarketingIdeaTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { taskId: string; data: Partial<ChecklistTaskPayload> }) =>
      apiPatch(`/marketing-ideas/tasks/${args.taskId}`, args.data),
    onSuccess: () => invalidateMarketing(qc),
  });
}

export function useDeleteMarketingIdeaTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiDelete(`/marketing-ideas/tasks/${taskId}`),
    onSuccess: () => invalidateMarketing(qc),
  });
}

// ── Studio: Social posts ──

interface SocialPostPayload {
  title?: string;
  content: string;
  platform: SocialPlatform;
  status?: SocialPostStatus;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  mediaUrls?: string[];
  link?: string | null;
  marketingIdeaId?: string | null;
  notes?: string | null;
}

function invalidateSocialPosts(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["social-posts"] });
}

export function useCreateSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SocialPostPayload) => apiPost("/social-posts", data),
    onSuccess: () => {
      invalidateSocialPosts(qc);
      toast({ variant: "success", title: "Post saved" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Could not save post", description: e.message }),
  });
}

export function useUpdateSocialPost(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SocialPostPayload>) => apiPatch(`/social-posts/${id}`, data),
    onSuccess: () => invalidateSocialPosts(qc),
    onError: (e: Error) => toast({ variant: "error", title: "Could not update post", description: e.message }),
  });
}

export function usePublishSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; link?: string }) => apiPost(`/social-posts/${args.id}/publish`, { link: args.link }),
    onSuccess: () => {
      invalidateSocialPosts(qc);
      toast({ variant: "success", title: "Marked as published" });
    },
  });
}

export function useDeleteSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/social-posts/${id}`),
    onSuccess: () => {
      invalidateSocialPosts(qc);
      toast({ variant: "success", title: "Post deleted" });
    },
  });
}

// ── Studio: Product ideas ──

interface ProductIdeaPayload {
  title: string;
  description?: string;
  rationale?: string;
  successMetric?: string;
  status?: ProductIdeaStatus;
  targetDate?: string | null;
  tags?: string[];
}

function invalidateProductIdeas(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["product-ideas"] });
  void qc.invalidateQueries({ queryKey: ["product-idea"] });
}

export function useCreateProductIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductIdeaPayload) => apiPost("/product-ideas", data),
    onSuccess: () => {
      invalidateProductIdeas(qc);
      toast({ variant: "success", title: "Idea saved" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Could not save idea", description: e.message }),
  });
}

export function useUpdateProductIdea(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProductIdeaPayload>) => apiPatch(`/product-ideas/${id}`, data),
    onSuccess: () => invalidateProductIdeas(qc),
    onError: (e: Error) => toast({ variant: "error", title: "Could not update idea", description: e.message }),
  });
}

export function useDeleteProductIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/product-ideas/${id}`),
    onSuccess: () => {
      invalidateProductIdeas(qc);
      toast({ variant: "success", title: "Idea deleted" });
    },
  });
}

export function useToggleProductIdeaVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<{ voted: boolean }>(`/product-ideas/${id}/vote`, {}),
    onSuccess: () => invalidateProductIdeas(qc),
  });
}

export function useAddProductIdeaTask(ideaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ChecklistTaskPayload) => apiPost(`/product-ideas/${ideaId}/tasks`, data),
    onSuccess: () => invalidateProductIdeas(qc),
  });
}

export function useUpdateProductIdeaTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { taskId: string; data: Partial<ChecklistTaskPayload> }) =>
      apiPatch(`/product-ideas/tasks/${args.taskId}`, args.data),
    onSuccess: () => invalidateProductIdeas(qc),
  });
}

export function useDeleteProductIdeaTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiDelete(`/product-ideas/tasks/${taskId}`),
    onSuccess: () => invalidateProductIdeas(qc),
  });
}

// ── Studio: Team tools ──

interface TeamToolPayload {
  name: string;
  description?: string;
  url: string;
  iconUrl?: string | null;
  category?: TeamToolCategory;
  isPinned?: boolean;
  isAi?: boolean;
  tags?: string[];
}

function invalidateTools(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["team-tools"] });
}

export function useCreateTeamTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TeamToolPayload) => apiPost("/team-tools", data),
    onSuccess: () => {
      invalidateTools(qc);
      toast({ variant: "success", title: "Tool added" });
    },
    onError: (e: Error) => toast({ variant: "error", title: "Could not add tool", description: e.message }),
  });
}

export function useUpdateTeamTool(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<TeamToolPayload>) => apiPatch(`/team-tools/${id}`, data),
    onSuccess: () => invalidateTools(qc),
  });
}

export function useToggleTeamToolPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/team-tools/${id}/pin`, {}),
    onSuccess: () => invalidateTools(qc),
  });
}

export function useDeleteTeamTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/team-tools/${id}`),
    onSuccess: () => {
      invalidateTools(qc);
      toast({ variant: "success", title: "Tool removed" });
    },
  });
}

// ── Self-serve change password ──

export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiPost("/auth/change-password", data),
    onSuccess: () =>
      toast({
        variant: "success",
        title: "Password updated",
        description: "Other devices have been signed out for safety.",
      }),
    onError: (e: Error) =>
      toast({ variant: "error", title: "Could not change password", description: e.message }),
  });
}

// ── User access overrides ──

import type { AccessOverride } from "./hooks";

export function useSetUserAccess(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { moduleKey: string; override: AccessOverride; note?: string }) =>
      apiPost(`/user-access/${userId}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["user-access"] });
      toast({ variant: "success", title: "Access updated" });
    },
    onError: (e: Error) =>
      toast({ variant: "error", title: "Could not update access", description: e.message }),
  });
}

export function useClearUserAccess(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moduleKey: string) => apiDelete(`/user-access/${userId}/${moduleKey}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["user-access"] });
      toast({ variant: "info", title: "Override removed", description: "Module now uses the role default." });
    },
  });
}

export function useSeedTeamTools() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<{ skipped: boolean; imported: number; message?: string }>("/team-tools/seed", {}),
    onSuccess: (res) => {
      invalidateTools(qc);
      if (res.imported > 0) {
        toast({
          variant: "success",
          title: `Imported ${res.imported} tool${res.imported === 1 ? "" : "s"}`,
          description: res.message,
        });
      } else {
        toast({
          variant: "info",
          title: "Catalog up to date",
          description: res.message ?? "All curated tools are already in your directory.",
        });
      }
    },
    onError: (e: Error) => toast({ variant: "error", title: "Could not seed tools", description: e.message }),
  });
}
