"use client";

import Link from "next/link";
import { useState } from "react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { AddEmployeeDialog } from "@/components/hr/add-employee-dialog";
import { useEmployeeDirectory } from "@/lib/api/hr-hub";
import { useAuthStore } from "@/lib/store/auth-store";

const HR_ROLES = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"];

const EMPLOYMENT_TYPES = [
  { value: "", label: "All types" },
  { value: "FULL_TIME", label: "Full time" },
  { value: "PART_TIME", label: "Part time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
];

const ACTIVE_OPTIONS = [
  { value: "true", label: "Active only" },
  { value: "false", label: "Terminated only" },
  { value: "", label: "Both" },
];

export default function DirectoryPage() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [active, setActive] = useState<"true" | "false" | "">("true");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const isHr = useAuthStore((s) => (s.user?.roles ?? []).some((r) => HR_ROLES.includes(r)));

  const q = useEmployeeDirectory({
    search: search || undefined,
    department: department || undefined,
    employmentType: employmentType || undefined,
    active: active === "true" || active === "false" ? active : undefined,
    page,
    pageSize: 20,
  });

  return (
    <div className="flex flex-col gap-6">
      <ModuleHeader
        module="hr"
        title="Employee directory"
        description="All employees with filters."
        counts={q.data ? [{ label: "total", value: q.data.meta.total }] : undefined}
      />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Search</label>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="name or email"
          />
        </div>
        <div className="w-44">
          <label className="mb-1 block text-xs font-medium text-slate-500">Department</label>
          <Input
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(1);
            }}
            placeholder="any"
          />
        </div>
        <div className="w-44">
          <label className="mb-1 block text-xs font-medium text-slate-500">Employment</label>
          <Select
            value={employmentType}
            onValueChange={(v) => {
              setEmploymentType(v);
              setPage(1);
            }}
            options={EMPLOYMENT_TYPES}
          />
        </div>
        <div className="w-44">
          <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
          <Select
            value={active}
            onValueChange={(v) => {
              setActive(v as "true" | "false" | "");
              setPage(1);
            }}
            options={ACTIVE_OPTIONS}
          />
        </div>
        {isHr && (
          <Button onClick={() => setAddOpen(true)} className="ml-auto">
            + Add employee
          </Button>
        )}
      </div>

      {q.isLoading && <LoadingState label="Loading..." />}
      {q.isError && <ErrorState label="Unable to load directory." />}

      {q.data && q.data.data.length === 0 && (
        <Card className="text-center py-12">
          <p className="text-sm text-slate-500">
            {search || department || employmentType || active !== "true"
              ? "No employees match these filters."
              : "No employees yet — add your first one."}
          </p>
        </Card>
      )}
      {q.data && q.data.data.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {q.data.data.map((e) => (
              <Link key={e.userId} href={`/hr/employees/${e.userId}`} className="block">
                <Card className="hover:border-blue-400">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {e.firstName} {e.lastName}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{e.email}</div>
                    </div>
                    {e.terminated && (
                      <Badge tone="destructive" size="sm">
                        Terminated
                      </Badge>
                    )}
                    {e.status === "INVITED" && (
                      <Badge tone="warning" size="sm">
                        Invited
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="hr" size="sm" dot>
                      {e.department}
                    </Badge>
                    <Badge tone="neutral" size="sm">
                      {e.designation}
                    </Badge>
                    {e.employmentType && (
                      <Badge tone="info" size="sm">
                        {e.employmentType}
                      </Badge>
                    )}
                  </div>
                  {e.managerLabel && (
                    <div className="mt-2 text-xs text-slate-500">Manager: {e.managerLabel}</div>
                  )}
                </Card>
              </Link>
            ))}
          </div>

          {q.data.meta.pageCount > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Page {q.data.meta.page} / {q.data.meta.pageCount}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(Math.min(q.data!.meta.pageCount, page + 1))}
                  disabled={page >= q.data!.meta.pageCount}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
