"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { DetailPageLayout } from "@/components/layouts/detail-page-layout";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { ProjectOverviewTab } from "@/components/projects/project-overview-tab";
import { ProjectTasksTab } from "@/components/projects/project-tasks-tab";
import { ProjectSprintsTab } from "@/components/projects/project-sprints-tab";
import { ProjectMilestonesTab } from "@/components/projects/project-milestones-tab";
import { ProjectProposalsTab } from "@/components/projects/project-proposals-tab";
import { ProjectWikiTab } from "@/components/projects/project-wiki-tab";
import { ProjectTimeTab } from "@/components/projects/project-time-tab";
import { ProjectGanttTab } from "@/components/projects/project-gantt-tab";
import { ProjectCalendarTab } from "@/components/projects/project-calendar-tab";
import { ProjectFinanceTab } from "@/components/projects/project-finance-tab";
import { ProjectAdminTab } from "@/components/projects/project-admin-tab";
import { useProject } from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/store/auth-store";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useProject(id);
  const router = useRouter();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  // Explicit allowlist so CLIENT (and any future role) doesn't accidentally
  // see internal time / workload data — `r !== "EMPLOYEE"` was a hole.
  const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "HR_MANAGER", "FINANCE_MANAGER"];
  const canSeeTime = roles.some((r) => STAFF_ROLES.includes(r));
  const canSeeBox = roles.some((r) => STAFF_ROLES.includes(r));
  const canSeeFinance = roles.some((r) =>
    ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER", "PROJECT_MANAGER"].includes(r),
  );

  if (query.isLoading) return <LoadingState label="Loading project..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load project." />;

  const project = query.data as {
    id: string;
    name: string;
    description?: string;
    status: string;
    budget?: number;
    startDate?: string;
    endDate?: string;
    client?: { companyName: string; email?: string; phone?: string };
    manager: { firstName: string; lastName: string; email: string };
    members: Array<{ user: { firstName: string; lastName: string } }>;
    milestones: Array<{ id: string; title: string; status: string; dueDate?: string }>;
    tasks: Array<{ id: string; title: string; status: string }>;
  };

  return (
    <DetailPageLayout
      module="projects"
      title={project.name}
      description={project.client?.companyName ?? ""}
      breadcrumbs={[
        { label: "Projects", href: "/projects" },
        { label: project.name },
      ]}
      tabs={[
        // ── Consolidated tabs (from 15 to 10) ─────────────────────────
        // Dropped as standalone tabs (functionality preserved via other surfaces):
        //   - Box → workload accessible via Tasks → group-by-assignee mode
        //   - Calendar → Timeline shows the same data with a richer gantt
        //   - Labels → moved under Settings
        //   - Recurring → moved under Settings
        // Merged: Budget + Payments → Finance
        // ───────────────────────────────────────────────────────────────
        {
          key: "overview",
          label: "Overview",
          content: <ProjectOverviewTab project={project} />,
        },
        {
          key: "tasks",
          label: "Tasks",
          count: project.tasks?.length ?? 0,
          content: <ProjectTasksTab projectId={project.id} />,
        },
        {
          key: "sprints",
          label: "Sprints",
          content: <ProjectSprintsTab projectId={project.id} />,
        },
        {
          key: "milestones",
          label: "Milestones",
          count: project.milestones?.length ?? 0,
          content: <ProjectMilestonesTab projectId={project.id} milestones={project.milestones ?? []} />,
        },
        {
          key: "timeline",
          label: "Timeline",
          content: <ProjectGanttTab projectId={project.id} />,
        },
        {
          key: "calendar",
          label: "Calendar",
          content: <ProjectCalendarTab projectId={project.id} />,
        },
        ...(canSeeTime
          ? [
              {
                key: "time",
                label: "Time",
                content: <ProjectTimeTab projectId={project.id} />,
              },
            ]
          : []),
        ...(canSeeFinance
          ? [
              {
                key: "finance",
                label: "Finance",
                content: <ProjectFinanceTab projectId={project.id} budget={Number(project.budget ?? 0)} />,
              },
              {
                key: "proposals",
                label: "Proposals",
                content: <ProjectProposalsTab projectId={project.id} />,
              },
            ]
          : []),
        {
          key: "wiki",
          label: "Wiki",
          content: <ProjectWikiTab projectId={project.id} />,
        },
        {
          key: "settings",
          label: "Settings",
          content: <ProjectAdminTab projectId={project.id} />,
        },
      ]}
      actions={[
        { label: "Back", onClick: () => router.push("/projects") },
      ]}
    />
  );
}
