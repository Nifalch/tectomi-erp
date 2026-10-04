"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useTerminateEmployee } from "@/lib/api/hr-hub";

interface Props {
  userId: string;
  employeeName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function TerminateEmployeeDialog({ userId, employeeName, open, onOpenChange, onSuccess }: Props) {
  const m = useTerminateEmployee(userId);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");

  const submit = () => {
    if (confirm.trim() !== employeeName) return;
    m.mutate(
      { effectiveDate, reason: reason || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Terminate employee</DialogTitle>
          <DialogDescription>
            This will deactivate <span className="font-medium">{employeeName}</span>&apos;s account and release their assigned
            assets. This is reversible only by manual edit.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Effective date</label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Reason (optional)</label>
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Type <span className="font-mono">{employeeName}</span> to confirm
            </label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={m.isPending || confirm.trim() !== employeeName}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {m.isPending ? "Terminating..." : "Terminate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
