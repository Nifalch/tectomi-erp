export const MODULE_KEYS = [
  "dashboard", "projects", "tasks", "clients", "hr",
  "attendance", "leave", "time", "accounts", "invoices",
  "proposals", "resources", "documents", "reports", "settings",
  "vault",
  // Studio bucket — marketing planner, social planner, product ideas, tools
  "marketing", "social", "ideas", "tools",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_META: Record<ModuleKey, { label: string; hex: string; group: "main" | "people" | "finance" | "more" }> = {
  dashboard:  { label: "Dashboard",   hex: "#3b82f6", group: "main" },
  projects:   { label: "Projects",    hex: "#8b5cf6", group: "main" },
  tasks:      { label: "Tasks",       hex: "#f59e0b", group: "main" },
  clients:    { label: "Clients",     hex: "#06b6d4", group: "main" },
  hr:         { label: "HR & Team",   hex: "#ec4899", group: "people" },
  attendance: { label: "Attendance",  hex: "#14b8a6", group: "people" },
  leave:      { label: "Leave",       hex: "#a855f7", group: "people" },
  time:       { label: "Time",        hex: "#6366f1", group: "people" },
  accounts:   { label: "Accounts",    hex: "#22c55e", group: "finance" },
  invoices:   { label: "Invoices",    hex: "#10b981", group: "finance" },
  proposals:  { label: "Proposals",   hex: "#0ea5e9", group: "finance" },
  resources:  { label: "Resources",   hex: "#f97316", group: "more" },
  documents:  { label: "Documents",   hex: "#64748b", group: "more" },
  reports:    { label: "Reports",     hex: "#f43f5e", group: "more" },
  settings:   { label: "Settings",    hex: "#78716c", group: "more" },
  // Credential vault — slate to read as "secure / locked"
  vault:      { label: "Vault",       hex: "#475569", group: "more" },
  // Studio — creative work that powers the company beyond client deliverables
  marketing:  { label: "Marketing",   hex: "#db2777", group: "more" },
  social:     { label: "Social",      hex: "#f97316", group: "more" },
  ideas:      { label: "Ideas",       hex: "#7c3aed", group: "more" },
  tools:      { label: "Tools",       hex: "#0ea5e9", group: "more" },
};

export const GROUP_LABELS: Record<string, string> = {
  main: "Main",
  people: "People",
  finance: "Finance",
  more: "More",
};
