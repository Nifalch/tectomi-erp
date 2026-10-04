"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiDelete } from "./client";
import { toast } from "@/lib/hooks/use-toast";

type TabKey =
  | "overview" | "attendance" | "leave" | "performance" | "payroll" | "career"
  | "projects" | "documents" | "assets" | "onboarding" | "timeline" | "notes";

export interface EmployeeOverview {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  status: string;
  joinDate: string | null;
  department: string | null;
  designation: string | null;
  employmentType: string | null;
  salary: number | null;
  hourlyRate: number | null;
  manager: string | null;
  emergencyContact: string | null;
  performanceScore: number | null;
  terminated: boolean;
  terminatedAt: string | null;
  isFounder: boolean;
  shiftStartHour: number | null;
  shiftEndHour: number | null;
  roles: Array<{ code: string; name: string }>;
  accessibleTabs: TabKey[];
}

const baseKey = (userId: string) => ["employee-profile", userId] as const;

export function useEmployeeProfile(userId: string) {
  return useQuery({
    queryKey: baseKey(userId),
    queryFn: () => apiFetch<EmployeeOverview>(`/hr/employees/${userId}`),
    enabled: !!userId,
  });
}

function useTabQuery<T>(userId: string, tab: TabKey, enabled = true) {
  return useQuery({
    queryKey: [...baseKey(userId), tab],
    queryFn: () => apiFetch<T>(`/hr/employees/${userId}/${tab}`),
    enabled: !!userId && enabled,
  });
}

export const useEmployeeAttendance = (userId: string, enabled = true) =>
  useTabQuery<{ records: Array<Record<string, unknown>> }>(userId, "attendance", enabled);
export const useEmployeeLeave = (userId: string, enabled = true) =>
  useTabQuery<{ requests: Array<Record<string, unknown>>; balances: Array<Record<string, unknown>> }>(
    userId, "leave", enabled,
  );
export const useEmployeePerformance = (userId: string, enabled = true) =>
  useTabQuery<{ reviews: Array<Record<string, unknown>>; goals: Array<Record<string, unknown>> }>(
    userId, "performance", enabled,
  );
export const useEmployeePayroll = (userId: string, enabled = true) =>
  useTabQuery<{
    salaryStructure: Record<string, unknown> | null;
    paySlips: Array<Record<string, unknown>>;
    isFounder: boolean;
    founderSummary: { lifetimeDeferred: number; ytdDeferred: number; monthsSubsidised: number } | null;
  }>(userId, "payroll", enabled);
export const useEmployeeCareer = (userId: string, enabled = true) =>
  useTabQuery<{ entries: Array<{ kind: string; id: string; effectiveDate: string; summary: string; details?: string | null }> }>(
    userId, "career", enabled,
  );
export const useEmployeeProjects = (userId: string, enabled = true) =>
  useTabQuery<{ projects: Array<Record<string, unknown>>; openTasks: Array<Record<string, unknown>>; completedTaskCount: number }>(
    userId, "projects", enabled,
  );
export const useEmployeeDocuments = (userId: string, enabled = true) =>
  useTabQuery<{ documents: Array<Record<string, unknown>> }>(userId, "documents", enabled);
export const useEmployeeAssets = (userId: string, enabled = true) =>
  useTabQuery<{ assets: Array<Record<string, unknown>> }>(userId, "assets", enabled);
export const useEmployeeOnboarding = (userId: string, enabled = true) =>
  useTabQuery<{ checklists: Array<Record<string, unknown>> }>(userId, "onboarding", enabled);
export const useEmployeeTimeline = (userId: string, enabled = true) =>
  useTabQuery<{ entries: Array<{ kind: string; id: string; at: string; summary: string; details?: string | null }> }>(
    userId, "timeline", enabled,
  );
export const useEmployeeNotes = (userId: string, enabled = true) =>
  useTabQuery<{ notes: Array<{ id: string; body: string; category: string; createdAt: string; author: { firstName: string; lastName: string } }> }>(
    userId, "notes", enabled,
  );

// ── Mutations ──

export function useAddHrNote(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { body: string; category?: string }) =>
      apiPost(`/hr/employees/${userId}/notes`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...baseKey(userId), "notes"] });
      toast({ variant: "success", title: "Note added" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to add note", description: err?.message }),
  });
}

export function useDeleteHrNote(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => apiDelete(`/hr/employees/${userId}/notes/${noteId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...baseKey(userId), "notes"] });
      toast({ variant: "success", title: "Note deleted" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to delete note", description: err?.message }),
  });
}

export function useAddCareerEvent(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type: string;
      fromValue?: string;
      toValue?: string;
      effectiveDate: string;
      reason?: string;
    }) => apiPost(`/hr/employees/${userId}/career-events`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: baseKey(userId) });
      toast({ variant: "success", title: "Career event logged" });
    },
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to log event", description: err?.message }),
  });
}

export function useResendInvite(userId: string) {
  return useMutation({
    mutationFn: () => apiPost<{ success: boolean; reason?: string; message?: string }>(`/hr/employees/${userId}/resend-invite`, {}),
    onSuccess: (data) =>
      toast({
        variant: data.success ? "success" : "info",
        title: data.success ? "Invite resent" : "No invite resent",
        description: data.reason ?? data.message,
      }),
    onError: (err: Error) =>
      toast({ variant: "error", title: "Failed to resend invite", description: err?.message }),
  });
}
