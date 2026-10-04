export interface HubKpis {
  headcount: number;
  newHiresThisMonth: number;
  attritionThisQuarter: number;
  averageTenureYears: number;
  openPositions: number; // placeholder — surfaced as 0 unless a "positions" table exists
  payrollCostMtd: number;
}

export interface HubAlert {
  id: string;
  kind: "LOW_ATTENDANCE" | "PROBATION_ENDING_SOON" | "CONTRACT_EXPIRING";
  userId: string;
  userName: string;
  detail: string;
  severity: "info" | "warning" | "destructive";
}

export interface HubAnniversary {
  userId: string;
  userName: string;
  joinDate: string;
  yearsAt: number; // tenure on the celebration date (1, 5, 10, ...)
  daysAway: number; // 0..7 — how many days from today
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
  headcountTrend: Array<{ label: string; value: number }>; // cumulative joins, last 12 months
  leaveRequestsTrend: Array<{ label: string; value: number }>; // last 12 months
  attendanceRateThisMonth: number; // 0-100, rounded
  // Raw numerator/denominator for the rate so the UI can show the math
  // ("28 / 30 expected") and the user can sanity-check the headline %.
  attendanceActualThisMonth: number;
  attendanceExpectedThisMonth: number;
}

export interface HubDirectorySnapshot {
  total: number;
  recentHires: Array<{
    userId: string;
    userName: string;
    designation: string;
    department: string;
    joinDate: string;
  }>;
}

export interface HubResponse {
  kpis: HubKpis;
  alerts: HubAlert[];
  anniversaries: HubAnniversary[];
  onboarding: HubOnboardingItem[];
  upcomingReviews: HubReviewItem[];
  pendingApprovals: HubPendingApproval[];
  charts: HubChartData;
  directorySnapshot: HubDirectorySnapshot;
}
