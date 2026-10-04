"use client";

import { ProjectBurnRateTab } from "@/components/projects/project-burn-rate-tab";
import { PaymentSchedule } from "@/components/projects/payment-schedule";

/**
 * Combined Finance view — replaces the separate "Budget" and "Payments"
 * tabs. Budget (burn rate, expenses, P&L) sits up top so the user sees
 * the financial health at a glance; the payment schedule sits below
 * since it's edit-frequency-low.
 */
export function ProjectFinanceTab({ projectId, budget }: { projectId: string; budget: number }) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Budget & burn
        </h2>
        <ProjectBurnRateTab projectId={projectId} />
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Payment schedule
        </h2>
        <PaymentSchedule projectId={projectId} budget={budget} />
      </section>
    </div>
  );
}
