import { rolePermissionMatrix, type PermissionKey, type AppRole } from "@nuro7/contracts";
import { useAuthStore } from "@/lib/store/auth-store";

export function usePermission(key: PermissionKey): boolean {
  const role = useAuthStore((s) => s.user?.roles[0]) as AppRole | undefined;
  if (!role) return false;
  return rolePermissionMatrix[role]?.includes(key) ?? false;
}

export function usePermissions(...keys: PermissionKey[]): boolean[] {
  const role = useAuthStore((s) => s.user?.roles[0]) as AppRole | undefined;
  if (!role) return keys.map(() => false);
  const perms = rolePermissionMatrix[role] ?? [];
  return keys.map((k) => perms.includes(k));
}
