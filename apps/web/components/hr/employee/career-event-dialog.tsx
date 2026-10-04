"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useAddCareerEvent } from "@/lib/api/employee-profile";

const TYPES = [
  { value: "PROMOTED", label: "Promoted" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "SALARY_CHANGE", label: "Salary change" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "REJOINED", label: "Rejoined" },
];

export function CareerEventDialog({ userId, open, onOpenChange }: { userId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const m = useAddCareerEvent(userId);
  const [type, setType] = useState("PROMOTED");
  const [fromValue, setFromValue] = useState("");
  const [toValue, setToValue] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  const submit = () => {
    m.mutate(
      { type, fromValue: fromValue || undefined, toValue: toValue || undefined, effectiveDate, reason: reason || undefined },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Log career event</DialogTitle>
          <DialogDescription>Record a promotion, transfer, salary change, or status change.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
            <Select value={type} onValueChange={setType} options={TYPES} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
              <Input value={fromValue} onChange={(e) => setFromValue(e.target.value)} placeholder="e.g. Engineer" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
              <Input value={toValue} onChange={(e) => setToValue(e.target.value)} placeholder="e.g. Senior Engineer" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Effective date</label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Reason (optional)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={m.isPending}>{m.isPending ? "Saving..." : "Log event"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
