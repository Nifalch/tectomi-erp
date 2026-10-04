"use client";

import { useRouter } from "next/navigation";
import { useReportRange } from "@/components/reports/date-range-bar";
import { AgingBody } from "@/components/reports/aging-body";
import { useApAging } from "@/lib/api/hooks";

export default function ApAgingPage() {
  const { from, to } = useReportRange();
  const query = useApAging(from, to);
  const router = useRouter();
  return <AgingBody title="Accounts Payable Aging" entity="bill" query={query} router={router} />;
}
