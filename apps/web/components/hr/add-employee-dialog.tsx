"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useCreateEmployee, type CreateEmployeeInput } from "@/lib/api/mutations";
import { toast } from "@/lib/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const EMPLOYMENT_TYPES: CreateEmployeeInput["employmentType"][] = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
];

const ROLE_OPTIONS = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "PROJECT_MANAGER", label: "Project Manager" },
  { value: "HR_MANAGER", label: "HR Manager" },
  { value: "FINANCE_MANAGER", label: "Finance Manager" },
  { value: "ADMIN", label: "Admin" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

export function AddEmployeeDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const mutation = useCreateEmployee();
  // Created-account confirmation — surfaces the temp password so the admin can
  // hand it to the new hire if the welcome email fails to land.
  const [created, setCreated] = useState<{
    email: string;
    tempPassword: string;
    userId: string;
    name: string;
  } | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [employmentType, setEmploymentType] =
    useState<CreateEmployeeInput["employmentType"]>("FULL_TIME");
  const [joinDate, setJoinDate] = useState(todayIso());
  const [salary, setSalary] = useState<number | null>(null);
  const [hourlyRate, setHourlyRate] = useState<number | null>(null);
  const [primaryRole, setPrimaryRole] = useState<string>("EMPLOYEE");

  const reset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setDepartment("");
    setDesignation("");
    setEmploymentType("FULL_TIME");
    setJoinDate(todayIso());
    setSalary(null);
    setHourlyRate(null);
    setPrimaryRole("EMPLOYEE");
  };

  const closeAndReset = () => {
    setCreated(null);
    reset();
    onOpenChange(false);
    router.refresh();
  };

  const submit = () => {
    setSubmitted(true);
    // Surface validation failures explicitly — silently returning was the
    // bug: clicking "Add employee" did nothing if any required field was
    // blank and the user had no idea why.
    const missing: string[] = [];
    if (!firstName.trim()) missing.push("first name");
    if (!lastName.trim()) missing.push("last name");
    if (!email.trim()) missing.push("email");
    if (!department.trim()) missing.push("department");
    if (!designation.trim()) missing.push("designation");
    if (salary == null || salary <= 0) missing.push("salary");
    if (missing.length > 0) {
      toast({
        variant: "error",
        title: "Missing required fields",
        description: missing.join(", "),
      });
      return;
    }
    // Basic email sanity check — backend validates too but a friendly
    // hint here saves a round-trip.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast({ variant: "error", title: "Email looks wrong", description: "Use a valid email address." });
      return;
    }
    const fullName = `${firstName} ${lastName}`.trim();
    const targetEmail = email;
    // Salary is non-null here because the validation block above bails on
    // `salary == null || salary <= 0`. Cast to keep TS happy without a
    // separate guard variable.
    const payload: CreateEmployeeInput = {
      firstName,
      lastName,
      email,
      phone: phone || undefined,
      department,
      designation,
      employmentType,
      joinDate,
      salary: salary as number,
      hourlyRate: hourlyRate ?? undefined,
      roles: [primaryRole],
    };
    mutation.mutate(payload, {
      onSuccess: (res) => {
        if (res?.user?.id && res.tempPassword) {
          setCreated({
            email: targetEmail,
            tempPassword: res.tempPassword,
            userId: res.user.id,
            name: fullName,
          });
        } else {
          closeAndReset();
        }
      },
    });
  };

  // Track whether the user has attempted a submit, so we only mark fields
  // red after they've seen at least one failed attempt.
  const [submitted, setSubmitted] = useState(false);
  const showMissing = (val: string | null | number) => submitted && (val == null || (typeof val === "string" && !val.trim()) || (typeof val === "number" && val <= 0));

  const copyTempPassword = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.tempPassword);
      toast({ variant: "success", title: "Temp password copied" });
    } catch {
      toast({ variant: "error", title: "Couldn't copy", description: "Select and copy manually." });
    }
  };

  // Post-creation success view — surfaces the temp password and the path
  // to the new hire's HR detail page so the admin can finish setup in one go.
  if (created) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && closeAndReset()}>
        <DialogContent size="md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <DialogTitle>Account created</DialogTitle>
                <DialogDescription>
                  Welcome email sent to {created.email}. Share the temp password if the email doesn&apos;t land.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-slate-50 p-4 dark:bg-slate-900/60">
              <div className="text-xs uppercase tracking-wider text-slate-500">Login email</div>
              <div className="mt-1 font-medium text-slate-900 dark:text-white">{created.email}</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700/50 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300">
                <KeyRound className="size-3.5" /> Temporary password — show once
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-white px-3 py-2 font-mono text-sm font-semibold text-slate-900 dark:bg-slate-950 dark:text-white">
                  {created.tempPassword}
                </code>
                <Button variant="secondary" size="sm" onClick={copyTempPassword}>
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                The new hire should change this on first login.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={closeAndReset}>
              Done
            </Button>
            <Button
              onClick={() => {
                const userId = created.userId;
                closeAndReset();
                router.push(`/hr/employees/${userId}`);
              }}
            >
              Open profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>
            Create the user account and HR profile in one step. An invite is sent to the email.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First name" required>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                error={showMissing(firstName)}
              />
            </Field>
            <Field label="Last name" required>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                error={showMissing(lastName)}
              />
            </Field>
          </div>

          <Field label="Work email" required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={showMissing(email)}
            />
          </Field>
          <Field label="Phone (optional)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Department" required>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                error={showMissing(department)}
              />
            </Field>
            <Field label="Designation" required>
              <Input
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                error={showMissing(designation)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Employment type">
              <Select
                value={employmentType}
                onValueChange={(v) =>
                  setEmploymentType(v as CreateEmployeeInput["employmentType"])
                }
                options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t.replace("_", " ") }))}
              />
            </Field>
            <Field label="Join date">
              <Input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Salary (annual)" required>
              <NumberInput
                value={salary}
                onChange={setSalary}
                placeholder="0"
                error={showMissing(salary)}
              />
            </Field>
            <Field label="Hourly rate (optional)">
              <NumberInput value={hourlyRate} onChange={setHourlyRate} placeholder="0.00" suffix="/hr" />
            </Field>
          </div>

          <Field label="Primary role">
            <Select value={primaryRole} onValueChange={setPrimaryRole} options={ROLE_OPTIONS} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Adding..." : "Add employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}
