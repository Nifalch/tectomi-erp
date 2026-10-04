"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select } from "@/components/ui/select";
import { useUsers } from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/store/auth-store";
import { toArray } from "@/lib/utils";
import { Eye } from "lucide-react";

/**
 * Compact inline "viewing as" picker shown on tasks/time/attendance/leave
 * pages for admin-role users. Sets ?userId=<id> in the URL which the host
 * pages use to scope their queries. Employees never see this.
 *
 * Rendered as a slim text + Select pair so it tucks neatly into a page
 * toolbar without claiming its own row of whitespace.
 */
export function ViewAsSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUser = useAuthStore((s) => s.user);
  const usersQuery = useUsers();

  const roles = currentUser?.roles ?? [];
  const isAdmin = roles.some((r) => r === "SUPER_ADMIN" || r === "ADMIN" || r === "HR_MANAGER" || r === "PROJECT_MANAGER");
  if (!isAdmin) return null;

  const users = toArray<{ id: string; firstName: string; lastName: string; email: string }>(usersQuery.data);
  const currentValue = searchParams.get("userId") ?? "";

  const onChange = (value: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (value) params.set("userId", value); else params.delete("userId");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="inline-flex items-center gap-1.5 text-xs">
      <Eye className="size-3.5 text-slate-400" />
      <span className="text-slate-500 whitespace-nowrap">Viewing as:</span>
      <div className="min-w-[160px]">
        <Select
          size="sm"
          value={currentValue}
          onValueChange={onChange}
          placeholder="Everyone"
          options={[
            { value: "", label: "Everyone" },
            ...users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
          ]}
        />
      </div>
    </div>
  );
}
