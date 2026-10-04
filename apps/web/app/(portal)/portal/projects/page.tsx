"use client";
import { useState } from "react";
import Link from "next/link";
import { Layers, Clock, ListChecks, Flag, ArrowUpRight } from "lucide-react";
import { portalApi } from "@/lib/portal-api";
import { usePortalRefresh } from "@/lib/hooks/use-portal-refresh";

interface PortalProject {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  totalTasks: number;
  completedTasks: number;
  completionPercent: number;
  milestoneCount: number;
  hoursLogged: number;
}

const PROJECT_TONE: Record<string, string> = {
  ACTIVE:    "var(--emerald)",
  ON_HOLD:   "var(--gold)",
  COMPLETED: "var(--sky)",
  CANCELLED: "var(--rose)",
  PLANNING:  "var(--muted)",
};

function fmtDateLong(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function PortalProjects() {
  const [rows, setRows] = useState<PortalProject[]>([]);
  const [loading, setLoading] = useState(true);

  usePortalRefresh(() => {
    setLoading(true);
    return portalApi.projects.list()
      .then((data) => setRows(data as PortalProject[]))
      .finally(() => setLoading(false));
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="portal-title text-[22px] sm:text-[28px] md:text-[34px]">Projects</h1>
        <p className="mt-2 max-w-xl text-[13px] sm:text-[14px]" style={{ color: "var(--ink-soft)" }}>
          Everything we&apos;re working on for you. Open a project to see tasks, milestones, and your coordinator.
        </p>
      </header>
      <div className="portal-hairline" />

      {loading ? (
        <div className="portal-card p-10 text-center text-[13px]" style={{ color: "var(--muted)" }}>
          Loading projects…
        </div>
      ) : rows.length === 0 ? (
        <div className="portal-card p-12 text-center">
          <Layers className="mx-auto size-7" style={{ color: "var(--muted-2)" }} />
          <p className="portal-title mt-4 text-[18px]">Nothing scheduled yet.</p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--muted)" }}>
            Projects appear here once your team kicks them off.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((p) => {
            const accent = PROJECT_TONE[p.status] ?? PROJECT_TONE.PLANNING;
            return (
              <Link
                key={p.id}
                href={`/portal/projects/${p.id}`}
                className="portal-card group block p-4 transition hover:-translate-y-0.5 hover:border-[var(--ink-soft)] sm:p-5"
                style={{ transitionDuration: ".2s" }}
              >
                <div className="flex items-start justify-between gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Title scales down on small mobile so a 2-word project
                        name doesn't bump the status pill onto a new row. */}
                    <h2 className="portal-title line-clamp-2 text-[15px] sm:text-[18px]">{p.name}</h2>
                    {p.description && (
                      <p className="mt-1 line-clamp-2 text-[12px] sm:text-[13px]" style={{ color: "var(--ink-soft)" }}>
                        {p.description}
                      </p>
                    )}
                  </div>
                  <span className="portal-pill shrink-0 self-start" style={{ color: accent }}>
                    <span className="dot" />
                    {p.status.replace("_", " ")}
                  </span>
                </div>

                {/* Progress */}
                <div className="mt-4">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="portal-num text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                      {p.completionPercent}<span style={{ color: "var(--muted-2)" }}>%</span>
                    </span>
                    <span className="portal-eyebrow">
                      {p.completedTasks}/{p.totalTasks} tasks
                    </span>
                  </div>
                  <div className="portal-progress">
                    <span style={{ width: `${p.completionPercent}%` }} />
                  </div>
                </div>

                {/* Stat strip — divide-x cells get cramped under 320px,
                    so px on each Stat is reduced from p-3 to p-2 below. */}
                <div className="mt-4 flex items-stretch divide-x border-t pt-3 text-center" style={{ borderColor: "var(--rule)" }}>
                  <Stat icon={<ListChecks />} label="Tasks" value={String(p.totalTasks)} />
                  <Stat icon={<Flag />} label="Milestones" value={String(p.milestoneCount)} />
                  <Stat icon={<Clock />} label="Hours" value={p.hoursLogged.toFixed(1)} />
                </div>

                {/* Date range row — stacks on small mobile so a long
                    "1 Feb 2025 → 30 Aug 2025" doesn't collide with the
                    "Open" eyebrow. */}
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--muted)" }}>
                  <span className="min-w-0 truncate">
                    {fmtDateLong(p.startDate)}
                    {p.startDate && p.endDate ? " → " : ""}
                    {p.endDate && fmtDateLong(p.endDate)}
                  </span>
                  <span className="portal-eyebrow inline-flex shrink-0 items-center gap-1 transition group-hover:translate-x-0.5" style={{ color: "var(--ink-soft)" }}>
                    Open <ArrowUpRight className="size-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex-1 px-2 sm:px-3" style={{ borderColor: "var(--rule)" }}>
      <div className="mx-auto inline-flex items-center gap-1 portal-eyebrow" style={{ color: "var(--muted-2)" }}>
        <span style={{ color: "var(--muted-2)" }} className="[&_svg]:size-3">{icon}</span>
        {label}
      </div>
      <div className="portal-num mt-0.5 text-[15px] font-semibold sm:text-[16px]" style={{ color: "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}
