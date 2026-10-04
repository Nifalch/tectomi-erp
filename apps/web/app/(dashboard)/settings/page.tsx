"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Shield, Users2, Plug, HardDrive, Bell, Mail, MoreHorizontal, KeyRound, LogIn as LogInIcon, Trash2, Edit3, UserCog, Database, RotateCcw } from "lucide-react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/components/ui/role-badge";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useUsers, useRolesMatrix } from "@/lib/api/hooks";
import { toast } from "@/lib/hooks/use-toast";
import { apiPost } from "@/lib/api/client";
import { roles as ROLE_CODES, type AppRole } from "@nuro7/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OfficeSettingsTab } from "@/components/settings/office-settings";
import { AttendancePolicyCard } from "@/components/settings/attendance-policy";
import { EmailSettingsTab } from "@/components/settings/email-settings";
import { BiometricDevicesCard } from "@/components/settings/biometric-devices";
import { useAuthStore } from "@/lib/store/auth-store";
import {
  useUpdateUser,
  useSetUserRoles,
  useResetUserPassword,
  useSeedDefaultPermissions,
  useSetRolePermissions,
} from "@/lib/api/mutations";

const tabs = [
  { key: "users", label: "Users & Roles" },
  { key: "permissions", label: "Permissions" },
  { key: "email", label: "Email" },
  { key: "integrations", label: "Integrations" },
  { key: "general", label: "General" },
  { key: "attendance", label: "Attendance" },
];

const roleList: Array<{ code: AppRole; name: string; desc: string; color: "destructive" | "warning" | "info" | "positive" | "neutral" }> = [
  { code: "SUPER_ADMIN", name: "Super Admin", desc: "Full access to all modules, users, and settings", color: "destructive" },
  { code: "ADMIN", name: "Admin", desc: "All access except user deletion and settings changes", color: "warning" },
  { code: "PROJECT_MANAGER", name: "Project Manager", desc: "Manage projects, tasks, clients, and documents", color: "info" },
  { code: "HR_MANAGER", name: "HR Manager", desc: "Manage employees, leave, attendance, and HR reports", color: "positive" },
  { code: "FINANCE_MANAGER", name: "Finance Manager", desc: "Manage finances, invoices, and financial reports", color: "positive" },
  { code: "EMPLOYEE", name: "Employee", desc: "View projects and tasks, comment, track time", color: "neutral" },
  { code: "CLIENT", name: "Client", desc: "View assigned projects, invoices, and documents", color: "neutral" },
];

const PERMISSION_ACTIONS = ["READ", "CREATE", "UPDATE", "DELETE", "APPROVE", "EXPORT"] as const;
type PermAction = typeof PERMISSION_ACTIONS[number];

const inviteSchema = z.object({
  email: z.string().email("Valid email required"),
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
  roles: z.array(z.string()).min(1, "Select at least one role"),
  department: z.string().optional(),
  designation: z.string().optional(),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  status: string;
  avatarUrl?: string | null;
  roles: Array<{ role: { code: string; name: string } }>;
  createdAt: string;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("users");
  const [inviteOpen, setInviteOpen] = useState(false);
  // Settings is the admin-only user management surface — opt into the
  // full list (including terminated/suspended) so admins can reactivate
  // or audit deactivated accounts here.
  const usersQuery = useUsers({ includeInactive: true });
  const qc = useQueryClient();
  const router = useRouter();
  const authRoles = useAuthStore((s) => s.user?.roles ?? []);
  const isSuperAdmin = authRoles.includes("SUPER_ADMIN");

  // Dialog state
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [rolesUser, setRolesUser] = useState<UserRow | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [impersonateUser, setImpersonateUser] = useState<UserRow | null>(null);

  const inviteMutation = useMutation({
    mutationFn: (data: InviteFormValues) => apiPost("/users", {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      password: "ChangeMe123!",
      // CreateUserDto only accepts `roles` (plural). Sending an extra
      // `role` field used to trip the `forbidNonWhitelisted: true`
      // validation pipe and 400 every invite attempt.
      roles: data.roles,
      department: data.department,
      designation: data.designation,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      toast({ variant: "success", title: "User invited successfully" });
      setInviteOpen(false);
    },
    onError: (e: Error) => toast({ variant: "error", title: "Failed to invite user", description: e.message }),
  });

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { roles: ["EMPLOYEE"] },
  });

  const users = (usersQuery.data?.data ?? []) as unknown as UserRow[];

  return (
    <div className="flex flex-col gap-8">
      <ModuleHeader
        module="settings"
        title="Settings"
        description="Platform controls, user management, and workspace configuration."
        primaryAction={{
          label: "Invite User",
          icon: <Plus className="mr-1 size-4" />,
          onClick: () => { form.reset({ roles: ["EMPLOYEE"] }); setInviteOpen(true); },
          permission: "users:invite",
        }}
      />

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Users & Roles Tab */}
      {activeTab === "users" && (
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <CardTitle>Team Members</CardTitle>
              <Badge tone="neutral" size="sm">{users.length} users</Badge>
            </div>

            {usersQuery.isLoading ? (
              <LoadingState label="Loading users..." />
            ) : usersQuery.isError ? (
              <ErrorState label="Unable to load users." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Name</TH>
                    <TH>Email</TH>
                    <TH>Roles</TH>
                    <TH>Status</TH>
                    <TH>Joined</TH>
                    <TH>Actions</TH>
                  </tr>
                </THead>
                <TBody>
                  {users.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-400">No users found.</td></tr>
                  ) : (
                    users.map((user) => {
                      const userRoles = (user.roles ?? []).map((r) => r.role.code as AppRole);
                      return (
                        <tr key={user.id}>
                          <TD>
                            <div className="flex items-center gap-3">
                              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {user.firstName?.[0]}{user.lastName?.[0]}
                              </span>
                              <span className="font-medium">{user.firstName} {user.lastName}</span>
                            </div>
                          </TD>
                          <TD className="text-slate-500">{user.email}</TD>
                          <TD>
                            <div className="flex flex-wrap gap-1">
                              {userRoles.length > 0 ? userRoles.map((rc) => (
                                <RoleBadge key={rc} role={rc} />
                              )) : <Badge tone="neutral" size="sm">No role</Badge>}
                            </div>
                          </TD>
                          <TD>
                            <Badge
                              tone={user.status === "ACTIVE" ? "positive" : user.status === "INVITED" ? "info" : "neutral"}
                              size="sm"
                              dot
                            >
                              {user.status}
                            </Badge>
                          </TD>
                          <TD className="text-slate-500 text-xs">{new Date(user.createdAt).toLocaleDateString()}</TD>
                          <TD>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                                  <MoreHorizontal className="size-4 text-slate-500" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => setEditUser(user)}>
                                  <Edit3 className="size-4" /> Edit
                                </DropdownMenuItem>
                                {isSuperAdmin && (
                                  <>
                                    <DropdownMenuItem onSelect={() => setRolesUser(user)}>
                                      <UserCog className="size-4" /> Set Roles
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setPasswordUser(user)}>
                                      <KeyRound className="size-4" /> Reset Password
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setImpersonateUser(user)}>
                                      <LogInIcon className="size-4" /> Login as user
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem destructive onSelect={() => setDeleteUser(user)}>
                                      <Trash2 className="size-4" /> Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TD>
                        </tr>
                      );
                    })
                  )}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* Permissions Tab */}
      {activeTab === "permissions" && <PermissionsTab isSuperAdmin={isSuperAdmin} />}

      {/* Integrations Tab */}
      {activeTab === "integrations" && (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { name: "Slack", desc: "Send notifications to Slack channels for task updates, leave approvals, and invoice alerts", icon: Plug, status: "Coming soon" },
            { name: "GitHub", desc: "Link commits and pull requests to tasks, auto-update task status on merge", icon: Plug, status: "Coming soon" },
            { name: "WhatsApp", desc: "Client communication tracking, send invoice reminders via WhatsApp Business API", icon: Plug, status: "Coming soon" },
            { name: "Email (SMTP)", desc: "Transactional emails for password resets, invoice delivery, and leave notifications", icon: Mail, status: "Configured" },
          ].map((int) => (
            <Card key={int.name}>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                  <int.icon className="size-5 text-slate-500" />
                </div>
                <div className="flex-1">
                  <CardTitle>{int.name}</CardTitle>
                  <CardDescription className="mt-1">{int.desc}</CardDescription>
                </div>
              </div>
              <div className="mt-3">
                <Badge tone={int.status === "Configured" ? "positive" : "neutral"} size="sm" dot>{int.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* General Tab */}
      {activeTab === "general" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <HardDrive className="size-5 text-slate-400" />
              <CardTitle>File Storage</CardTitle>
            </div>
            <CardDescription>Documents and uploads are stored on local disk. Switch to S3-compatible buckets via the FILE_STORAGE_DRIVER environment variable.</CardDescription>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              FILE_STORAGE_DRIVER=local<br/>
              LOCAL_UPLOAD_DIR=./uploads
            </div>
            <Badge tone="info" size="sm" className="mt-3" dot>Local Storage Active</Badge>
          </Card>

          <Card>
            <div className="flex items-center gap-3 mb-4">
              <Bell className="size-5 text-slate-400" />
              <CardTitle>Notifications</CardTitle>
            </div>
            <CardDescription>In-app notifications are enabled. Email notifications require SMTP configuration. WebSocket real-time updates are available when connected.</CardDescription>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">In-App Notifications</span>
                <Badge tone="positive" size="sm" dot>Enabled</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Email Notifications</span>
                <Badge tone="warning" size="sm" dot>Configure SMTP</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">WebSocket (Real-time)</span>
                <Badge tone="info" size="sm" dot>Available</Badge>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3 mb-4">
              <Shield className="size-5 text-slate-400" />
              <CardTitle>Security</CardTitle>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Authentication</span>
                <Badge tone="positive" size="sm">JWT + Refresh Tokens</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Access Token TTL</span>
                <span className="font-mono text-xs text-slate-500">15 minutes</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Refresh Token TTL</span>
                <span className="font-mono text-xs text-slate-500">7 days</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Password Hashing</span>
                <Badge tone="positive" size="sm">scrypt</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Rate Limiting</span>
                <span className="font-mono text-xs text-slate-500">120 req/min</span>
              </div>
            </div>
          </Card>

          <Link
            href="/settings/organization"
            className="block rounded-2xl border border-border bg-white p-6 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-panel dark:bg-slate-900/80"
          >
            <div className="flex items-center gap-3 mb-2">
              <Users2 className="size-5 text-slate-400" />
              <CardTitle>Organization Profile</CardTitle>
            </div>
            <CardDescription>
              Company name, address, contact details, logo & stamp, bank details, and invoice template defaults.
              Used on every invoice, estimate, and bill.
            </CardDescription>
            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
              Open Organization Settings →
            </div>
          </Link>

          <Link
            href="/settings/custom-fields"
            className="block rounded-2xl border border-border bg-white p-6 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-panel dark:bg-slate-900/80"
          >
            <div className="flex items-center gap-3 mb-2">
              <Database className="size-5 text-slate-400" />
              <CardTitle>Custom Fields</CardTitle>
            </div>
            <CardDescription>
              Add custom fields to clients, projects, leads, deals, and tasks to capture organization-specific data.
            </CardDescription>
            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
              Manage Custom Fields →
            </div>
          </Link>
        </div>
      )}

      {activeTab === "email" && <EmailSettingsTab />}

      {activeTab === "attendance" && (
        <div className="flex flex-col gap-6">
          <AttendancePolicyCard />
          <OfficeSettingsTab />
          <BiometricDevicesCard />
        </div>
      )}

      {/* Invite User Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => inviteMutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="First Name" required error={form.formState.errors.firstName?.message}>
                <Input {...form.register("firstName")} error={!!form.formState.errors.firstName} placeholder="John" />
              </FormField>
              <FormField label="Last Name" required error={form.formState.errors.lastName?.message}>
                <Input {...form.register("lastName")} error={!!form.formState.errors.lastName} placeholder="Doe" />
              </FormField>
            </div>
            <FormField label="Email" required error={form.formState.errors.email?.message}>
              <Input {...form.register("email")} error={!!form.formState.errors.email} placeholder="john@tectomi.com" type="email" />
            </FormField>
            <FormField label="Roles" required error={form.formState.errors.roles?.message as string | undefined}>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-white/60 p-3 dark:bg-slate-900/40">
                {roleList.map((r) => {
                  const checked = form.watch("roles")?.includes(r.code) ?? false;
                  return (
                    <label key={r.code} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-slate-300"
                        checked={checked}
                        onChange={(e) => {
                          const current = form.getValues("roles") ?? [];
                          if (e.target.checked) form.setValue("roles", [...current, r.code], { shouldValidate: true });
                          else form.setValue("roles", current.filter((c) => c !== r.code), { shouldValidate: true });
                        }}
                      />
                      <span>{r.name}</span>
                    </label>
                  );
                })}
              </div>
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Department">
                <Input {...form.register("department")} placeholder="Engineering" />
              </FormField>
              <FormField label="Designation">
                <Input {...form.register("designation")} placeholder="Software Engineer" />
              </FormField>
            </div>
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              Default password: <span className="font-mono font-semibold">ChangeMe123!</span> — User should change it on first login.
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? "Inviting..." : "Invite User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      {editUser && <EditUserDialog user={editUser} onClose={() => setEditUser(null)} />}
      {rolesUser && <SetRolesDialog user={rolesUser} onClose={() => setRolesUser(null)} />}
      {passwordUser && <ResetPasswordDialog user={passwordUser} onClose={() => setPasswordUser(null)} />}

      <ConfirmDialog
        open={!!deleteUser}
        onOpenChange={(open) => !open && setDeleteUser(null)}
        title="Delete user?"
        description={deleteUser ? `This will permanently delete ${deleteUser.firstName} ${deleteUser.lastName} and their data. This action cannot be undone.` : ""}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteUser) return;
          await deleteUserMutation(deleteUser.id, qc);
          setDeleteUser(null);
        }}
      />

      <ConfirmDialog
        open={!!impersonateUser}
        onOpenChange={(open) => !open && setImpersonateUser(null)}
        title={impersonateUser ? `Log in as ${impersonateUser.firstName} ${impersonateUser.lastName}?` : ""}
        description="Your current session will be replaced with theirs. You'll need to log out and back in to return to your own account."
        variant="warning"
        confirmLabel="Impersonate"
        onConfirm={async () => {
          if (!impersonateUser) return;
          try {
            const session = await apiPost<import("@/lib/auth").LoginResponse>(`/users/${impersonateUser.id}/impersonate`, {});
            useAuthStore.getState().setSession(session);
            toast({ variant: "success", title: `Logged in as ${impersonateUser.firstName}` });
            setImpersonateUser(null);
            router.push("/dashboard");
          } catch (e) {
            toast({ variant: "error", title: "Impersonation failed", description: (e as Error).message });
          }
        }}
      />
    </div>
  );
}

async function deleteUserMutation(id: string, qc: ReturnType<typeof useQueryClient>) {
  try {
    const { apiDelete } = await import("@/lib/api/client");
    await apiDelete(`/users/${id}`);
    void qc.invalidateQueries({ queryKey: ["users"] });
    toast({ variant: "success", title: "User deleted" });
  } catch (e) {
    toast({ variant: "error", title: "Failed to delete user", description: (e as Error).message });
  }
}

// ── Sub-components ──

function EditUserDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const mut = useUpdateUser(user.id);
  const schema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    status: z.string(),
  });
  type V = z.infer<typeof schema>;
  const form = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? "",
      status: user.status,
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mut.mutate(v, { onSuccess: onClose }))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="First Name" required error={form.formState.errors.firstName?.message}>
              <Input {...form.register("firstName")} />
            </FormField>
            <FormField label="Last Name" required error={form.formState.errors.lastName?.message}>
              <Input {...form.register("lastName")} />
            </FormField>
          </div>
          <FormField label="Email" required error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register("email")} />
          </FormField>
          <FormField label="Phone">
            <Input {...form.register("phone")} />
          </FormField>
          <FormField label="Status">
            <Select
              value={form.watch("status")}
              onValueChange={(v) => form.setValue("status", v)}
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "INACTIVE", label: "Inactive" },
                { value: "SUSPENDED", label: "Suspended" },
                { value: "INVITED", label: "Invited" },
              ]}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SetRolesDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const mut = useSetUserRoles();
  const initial = (user.roles ?? []).map((r) => r.role.code);
  const [selected, setSelected] = useState<string[]>(initial);

  const toggle = (code: string) => {
    setSelected((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Set Roles — {user.firstName} {user.lastName}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {roleList.map((r) => (
            <label key={r.code} className="flex items-start gap-3 rounded-xl border border-border/60 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded border-slate-300"
                checked={selected.includes(r.code)}
                onChange={() => toggle(r.code)}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{r.name}</span>
                  <Badge tone={r.color} size="sm">{r.code}</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{r.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={mut.isPending || selected.length === 0}
            onClick={() => mut.mutate({ id: user.id, roles: selected }, { onSuccess: onClose })}
          >
            {mut.isPending ? "Saving..." : "Save Roles"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const mut = useResetUserPassword();
  const [newPassword, setNewPassword] = useState("");
  const valid = newPassword.length >= 8;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Reset Password — {user.firstName} {user.lastName}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            User will be forced to log back in with the new password.
          </div>
          <FormField label="New Password" required error={newPassword && !valid ? "Minimum 8 characters" : undefined}>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={mut.isPending || !valid}
            onClick={() => mut.mutate({ id: user.id, newPassword }, { onSuccess: onClose })}
          >
            {mut.isPending ? "Resetting..." : "Reset Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Permissions Tab ──

function PermissionsTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const matrixQuery = useRolesMatrix();
  const seedMut = useSeedDefaultPermissions();
  const saveMut = useSetRolePermissions();
  const [selectedRole, setSelectedRole] = useState<AppRole>("ADMIN");
  // Local edits: { role: { "resource:ACTION": boolean } }
  const [edits, setEdits] = useState<Record<string, Record<string, boolean>> | null>(null);

  // Reset edits whenever data reloads
  useEffect(() => {
    if (matrixQuery.data?.grants) {
      setEdits(structuredCloneSafe(matrixQuery.data.grants));
    }
  }, [matrixQuery.data]);

  const permissionsList = (matrixQuery.data?.permissions ?? []) as Array<{ id: string; resource: string; action: string }>;
  const resources = useMemo(() => {
    const set = new Set<string>();
    permissionsList.forEach((p) => set.add(p.resource));
    return Array.from(set).sort();
  }, [permissionsList]);

  const originalGrants = matrixQuery.data?.grants ?? {};
  const isDirty = useMemo(() => {
    if (!edits) return false;
    const current = edits[selectedRole] ?? {};
    const original = originalGrants[selectedRole] ?? {};
    const keys = new Set([...Object.keys(current), ...Object.keys(original)]);
    for (const k of keys) {
      if (!!current[k] !== !!original[k]) return true;
    }
    return false;
  }, [edits, originalGrants, selectedRole]);

  if (matrixQuery.isLoading) return <LoadingState label="Loading permissions..." />;
  if (matrixQuery.isError) return <ErrorState label="Unable to load permissions matrix." />;

  // Empty state
  if (permissionsList.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
          <div className="rounded-full bg-primary/10 p-4">
            <Database className="size-8 text-primary" />
          </div>
          <div>
            <CardTitle>No permissions configured</CardTitle>
            <CardDescription className="mt-1">Seed a comprehensive resource × action matrix to get started.</CardDescription>
          </div>
          {isSuperAdmin && (
            <Button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
              {seedMut.isPending ? "Seeding..." : "Seed default permissions"}
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const currentGrants = edits?.[selectedRole] ?? {};
  const isSuperAdminRole = selectedRole === "SUPER_ADMIN";

  const toggleCell = (resource: string, action: PermAction) => {
    if (isSuperAdminRole) return;
    const key = `${resource}:${action}`;
    setEdits((prev) => {
      const next = prev ? { ...prev } : {};
      const roleGrants = { ...(next[selectedRole] ?? {}) };
      roleGrants[key] = !roleGrants[key];
      next[selectedRole] = roleGrants;
      return next;
    });
  };

  const handleSave = () => {
    const payload: Array<{ resource: string; action: string; granted: boolean }> = [];
    for (const resource of resources) {
      for (const action of PERMISSION_ACTIONS) {
        const key = `${resource}:${action}`;
        payload.push({ resource, action, granted: !!currentGrants[key] });
      }
    }
    saveMut.mutate({ code: selectedRole, permissions: payload });
  };

  const handleReset = () => {
    setEdits(structuredCloneSafe(originalGrants));
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Role Permissions</CardTitle>
            <CardDescription className="mt-1">Edit granular resource × action grants for each role. SUPER_ADMIN always has all permissions.</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isSuperAdmin && (
              <Button variant="secondary" size="sm" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
                <Database className="mr-1 size-4" />
                {seedMut.isPending ? "Seeding..." : "Seed defaults"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={!isDirty}>
              <RotateCcw className="mr-1 size-4" /> Reset
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!isDirty || saveMut.isPending || !isSuperAdmin || isSuperAdminRole}>
              {saveMut.isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>

        {/* Role selector */}
        <div className="mt-4 flex flex-wrap gap-2">
          {ROLE_CODES.map((code) => (
            <button
              key={code}
              onClick={() => setSelectedRole(code)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                selectedRole === code
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {code}
            </button>
          ))}
        </div>

        {isSuperAdminRole && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            SUPER_ADMIN always has all permissions — this role is read-only.
          </div>
        )}

        {/* Matrix */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 text-left font-semibold text-slate-500">Resource</th>
                {PERMISSION_ACTIONS.map((a) => (
                  <th key={a} className="px-2 py-2 text-center font-semibold text-slate-500">{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium capitalize text-slate-700 dark:text-slate-300">{resource}</td>
                  {PERMISSION_ACTIONS.map((action) => {
                    const key = `${resource}:${action}`;
                    const granted = isSuperAdminRole ? true : !!currentGrants[key];
                    const disabled = isSuperAdminRole || !isSuperAdmin;
                    return (
                      <td key={action} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-slate-300 disabled:opacity-50"
                          checked={granted}
                          disabled={disabled}
                          onChange={() => toggleCell(resource, action)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
