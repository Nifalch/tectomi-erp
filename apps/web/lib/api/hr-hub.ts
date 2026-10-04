"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost } from "./client";
import { toast } from "@/lib/hooks/use-toast";

export interface HubKpis {
  headcount: number;
  newHiresThisMonth: number;
  attritionThisQuarter: number;
  averageTenureYears: number;
  openPositions: number;
  payrollCostMtd: number;
}

export interface HubAlert {
  id: string;
  kind: string;
  userId: string;
  userName: string;
  detail: string;
  severity: "info" | "warning" | "destructive";
}

export interface HubAnniversary {
  userId: string;
  userName: string;
  joinDate: string;
  yearsAt: number;
  daysAway: number;
}

export interface HubOnboardingItem {
  userId: string;
  userName: string;
  checklistTitle: string;
  doneCount: number;
  totalCount: number;
  startedAt: string;
}

export interface HubReviewItem {
  reviewId: string;
  userId: string;
  userName: string;
  reviewType: string;
  scheduledFor: string | null;
  overdue: boolean;
}

export interface HubPendingApproval {
  kind: "LEAVE";
  id: string;
  userId: string;
  userName: string;
  summary: string;
  createdAt: string;
}

export interface HubChartData {
  departmentBreakdown: Array<{ label: string; value: number }>;
  headcountTrend: Array<{ label: string; value: number }>;
  leaveRequestsTrend: Array<{ label: string; value: number }>;
  attendanceRateThisMonth: number;
  attendanceActualThisMonth: number;
  attendanceExpectedThisMonth: number;
}

export interface HubResponse {
  kpis: HubKpis;
  alerts: HubAlert[];
  anniversaries: HubAnniversary[];
  onboarding: HubOnboardingItem[];
  upcomingReviews: HubReviewItem[];
  pendingApprovals: HubPendingApproval[];
  charts: HubChartData;
  directorySnapshot: {
    total: number;
    recentHires: Array<{ userId: string; userName: string; designation: string; department: string; joinDate: string }>;
  };
}

export interface OrgNode {
  userId: string;
  name: string;
  designation: string;
  department: string;
  avatarUrl: string | null;
  reports: OrgNode[];
}

export interface DirectoryEntry {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  department: string;
  designation: string;
  employmentType: string;
  joinDate: string;
  terminated: boolean;
  managerLabel: string | null;
}

export function useHrHub() {
  return useQuery({
    queryKey: ["hr-hub"],
    queryFn: () => apiFetch<HubResponse>("/hr/hub"),
  });
}

export function useOrgChart() {
  return useQuery({
    queryKey: ["hr-org-chart"],
    queryFn: () => apiFetch<{ roots: OrgNode[] }>("/hr/org-chart"),
  });
}

export interface DirectoryFilters {
  search?: string;
  department?: string;
  employmentType?: string;
  managerId?: string;
  active?: "true" | "false";
  page?: number;
  pageSize?: number;
}

export function useEmployeeDirectory(filters: DirectoryFilters) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== "") qs.set(k, String(v));
  }
  const url = `/hr/employees${qs.toString() ? `?${qs.toString()}` : ""}`;
  return useQuery({
    queryKey: ["hr-directory", JSON.stringify(filters)],
    queryFn: () =>
      apiFetch<{ data: DirectoryEntry[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }>(url),
  });
}

export function useTerminateEmployee(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { effectiveDate: string; reason?: string }) =>
      apiPost<{ success: boolean; releasedAssetCount: number }>(`/hr/employees/${userId}/terminate`, data),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["hr-hub"] });
      void qc.invalidateQueries({ queryKey: ["hr-directory"] });
      void qc.invalidateQueries({ queryKey: ["employee-profile", userId] });
      // Also blow user-list caches so the now-terminated employee
      // disappears from project member / assignee pickers immediately.
      void qc.invalidateQueries({ queryKey: ["users"] });
      toast({
        variant: "success",
        title: "Employee terminated",
        description: `${data.releasedAssetCount} asset(s) released.`,
      });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to terminate", description: err?.message }),
  });
}

export function useReactivateEmployee(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { reason?: string } = {}) =>
      apiPost<{ success: boolean }>(`/hr/employees/${userId}/reactivate`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["hr-hub"] });
      void qc.invalidateQueries({ queryKey: ["hr-directory"] });
      void qc.invalidateQueries({ queryKey: ["employee-profile", userId] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      toast({ variant: "success", title: "Employee reactivated" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to reactivate", description: err?.message }),
  });
}
