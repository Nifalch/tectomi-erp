"use client";

import { useRouter } from "next/navigation";
import { useReportRange } from "@/components/reports/date-range-bar";
import { AgingBody } from "@/components/reports/aging-body";
import { useArAging } from "@/lib/api/hooks";

export default function ArAgingPage() {
  const { from, to } = useReportRange();
  const query = useArAging(from, to);
  const router = useRouter();

  return <AgingBody title="Accounts Receivable Aging" entity="invoice" query={query} router={router} />;
}
