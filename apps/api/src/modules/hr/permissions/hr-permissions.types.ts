import { RoleCode } from "@prisma/client";

// Note: MANAGER is intentionally NOT a ViewerLevel. It's a Relationship —
// a user can be a manager for one employee and a peer for another.
export type ViewerLevel = "HR" | "FINANCE" | "PEER";

export type Relationship = "SELF" | "MANAGER" | "OTHER";

export interface ViewerContext {
  id: string;
  roles: RoleCode[];
}

export type EmployeeTabKey =
  | "overview"
  | "attendance"
  | "leave"
  | "performance"
  | "payroll"
  | "career"
  | "projects"
  | "documents"
  | "assets"
  | "onboarding"
  | "timeline"
  | "notes"
  | "access";

export type EmployeeAction =
  | "VIEW"
  | "EDIT_PROFILE"
  | "EDIT_OWN_LIMITED"
  | "TERMINATE"
  | "RESEND_INVITE"
  | "LOG_CAREER_EVENT"
  | "ADD_HR_NOTE"
  | "DELETE_HR_NOTE"
  | "UPLOAD_DOCUMENT"
  | "DELETE_DOCUMENT"
  | "APPROVE_LEAVE"
  | "WRITE_REVIEW";

export interface EmployeeOverviewSource {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
    phone: string | null;
    status: string;
    createdAt: Date;
  };
  profile: {
    id: string;
    department: string;
    designation: string;
    employmentType: string;
    joinDate: Date;
    salary: unknown;
    hourlyRate: unknown;
    managerId: string | null;
    emergencyContact: string | null;
    performanceScore: unknown;
    terminatedAt: Date | null;
    isFounder: boolean;
    shiftStartHour: number | null;
    shiftStartMinute: number | null;
    shiftEndHour: number | null;
    shiftEndMinute: number | null;
    requiredDailyHours: unknown;
  } | null;
  managerLabel: string | null;
}

export interface MaskedOverviewDto {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  status: string;
  joinDate: string | null;
  department: string | null;
  designation: string | null;
  employmentType: string | null;
  salary: number | null;
  hourlyRate: number | null;
  manager: string | null;
  managerId: string | null;
  emergencyContact: string | null;
  performanceScore: number | null;
  terminated: boolean;
  terminatedAt: string | null;
  isFounder: boolean;
  shiftStartHour: number | null;
  shiftStartMinute: number | null;
  shiftEndHour: number | null;
  shiftEndMinute: number | null;
  requiredDailyHours: number | null;
}
