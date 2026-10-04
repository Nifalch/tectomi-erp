"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFetchForm } from "./client";

function useApiQuery<T>(
  queryKey: string[],
  path: string,
  enabled = true,
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey,
    queryFn: () => apiFetch<T>(path),
    enabled,
    ...(options?.refetchInterval ? { refetchInterval: options.refetchInterval } : {}),
  });
}

export function useDashboardSummary() {
  return useApiQuery<{ metrics: Record<string, number>; taskBoard: Array<{ status: string; _count: number }> }>(
    ["dashboard-summary"],
    "/dashboard/summary",
  );
}

export function useClients(includeArchived = false) {
  const qs = includeArchived ? "?includeArchived=true" : "";
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(
    ["clients", includeArchived ? "all" : "active"],
    `/clients${qs}`,
  );
}

export function useClientTags() {
  return useApiQuery<string[]>(["client-tags"], "/clients/tags");
}

export function useClientHistory(clientId: string | null) {
  return useApiQuery<Array<Record<string, unknown>>>(
    ["client-history", clientId ?? ""],
    `/clients/${clientId}/history`,
    !!clientId,
  );
}

export function useSavedViews(module: string) {
  return useApiQuery<Array<Record<string, unknown>>>(
    ["saved-views", module],
    `/saved-views?module=${module}`,
  );
}

export function useCustomFields(entity: string) {
  return useApiQuery<Array<Record<string, unknown>>>(
    ["custom-fields", entity],
    `/custom-fields?entity=${entity}`,
  );
}

export function useProjects() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["projects"], "/projects");
}

export function useProjectPortfolio() {
  return useApiQuery<Array<any>>(["project-portfolio"], "/projects/portfolio");
}

export function useProjectBurnRate(projectId: string | null) {
  return useApiQuery<any>(
    ["project-burn-rate", projectId ?? ""],
    `/projects/${projectId}/burn-rate`,
    !!projectId,
  );
}

export function useProjectExpenses(projectId: string | null) {
  return useApiQuery<any[]>(
    ["project-expenses", projectId ?? ""],
    `/project-expenses?projectId=${projectId}`,
    !!projectId,
  );
}

export function useProjectExpenseSummary(projectId: string | null) {
  return useApiQuery<any>(
    ["project-expense-summary", projectId ?? ""],
    `/project-expenses/summary/${projectId}`,
    !!projectId,
  );
}

export function useProjectProfitLoss(projectId: string | null) {
  return useApiQuery<any>(
    ["project-pnl", projectId ?? ""],
    `/projects/${projectId}/profit-loss`,
    !!projectId,
  );
}


export function useTeamAttendance(enabled = true) {
  return useApiQuery<Array<Record<string, unknown>>>(["attendance-team"], "/attendance/team", enabled);
}

export function useAllLeaveRequests(enabled = true) {
  return useApiQuery<Array<Record<string, unknown>>>(["leave-all"], "/leave/all", enabled);
}

export function useHrOverview() {
  return useApiQuery<{ employees: Array<Record<string, unknown>>; metrics: Record<string, number> }>(
    ["hr-overview"],
    "/hr/overview",
  );
}

export function useFinanceSummary() {
  return useApiQuery<Record<string, unknown>>(["finance-summary"], "/finance/summary");
}

export function useInvoices() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["invoices"], "/invoices");
}

export function useProposal(id: string) {
  return useApiQuery<Record<string, unknown>>(["proposal", id], `/proposals/${id}`, !!id);
}

export function useProposals(filters: { projectId?: string; clientId?: string; status?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.clientId) params.set("clientId", filters.clientId);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  return useApiQuery<Array<Record<string, unknown>>>(
    ["proposals", filters.projectId ?? "all", filters.clientId ?? "all", filters.status ?? "all"],
    `/proposals${qs ? `?${qs}` : ""}`,
  );
}

export function useResources() {
  return useApiQuery<Array<Record<string, unknown>>>(["resources"], "/resources");
}

export function useDocuments() {
  return useApiQuery<Array<Record<string, unknown>>>(["documents"], "/documents");
}

export function useClientDocuments(clientId: string | null) {
  return useApiQuery<Array<Record<string, unknown>>>(
    ["client-documents", clientId ?? ""],
    `/documents?clientId=${clientId ?? ""}`,
    !!clientId,
  );
}

export function useProfitabilityReport() {
  return useApiQuery<Array<Record<string, unknown>>>(["profitability"], "/reports/profitability");
}

export function useProductivityReport() {
  return useApiQuery<Array<Record<string, unknown>>>(["productivity"], "/reports/productivity");
}

export type NotificationType =
  | "TASK_ASSIGNED"
  | "TASK_MENTIONED"
  | "TASK_WATCHER_ACTIVITY"
  | "TASK_DUE_SOON"
  | "TASK_COMMENT"
  | "SPRINT_STARTED"
  | "PROJECT_ADDED"
  | "PROJECT_MEMBER_ADDED"
  | "PROJECT_DEADLINE_SOON"
  | "CHAT_MENTIONED"
  | "LEAVE_APPROVED"
  | "LEAVE_REJECTED"
  | "HOLIDAY_UPCOMING"
  | "ANNOUNCEMENT_POSTED"
  | "GENERIC";

export interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  readAt: string | null;
  createdAt: string;
}

export function useNotifications() {
  return useApiQuery<NotificationRow[]>(["notifications", "all"], "/notifications?limit=100");
}

export function useNotificationsUnread() {
  return useApiQuery<NotificationRow[]>(
    ["notifications", "unread"],
    "/notifications?unread=true&limit=100",
  );
}

export function useNotificationsUnreadCount(enabled = true) {
  return useApiQuery<{ count: number }>(
    ["notifications-unread-count"],
    "/notifications/unread-count",
    enabled,
    { refetchInterval: 30_000 },
  );
}

export function useProject(id: string) {
  return useApiQuery<Record<string, unknown>>(["project", id], `/projects/${id}`, !!id);
}

export function useProjectPaymentMilestones(projectId: string) {
  return useApiQuery<Array<Record<string, unknown>>>(
    ["project-payment-milestones", projectId],
    `/projects/${projectId}/payment-milestones`,
    !!projectId,
  );
}

export function useProjectTasks(projectId: string) {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(
    ["project-tasks", projectId],
    `/tasks?projectId=${projectId}&pageSize=1000`,
    !!projectId,
  );
}

/**
 * Fetch the user directory. Excludes by default:
 *   - terminated / suspended accounts (toggle with includeInactive)
 *   - client-portal accounts (toggle with includeClients)
 *
 * Every staff-side picker — project members, task assignees, founder
 * picker, chat invites, lead/deal owners, etc. — uses defaults so
 * portal-only client users never appear there. The Settings → Users
 * admin panel passes `includeInactive: true` (and optionally
 * `includeClients: true`) to manage the full list.
 */
export function useUsers(opts: { includeInactive?: boolean; includeClients?: boolean } = {}) {
  const params = new URLSearchParams();
  if (opts.includeInactive) params.set("includeInactive", "true");
  if (opts.includeClients) params.set("includeClients", "true");
  const qs = params.toString();
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(
    [
      "users",
      opts.includeInactive ? "all" : "active",
      opts.includeClients ? "withClients" : "staffOnly",
    ],
    `/users${qs ? `?${qs}` : ""}`,
  );
}

// ── Biometric / ESSL device admin ────────────────────────────────────
export type BiometricDevice = {
  id: string;
  serialNumber: string;
  name: string | null;
  approved: boolean;
  lastSeenAt: string | null;
  firstSeenAt: string;
  deviceModel: string | null;
  firmware: string | null;
  _count?: { logs: number };
};

export type UnmappedEnrollment = {
  deviceId: string;
  deviceUserId: string;
  punchCount: number;
  lastSeen: string;
};

export type BiometricLogRow = {
  id: string;
  deviceId: string;
  deviceUserId: string;
  userId: string | null;
  punchAt: string;
  punchType: number;
  verifyMode: number;
  raw: string;
  processed: boolean;
  appliedAt: string | null;
  createdAt: string;
  device: { id: string; serialNumber: string; name: string | null };
  user: { id: string; firstName: string; lastName: string; email: string } | null;
};

export function useBiometricDevices() {
  return useApiQuery<BiometricDevice[]>(["biometric", "devices"], "/biometric/devices");
}

export function useBiometricUnmapped() {
  return useApiQuery<UnmappedEnrollment[]>(
    ["biometric", "unmapped"],
    "/biometric/unmapped-enrollments",
  );
}

export function useBiometricLogs(limit = 50) {
  return useApiQuery<BiometricLogRow[]>(
    ["biometric", "logs", String(limit)],
    `/biometric/logs?limit=${limit}`,
  );
}

export function useTasks(userId?: string) {
  const params = new URLSearchParams();
  if (userId) params.set("userId", userId);
  // Kanban boards need every task, not just the first page.
  params.set("pageSize", "1000");
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(
    ["tasks", userId ?? "self"],
    `/tasks?${params.toString()}`,
  );
}

export function useTimeEntries(
  userId?: string,
  range?: { from?: string; to?: string; pageSize?: number },
) {
  const p = new URLSearchParams();
  if (userId) p.set("userId", userId);
  if (range?.from) p.set("from", range.from);
  if (range?.to) p.set("to", range.to);
  if (range?.pageSize) p.set("pageSize", String(range.pageSize));
  const qs = p.toString();
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(
    ["time-entries", userId ?? "self", range?.from ?? "", range?.to ?? ""],
    `/time-entries${qs ? `?${qs}` : ""}`,
  );
}

export function useAttendance(userId?: string) {
  const qs = userId ? `?userId=${userId}` : "";
  return useApiQuery<Array<Record<string, unknown>>>(["attendance", userId ?? "self"], `/attendance${qs}`);
}

// Today's attendance row + policy + monthly counters — fast-path for the
// topbar quick-access widget. Polls every 60s so the "on time / late /
// half-day" state stays fresh without manual refresh.
export interface AttendanceTodayResponse {
  today: {
    id: string;
    date: string;
    checkIn?: string | null;
    checkOut?: string | null;
    totalHours?: number | string | null;
    status: "PRESENT" | "LATE" | "HALF_DAY" | "ABSENT" | "ON_LEAVE" | "HOLIDAY";
    lateMinutes: number;
  } | null;
  policy: {
    officeStartHour: number;
    officeStartMinute: number;
    officeEndHour: number;
    officeEndMinute: number;
    graceMinutes: number;
    halfDayCutoffHour: number;
    halfDayCutoffMinute: number;
    requiredDailyHours: number;
    lateStreakThreshold: number;
    monthlyPaidLeaveCap: number;
    workingDaysMask: number;
  };
  office: { geofenceEnabled: boolean; name: string; radiusMeters: number };
  monthly: {
    lateCount: number;
    lateStreakThreshold: number;
    paidLeavesUsed: number;
    monthlyPaidLeaveCap: number;
  };
  isWorkingDay: boolean;
}

export function useAttendanceToday(enabled = true) {
  return useApiQuery<AttendanceTodayResponse>(
    ["attendance-today"],
    "/attendance/today",
    enabled,
    { refetchInterval: 60_000 },
  );
}

export function useAttendancePolicy() {
  return useApiQuery<AttendanceTodayResponse["policy"]>(
    ["attendance-policy"],
    "/attendance/policy",
  );
}

export interface OfficeNetworkCheck {
  seenIp: string | null;
  geofenceEnabled: boolean;
  hasAllowlist?: boolean;
  matchesAllowlist: boolean;
  message: string;
}

/** Preflight: does the caller's current network IP satisfy the office
 *  attendance gate? Used by the "Test office network" button. */
export function useCheckOfficeNetwork(enabled = false) {
  return useApiQuery<OfficeNetworkCheck>(
    ["attendance-check-network"],
    "/attendance/check-network",
    enabled,
  );
}

export function useAttendanceHrSummary(month?: string) {
  const qs = month ? `?month=${month}` : "";
  return useApiQuery<
    Array<{
      userId: string;
      user: { id: string; firstName: string; lastName: string; email: string } | null;
      present: number;
      late: number;
      halfDay: number;
      absent: number;
    }>
  >(["attendance-hr-summary", month ?? "current"], `/attendance/hr-summary${qs}`);
}

export function useLeaveRequests(userId?: string) {
  const qs = userId ? `?userId=${userId}` : "";
  return useApiQuery<Array<Record<string, unknown>>>(["leave", userId ?? "self"], `/leave${qs}`);
}

export function useLeaveBalances(userId?: string) {
  const qs = userId ? `?userId=${userId}` : "";
  return useApiQuery<Array<Record<string, unknown>>>(["leave-balances", userId ?? "self"], `/leave/balances${qs}`);
}

export function useLeaveMonthlyUsage(userId?: string) {
  const qs = userId ? `?userId=${userId}` : "";
  return useApiQuery<{ cap: number; used: number; remaining: number }>(
    ["leave-monthly-usage", userId ?? "self"],
    `/leave/monthly-usage${qs}`,
  );
}

export function useRolesMatrix() {
  return useApiQuery<{ roles: any[]; permissions: any[]; grants: Record<string, Record<string, boolean>> }>(["roles-matrix"], "/roles/permissions/matrix");
}

export function useAllPermissions() {
  return useApiQuery<any[]>(["permissions-all"], "/roles/permissions/all");
}

export function useLeads() {
  return useApiQuery<Array<Record<string, unknown>>>(["leads"], "/leads");
}
export function useHolidays() {
  return useApiQuery<Array<Record<string, unknown>>>(["holidays"], "/holidays");
}
export function useKnowledgeArticles() {
  return useApiQuery<Array<Record<string, unknown>>>(["knowledge"], "/knowledge");
}
export function useActivityLogs() {
  return useApiQuery<Array<Record<string, unknown>>>(["activity"], "/activity");
}

export function useGoals() {
  return useApiQuery<Array<Record<string, unknown>>>(["goals"], "/goals");
}
export function useVendors() {
  return useApiQuery<Array<Record<string, unknown>>>(["vendors"], "/vendors");
}
export function useCalendarEvents() {
  return useApiQuery<Array<Record<string, unknown>>>(["calendar"], "/calendar");
}
export function useOnboardingChecklists() {
  return useApiQuery<Array<Record<string, unknown>>>(["onboarding"], "/onboarding");
}
export function useCommunications(clientId?: string) {
  const path = clientId ? `/communications?clientId=${clientId}` : "/communications";
  return useApiQuery<Array<Record<string, unknown>>>(["communications", clientId ?? "all"], path);
}
export function useEmailTemplates() {
  return useApiQuery<Array<Record<string, unknown>>>(["templates"], "/templates");
}

export function useSprints(projectId?: string | null) {
  return useApiQuery<Array<Record<string, unknown>>>(
    ["sprints", projectId ?? "none"],
    `/sprints?projectId=${projectId ?? ""}`,
    !!projectId,
  );
}
export function useLabels(projectId?: string) {
  const path = projectId ? `/labels?projectId=${projectId}` : "/labels";
  return useApiQuery<Array<Record<string, unknown>>>(["labels", projectId ?? "all"], path);
}
export function useWikiPages(projectId: string) {
  return useApiQuery<Array<Record<string, unknown>>>(["wiki", projectId], `/wiki?projectId=${projectId}`, !!projectId);
}

export function useDocumentUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (formData: FormData) => apiFetchForm("/documents/upload", formData),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// ── CRM ──
export function useContacts(clientId?: string) {
  const q = clientId ? `?clientId=${clientId}` : "";
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["contacts", clientId ?? "all"], `/contacts${q}`);
}
export function useContact(id: string | null) {
  return useApiQuery<Record<string, unknown>>(["contact", id ?? ""], `/contacts/${id}`, !!id);
}
export function useDeals(filters?: { stage?: string; ownerId?: string; clientId?: string }) {
  const params = new URLSearchParams();
  if (filters?.stage) params.set("stage", filters.stage);
  if (filters?.ownerId) params.set("ownerId", filters.ownerId);
  if (filters?.clientId) params.set("clientId", filters.clientId);
  const qs = params.toString();
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["deals", qs], `/deals${qs ? `?${qs}` : ""}`);
}
export function useDeal(id: string | null) {
  return useApiQuery<Record<string, unknown>>(["deal", id ?? ""], `/deals/${id}`, !!id);
}
export function useActivities(filters: { leadId?: string; dealId?: string; clientId?: string; contactId?: string }) {
  const p = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
  const qs = p.toString();
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["activities", qs], `/activities?${qs}`, Object.values(filters).some(Boolean));
}

// ── ACCOUNTING ──
export function useItems() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["items"], "/items");
}
export function useItem(id: string) {
  return useApiQuery<Record<string, unknown>>(["item", id], `/items/${id}`, !!id);
}
export function useTaxRates() {
  return useApiQuery<Array<Record<string, unknown>>>(["tax-rates"], "/tax-rates");
}
export function useChartAccounts() {
  return useApiQuery<Array<Record<string, unknown>>>(["chart-accounts"], "/chart-accounts");
}
export function useChartAccountsTree() {
  return useApiQuery<Record<string, unknown>>(["chart-accounts-tree"], "/chart-accounts/tree");
}
export function useOrgSettings() {
  return useApiQuery<Record<string, unknown>>(["org-settings"], "/org-settings");
}
export function useEstimates() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["estimates"], "/estimates");
}
export function useEstimate(id: string) {
  return useApiQuery<Record<string, unknown>>(["estimate", id], `/estimates/${id}`, !!id);
}
export function useBills() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["bills"], "/bills");
}
export function useBill(id: string) {
  return useApiQuery<Record<string, unknown>>(["bill", id], `/bills/${id}`, !!id);
}
export function usePayments() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["payments"], "/payments");
}
export function usePayment(id: string) {
  return useApiQuery<Record<string, unknown>>(["payment", id], `/payments/${id}`, !!id);
}
/** Lists every Payment with type=MADE — i.e. money that left the company.
 *  Used by the /expenses page so we get bill payments, recurring expenses,
 *  and one-off cash spends in one feed. */
export function useExpenses() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["expenses"], "/payments?type=MADE&pageSize=200");
}
export function useRecurringExpenses() {
  return useApiQuery<Array<Record<string, unknown>>>(["recurring-expenses"], "/recurring-expenses");
}
export function useRecurringExpense(id: string) {
  return useApiQuery<Record<string, unknown>>(["recurring-expense", id], `/recurring-expenses/${id}`, !!id);
}
export function useCreditNotes() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["credit-notes"], "/credit-notes");
}
export function useCreditNote(id: string) {
  return useApiQuery<Record<string, unknown>>(["credit-note", id], `/credit-notes/${id}`, !!id);
}
export function useBankAccounts() {
  return useApiQuery<Array<Record<string, unknown>>>(["bank-accounts"], "/bank-accounts");
}
export function useBankTransactions(accountId: string) {
  // pageSize=1000 — the drawer is a "show me everything" view; the
  // default 10 made historical imports look amputated (only the
  // latest 10 visible out of 100+ real txns).
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(
    ["bank-transactions", accountId],
    `/bank-accounts/${accountId}/transactions?pageSize=1000`,
    !!accountId,
  );
}
export function useJournalEntries() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["journal-entries"], "/journal-entries");
}
export function useJournalEntry(id: string) {
  return useApiQuery<Record<string, unknown>>(["journal-entry", id], `/journal-entries/${id}`, !!id);
}
export function useRecurringInvoices() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["recurring-invoices"], "/recurring-invoices");
}
export function useInvoice(id: string) {
  return useApiQuery<Record<string, unknown>>(["invoice", id], `/invoices/${id}`, !!id);
}

// ── REPORTS ──
function reportsToQs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function useProfitLoss(from?: string, to?: string) {
  const qs = reportsToQs({ from, to });
  return useApiQuery<any>(["report-pl", qs], `/reports/profit-loss${qs}`);
}
export function useBalanceSheet(from?: string, to?: string) {
  const qs = reportsToQs({ from, to });
  return useApiQuery<any>(["report-bs", qs], `/reports/balance-sheet${qs}`);
}
export function useTrialBalance(from?: string, to?: string) {
  const qs = reportsToQs({ from, to });
  return useApiQuery<any>(["report-tb", qs], `/reports/trial-balance${qs}`);
}
export function useCashFlow(from?: string, to?: string) {
  const qs = reportsToQs({ from, to });
  return useApiQuery<any>(["report-cf", qs], `/reports/cash-flow${qs}`);
}
export function useArAging(from?: string, to?: string) {
  const qs = reportsToQs({ from, to });
  return useApiQuery<any>(["report-ar", qs], `/reports/ar-aging${qs}`);
}
export function useApAging(from?: string, to?: string) {
  const qs = reportsToQs({ from, to });
  return useApiQuery<any>(["report-ap", qs], `/reports/ap-aging${qs}`);
}
export function useTaxSummary(from?: string, to?: string) {
  const qs = reportsToQs({ from, to });
  return useApiQuery<any>(["report-tax", qs], `/reports/tax-summary${qs}`);
}
export function useSalesByCustomer(from?: string, to?: string) {
  const qs = reportsToQs({ from, to });
  return useApiQuery<any>(["report-sbc", qs], `/reports/sales-by-customer${qs}`);
}
export function useExpensesByCategory(from?: string, to?: string) {
  const qs = reportsToQs({ from, to });
  return useApiQuery<any>(["report-ebc", qs], `/reports/expenses-by-category${qs}`);
}
export function useCustomerStatement(clientId: string | null, from?: string, to?: string) {
  const qs = reportsToQs({ from, to });
  return useApiQuery<any>(["report-stmt", clientId ?? "", qs], `/reports/customer-statement/${clientId}${qs}`, !!clientId);
}

// ── HRM ──
export function useSalaryStructures() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["salary-structures"], "/payroll/salary-structures");
}
export function useSalaryStructure(employeeId: string | null) {
  return useApiQuery<Record<string, unknown>>(["salary-structure", employeeId ?? ""], `/payroll/salary-structures/${employeeId}`, !!employeeId);
}
export function usePayrollRuns() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["payroll-runs"], "/payroll/runs");
}
export function usePayrollRun(id: string | null) {
  return useApiQuery<Record<string, unknown>>(["payroll-run", id ?? ""], `/payroll/runs/${id}`, !!id);
}
export function usePaySlips(filters?: { runId?: string; userId?: string }) {
  const p = new URLSearchParams();
  if (filters?.runId) p.set("runId", filters.runId);
  if (filters?.userId) p.set("userId", filters.userId);
  const qs = p.toString();
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["pay-slips", qs], `/payroll/slips${qs ? `?${qs}` : ""}`);
}
export function useMyPaySlips() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["my-pay-slips"], "/payroll/slips/my");
}
export function usePaySlip(id: string | null) {
  return useApiQuery<Record<string, unknown>>(["pay-slip", id ?? ""], `/payroll/slips/${id}`, !!id);
}

export function useReviewCycles() {
  return useApiQuery<Array<Record<string, unknown>>>(["review-cycles"], "/performance-reviews/cycles");
}
export function useReviewCycle(id: string | null) {
  return useApiQuery<Record<string, unknown>>(["review-cycle", id ?? ""], `/performance-reviews/cycles/${id}`, !!id);
}
// The Performance controller mounts cycles/reviews/feedback under
// `/performance-reviews/...` — the list endpoints live under `/reviews`,
// NOT at the bare module root. The previous URLs here returned 404 and
// React Query silently rendered empty arrays, which is why every tab on
// the Performance page showed 0 even when reviews existed in the DB.
export function useReviews(filters?: { cycleId?: string; status?: string; employeeId?: string }) {
  const p = new URLSearchParams();
  if (filters?.cycleId) p.set("cycleId", filters.cycleId);
  if (filters?.status) p.set("status", filters.status);
  if (filters?.employeeId) p.set("employeeId", filters.employeeId);
  const qs = p.toString();
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["reviews", qs], `/performance-reviews/reviews${qs ? `?${qs}` : ""}`);
}
export function useReview(id: string | null) {
  return useApiQuery<Record<string, unknown>>(["review", id ?? ""], `/performance-reviews/reviews/${id}`, !!id);
}
export function useMyReviewsToSelfReview() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["my-reviews-self"], "/performance-reviews/reviews/my/to-self-review");
}
export function useMyReviewsToReview() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["my-reviews-to-review"], "/performance-reviews/reviews/my/to-review");
}
export function useFeedback360(reviewId: string | null) {
  // Endpoint lives at `/performance-reviews/reviews/:id/feedback360`. The
  // earlier short path was a 404 — same mismatch as the submit mutation.
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["feedback-360", reviewId ?? ""], `/performance-reviews/reviews/${reviewId}/feedback360`, !!reviewId);
}

export function useAssets(filters?: { status?: string; category?: string; assignedToId?: string }) {
  const p = new URLSearchParams();
  if (filters?.status) p.set("status", filters.status);
  if (filters?.category) p.set("category", filters.category);
  if (filters?.assignedToId) p.set("assignedToId", filters.assignedToId);
  const qs = p.toString();
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["assets", qs], `/assets${qs ? `?${qs}` : ""}`);
}
export function useAsset(id: string | null) {
  return useApiQuery<Record<string, unknown>>(["asset", id ?? ""], `/assets/${id}`, !!id);
}

export function useAnnouncements() {
  return useApiQuery<Array<Record<string, unknown>>>(["announcements"], "/announcements");
}

export function useTimesheets(filters?: { status?: string; userId?: string }) {
  const p = new URLSearchParams();
  if (filters?.status) p.set("status", filters.status);
  if (filters?.userId) p.set("userId", filters.userId);
  const qs = p.toString();
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["timesheets", qs], `/timesheets${qs ? `?${qs}` : ""}`);
}
export function useMyTimesheets() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(["my-timesheets"], "/timesheets/my");
}
export function useTimesheet(id: string | null) {
  return useApiQuery<Record<string, unknown>>(["timesheet", id ?? ""], `/timesheets/${id}`, !!id);
}

// ── TASK TIMER ──
export function useActiveTimer() {
  return useQuery({
    queryKey: ["active-timer"],
    queryFn: () => apiFetch<any>("/time-entries/active"),
    refetchInterval: 10_000, // keep it in sync if user opens another tab
  });
}
export function useTaskTimeSummary(taskId: string | null, refetchInterval?: number) {
  return useQuery({
    queryKey: ["task-time-summary", taskId],
    queryFn: () => apiFetch<any>(`/time-entries/task/${taskId}/summary`),
    enabled: !!taskId,
    refetchInterval,
  });
}

export function useProjectTimeSummary(projectId: string | null) {
  return useQuery({
    queryKey: ["project-time-summary", projectId],
    queryFn: () => apiFetch<any>(`/time-entries/project/${projectId}/summary`),
    enabled: !!projectId,
  });
}
export function useMyPerformance(from?: string, to?: string) {
  const qs = [from && `from=${from}`, to && `to=${to}`].filter(Boolean).join("&");
  return useQuery({
    queryKey: ["my-performance", from, to],
    queryFn: () => apiFetch<any>(`/time-entries/performance/me${qs ? `?${qs}` : ""}`),
  });
}
export function useUserPerformance(userId: string | null, from?: string, to?: string) {
  const qs = [from && `from=${from}`, to && `to=${to}`].filter(Boolean).join("&");
  return useQuery({
    queryKey: ["user-performance", userId, from, to],
    queryFn: () => apiFetch<any>(`/time-entries/performance/${userId}${qs ? `?${qs}` : ""}`),
    enabled: !!userId,
  });
}

export function useProjectWorkload(projectId: string | null) {
  return useQuery({
    queryKey: ["project-workload", projectId],
    queryFn: () => apiFetch<any>(`/projects/${projectId}/workload`),
    enabled: !!projectId,
  });
}

// ── Task history & bulk ops ──
export function useTaskHistory(taskId: string | null) {
  return useApiQuery<Array<Record<string, unknown>>>(
    ["task-history", taskId ?? ""],
    `/tasks/${taskId}/history`,
    !!taskId,
  );
}

// ── ADVANCED PM ──
export function useRecurringTasks(projectId?: string) {
  const qs = projectId ? `?projectId=${projectId}` : "";
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(
    ["recurring-tasks", projectId ?? "all"], `/recurring-tasks${qs}`
  );
}
export function useProjectStatuses(projectId: string | null) {
  return useApiQuery<Array<Record<string, unknown>>>(
    ["project-statuses", projectId ?? ""], `/project-statuses?projectId=${projectId ?? ""}`, !!projectId,
  );
}
export function useSprintBurndown(sprintId: string | null) {
  return useApiQuery<any>(["burndown", sprintId ?? ""], `/sprints/${sprintId}/burndown`, !!sprintId);
}
export function useMentionableUsers(taskId: string | null) {
  return useApiQuery<Array<{ id: string; firstName: string; lastName: string; email?: string }>>(
    ["mentionable", taskId ?? ""], `/tasks/${taskId}/mentionable-users`, !!taskId,
  );
}
export function usePendingTimeApprovals() {
  return useApiQuery<{ data: Array<Record<string, unknown>> }>(
    ["time-approvals"], "/time-entries/pending-approval",
  );
}

// ── ADVANCED PM 2 ──
export function useTaskWatchers(taskId: string | null) {
  // Backend returns a flat user array: [{ id, firstName, lastName, email, avatarUrl }].
  // Do NOT shape this as { user: {...} } — it's not a pivot row.
  return useApiQuery<Array<{ id: string; firstName: string; lastName: string; email?: string; avatarUrl?: string | null }>>(
    ["task-watchers", taskId ?? ""], `/tasks/${taskId}/watchers`, !!taskId,
  );
}
export function useSprintRetrospective(sprintId: string | null) {
  return useApiQuery<any>(["retro", sprintId ?? ""], `/sprints/${sprintId}/retrospective`, !!sprintId);
}
export function useUserCapacity(userId: string | null) {
  return useApiQuery<any>(["user-capacity", userId ?? ""], `/users/${userId}/capacity`, !!userId);
}
export function useTaskEstimateVsActual(taskId: string | null) {
  return useApiQuery<any>(["task-estimate-actual", taskId ?? ""], `/tasks/${taskId}/estimate-vs-actual`, !!taskId);
}

export function useSprintVelocity(projectId: string | null) {
  return useApiQuery<any>(
    ["sprint-velocity", projectId ?? ""], `/sprints/velocity/${projectId}`, !!projectId,
  );
}

export function useProjectMilestones(projectId: string | null) {
  return useQuery({
    queryKey: ["project-milestones", projectId ?? ""],
    queryFn: () => apiFetch<any>(`/projects/${projectId}`).then((p: any) => p?.milestones ?? []),
    enabled: !!projectId,
  });
}

// ── CHAT ──
export interface ChannelSummary {
  id: string;
  type: "GLOBAL" | "PROJECT" | "DIRECT" | "GROUP";
  name: string;
  description: string | null;
  projectId: string | null;
  project: { id: string; name: string } | null;
  updatedAt: string;
  lastMessage: {
    id: string;
    content: string;
    authorId: string;
    createdAt: string;
    deleted: boolean;
  } | null;
  unreadCount: number;
  directWith?: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
}

export interface ChatMessageRow {
  id: string;
  channelId: string;
  authorId: string;
  author: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  reactions: Array<{ emoji: string; users: string[]; count: number }>;
}

export interface ChannelMemberRow {
  userId: string;
  lastReadAt: string;
  user: { id: string; firstName: string; lastName: string; email: string; avatarUrl: string | null };
}

export function useChannels(enabled = true) {
  return useApiQuery<ChannelSummary[]>(["channels"], "/chat/channels", enabled, {
    refetchInterval: 15_000,
  });
}
export function useChannel(id: string | null) {
  return useApiQuery<any>(["channel", id ?? ""], `/chat/channels/${id}`, !!id);
}
export function useChannelMessages(id: string | null) {
  return useApiQuery<ChatMessageRow[]>(
    ["messages", id ?? ""],
    `/chat/channels/${id}/messages?limit=100`,
    !!id,
    { refetchInterval: 5_000 },
  );
}
export function useChannelMembers(id: string | null) {
  return useApiQuery<ChannelMemberRow[]>(
    ["channel-members", id ?? ""],
    `/chat/channels/${id}/members`,
    !!id,
  );
}

// ── Founders / capital account / cap table ──
export interface FounderLedgerEntryRow {
  id: string;
  date: string;
  direction: "CREDIT" | "DEBIT";
  kind: "LOAN_IN" | "EXPENSE_REIMBURSEMENT" | "DISTRIBUTION" | "REPAYMENT" | "OTHER";
  amount: number | string;
  description?: string | null;
  reference?: string | null;
  createdAt: string;
  createdBy?: { firstName: string; lastName: string } | null;
}

export interface FounderCapitalAccount {
  founder: { userId: string; employeeId: string };
  balance: number;
  breakdown: { deferredFromSlips: number; ledgerCredits: number; ledgerDebits: number };
  entries: FounderLedgerEntryRow[];
  slips: Array<{
    id: string;
    month: number;
    year: number;
    netSalary: number | string;
    drawnAmount?: number | string | null;
    deferredAmount: number | string;
  }>;
}

export function useFounderCapital(userId: string, enabled = true) {
  return useApiQuery<FounderCapitalAccount>(
    ["founder-capital", userId],
    `/founders/${userId}/capital`,
    enabled,
  );
}

export type EquityGrantTypeValue = "FOUNDER_SHARES" | "ESOP" | "INVESTOR" | "ADVISOR" | "OTHER";

export interface EquityGrantRow {
  id: string;
  type: EquityGrantTypeValue;
  shares: number;
  grantDate: string;
  vestingMonths: number;
  cliffMonths: number;
  status: "ACTIVE" | "CANCELLED" | "EXERCISED";
  notes?: string | null;
  employee?: { user?: { firstName: string; lastName: string; email: string } } | null;
  holderName?: string | null;
  holderEmail?: string | null;
  organization?: string | null;
  investmentAmount?: number | string | null;
  investmentDate?: string | null;
}

export function useEquityGrants(userId?: string, enabled = true) {
  const qs = userId ? `?userId=${userId}` : "";
  return useApiQuery<EquityGrantRow[]>(
    ["equity-grants", userId ?? "all"],
    `/founders/grants${qs}`,
    enabled,
  );
}

export interface CapTableHolder {
  kind: "EMPLOYEE" | "EXTERNAL";
  userId: string | null;
  employeeId: string | null;
  name: string;
  email: string | null;
  organization: string | null;
}

export interface CapTableRow {
  id: string;
  type: EquityGrantTypeValue;
  status: "ACTIVE" | "CANCELLED" | "EXERCISED";
  grantDate: string;
  vestingMonths: number;
  cliffMonths: number;
  shares: number;
  vested: number;
  ownershipPct: number;
  vestedPct: number;
  valueAtCurrent: number;
  investmentAmount: number | null;
  investmentDate: string | null;
  notes?: string | null;
  holder: CapTableHolder;
}

export interface CapTableResponse {
  asOf: string;
  valuation: {
    totalShares: number;
    sharePrice: number;
    asOf: string;
    companyValuation: number;
  } | null;
  totals: {
    issued: number;
    vested: number;
    outstanding: number;
    denominator: number;
    cashInvested: number;
  };
  grants: CapTableRow[];
}

export function useCapTable(enabled = true) {
  return useApiQuery<CapTableResponse>(["cap-table"], "/founders/cap-table", enabled);
}

export interface CompanyValuationRow {
  id: string;
  totalShares: number;
  sharePrice: number | string;
  asOf: string;
  notes?: string | null;
  createdBy?: { firstName: string; lastName: string } | null;
}

export function useCompanyValuations(enabled = true) {
  return useApiQuery<CompanyValuationRow[]>(["company-valuations"], "/founders/valuations", enabled);
}

export interface FounderDashboardRow {
  userId: string;
  employeeId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  capitalBalance: number;
  deferredSalary: number;
  ledgerCredits: number;
  ledgerDebits: number;
  shares: number;
  vested: number;
  ownershipPct: number;
  vestedValue: number;
}

export interface FounderDashboardResponse {
  founders: FounderDashboardRow[];
  capTable: {
    asOf: string;
    totalShares: number;
    sharePrice: number;
    companyValuation: number;
  } | null;
}

export function useFounderDashboard(enabled = true) {
  return useApiQuery<FounderDashboardResponse>(["founder-dashboard"], "/founders/dashboard", enabled);
}

// ── Finance / main account ──
export interface MainAccountResponse {
  primaryBank: {
    id: string;
    name: string;
    type: string;
    bankName?: string | null;
    accountNumber?: string | null;
    currency: string;
    openingBalance: number;
    currentBalance: number;
    liveBalance: number;
    isPrimary: boolean;
  } | null;
  banks: Array<{
    id: string;
    name: string;
    type: string;
    bankName?: string | null;
    accountNumber?: string | null;
    openingBalance: number;
    currentBalance: number;
    liveBalance: number;
    isPrimary: boolean;
  }>;
  mainBalance: number;
  glBalance: number;
  reconciled: boolean;
  monthToDate: { inflow: number; outflow: number; net: number };
  profitLoss: {
    lifetimeIncome: number;
    lifetimeExpense: number;
    lifetimeNet: number;
    mtdIncome: number;
    mtdExpense: number;
    mtdNet: number;
  };
  byType: Record<string, number>;
  founders: Array<{ userId: string; name: string; net: number }>;
  recentEntries: Array<{
    id: string;
    date: string;
    journalNumber: string;
    description: string;
    source: "MANUAL" | "PAYMENT" | "PAY_SLIP" | "FOUNDER_LEDGER" | "OPENING_BALANCE";
    sourceId: string | null;
    reference: string | null;
    amount: number;
    lines: Array<{ accountCode: string; accountName: string; debit: number; credit: number }>;
  }>;
  recentBankTransactions: Array<{
    id: string;
    date: string;
    amount: number;
    type: "DEBIT" | "CREDIT";
    description: string;
    reference: string | null;
    bank: { id: string; name: string; isPrimary: boolean };
  }>;
}

export function useMainAccount(enabled = true) {
  return useApiQuery<MainAccountResponse>(["finance-main-account"], "/finance/main-account", enabled);
}

// ── Credential vault ──

export type CredentialType =
  | "PASSWORD"
  | "API_KEY"
  | "SSH_KEY"
  | "DATABASE"
  | "CERTIFICATE"
  | "ENV_FILE"
  | "CARD"
  | "NOTE"
  | "SOCIAL_MEDIA"
  | "EMAIL_ACCOUNT"
  | "GENERIC";

export type CredentialAccessRole = "VIEWER" | "EDITOR" | "OWNER";

export interface CredentialUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
}

export interface CredentialAccessRow {
  id: string;
  role: CredentialAccessRole;
  grantedAt: string;
  user: CredentialUser;
}

export interface CredentialFolderRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  parentId: string | null;
  createdAt: string;
  _count: { credentials: number };
}

export interface CredentialRow {
  id: string;
  name: string;
  type: CredentialType;
  description: string | null;
  username: string | null;
  url: string | null;
  metadata: Record<string, unknown> | null;
  tags: string[];
  expiresAt: string | null;
  lastRotatedAt: string | null;
  rotationIntervalDays: number | null;
  requiresReason: boolean;
  highSecurity: boolean;
  folderId: string | null;
  folder: { id: string; name: string; color: string | null } | null;
  ownerId: string;
  owner: CredentialUser;
  accesses: CredentialAccessRow[];
  createdAt: string;
  updatedAt: string;
}

export interface CredentialSecret {
  password?: string;
  apiKey?: string;
  apiSecret?: string;
  privateKey?: string;
  publicKey?: string;
  certificate?: string;
  connectionString?: string;
  host?: string;
  port?: string;
  database?: string;
  envContent?: string;
  cardNumber?: string;
  cardHolder?: string;
  cardExpiry?: string;
  cardCvv?: string;
  pin?: string;
  note?: string;
  value?: string;
  // Email + social media specific
  emailAddress?: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
  appPassword?: string;
  twoFactorBackup?: string;
  handle?: string;
}

export interface CredentialAuditRow {
  id: string;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: CredentialUser;
}

export interface CredentialFilters {
  search?: string;
  type?: CredentialType | "";
  folderId?: string | "";
  tag?: string;
  ownedBy?: "me" | "shared" | "all";
}

export function useCredentials(filters: CredentialFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.type) params.set("type", filters.type);
  if (filters.folderId) params.set("folderId", filters.folderId);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.ownedBy) params.set("ownedBy", filters.ownedBy);
  const qs = params.toString();
  return useApiQuery<CredentialRow[]>(
    ["credentials", filters.search ?? "", filters.type ?? "", filters.folderId ?? "", filters.tag ?? "", filters.ownedBy ?? ""],
    `/credentials${qs ? `?${qs}` : ""}`,
  );
}

export function useCredentialFolders() {
  return useApiQuery<CredentialFolderRow[]>(["credential-folders"], "/credentials/folders");
}

export function useCredentialAudit(id: string | null) {
  return useApiQuery<CredentialAuditRow[]>(
    ["credential-audit", id ?? ""],
    `/credentials/${id ?? ""}/audit`,
    !!id,
  );
}

export function useCredentialShareableUsers(search: string) {
  return useApiQuery<CredentialUser[]>(
    ["credential-users", search],
    `/credentials/users${search ? `?search=${encodeURIComponent(search)}` : ""}`,
  );
}

// ── Studio: Marketing ideas ──

export type MarketingIdeaStage =
  | "IDEA"
  | "PLANNED"
  | "IN_PROGRESS"
  | "REVIEW"
  | "LIVE"
  | "DONE"
  | "CANCELLED";

export type MarketingIdeaPriority = "LOW" | "MEDIUM" | "HIGH";

export interface MarketingIdeaTaskRow {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  sortOrder: number;
  assignedToId: string | null;
  assignedTo: CredentialUser | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingIdeaRow {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  stage: MarketingIdeaStage;
  priority: MarketingIdeaPriority;
  targetDate: string | null;
  tags: string[];
  ownerId: string;
  owner: CredentialUser;
  tasks: MarketingIdeaTaskRow[];
  _count: { tasks: number; socialPosts: number };
  createdAt: string;
  updatedAt: string;
}

export function useMarketingIdeas(filters: { search?: string; stage?: MarketingIdeaStage | ""; tag?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.tag) params.set("tag", filters.tag);
  const qs = params.toString();
  return useApiQuery<MarketingIdeaRow[]>(
    ["marketing-ideas", filters.search ?? "", filters.stage ?? "", filters.tag ?? ""],
    `/marketing-ideas${qs ? `?${qs}` : ""}`,
  );
}

export function useMarketingIdea(id: string | null) {
  return useApiQuery<MarketingIdeaRow & { socialPosts: Array<{ id: string; title: string | null; content: string; platform: string; status: string; scheduledAt: string | null; publishedAt: string | null; link: string | null }> }>(
    ["marketing-idea", id ?? ""],
    `/marketing-ideas/${id ?? ""}`,
    !!id,
  );
}

// ── Studio: Social posts ──

export type SocialPlatform =
  | "TWITTER"
  | "FACEBOOK"
  | "INSTAGRAM"
  | "LINKEDIN"
  | "YOUTUBE"
  | "TIKTOK"
  | "THREADS"
  | "PINTEREST"
  | "REDDIT"
  | "WHATSAPP"
  | "TELEGRAM"
  | "OTHER";

export type SocialPostStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED" | "CANCELLED";

export interface SocialPostRow {
  id: string;
  title: string | null;
  content: string;
  platform: SocialPlatform;
  status: SocialPostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  mediaUrls: string[];
  link: string | null;
  notes: string | null;
  marketingIdeaId: string | null;
  marketingIdea: { id: string; title: string; stage: MarketingIdeaStage } | null;
  ownerId: string;
  owner: CredentialUser;
  createdAt: string;
  updatedAt: string;
}

export function useSocialPosts(filters: {
  search?: string;
  platform?: SocialPlatform | "";
  status?: SocialPostStatus | "";
  from?: string;
  to?: string;
} = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.platform) params.set("platform", filters.platform);
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const qs = params.toString();
  return useApiQuery<SocialPostRow[]>(
    ["social-posts", filters.search ?? "", filters.platform ?? "", filters.status ?? "", filters.from ?? "", filters.to ?? ""],
    `/social-posts${qs ? `?${qs}` : ""}`,
  );
}

// ── Studio: Product ideas ──

export type ProductIdeaStatus =
  | "IDEA"
  | "VALIDATING"
  | "PLANNED"
  | "BUILDING"
  | "SHIPPED"
  | "REJECTED";

export interface ProductIdeaTaskRow {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  sortOrder: number;
  assignedToId: string | null;
  assignedTo: CredentialUser | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductIdeaRow {
  id: string;
  title: string;
  description: string | null;
  rationale: string | null;
  successMetric: string | null;
  status: ProductIdeaStatus;
  voteCount: number;
  targetDate: string | null;
  tags: string[];
  ownerId: string;
  owner: CredentialUser;
  tasks: ProductIdeaTaskRow[];
  votes: Array<{ id: string; userId: string }>;
  _count: { tasks: number };
  createdAt: string;
  updatedAt: string;
}

export function useProductIdeas(filters: { search?: string; status?: ProductIdeaStatus | ""; tag?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.tag) params.set("tag", filters.tag);
  const qs = params.toString();
  return useApiQuery<ProductIdeaRow[]>(
    ["product-ideas", filters.search ?? "", filters.status ?? "", filters.tag ?? ""],
    `/product-ideas${qs ? `?${qs}` : ""}`,
  );
}

export function useProductIdea(id: string | null) {
  return useApiQuery<ProductIdeaRow>(
    ["product-idea", id ?? ""],
    `/product-ideas/${id ?? ""}`,
    !!id,
  );
}

// ── Studio: Team tools ──

export type TeamToolCategory =
  | "AI"
  | "DESIGN"
  | "DEVELOPMENT"
  | "MARKETING"
  | "PRODUCTIVITY"
  | "ANALYTICS"
  | "COMMUNICATION"
  | "RESEARCH"
  | "OTHER";

export interface TeamToolRow {
  id: string;
  name: string;
  description: string | null;
  url: string;
  iconUrl: string | null;
  category: TeamToolCategory;
  isPinned: boolean;
  isAi: boolean;
  tags: string[];
  addedById: string;
  addedBy: CredentialUser;
  createdAt: string;
  updatedAt: string;
}

export function useTeamTools(filters: {
  search?: string;
  category?: TeamToolCategory | "";
  isAi?: boolean;
  isPinned?: boolean;
} = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.category) params.set("category", filters.category);
  if (filters.isAi !== undefined) params.set("isAi", String(filters.isAi));
  if (filters.isPinned !== undefined) params.set("isPinned", String(filters.isPinned));
  const qs = params.toString();
  return useApiQuery<TeamToolRow[]>(
    ["team-tools", filters.search ?? "", filters.category ?? "", String(filters.isAi ?? ""), String(filters.isPinned ?? "")],
    `/team-tools${qs ? `?${qs}` : ""}`,
  );
}

// ── User access overrides ──

export type AccessOverride = "GRANT" | "DENY";

export interface UserAccessRow {
  moduleKey: string;
  titles: string[];
  roleAllowed: boolean;
  override: AccessOverride | null;
  effective: boolean;
}

export interface UserAccessSnapshot {
  roles: string[];
  overrides: Array<{ moduleKey: string; override: AccessOverride }>;
}

export interface AdminUserAccessResponse {
  roles: string[];
  overrides: Array<{
    id: string;
    moduleKey: string;
    override: AccessOverride;
    note: string | null;
    createdAt: string;
    updatedAt: string;
    grantedBy: { id: string; firstName: string; lastName: string; email: string };
  }>;
}

/** Bootstrap snapshot for the sidebar. Returns the caller's roles +
 *  override rows; the sidebar unions them with the navigationItems
 *  baseline locally. */
export function useMyAccessSnapshot(enabled = true) {
  return useApiQuery<UserAccessSnapshot>(["user-access", "me"], "/user-access/me", enabled);
}

/** Admin view: target user's roles + their overrides. The matrix UI
 *  combines this with navigationItems to render the full module list. */
export function useUserAccessMatrix(userId: string | null) {
  return useApiQuery<AdminUserAccessResponse>(
    ["user-access", "matrix", userId ?? ""],
    `/user-access/${userId ?? ""}`,
    !!userId,
  );
}
