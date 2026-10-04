export type BadgeTone =
  | "neutral" | "positive" | "warning" | "destructive" | "info";

export const STATUS_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
  // Project statuses
  PLANNING:    { label: "Planning",     tone: "neutral" },
  ACTIVE:      { label: "Active",       tone: "positive" },
  ON_HOLD:     { label: "On Hold",      tone: "warning" },
  COMPLETED:   { label: "Completed",    tone: "info" },
  CANCELLED:   { label: "Cancelled",    tone: "destructive" },

  // Task statuses
  BACKLOG:     { label: "Backlog",      tone: "neutral" },
  TODO:        { label: "To Do",        tone: "neutral" },
  IN_PROGRESS: { label: "In Progress",  tone: "info" },
  REVIEW:      { label: "Review",       tone: "warning" },
  DONE:        { label: "Done",         tone: "positive" },
  BLOCKED:     { label: "Blocked",      tone: "destructive" },

  // Invoice statuses
  DRAFT:       { label: "Draft",        tone: "neutral" },
  SENT:        { label: "Sent",         tone: "info" },
  PAID:        { label: "Paid",         tone: "positive" },
  OVERDUE:     { label: "Overdue",      tone: "destructive" },
  VOID:        { label: "Void",         tone: "neutral" },

  // Leave / approval statuses
  PENDING:     { label: "Pending",      tone: "warning" },
  APPROVED:    { label: "Approved",     tone: "positive" },
  REJECTED:    { label: "Rejected",     tone: "destructive" },

  // Priority
  LOW:         { label: "Low",          tone: "neutral" },
  MEDIUM:      { label: "Medium",       tone: "info" },
  HIGH:        { label: "High",         tone: "warning" },
  URGENT:      { label: "Urgent",       tone: "destructive" },
};
