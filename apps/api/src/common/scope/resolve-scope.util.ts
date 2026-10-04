import { RoleCode } from "@prisma/client";

/**
 * Resolve which userId a request should act on behalf of.
 *
 * - If the caller is SUPER_ADMIN / ADMIN / HR_MANAGER / PROJECT_MANAGER and passes ?userId=xxx,
 *   use that userId (lets admins "view as" any employee).
 * - Otherwise always scope to the current user — employees cannot see others.
 */
export function resolveScopedUserId(
  current: { id: string; roles?: RoleCode[] | Array<{ role: { code: RoleCode | string } }> } | undefined,
  queryUserId?: string,
): string {
  if (!current) throw new Error("Auth required");
  const roles: string[] = Array.isArray(current.roles)
    ? (current.roles as any[]).map((r) => (typeof r === "string" ? r : r?.role?.code)).filter(Boolean)
    : [];
  const isAdmin = roles.some((c) =>
    c === RoleCode.SUPER_ADMIN ||
    c === RoleCode.ADMIN ||
    c === RoleCode.HR_MANAGER ||
    c === RoleCode.PROJECT_MANAGER,
  );
  if (queryUserId && isAdmin) return queryUserId;
  return current.id;
}

export function isAdminRole(
  current: { roles?: RoleCode[] | Array<{ role: { code: RoleCode | string } }> } | undefined,
): boolean {
  const roles: string[] = Array.isArray(current?.roles)
    ? (current!.roles as any[]).map((r) => (typeof r === "string" ? r : r?.role?.code)).filter(Boolean)
    : [];
  return roles.some((c) =>
    c === RoleCode.SUPER_ADMIN ||
    c === RoleCode.ADMIN ||
    c === RoleCode.HR_MANAGER ||
    c === RoleCode.PROJECT_MANAGER,
  );
}
