"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ChevronRight, ArrowUpRight, Wallet, Layers, MessagesSquare, CalendarClock,
  ReceiptText, Plus, Activity, CheckCircle2, Loader2, CircleDashed,
} from "lucide-react";
import { portalApi } from "@/lib/portal-api";
import { usePortalRefresh } from "@/lib/hooks/use-portal-refresh";

interface DashProject {
  id: string;
  name: string;
  status: string;
  budget: number;
  invoicedTotal: number;
  paidTotal: number;
  outstanding: number;
  progressPercent: number;
  milestoneCount: number;
  completedMilestones: number;
  lastUpdate: { taskId: string; title: string; status: string; at: string } | null;
}

interface RecentUpdate {
  id: string;
  title: string;
  status: string;
  at: string;
  projectId: string;
  projectName: string;
  kind: "completed" | "in_progress" | "update";
}

interface Dashboard {
  activeProjectCount: number;
  nextMilestone: { id: string; title: string; dueDate: string; project?: { id: string; name: string } } | null;
  outstandingBalance: number | string;
  openRequestCount: number;
  projects: DashProject[];
  recentUpdates: RecentUpdate[];
  recentInvoices: Array<{ id: string; number: string; total: number | string; status: string; issueDate: string; projectId?: string | null }>;
  recentRequests: Array<{ id: string; title: string; status: string; updatedAt: string }>;
}

interface Me { name: string | null; baseCurrency: string; orgName: string }

const STATUS_TONE: Record<string, string> = {
  PAID:    "var(--emerald)",
  SENT:    "var(--sky)",
  OVERDUE: "var(--rose)",
  PARTIAL: "var(--gold)",
  OPEN:    "var(--sky)",
  IN_PROGRESS: "var(--gold)",
  RESOLVED: "var(--emerald)",
  CLOSED:  "var(--muted)",
  DRAFT:   "var(--muted)",
  DONE:    "var(--emerald)",
  TODO:    "var(--muted)",
};

function fmtMoney(v: number | string, currency = "INR"): string {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

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

export default function PortalDashboard() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  const [err, setErr] = useState<string | null>(null);
  usePortalRefresh(() => {
    setErr(null);
    // Both calls must resolve for the page to render. If either fails
    // we surface the error instead of leaving the user on an infinite
    // "Loading…" spinner.
    Promise.all([
      portalApi.dashboard().then((res) => setD(res as Dashboard)),
      portalApi.me().then((res) => setMe(res as Me)),
    ]).catch((e: Error) => setErr(e.message ?? "Unable to load dashboard."));
  });

  if (err && !d) {
    return (
      <div className="portal-card p-6" style={{ borderColor: "var(--rose)", color: "var(--rose)" }}>
        <div className="font-medium">Unable to load your dashboard</div>
        <p className="mt-1 text-sm">{err}</p>
      </div>
    );
  }
  if (!d) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  const currency = me?.baseCurrency ?? "INR";
  const today = new Date();
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      {/* Greeting header */}
      <header>
        <div className="portal-eyebrow">
          {today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
        <h1 className="portal-title mt-2 text-[24px] sm:text-[32px] md:text-[40px]">
          {greeting}{me?.name ? `, ${me.name.split(" ")[0]}` : ""}.
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] sm:text-[14px]" style={{ color: "var(--ink-soft)" }}>
          Here&apos;s where things stand across your active projects.
        </p>

        {d.nextMilestone && (
          <div
            className="mt-5 inline-flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
          >
            <CalendarClock className="size-3.5" />
            <span className="text-[12px] font-medium">
              Next up — <strong>{d.nextMilestone.title}</strong>
              {d.nextMilestone.project?.name ? ` (${d.nextMilestone.project.name})` : ""}
              {" "}due {fmtDateLong(d.nextMilestone.dueDate)}
            </span>
          </div>
        )}
      </header>

      {/* KPI row — Outstanding is now the sum of active-project outstandings only. */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Kpi
          icon={<Layers className="size-4" />}
          label="Active projects"
          value={String(d.activeProjectCount)}
          href="/portal/projects"
        />
        <Kpi
          icon={<Wallet className="size-4" />}
          label="Outstanding (active)"
          value={fmtMoney(d.outstandingBalance, currency)}
          href="/portal/invoices"
          tone={Number(d.outstandingBalance) > 0 ? "var(--rose)" : "var(--emerald)"}
        />
        <Kpi
          icon={<MessagesSquare className="size-4" />}
          label="Open requests"
          value={String(d.openRequestCount)}
          href="/portal/requests"
        />
      </section>

      {/* Active project breakdown — budget / paid / outstanding per project. */}
      {d.projects.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink)" }}>
              Your active projects
            </h2>
            <Link href="/portal/projects" className="text-[11px] font-medium hover:underline" style={{ color: "var(--muted)" }}>
              View all →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {d.projects.map((p) => (
              <Link
                key={p.id}
                href={`/portal/projects/${p.id}`}
                className="portal-card group block p-5 transition hover:-translate-y-0.5 hover:border-[var(--ink-soft)]"
                style={{ transitionDuration: ".2s" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
                      {p.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: "var(--muted)" }}>
                      <span className="portal-eyebrow" style={{ color: "var(--emerald)" }}>{p.status}</span>
                      <span>·</span>
                      <span>{p.completedMilestones}/{p.milestoneCount} milestones</span>
                    </div>
                  </div>
                  <span className="portal-num text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                    {p.progressPercent}%
                  </span>
                </div>
                <div className="portal-progress mt-3">
                  <span style={{ width: `${p.progressPercent}%` }} />
                </div>

                {/*
                  Four-column money strip so the math is fully visible:
                  Invoiced − Paid = Outstanding. Budget is shown for
                  scope context only. The old 3-column layout (Budget /
                  Paid / Outstanding) was internally inconsistent — when
                  scope expanded past the original budget you couldn't
                  reconcile the numbers without seeing "Invoiced" too.
                */}
                <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-[11px] sm:grid-cols-4 sm:gap-2" style={{ borderColor: "var(--rule)" }}>
                  <div>
                    <div className="portal-eyebrow">Budget</div>
                    <div className="portal-num mt-0.5 text-[13px] font-semibold" style={{ color: "var(--ink-soft)" }}>
                      {fmtMoney(p.budget, currency)}
                    </div>
                  </div>
                  <div>
                    <div className="portal-eyebrow">Invoiced</div>
                    <div className="portal-num mt-0.5 text-[13px] font-semibold" style={{ color: "var(--sky)" }}>
                      {fmtMoney(p.invoicedTotal, currency)}
                    </div>
                  </div>
                  <div>
                    <div className="portal-eyebrow">Paid</div>
                    <div className="portal-num mt-0.5 text-[13px] font-semibold" style={{ color: "var(--emerald)" }}>
                      {fmtMoney(p.paidTotal, currency)}
                    </div>
                  </div>
                  <div>
                    <div className="portal-eyebrow">Outstanding</div>
                    <div className="portal-num mt-0.5 text-[13px] font-semibold" style={{ color: p.outstanding > 0 ? "var(--rose)" : "var(--emerald)" }}>
                      {fmtMoney(p.outstanding, currency)}
                    </div>
                  </div>
                </div>

                {p.lastUpdate && (
                  <div className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
                    <Activity className="size-3" />
                    <span className="truncate">
                      {p.lastUpdate.status === "DONE" ? "Completed " : "Working on "}
                      <span style={{ color: "var(--ink-soft)" }}>{p.lastUpdate.title}</span>
                    </span>
                    <span className="ml-auto whitespace-nowrap">{fmtRel(p.lastUpdate.at)}</span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Project updates feed */}
      {d.recentUpdates.length > 0 && (
        <Panel
          title="Recent project updates"
          href="/portal/projects"
          icon={<Activity className="size-3.5" />}
          empty={false}
        >
          <ul>
            {d.recentUpdates.map((u, idx) => (
              <li key={u.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--rule-soft)" }}>
                <Link
                  href={`/portal/projects/${u.projectId}`}
                  className="group flex items-start gap-3 px-5 py-3 transition hover:bg-[var(--paper-2)]"
                >
                  <div className="mt-0.5 shrink-0">
                    {u.kind === "completed" ? (
                      <CheckCircle2 className="size-4" style={{ color: "var(--emerald)" }} />
                    ) : u.kind === "in_progress" ? (
                      <Loader2 className="size-4" style={{ color: "var(--gold)" }} />
                    ) : (
                      <CircleDashed className="size-4" style={{ color: "var(--muted-2)" }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
                      {u.kind === "completed" ? "Completed " : u.kind === "in_progress" ? "Working on " : "Updated "}
                      <span className="font-medium" style={{ color: "var(--ink)" }}>{u.title}</span>
                    </p>
                    <p className="mt-0.5 text-[10.5px]" style={{ color: "var(--muted)" }}>
                      <span className="font-medium" style={{ color: "var(--ink-soft)" }}>{u.projectName}</span>
                      {" · "}{fmtRel(u.at)}
                    </p>
                  </div>
                  <span className="portal-eyebrow shrink-0" style={{ color: STATUS_TONE[u.status] ?? "var(--muted)" }}>
                    {u.status.replace("_", " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Invoices + Requests */}
      <section className="grid gap-5 lg:grid-cols-5">
        <Panel
          title="Recent invoices"
          href="/portal/invoices"
          icon={<ReceiptText className="size-3.5" />}
          empty={d.recentInvoices.length === 0}
          emptyText="No invoices yet. Your team will share them here once issued."
          className="lg:col-span-3"
        >
          <ul>
            {d.recentInvoices.map((i, idx) => (
              <li key={i.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--rule-soft)" }}>
                <Link
                  href={`/portal/invoices/${i.id}`}
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--paper-2)] sm:gap-4 sm:px-5 sm:py-4"
                >
                  <span className="portal-eyebrow hidden w-16 shrink-0 sm:block">{fmtDate(i.issueDate)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold sm:text-[14px]" style={{ color: "var(--ink)" }}>
                      {i.number}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                      <span className="portal-eyebrow inline-flex items-center gap-1" style={{ color: STATUS_TONE[i.status] ?? "var(--muted)" }}>
                        <span className="size-1 rounded-full" style={{ background: STATUS_TONE[i.status] ?? "var(--muted)" }} />
                        {i.status}
                      </span>
                      <span className="text-[11px] sm:hidden" style={{ color: "var(--muted)" }}>
                        · {fmtDate(i.issueDate)}
                      </span>
                    </div>
                  </div>
                  <div className="portal-num shrink-0 text-[13px] font-semibold sm:text-[15px]" style={{ color: "var(--ink)" }}>
                    {fmtMoney(i.total, currency)}
                  </div>
                  <ChevronRight className="size-4 shrink-0 transition group-hover:translate-x-0.5" style={{ color: "var(--muted-2)" }} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Recent requests"
          href="/portal/requests"
          icon={<MessagesSquare className="size-3.5" />}
          empty={d.recentRequests.length === 0}
          emptyText="No requests yet."
          className="lg:col-span-2"
        >
          <ul>
            {d.recentRequests.map((r, idx) => (
              <li key={r.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--rule-soft)" }}>
                <Link href={`/portal/requests/${r.id}`} className="group block px-4 py-3 transition hover:bg-[var(--paper-2)] sm:px-5 sm:py-4">
                  <div className="portal-eyebrow">{fmtDate(r.updatedAt)}</div>
                  <div className="mt-1 truncate text-[14px] font-medium" style={{ color: "var(--ink)" }}>
                    {r.title}
                  </div>
                  <span className="portal-eyebrow mt-0.5 inline-flex items-center gap-1" style={{ color: STATUS_TONE[r.status] ?? "var(--muted)" }}>
                    <span className="size-1 rounded-full" style={{ background: STATUS_TONE[r.status] ?? "var(--muted)" }} />
                    {r.status.replace("_", " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      {/* CTA strip */}
      <section
        className="overflow-hidden rounded-2xl"
        style={{ background: "var(--ink)", color: "var(--paper)" }}
      >
        <div className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-7">
          <div>
            <div className="portal-eyebrow" style={{ color: "rgba(251,250,248,0.55)" }}>Need to ask us something?</div>
            <h3 className="portal-title mt-1 text-[22px]" style={{ color: "var(--paper)" }}>
              Submit a request — we&apos;ll be on it shortly.
            </h3>
            <p className="mt-1 text-[13px]" style={{ color: "rgba(251,250,248,0.65)" }}>
              Change scope, ask a question, flag an issue — your project lead is notified instantly.
            </p>
          </div>
          <Link href="/portal/requests/new" className="portal-cta portal-cta-accent shrink-0">
            <Plus className="size-3.5" /> New request <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon, label, value, href, tone,
}: { icon: React.ReactNode; label: string; value: string; href: string; tone?: string }) {
  return (
    <Link
      href={href}
      className="portal-card group block p-5 transition hover:border-[var(--ink-soft)]"
    >
      <div className="flex items-center gap-2" style={{ color: tone ?? "var(--ink-soft)" }}>
        {icon}
        <span className="portal-eyebrow" style={{ color: "var(--muted)" }}>{label}</span>
      </div>
      <div className="portal-num mt-3 text-[22px] font-semibold tracking-tight sm:text-[26px] md:text-[28px]" style={{ color: tone ?? "var(--ink)" }}>
        {value}
      </div>
      <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--muted)" }}>
        View <ChevronRight className="size-3 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function Panel({
  title, href, icon, children, empty, emptyText, className,
}: {
  title: string;
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
  className?: string;
}) {
  return (
    <section className={`portal-card overflow-hidden ${className ?? ""}`}>
      <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--rule-soft)" }}>
        <div className="flex items-center gap-2" style={{ color: "var(--ink-soft)" }}>
          {icon}
          <h2 className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink)" }}>{title}</h2>
        </div>
        <Link href={href} className="text-[11px] font-medium hover:underline" style={{ color: "var(--muted)" }}>
          View all →
        </Link>
      </div>
      {empty ? (
        <div className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--muted)" }}>
          {emptyText}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
