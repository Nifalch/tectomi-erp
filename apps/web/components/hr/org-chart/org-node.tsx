"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import type { OrgNode as OrgNodeType } from "@/lib/api/hr-hub";
import { useAuthStore } from "@/lib/store/auth-store";

const HR_ROLES = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"];

export function OrgNode({ node, depth = 0 }: { node: OrgNodeType; depth?: number }) {
  const isHr = useAuthStore((s) => (s.user?.roles ?? []).some((r) => HR_ROLES.includes(r)));

  return (
    <li className="my-1">
      <div className="group flex items-center gap-2">
        <Link
          href={`/hr/employees/${node.userId}`}
          className="rounded border border-slate-200 px-3 py-1.5 text-sm hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <span className="font-medium">{node.name}</span>
          <span className="ml-2 text-xs text-slate-500">{node.designation}</span>
        </Link>
        {node.reports.length > 0 && (
          <span className="text-xs text-slate-400">
            ({node.reports.length} report{node.reports.length === 1 ? "" : "s"})
          </span>
        )}
        {isHr && (
          <Link
            href={`/hr/employees/${node.userId}?edit=1`}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-slate-400 opacity-0 transition hover:bg-blue-50 hover:text-blue-700 group-hover:opacity-100 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
            title="Open profile and edit reporting line"
          >
            <Pencil className="size-3" /> Edit
          </Link>
        )}
      </div>
      {node.reports.length > 0 && (
        <ul className="ml-6 border-l border-slate-200 pl-4 dark:border-slate-700">
          {node.reports.map((child) => (
            <OrgNode key={child.userId} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
