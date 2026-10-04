"use client";

import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { useDeal } from "@/lib/api/hooks";
import { useUpdateDeal, useDeleteDeal } from "@/lib/api/mutations";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { formatCurrency } from "@/lib/utils";

interface Props {
  dealId: string | null;
  onClose: () => void;
}

interface Deal {
  id: string;
  name: string;
  stage: string;
  amount?: number | null;
  probability?: number | null;
  expectedCloseDate?: string | null;
  description?: string | null;
  lostReason?: string | null;
  clientId?: string;
  client?: { companyName?: string };
}

const STAGES = ["PROSPECTING", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"];

const stageTone: Record<string, "info" | "neutral" | "warning" | "positive" | "destructive"> = {
  PROSPECTING: "info",
  QUALIFICATION: "info",
  PROPOSAL: "warning",
  NEGOTIATION: "warning",
  CLOSED_WON: "positive",
  CLOSED_LOST: "destructive",
};

export function DealDetailDrawer({ dealId, onClose }: Props) {
  const query = useDeal(dealId);
  const updateMutation = useUpdateDeal(dealId ?? "");
  const deleteMutation = useDeleteDeal();

  const deal = (query.data as unknown as Deal | undefined) ?? null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (deal) {
      setName(deal.name ?? "");
      setDescription(deal.description ?? "");
      setLostReason(deal.lostReason ?? "");
    }
  }, [deal]);

  if (!dealId) return null;

  const handleUpdate = (field: string, value: unknown) => {
    updateMutation.mutate({ [field]: value });
  };

  const handleDelete = () => {
    if (!deal) return;
    deleteMutation.mutate(deal.id, { onSuccess: onClose });
  };

  return (
    <Drawer open={!!dealId} onOpenChange={(open) => !open && onClose()} title="Deal Details" size="lg">
      {query.isLoading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : !deal ? (
        <div className="text-sm text-slate-400">Deal not found</div>
      ) : (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== deal.name && handleUpdate("name", name)}
              className="text-lg font-semibold"
            />
            <Badge tone={stageTone[deal.stage] ?? "neutral"} dot size="sm">
              {deal.stage.replace("_", " ")}
            </Badge>
          </div>

          <div className="text-sm text-slate-500">
            {deal.client?.companyName ?? "—"}
            {deal.amount != null && <> · {formatCurrency(Number(deal.amount))}</>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">Stage</div>
              <Select
                value={deal.stage}
                onValueChange={(v) => handleUpdate("stage", v)}
                options={STAGES.map((s) => ({ value: s, label: s.replace("_", " ") }))}
              />
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">Probability (%)</div>
              <NumberInput
                value={deal.probability ?? null}
                onChange={(v) => handleUpdate("probability", v)}
                suffix="%"
              />
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">Amount</div>
              <NumberInput
                value={deal.amount ?? null}
                onChange={(v) => handleUpdate("amount", v)}
                prefix="$"
              />
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">Expected Close</div>
              <DatePicker
                value={deal.expectedCloseDate ? new Date(deal.expectedCloseDate) : undefined}
                onChange={(d) => handleUpdate("expectedCloseDate", d?.toISOString())}
              />
            </div>
          </div>

          {deal.stage === "CLOSED_LOST" && (
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">Lost Reason</div>
              <Input
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                onBlur={() => lostReason !== (deal.lostReason ?? "") && handleUpdate("lostReason", lostReason)}
              />
            </div>
          )}

          <div>
            <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">Description</div>
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== (deal.description ?? "") && handleUpdate("description", description)}
              className="min-h-[100px]"
            />
          </div>

          {/* Activities */}
          <ActivityTimeline scope={{ dealId: deal.id }} />

          <div className="flex items-center justify-between border-t pt-4">
            <Button variant="ghost" className="text-red-500" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 size-4" /> Delete Deal
            </Button>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete deal"
        description={`Delete "${deal?.name ?? ""}"?`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        loading={deleteMutation.isPending}
      />
    </Drawer>
  );
}
