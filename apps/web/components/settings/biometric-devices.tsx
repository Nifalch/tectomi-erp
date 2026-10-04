"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Fingerprint,
  Loader2,
  RotateCcw,
  ShieldOff,
  Trash2,
  XCircle,
} from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import {
  useBiometricDevices,
  useBiometricLogs,
  useBiometricUnmapped,
  useUsers,
  type BiometricDevice,
  type BiometricLogRow,
  type UnmappedEnrollment,
} from "@/lib/api/hooks";
import {
  useDeleteBiometricDevice,
  useReprocessBiometricDevice,
  useSetUserEnrollId,
  useUpdateBiometricDevice,
} from "@/lib/api/mutations";

// Quick-format an ISO date for the "last seen" / "punch at" columns.
// Empty string for null so the cell renders a dash via the caller.
function fmt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type UserOption = { id: string; firstName?: string; lastName?: string; email?: string; biometricEnrollId?: string | null };

export function BiometricDevicesCard() {
  const devicesQ = useBiometricDevices();
  const unmappedQ = useBiometricUnmapped();
  const logsQ = useBiometricLogs(50);
  const usersQ = useUsers();

  const users: UserOption[] = useMemo(
    () => (usersQ.data?.data as unknown as UserOption[]) ?? [],
    [usersQ.data],
  );

  if (devicesQ.isLoading) {
    return (
      <Card className="p-6">
        <LoadingState label="Loading biometric devices…" />
      </Card>
    );
  }
  if (devicesQ.error) {
    return (
      <Card className="p-6">
        <ErrorState label="Couldn't load biometric devices — try refreshing the page." />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <DevicesPanel devices={devicesQ.data ?? []} />
      <EnrollmentMappingPanel
        unmapped={unmappedQ.data ?? []}
        users={users}
        loading={unmappedQ.isLoading || usersQ.isLoading}
      />
      <LogsPanel logs={logsQ.data ?? []} loading={logsQ.isLoading} />
    </div>
  );
}

// ───────────────── Devices ─────────────────

function DevicesPanel({ devices }: { devices: BiometricDevice[] }) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start gap-3">
        <Fingerprint className="mt-1 h-5 w-5 text-emerald-500" />
        <div className="flex-1">
          <CardTitle>ESSL / Biometric Devices</CardTitle>
          <CardDescription className="mt-1">
            Devices auto-register when they first connect via the cloud push protocol.
            Approve a device to start syncing its punches into attendance.
          </CardDescription>
        </div>
      </div>

      {devices.length === 0 ? (
        <EmptyDevicesHint />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <THead>
              <tr>
                <TH>Serial</TH>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>Punches</TH>
                <TH>Last seen</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {devices.map((d) => (
                <DeviceRow key={d.id} device={d} />
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function DeviceRow({ device }: { device: BiometricDevice }) {
  const [name, setName] = useState(device.name ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const update = useUpdateBiometricDevice();
  const remove = useDeleteBiometricDevice();
  const reprocess = useReprocessBiometricDevice();

  const dirty = name !== (device.name ?? "");

  return (
    <tr>
      <TD className="font-mono text-xs">{device.serialNumber}</TD>
      <TD>
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Reception"
            className="h-9 w-44"
          />
          {dirty && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => update.mutate({ id: device.id, name })}
              disabled={update.isPending}
            >
              Save
            </Button>
          )}
        </div>
      </TD>
      <TD>
        {device.approved ? (
          <Badge tone="positive" size="sm" dot>
            Approved
          </Badge>
        ) : (
          <Badge tone="warning" size="sm" dot>
            Quarantined
          </Badge>
        )}
      </TD>
      <TD>{device._count?.logs ?? 0}</TD>
      <TD className="text-xs text-slate-500">{fmt(device.lastSeenAt) || "—"}</TD>
      <TD>
        <div className="flex items-center justify-end gap-2">
          {device.approved ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => update.mutate({ id: device.id, approved: false })}
              disabled={update.isPending}
            >
              <ShieldOff className="mr-1 h-3.5 w-3.5" /> Suspend
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => update.mutate({ id: device.id, approved: true })}
              disabled={update.isPending}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            title="Re-sync quarantined punches into attendance"
            onClick={() => reprocess.mutate(device.id)}
            disabled={reprocess.isPending || !device.approved}
          >
            {reprocess.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:text-red-600"
            onClick={() => setConfirmRemove(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title={`Remove ${device.name || device.serialNumber}?`}
          description="This deletes the device and ALL its biometric logs. Attendance rows already synced from those logs are kept."
          variant="destructive"
          confirmLabel="Remove device"
          loading={remove.isPending}
          onConfirm={async () => {
            // mutateAsync re-throws on failure; swallow here so the
            // dialog can close cleanly without an unhandled rejection
            // bubbling up (the mutation's onError already toasts).
            try {
              await remove.mutateAsync(device.id);
            } catch {
              /* error already surfaced via toast */
            }
            setConfirmRemove(false);
          }}
        />
      </TD>
    </tr>
  );
}

function EmptyDevicesHint() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-slate-50/60 p-6 text-sm text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
      <p className="font-medium">No biometric devices yet.</p>
      <p className="mt-1 text-xs text-slate-500">
        Set the device&apos;s Cloud Server Setting to{" "}
        <code className="rounded bg-slate-200 px-1 py-0.5 text-[11px] dark:bg-slate-800">
          {process.env.NEXT_PUBLIC_API_URL ?? "your API host"}
        </code>{" "}
        and it&apos;ll appear here within a few seconds of its next handshake.
      </p>
    </div>
  );
}

// ───────────────── Enrollment mapping ─────────────────

function EnrollmentMappingPanel({
  unmapped,
  users,
  loading,
}: {
  unmapped: UnmappedEnrollment[];
  users: UserOption[];
  loading: boolean;
}) {
  const setEnroll = useSetUserEnrollId();
  const [pickedUser, setPickedUser] = useState<Record<string, string>>({});

  // Users that already have a biometric enroll ID set — useful to show
  // "already mapped" badges next to candidates in the picker.
  const mappedUsers = useMemo(
    () => users.filter((u) => u.biometricEnrollId),
    [users],
  );

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start gap-3">
        <Fingerprint className="mt-1 h-5 w-5 text-indigo-500" />
        <div className="flex-1">
          <CardTitle>Map Enrollment IDs to Employees</CardTitle>
          <CardDescription className="mt-1">
            Each row is a device enroll ID with at least one punch but no matching employee.
            Pick the right user — past punches will retroactively appear in their attendance.
          </CardDescription>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading…" />
      ) : unmapped.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-slate-50/60 p-4 text-sm text-slate-500 dark:bg-slate-900/40">
          Every device enroll ID is mapped. Nice.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <THead>
              <tr>
                <TH>Enroll ID</TH>
                <TH>Last punch</TH>
                <TH>Punches seen</TH>
                <TH>Assign to user</TH>
                <TH className="text-right">Action</TH>
              </tr>
            </THead>
            <TBody>
              {unmapped.map((row) => {
                const key = `${row.deviceId}|${row.deviceUserId}`;
                const selectedUserId = pickedUser[key] ?? "";
                return (
                  <tr key={key}>
                    <TD className="font-mono text-xs">{row.deviceUserId}</TD>
                    <TD className="text-xs text-slate-500">{fmt(row.lastSeen)}</TD>
                    <TD>{row.punchCount}</TD>
                    <TD>
                      <Select
                        value={selectedUserId}
                        onValueChange={(v) =>
                          setPickedUser((prev) => ({ ...prev, [key]: v }))
                        }
                        placeholder="Select employee…"
                        size="sm"
                        className="w-64"
                        options={users.map((u) => ({
                          value: u.id,
                          label:
                            `${u.firstName ?? ""} ${u.lastName ?? ""} (${u.email ?? ""})` +
                            (u.biometricEnrollId
                              ? ` · already #${u.biometricEnrollId}`
                              : ""),
                        }))}
                      />
                    </TD>
                    <TD>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          disabled={!selectedUserId || setEnroll.isPending}
                          onClick={() =>
                            setEnroll.mutate({
                              userId: selectedUserId,
                              enrollId: row.deviceUserId,
                            })
                          }
                        >
                          {setEnroll.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Map"
                          )}
                        </Button>
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}

      {mappedUsers.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            Already mapped
          </p>
          <ul className="flex flex-wrap gap-2 text-xs">
            {mappedUsers.map((u) => (
              <li
                key={u.id}
                className="flex items-center gap-2 rounded-full border border-border px-2.5 py-1"
              >
                <span>
                  {u.firstName} {u.lastName}
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  #{u.biometricEnrollId}
                </span>
                <button
                  className="text-slate-400 hover:text-red-500"
                  title="Remove mapping"
                  onClick={() =>
                    setEnroll.mutate({ userId: u.id, enrollId: null })
                  }
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ───────────────── Recent logs ─────────────────

function LogsPanel({ logs, loading }: { logs: BiometricLogRow[]; loading: boolean }) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start gap-3">
        <Fingerprint className="mt-1 h-5 w-5 text-sky-500" />
        <div className="flex-1">
          <CardTitle>Recent Biometric Punches</CardTitle>
          <CardDescription className="mt-1">
            Most recent 50 raw punches received from devices. Useful when debugging a
            missed clock-in.
          </CardDescription>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading…" />
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-500">No punches received yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <THead>
              <tr>
                <TH>When</TH>
                <TH>Device</TH>
                <TH>Enroll ID</TH>
                <TH>Employee</TH>
                <TH>Synced</TH>
              </tr>
            </THead>
            <TBody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <TD className="whitespace-nowrap text-xs text-slate-600">{fmt(log.punchAt)}</TD>
                  <TD className="text-xs">
                    {log.device.name || (
                      <span className="font-mono">{log.device.serialNumber}</span>
                    )}
                  </TD>
                  <TD className="font-mono text-xs">{log.deviceUserId}</TD>
                  <TD>
                    {log.user ? (
                      <span className="text-sm">
                        {log.user.firstName} {log.user.lastName}
                      </span>
                    ) : (
                      <Badge tone="warning" size="sm">
                        Unmapped
                      </Badge>
                    )}
                  </TD>
                  <TD>
                    {log.processed ? (
                      <Badge tone="positive" size="sm" dot>
                        Yes
                      </Badge>
                    ) : (
                      <Badge tone="neutral" size="sm" dot>
                        Pending
                      </Badge>
                    )}
                  </TD>
                </tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
