"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store/auth-store";

const HR_ROLES = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"];

export function QuickActionsBar({ onAddEmployee }: { onAddEmployee: () => void }) {
  const isHr = useAuthStore((s) => (s.user?.roles ?? []).some((r) => HR_ROLES.includes(r)));
  if (!isHr) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onAddEmployee}>+ Add employee</Button>
      <Link href="/hr/employees">
        <Button variant="secondary">Browse employees</Button>
      </Link>
      <Link href="/payroll">
        <Button variant="secondary">Run payroll</Button>
      </Link>
      <Link href="/leave">
        <Button variant="secondary">Approve leaves</Button>
      </Link>
      <Link href="/performance">
        <Button variant="secondary">Schedule review</Button>
      </Link>
    </div>
  );
}
