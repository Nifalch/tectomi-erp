"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Clock, ListChecks, Flag, CheckCircle2,
  CircleDashed, Loader2, Activity, Calendar, Mail, Phone,
  ExternalLink, Wallet, Receipt, ChevronRight,
} from "lucide-react";
import { portalApi } from "@/lib/portal-api";
import { usePortalRefresh } from "@/lib/hooks/use-portal-refresh";

interface Milestone { id: string; title: string; dueDate: string | null; status: string }
interface RecentUpdate { id: string; title: string; status: string; at: string; kind: "completed" | "in_progress" | "update" }

interface PaymentCycleEntry {
  id: string;
  label: string;
  percentage: number;
  isExtra?: boolean;
  amount: number;
  status: string;
  dueDate: string | null;
  invoice: { id: string; number: string; status: string; total: number } | null;
}

interface ProjectDetail {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  milestones: Milestone[];
  stats: {
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    todoTasks: number;
    completionPercent: number;
    hoursLogged: number;
    milestoneCount: number;
    completedMilestones: number;
  };
  finance: {
    budget: number;
    invoicedTotal: number;
    invoiceCount: number;
    paidTotal: number;
    outstanding: number;
  };
  paymentCycle: PaymentCycleEntry[];
  invoices?: Array<{
    id: string;
    number: string;
    total: number;
    status: string;
    issueDate: string;
    dueDate: string | null;
  }>;
  manager: { id: string; name: string; email: string; phone: string | null; avatarUrl: string | null } | null;
  recentUpdates: RecentUpdate[];
}

interface PortalTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  priority: string | null;
  progressPercent: number;
  assignee: { name: string | null; avatarUrl: string | null } | null;
}

const PROJECT_TONE: Record<string, string> = {
  ACTIVE:    "var(--emerald)",
  ON_HOLD:   "var(--gold)",
  COMPLETED: "var(--sky)",
  CANCELLED: "var(--rose)",
  PLANNING:  "var(--muted)",
};

const TASK_STATUS_TONE: Record<string, string> = {
  TODO:        "var(--muted)",
  IN_PROGRESS: "var(--gold)",
  DONE:        "var(--emerald)",
  REVIEW:      "var(--sky)",
  BACKLOG:     "var(--muted-2)",
};

const MILESTONE_TONE: Record<string, string> = {
  NOT_STARTED: "var(--muted)",
  IN_PROGRESS: "var(--gold)",
  BLOCKED:     "var(--rose)",
  DONE:        "var(--emerald)",
};

function fmtRel(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtDateLong(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function fmtMoney(v: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v ?? 0));
}

// Tones used by both the milestone-status pill and the invoice-status
// chip in the project invoice list. Covers the union of both enum sets.
const PAYMENT_STATUS_TONE: Record<string, { color: string; label: string }> = {
  // Milestone statuses
  PENDING:  { color: "var(--muted)",  label: "Pending" },
  INVOICED: { color: "var(--sky)",    label: "Invoiced" },
  PAID:     { color: "var(--emerald)", label: "Paid" },
  OVERDUE:  { color: "var(--rose)",   label: "Overdue" },
  // Invoice statuses (PAID + OVERDUE already covered above)
  SENT:     { color: "var(--sky)",    label: "Sent" },
  PARTIAL:  { color: "var(--gold)",   label: "Partial" },
  DRAFT:    { color: "var(--muted)",  label: "Draft" },
  VOID:     { color: "var(--muted-2)", label: "Void" },
};

export default function PortalProjectDetail() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tasks, setTasks] = useState<PortalTask[]>([]);
  // Chat tab + per-project chat surface removed; the floating portal chat
  // widget (mounted in the layout) handles all client → team messaging in
  // one place. Project page now focuses on status + work artefacts.
  const [tab, setTab] = useState<"updates" | "tasks" | "milestones" | "budget">("updates");

  const [loadErr, setLoadErr] = useState<string | null>(null);
  usePortalRefresh(() => {
    setLoadErr(null);
    Promise.all([
      portalApi.projects.detail(id).then((d) => setProject(d as ProjectDetail)),
      portalApi.projects.tasks(id).then((d) => setTasks(d as PortalTask[])),
    ]).catch((e: Error) => setLoadErr(e.message ?? "Unable to load project."));
  }, id);

  if (loadErr && !project) {
    return (
      <div className="portal-card p-6" style={{ borderColor: "var(--rose)", color: "var(--rose)" }}>
        <div className="font-medium">Unable to load project</div>
        <p className="mt-1 text-sm">{loadErr}</p>
      </div>
    );
  }
  if (!project) {
    return <p style={{ color: "var(--muted)" }}>Loading project…</p>;
  }

  const accent = PROJECT_TONE[project.status] ?? PROJECT_TONE.PLANNING;
  const { stats, manager } = project;

  return (
    <div className="space-y-6">
      <Link href="/portal/projects" className="portal-eyebrow inline-flex items-center gap-1.5 hover:opacity-70">
        <ArrowLeft className="size-3" /> All projects
      </Link>

      {/* Hero */}
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="portal-pill" style={{ color: accent }}>
            <span className="dot" />
            {project.status.replace("_", " ")}
          </span>
          {project.startDate && (
            <span className="portal-eyebrow inline-flex items-center gap-1">
              <Calendar className="size-3" />
              {fmtDateLong(project.startDate)}
              {project.endDate && ` → ${fmtDateLong(project.endDate)}`}
            </span>
          )}
        </div>
        <h1 className="portal-title mt-3 text-[24px] sm:text-[32px] md:text-[42px]">{project.name}</h1>
        {project.description && (
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed sm:text-[15px]" style={{ color: "var(--ink-soft)" }}>
            {project.description}
          </p>
        )}
      </header>

      {/* Two-column: progress + project coordinator */}
      <section className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <div className="portal-card p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <span className="portal-eyebrow">Overall progress</span>
            <span className="portal-num text-[22px] font-semibold sm:text-[24px]" style={{ color: "var(--ink)" }}>
              {stats.completionPercent}<span style={{ color: "var(--muted-2)" }}>%</span>
            </span>
          </div>
          <div className="portal-progress mt-3" style={{ height: "10px" }}>
            <span style={{ width: `${stats.completionPercent}%` }} />
          </div>
          {/* 3-stat row — no team count. */}
          <div className="mt-5 grid grid-cols-3 gap-x-4 sm:gap-x-8">
            <Mini label="Tasks done" value={`${stats.completedTasks}/${stats.totalTasks}`} sub={stats.inProgressTasks > 0 ? `${stats.inProgressTasks} in progress` : undefined} />
            <Mini label="Milestones" value={`${stats.completedMilestones}/${stats.milestoneCount}`} />
            <Mini label="Hours logged" value={stats.hoursLogged.toFixed(1)} />
          </div>
        </div>

        {/* Project coordinator — single contact, prominent. No team grid. */}
        {manager ? (
          <aside className="portal-card-warm p-5 sm:p-6">
            <div className="portal-eyebrow">Project coordinator</div>
            <div className="mt-3 flex items-center gap-3">
              {manager.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={manager.avatarUrl} alt={manager.name} className="size-12 rounded-full object-cover" />
              ) : (
                <div
                  className="flex size-12 items-center justify-center rounded-full text-[14px] font-semibold"
                  style={{ background: "var(--ink)", color: "var(--paper)" }}
                >
                  {(manager.name ?? "")
                    .split(" ")
                    .map((w) => w?.[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "?"}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
                  {manager.name}
                </div>
                <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                  Your single point of contact
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-[13px]">
              <a
                href={`mailto:${manager.email}`}
                className="group flex items-center gap-2"
                style={{ color: "var(--ink-soft)" }}
              >
                <Mail className="size-3.5" />
                <span className="truncate">{manager.email}</span>
                <ExternalLink className="size-3 opacity-0 transition group-hover:opacity-100" />
              </a>
              {manager.phone && (
                <a
                  href={`tel:${manager.phone}`}
                  className="flex items-center gap-2"
                  style={{ color: "var(--ink-soft)" }}
                >
                  <Phone className="size-3.5" />
                  <span>{manager.phone}</span>
                </a>
              )}
            </div>
            <div className="portal-hairline mt-4" />
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`mailto:${manager.email}`} className="portal-btn-ghost text-[12px]">
                <Mail className="size-3.5" /> Email
              </a>
            </div>
          </aside>
        ) : (
          <aside className="portal-card p-5 sm:p-6">
            <div className="portal-eyebrow">Project coordinator</div>
            <p className="mt-3 text-[14px]" style={{ color: "var(--muted)" }}>
              Not assigned yet. Reach support via the footer.
            </p>
          </aside>
        )}
      </section>

      {/* Tabs — Chat tab removed; messaging lives in the floating chat
          widget mounted in the portal layout. */}
      <div className="-mx-4 overflow-x-auto sm:mx-0" style={{ borderBottom: "1px solid var(--rule)" }}>
        <nav className="-mb-px flex min-w-max gap-1 px-4 sm:min-w-0 sm:px-0">
          {([
            { key: "updates", label: "Updates", icon: Activity },
            { key: "tasks", label: "Tasks", icon: ListChecks },
            { key: "milestones", label: "Milestones", icon: Flag },
            { key: "budget", label: "Budget", icon: Wallet },
          ] as const).map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition sm:px-4 sm:py-3"
                style={{
                  borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
                  color: active ? "var(--ink)" : "var(--muted)",
                }}
              >
                <Icon className="size-3.5" /> {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === "updates" && (
        <section className="portal-card">
          {project.recentUpdates.length === 0 ? (
            <EmptyText text="No recent updates. We'll post here as work progresses." />
          ) : (
            <ul>
              {project.recentUpdates.map((u, idx) => (
                <li key={u.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--rule-soft)" }}>
                  <div className="flex items-start gap-3 px-5 py-3.5">
                    <div className="mt-0.5 shrink-0">
                      {u.kind === "completed"
                        ? <CheckCircle2 className="size-4" style={{ color: "var(--emerald)" }} />
                        : u.kind === "in_progress"
                          ? <Loader2 className="size-4" style={{ color: "var(--gold)" }} />
                          : <CircleDashed className="size-4" style={{ color: "var(--muted-2)" }} />
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px]" style={{ color: "var(--ink-soft)" }}>
                        {u.kind === "completed"
                          ? <>Completed <span className="font-semibold" style={{ color: "var(--ink)" }}>{u.title}</span></>
                          : u.kind === "in_progress"
                            ? <>Working on <span className="font-semibold" style={{ color: "var(--ink)" }}>{u.title}</span></>
                            : <>Updated <span className="font-semibold" style={{ color: "var(--ink)" }}>{u.title}</span></>
                        }
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--muted)" }}>{fmtRel(u.at)}</p>
                    </div>
                    <span className="portal-pill shrink-0" style={{ color: TASK_STATUS_TONE[u.status] ?? "var(--muted)" }}>
                      <span className="dot" /> {u.status.replace("_", " ")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "tasks" && (
        <section className="portal-card">
          {tasks.length === 0 ? (
            <EmptyText text="No client-visible tasks yet." />
          ) : (
            <ul>
              {tasks.map((t, idx) => (
                <li key={t.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--rule-soft)" }}>
                  <div className="flex items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full" style={{ background: TASK_STATUS_TONE[t.status] ?? "var(--muted)" }} />
                        <span className="text-[14px] font-medium" style={{ color: "var(--ink)" }}>{t.title}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: "var(--muted)" }}>
                        <span className="portal-eyebrow" style={{ color: TASK_STATUS_TONE[t.status] ?? "var(--muted)" }}>
                          {t.status.replace("_", " ")}
                        </span>
                        {t.dueDate && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="size-3" /> Due {fmtDateLong(t.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    {t.progressPercent > 0 && t.status !== "DONE" && (
                      <div className="w-24 shrink-0">
                        <div className="portal-num mb-1 text-right text-[10px]" style={{ color: "var(--muted-2)" }}>
                          {t.progressPercent}%
                        </div>
                        <div className="portal-progress" style={{ height: "4px" }}>
                          <span style={{ width: `${t.progressPercent}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "milestones" && (
        <section className="portal-card">
          {project.milestones.length === 0 ? (
            <EmptyText text="No milestones set yet." />
          ) : (
            <ul>
              {project.milestones.map((m, idx) => (
                <li key={m.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--rule-soft)" }}>
                  <div className="flex items-center gap-3 px-5 py-4">
                    <Flag className="size-4" style={{ color: MILESTONE_TONE[m.status] ?? "var(--muted)" }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium" style={{ color: "var(--ink)" }}>{m.title}</div>
                      {m.dueDate && (
                        <div className="text-[11px]" style={{ color: "var(--muted)" }}>Due {fmtDateLong(m.dueDate)}</div>
                      )}
                    </div>
                    <span className="portal-pill" style={{ color: MILESTONE_TONE[m.status] ?? "var(--muted)" }}>
                      <span className="dot" /> {m.status.replace("_", " ")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "budget" && (
        <section className="space-y-5">
          {/*
            Per request: only Project Budget + invoice details on this tab.
            "Paid by you" and "Outstanding" tiles were dropping confusion
            on the client because the tile math sometimes diverged from
            what they saw on individual invoices (e.g. legacy PAID
            invoices without backing payment records). The Project
            Budget headline + the per-invoice list is the cleanest read.
          */}
          <div className="grid gap-3 sm:grid-cols-2">
            <BudgetTile
              label="Project budget"
              value={fmtMoney(project.finance.budget)}
              icon={<Wallet className="size-3.5" style={{ color: "var(--ink-soft)" }} />}
            />
            <BudgetTile
              label="Invoiced so far"
              value={fmtMoney(project.finance.invoicedTotal)}
              sub={`${project.finance.invoiceCount} invoice${project.finance.invoiceCount === 1 ? "" : "s"}`}
              icon={<Receipt className="size-3.5" style={{ color: "var(--sky)" }} />}
            />
          </div>

          {/* Payment cycle — schedule of payments per the project plan.
              The headline amount is now the expected milestone amount
              (budget × percentage). The linked invoice (if any) shows
              underneath with its actual total — when the two don't
              match, the discrepancy is visible so the client can flag
              it without having to do the math themselves. */}
          {(() => {
            const regulars = project.paymentCycle.filter((p) => !p.isExtra);
            const extras = project.paymentCycle.filter((p) => p.isExtra);
            // Roll up totals so the math is visible at a glance. If the
            // staff data is broken (percentages summing past 100 %, or
            // expected total exceeding budget), the summary row flags it
            // in amber so the client can ask their PM instead of doing
            // the addition by hand.
            const totalPercent = regulars.reduce((s, p) => s + Number(p.percentage ?? 0), 0);
            const totalExpected = regulars.reduce((s, p) => s + Number(p.amount ?? 0), 0);
            const totalExtra = extras.reduce((s, p) => s + Number(p.amount ?? 0), 0);
            const totalInvoiced = project.paymentCycle.reduce(
              (s, p) => s + (p.invoice ? Number(p.invoice.total ?? 0) : 0),
              0,
            );
            const budget = Number(project.finance.budget ?? 0);
            const percentOver = totalPercent > 100.01;
            const amountOver = budget > 0 && totalExpected > budget + 0.5;
            const renderEntry = (p: PaymentCycleEntry, idx: number, opts: { numbered: boolean; isExtra: boolean }) => {
              const tone = PAYMENT_STATUS_TONE[p.status] ?? PAYMENT_STATUS_TONE.PENDING;
              // Only flag the "issued amount differs" warning while the
              // invoice is still in-flight (INVOICED). Once it's PAID
              // the payment is settled — flagging it again every page
              // load is just noise; the historical drift can't be
              // changed from the portal anyway.
              const mismatch =
                p.status !== "PAID" &&
                p.invoice &&
                Math.abs(p.invoice.total - p.amount) > 0.5;
              return (
                <li key={p.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--rule-soft)" }}>
                  <div className="flex items-start gap-4 px-5 py-4">
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                      style={{
                        background: opts.isExtra ? "var(--gold-soft, var(--paper-2))" : "var(--paper-2)",
                        color: "var(--ink)",
                      }}
                    >
                      {opts.numbered ? idx + 1 : "+"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{p.label}</span>
                        {!opts.isExtra && <span className="portal-eyebrow">{p.percentage}%</span>}
                        {opts.isExtra && (
                          <span className="portal-eyebrow" style={{ color: "var(--gold)" }}>Additional charge</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: "var(--muted)" }}>
                        <span className="portal-eyebrow" style={{ color: tone.color }}>
                          {tone.label}
                        </span>
                        {p.dueDate && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="size-3" /> Due {fmtDateLong(p.dueDate)}
                          </span>
                        )}
                      </div>
                      {p.invoice && (
                        <div className="mt-2">
                          <Link
                            href={`/portal/invoices/${p.invoice.id}`}
                            className="inline-flex items-center gap-1.5 text-[11px] hover:underline"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            <Receipt className="size-3" />
                            <span>Issued: {p.invoice.number}</span>
                            <span style={{ color: "var(--muted)" }}>· {fmtMoney(p.invoice.total)}</span>
                            <ChevronRight className="size-3" />
                          </Link>
                          {mismatch && (
                            <p className="mt-1 text-[10px]" style={{ color: "var(--gold)" }}>
                              Issued amount differs from the milestone total — please flag this if it&apos;s unexpected.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="portal-num text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
                        {fmtMoney(p.amount)}
                      </div>
                      <div className="portal-eyebrow mt-0.5" style={{ color: "var(--muted-2)" }}>
                        {opts.isExtra ? "Extra" : "Expected"}
                      </div>
                    </div>
                  </div>
                </li>
              );
            };
            return (
              <div className="portal-card">
                <div className="flex items-baseline justify-between border-b px-5 py-3" style={{ borderColor: "var(--rule-soft)" }}>
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink)" }}>
                    Payment cycle
                  </h3>
                  <span className="portal-eyebrow">
                    {regulars.length} milestone{regulars.length === 1 ? "" : "s"}
                    {extras.length > 0 ? ` · ${extras.length} extra${extras.length === 1 ? "" : "s"}` : ""}
                  </span>
                </div>
                {project.paymentCycle.length === 0 ? (
                  <div className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--muted)" }}>
                    No payment schedule set for this project. Reach out to your coordinator if you need one.
                  </div>
                ) : (
                  <>
                    {regulars.length > 0 && (
                      <ul>
                        {regulars.map((p, idx) => renderEntry(p, idx, { numbered: true, isExtra: false }))}
                      </ul>
                    )}
                    {extras.length > 0 && (
                      <>
                        <div
                          className="border-t px-5 py-2 text-[11px] font-semibold uppercase tracking-wide"
                          style={{ borderColor: "var(--rule-soft)", color: "var(--muted)" }}
                        >
                          Additional charges
                        </div>
                        <ul>
                          {extras.map((p, idx) => renderEntry(p, idx, { numbered: false, isExtra: true }))}
                        </ul>
                      </>
                    )}

                    {/* Totals row — makes the math add up at a glance and
                        surfaces a warning when staff data is broken
                        (percentages > 100 % or expected > budget). */}
                    <div
                      className="grid gap-4 border-t px-5 py-4 sm:grid-cols-3"
                      style={{ borderColor: "var(--rule)", background: "var(--paper-2)" }}
                    >
                      <div>
                        <div className="portal-eyebrow">Allocated</div>
                        <div
                          className="portal-num mt-1 text-[15px] font-semibold"
                          style={{ color: percentOver ? "var(--gold)" : "var(--ink)" }}
                        >
                          {totalPercent.toFixed(0)}%
                          <span className="ml-1 text-[11px] font-normal" style={{ color: "var(--muted)" }}>
                            of project
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="portal-eyebrow">Expected total</div>
                        <div
                          className="portal-num mt-1 text-[15px] font-semibold"
                          style={{ color: amountOver ? "var(--gold)" : "var(--ink)" }}
                        >
                          {fmtMoney(totalExpected)}
                          {totalExtra > 0 && (
                            <span className="ml-1 text-[11px] font-normal" style={{ color: "var(--muted)" }}>
                              + {fmtMoney(totalExtra)} extras
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="portal-eyebrow">Invoiced so far</div>
                        <div className="portal-num mt-1 text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
                          {fmtMoney(totalInvoiced)}
                        </div>
                      </div>
                      {(percentOver || amountOver) && (
                        <p className="sm:col-span-3 text-[11px] leading-relaxed" style={{ color: "var(--gold)" }}>
                          {percentOver && (
                            <>
                              Payment milestones add up to <strong>{totalPercent.toFixed(0)}%</strong> of the project — more than the 100% baseline.{" "}
                            </>
                          )}
                          {amountOver && (
                            <>
                              Expected payments ({fmtMoney(totalExpected)}) exceed the project budget of {fmtMoney(budget)}.{" "}
                            </>
                          )}
                          If this looks wrong, ask your project coordinator to revise the schedule.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Full invoice list for this project — replaces the old
              "Paid by you / Outstanding" tiles. Each row is a real
              invoice the client can open. */}
          {project.invoices && project.invoices.length > 0 && (
            <div className="portal-card">
              <div className="flex items-baseline justify-between border-b px-5 py-3" style={{ borderColor: "var(--rule-soft)" }}>
                <h3 className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink)" }}>
                  Project invoices
                </h3>
                <span className="portal-eyebrow">
                  {project.invoices.length} invoice{project.invoices.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul>
                {project.invoices.map((inv, idx) => (
                  <li key={inv.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--rule-soft)" }}>
                    <Link
                      href={`/portal/invoices/${inv.id}`}
                      className="group flex items-center gap-4 px-5 py-4 transition hover:bg-[var(--paper-2)]"
                    >
                      <span className="portal-eyebrow w-24 shrink-0">
                        {new Date(inv.issueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                          {inv.number}
                        </div>
                        {inv.dueDate && (
                          <div className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                            Due {fmtDateLong(inv.dueDate)}
                          </div>
                        )}
                      </div>
                      <span className="portal-eyebrow" style={{ color: PAYMENT_STATUS_TONE[inv.status]?.color ?? "var(--muted)" }}>
                        {inv.status}
                      </span>
                      <span className="portal-num text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
                        {fmtMoney(inv.total)}
                      </span>
                      <ChevronRight className="size-4 transition group-hover:translate-x-0.5" style={{ color: "var(--muted-2)" }} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

    </div>
  );
}

function BudgetTile({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon?: React.ReactNode; tone?: string }) {
  return (
    <div className="portal-card p-4">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="portal-eyebrow">{label}</span>
      </div>
      <div className="portal-num mt-2 text-[20px] font-semibold" style={{ color: tone ?? "var(--ink)" }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10.5px]" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="portal-eyebrow">{label}</div>
      <div className="portal-num mt-1 text-[18px] font-semibold" style={{ color: "var(--ink)" }}>
        {value}
      </div>
      {sub && <div className="text-[10.5px]" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <div className="px-5 py-12 text-center text-[13px]" style={{ color: "var(--muted)" }}>
      {text}
    </div>
  );
}
