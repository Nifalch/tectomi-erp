export type StatCard = {
  title: string;
  value: string;
  delta?: string;
  tone?: "neutral" | "positive" | "warning";
};

export type KanbanColumn = {
  id: string;
  title: string;
  count: number;
};

export type DashboardSnapshot = {
  revenueYtd: number;
  activeProjects: number;
  pendingInvoices: number;
  employeesOnline: number;
};

