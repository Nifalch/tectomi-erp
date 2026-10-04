import type { Request } from "express";
import type { RoleCode } from "@prisma/client";

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    name?: string;
    roles: RoleCode[];
    permissions?: string[];
  };
}

export interface ResolvedTarget {
  userId: string; // canonical user id (after resolving "me")
  employeeId: string; // EmployeeProfile.id
}
