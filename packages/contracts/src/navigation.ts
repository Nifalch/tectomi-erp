import type { AppRole } from "./rbac";
import type { ModuleKey } from "./modules";

/**
 * Sidebar section a nav item belongs to. Items are rendered in this order:
 *
 *   workspace → projects → crm → people → time → finance → docs → ops → settings
 *
 * `moduleKey` still drives color/icon theming per item; `group` decides which
 * sidebar section the row lives under. Multiple items can share a moduleKey
 * but live in different groups (e.g. Announcements under `people`, but HR's
 * own admin page also under `people`).
 */
export type NavGroup =
  | "workspace" // Dashboard, Notifications, Chat
  | "projects"  // Projects, Portfolio, Tasks, My Tasks, Goals, Calendar
  | "crm"       // Clients, Leads, Contacts, Deals, Proposals, Estimates
  | "people"    // HR, Attendance, Leave, Shifts, Holidays, Announcements, Assets, Performance, Payroll
  | "time"      // Time, Timesheets, Time Approvals
  | "finance"   // Invoices, Bills, Payments, Credit Notes, Bank Accounts, etc.
  | "studio"    // Marketing, Social planner, Product ideas, Team tools
  | "docs"      // Documents, Knowledge Base, Templates
  | "vault"     // Credentials & secrets store
  | "ops"       // Resources, Vendors, Reports
  | "settings"; // Settings, Custom Fields

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  workspace: "Workspace",
  projects: "Project Management",
  crm: "CRM & Sales",
  people: "HR & People",
  time: "Time Tracking",
  finance: "Finance",
  studio: "Studio",
  docs: "Documents",
  vault: "Vault",
  ops: "Operations",
  settings: "Settings",
};

export const NAV_GROUP_ORDER: NavGroup[] = [
  "workspace",
  "projects",
  "crm",
  "people",
  "time",
  "finance",
  "studio",
  "docs",
  "vault",
  "ops",
  "settings",
];

export type NavigationItem = {
  title: string;
  href: string;
  roles: AppRole[];
  description: string;
  moduleKey: ModuleKey;
  group: NavGroup;
  /**
   * Hide from the sidebar. The route still exists and is reachable directly,
   * so power users can flip a flag later or deep-link from anywhere.
   */
  hidden?: boolean;
};

export const navigationItems: NavigationItem[] = [
  // ── Workspace ──
  { title: "Dashboard", href: "/dashboard", moduleKey: "dashboard", group: "workspace",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","HR_MANAGER","FINANCE_MANAGER","EMPLOYEE","CLIENT"],
    description: "Role-aware overview of delivery, people, and finance." },
  { title: "Notifications", href: "/notifications", moduleKey: "dashboard", group: "workspace",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","HR_MANAGER","FINANCE_MANAGER","EMPLOYEE","CLIENT"],
    description: "Your assignments, mentions, and task activity." },
  // Chat is available everywhere via the floating widget (bottom-right) —
  // keeping it out of the sidebar to avoid duplicate entry points. The
  // /chat page still works if linked directly.

  // ── Project Management ──
  { title: "Projects", href: "/projects", moduleKey: "projects", group: "projects",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","EMPLOYEE","CLIENT"],
    description: "Projects, milestones, assignments, and delivery status." },
  // Portfolio merged into /projects?view=health — one entry point, two tabs.
  { title: "Tasks", href: "/tasks", moduleKey: "tasks", group: "projects",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","EMPLOYEE"],
    description: "Kanban execution, due dates, owners, and comments." },
  { title: "My Tasks", href: "/my-tasks", moduleKey: "tasks", group: "projects",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","HR_MANAGER","EMPLOYEE"],
    description: "Your tasks across every project, grouped by urgency." },
  { title: "Goals", href: "/goals", moduleKey: "dashboard", group: "projects",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","HR_MANAGER","EMPLOYEE"],
    description: "OKRs, KPIs, and goal tracking." },
  { title: "Calendar", href: "/calendar", moduleKey: "dashboard", group: "projects",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","HR_MANAGER","FINANCE_MANAGER","EMPLOYEE"],
    description: "Meetings, appointments, and events." },

  // ── CRM & Sales ──
  { title: "Clients", href: "/clients", moduleKey: "clients", group: "crm",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","FINANCE_MANAGER"],
    description: "Client profiles, contracts, project history, and billing context." },
  { title: "Leads", href: "/leads", moduleKey: "clients", group: "crm",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER"],
    description: "Lead pipeline, deal tracking, and client conversion." },
  { title: "Contacts", href: "/contacts", moduleKey: "clients", group: "crm",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER"],
    description: "Client-side contacts and decision makers." },
  { title: "Deals", href: "/deals", moduleKey: "clients", group: "crm",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER"],
    description: "Sales pipeline and opportunity tracking." },
  { title: "Proposals", href: "/proposals", moduleKey: "proposals", group: "crm",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","FINANCE_MANAGER"],
    description: "Proposal drafts, reusable blocks, and exported documents." },
  { title: "Estimates", href: "/estimates", moduleKey: "proposals", group: "crm",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER","PROJECT_MANAGER"],
    description: "Quotes and estimates, convertible to invoices." },

  // ── HR & People ──
  { title: "HR", href: "/hr", moduleKey: "hr", group: "people",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER"],
    description: "Employees, attendance, leave, and performance." },
  { title: "Founders", href: "/founders", moduleKey: "hr", group: "people",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER"],
    description: "Co-founder capital accounts, deferred salary, and equity stake." },
  { title: "Cap Table", href: "/cap-table", moduleKey: "hr", group: "people",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER"],
    description: "Equity grants, vesting schedule, and company valuation." },
  { title: "Attendance", href: "/attendance", moduleKey: "attendance", group: "people",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER","EMPLOYEE"],
    description: "Clock-in records, team attendance, and daily work hours." },
  { title: "Leave", href: "/leave", moduleKey: "leave", group: "people",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER","EMPLOYEE"],
    description: "Leave requests, approvals, and balances." },
  { title: "Holidays", href: "/holidays", moduleKey: "attendance", group: "people",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER","EMPLOYEE"],
    description: "Company holidays and day-off calendar." },
  { title: "Announcements", href: "/announcements", moduleKey: "hr", group: "people",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER","PROJECT_MANAGER","FINANCE_MANAGER","EMPLOYEE"],
    description: "Company announcements and notices." },
  { title: "Assets", href: "/assets", moduleKey: "hr", group: "people",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER"],
    description: "Company assets, assignments, and tracking." },
  { title: "Performance", href: "/performance", moduleKey: "hr", group: "people",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER","PROJECT_MANAGER","EMPLOYEE"],
    description: "Review cycles, self-reviews, and 360 feedback." },
  { title: "My Performance", href: "/my-performance", moduleKey: "time", group: "people",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER","PROJECT_MANAGER","EMPLOYEE"],
    description: "Personal time, throughput, and task completion analytics." },
  { title: "Payroll", href: "/payroll", moduleKey: "hr", group: "people",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER","FINANCE_MANAGER","EMPLOYEE"],
    description: "Salary structures, pay runs, and pay slips." },

  // ── Time Tracking ──
  // Consolidated from 3 items to 2: the old "Timesheets" page now lives as
  // a "My Week" pill inside /time, and entry-level approvals are folded into
  // /time/approvals as a week-level approval queue.
  { title: "Time", href: "/time", moduleKey: "time", group: "time",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","EMPLOYEE"],
    description: "Log time and submit your weekly timesheet." },
  { title: "Approvals", href: "/time/approvals", moduleKey: "time", group: "time",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","HR_MANAGER"],
    description: "Approve weekly timesheets submitted by the team." },

  // ── Finance ──
  { title: "Finance", href: "/finance", moduleKey: "accounts", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "Revenue, expenses, invoices, and accounting flows." },
  { title: "Main Account", href: "/finance/main", moduleKey: "accounts", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "Live cash position, auto-posted journal entries, and founder sub-accounts." },
  { title: "Invoices", href: "/invoices", moduleKey: "invoices", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER","CLIENT"],
    description: "Invoice lifecycle, payment status, and PDF exports." },
  { title: "Recurring Invoices", href: "/recurring-invoices", moduleKey: "invoices", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "Schedule invoices that repeat automatically." },
  { title: "Bills", href: "/bills", moduleKey: "accounts", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "Vendor bills and supplier invoices." },
  { title: "Expenses", href: "/expenses", moduleKey: "accounts", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "Operating expenses, rent, subscriptions, utilities — anything that drains the main account." },
  { title: "Payments", href: "/payments", moduleKey: "accounts", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "Received and made payments with allocations." },
  { title: "Credit Notes", href: "/credit-notes", moduleKey: "accounts", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "Credits issued to clients against invoices.",
    hidden: true },
  { title: "Items", href: "/items", moduleKey: "accounts", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "Catalog of goods and services for invoices and bills." },
  { title: "Bank Accounts", href: "/bank-accounts", moduleKey: "accounts", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "Bank balances and transactions." },
  { title: "Chart of Accounts", href: "/chart-of-accounts", moduleKey: "accounts", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "Ledger accounts grouped by type.",
    hidden: true },
  { title: "Tax Rates", href: "/tax-rates", moduleKey: "accounts", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "GST/VAT rates used on invoices and bills." },
  { title: "Journal Entries", href: "/journal-entries", moduleKey: "accounts", group: "finance",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "Manual general ledger entries.",
    hidden: true },

  // ── Documents ──
  { title: "Documents", href: "/documents", moduleKey: "documents", group: "docs",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","HR_MANAGER","FINANCE_MANAGER","EMPLOYEE","CLIENT"],
    description: "Shared files linked to projects, clients, and employees." },
  { title: "Knowledge Base", href: "/knowledge", moduleKey: "documents", group: "docs",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","HR_MANAGER","FINANCE_MANAGER","EMPLOYEE"],
    description: "Internal wiki, guides, and documentation." },
  { title: "Templates", href: "/templates", moduleKey: "documents", group: "docs",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER"],
    description: "Email and document templates." },

  // ── Studio ──
  { title: "Marketing", href: "/marketing", moduleKey: "marketing", group: "studio",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER","PROJECT_MANAGER","FINANCE_MANAGER","EMPLOYEE"],
    description: "Marketing ideas, campaigns, and content with stage-based progress." },
  { title: "Social Planner", href: "/social-planner", moduleKey: "social", group: "studio",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER","PROJECT_MANAGER","FINANCE_MANAGER","EMPLOYEE"],
    description: "Calendar of scheduled and published social media posts across platforms." },
  { title: "Ideas", href: "/product-ideas", moduleKey: "ideas", group: "studio",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER","PROJECT_MANAGER","FINANCE_MANAGER","EMPLOYEE"],
    description: "Product idea backlog with rationale, success metrics, and team votes." },
  { title: "Tools", href: "/tools", moduleKey: "tools", group: "studio",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER","PROJECT_MANAGER","FINANCE_MANAGER","EMPLOYEE"],
    description: "Directory of AI and team tools the workspace uses day-to-day." },

  // ── Vault ──
  { title: "Credentials", href: "/credentials", moduleKey: "vault", group: "vault",
    roles: ["SUPER_ADMIN","ADMIN","HR_MANAGER","PROJECT_MANAGER","FINANCE_MANAGER","EMPLOYEE"],
    description: "Encrypted store for shared passwords, API keys, SSH keys, certificates, and notes." },

  // ── Operations ──
  { title: "Resources", href: "/resources", moduleKey: "resources", group: "ops",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER"],
    description: "Capacity planning, workload visibility, and allocations." },
  { title: "Vendors", href: "/vendors", moduleKey: "accounts", group: "ops",
    roles: ["SUPER_ADMIN","ADMIN","FINANCE_MANAGER"],
    description: "Vendor profiles and management." },
  { title: "Reports", href: "/reports", moduleKey: "reports", group: "ops",
    roles: ["SUPER_ADMIN","ADMIN","PROJECT_MANAGER","HR_MANAGER","FINANCE_MANAGER"],
    description: "Operational and financial reporting with exports." },

  // ── Settings ──
  { title: "Settings", href: "/settings", moduleKey: "settings", group: "settings",
    roles: ["SUPER_ADMIN","ADMIN"],
    description: "Workspace controls, permissions, integrations, and policies. Custom Fields available from the General tab." },
];
