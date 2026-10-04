"use client";

import { useParams, useSearchParams } from "next/navigation";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeProfile } from "@/lib/api/employee-profile";
import { EmployeeHeader } from "@/components/hr/employee/employee-header";
import { EmployeeQuickStats } from "@/components/hr/employee/employee-quick-stats";
import { EmployeeTabBar } from "@/components/hr/employee/employee-tab-bar";
import { OverviewTab } from "@/components/hr/employee/tabs/overview-tab";
import { AttendanceTab } from "@/components/hr/employee/tabs/attendance-tab";
import { LeaveTab } from "@/components/hr/employee/tabs/leave-tab";
import { PerformanceTab } from "@/components/hr/employee/tabs/performance-tab";
import { PayrollTab } from "@/components/hr/employee/tabs/payroll-tab";
import { CareerTab } from "@/components/hr/employee/tabs/career-tab";
import { ProjectsTab } from "@/components/hr/employee/tabs/projects-tab";
import { DocumentsTab } from "@/components/hr/employee/tabs/documents-tab";
import { AssetsTab } from "@/components/hr/employee/tabs/assets-tab";
import { OnboardingTab } from "@/components/hr/employee/tabs/onboarding-tab";
import { TimelineTab } from "@/components/hr/employee/tabs/timeline-tab";
import { NotesTab } from "@/components/hr/employee/tabs/notes-tab";
import { AccessTab } from "@/components/hr/employee/tabs/access-tab";

export default function EmployeeDetailPage() {
  const params = useParams<{ userId: string }>();
  const search = useSearchParams();
  const userId = params.userId;
  const activeTab = search.get("tab") ?? "overview";

  const profile = useEmployeeProfile(userId);

  if (profile.isLoading) return <LoadingState label="Loading profile..." />;
  if (profile.isError || !profile.data) return <ErrorState label="Unable to load profile." />;

  const employee = profile.data;

  return (
    <div className="flex flex-col gap-6">
      <EmployeeHeader employee={employee} />
      <EmployeeQuickStats employee={employee} />
      <EmployeeTabBar activeTab={activeTab} accessibleTabs={employee.accessibleTabs} />
      {/* Tab body */}
      {activeTab === "overview" && <OverviewTab employee={employee} />}
      {activeTab === "attendance" && <AttendanceTab userId={userId} />}
      {activeTab === "leave" && <LeaveTab userId={userId} />}
      {activeTab === "performance" && <PerformanceTab userId={userId} />}
      {activeTab === "payroll" && <PayrollTab userId={userId} />}
      {activeTab === "career" && <CareerTab userId={userId} />}
      {activeTab === "projects" && <ProjectsTab userId={userId} />}
      {activeTab === "documents" && <DocumentsTab userId={userId} />}
      {activeTab === "assets" && <AssetsTab userId={userId} />}
      {activeTab === "onboarding" && <OnboardingTab userId={userId} />}
      {activeTab === "timeline" && <TimelineTab userId={userId} />}
      {activeTab === "notes" && <NotesTab userId={userId} />}
      {activeTab === "access" && <AccessTab userId={userId} />}
    </div>
  );
}
