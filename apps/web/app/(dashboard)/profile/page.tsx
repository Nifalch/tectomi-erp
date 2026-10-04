"use client";

import Link from "next/link";
import { useState } from "react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/components/ui/role-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { ChangePasswordCard } from "@/components/profile/change-password-card";
import { useAuthStore } from "@/lib/store/auth-store";
import { apiFetch } from "@/lib/api/client";
import { toast } from "@/lib/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import type { AppRole } from "@nuro7/contracts";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const query = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => apiFetch<Record<string, unknown>>("/auth/me"),
    enabled: !!user,
  });

  if (query.isLoading) return <LoadingState label="Loading profile..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load profile." />;

  const profile = query.data as {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    status: string;
    roles: Array<{ role: { code: string; name: string } }>;
    employeeProfile?: {
      department: string;
      designation: string;
      salary?: number;
      joinDate?: string;
      employmentType: string;
      performanceScore?: number;
    };
    createdAt: string;
  };

  const role = profile.roles?.[0]?.role?.code as AppRole | undefined;

  return (
    <div className="flex flex-col gap-8">
      <ModuleHeader module="settings" title="My Profile" description="Your account details and employment information." />

      <div className="flex justify-start">
        <Link href="/hr/employees/me">
          <Button variant="secondary">View my full HR profile →</Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Card */}
        <Card className="md:col-span-1">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-2xl font-bold text-white">
              {profile.firstName?.[0]}{profile.lastName?.[0]}
            </div>
            <h2 className="mt-4 text-lg font-semibold">{profile.firstName} {profile.lastName}</h2>
            <p className="text-sm text-slate-500">{profile.email}</p>
            <div className="mt-3 flex items-center gap-2">
              {role && <RoleBadge role={role} />}
              <Badge tone="positive" size="sm" dot>{profile.status}</Badge>
            </div>
          </div>
        </Card>

        {/* Account Details */}
        <Card className="md:col-span-2">
          <CardTitle>Account Details</CardTitle>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">First Name</span>
              <div className="mt-1 font-medium">{profile.firstName}</div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">Last Name</span>
              <div className="mt-1 font-medium">{profile.lastName}</div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">Email</span>
              <div className="mt-1">{profile.email}</div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">Phone</span>
              <div className="mt-1">{profile.phone ?? "Not set"}</div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">Role</span>
              <div className="mt-1">{profile.roles?.[0]?.role?.name ?? "—"}</div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">Member Since</span>
              <div className="mt-1">{new Date(profile.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        </Card>

        {/* Employment Info */}
        {profile.employeeProfile && (
          <Card className="md:col-span-3">
            <CardTitle>Employment Information</CardTitle>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400">Department</span>
                <div className="mt-1"><Badge tone="hr" size="sm" dot>{profile.employeeProfile.department}</Badge></div>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400">Designation</span>
                <div className="mt-1 font-medium">{profile.employeeProfile.designation}</div>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400">Employment Type</span>
                <div className="mt-1"><Badge tone="info" size="sm">{profile.employeeProfile.employmentType}</Badge></div>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400">Join Date</span>
                <div className="mt-1">{profile.employeeProfile.joinDate ? new Date(profile.employeeProfile.joinDate).toLocaleDateString() : "—"}</div>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400">Salary</span>
                <div className="mt-1 font-semibold">{profile.employeeProfile.salary ? formatCurrency(Number(profile.employeeProfile.salary)) : "—"}</div>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400">Performance Score</span>
                <div className="mt-1">
                  {profile.employeeProfile.performanceScore != null ? (
                    <Badge tone={Number(profile.employeeProfile.performanceScore) >= 4 ? "positive" : Number(profile.employeeProfile.performanceScore) >= 3 ? "warning" : "destructive"}>
                      {Number(profile.employeeProfile.performanceScore).toFixed(1)} / 5.0
                    </Badge>
                  ) : "Not rated"}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Security */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <ChangePasswordCard />
        </div>
      </div>
    </div>
  );
}
