"use client";

import { useRouter } from "next/navigation";
import { FormPageLayout } from "@/components/layouts/form-page-layout";
import { Button } from "@/components/ui/button";
import { DocumentBuilder, useBuilderState } from "@/components/accounting/document-builder";
import { useCreateEstimate, useSendEstimate } from "@/lib/api/mutations";

export default function NewEstimatePage() {
  const router = useRouter();
  const [state, patch] = useBuilderState();
  const createMutation = useCreateEstimate();
  const sendMutation = useSendEstimate();

  const buildPayload = () => ({
    clientId: state.partyId,
    projectId: state.projectId || undefined,
    issueDate: state.issueDate?.toISOString(),
    expiryDate: state.expiryDate?.toISOString(),
    notes: state.notes,
    terms: state.terms,
    discountAmount: state.discount,
    items: state.items.filter((i) => i.description && i.price >= 0).map((i) => ({
      itemId: i.itemId || undefined,
      description: i.description,
      quantity: i.quantity,
      price: i.price,
      taxRateId: i.taxRateId || undefined,
    })),
  });

  const saveDraft = () => {
    createMutation.mutate(buildPayload(), { onSuccess: () => router.push("/estimates") });
  };

  const saveAndSend = () => {
    createMutation.mutate(buildPayload(), {
      onSuccess: (data: unknown) => {
        const id = (data as { id?: string })?.id;
        if (id) sendMutation.mutate(id, { onSuccess: () => router.push("/estimates") });
        else router.push("/estimates");
      },
    });
  };

  return (
    <FormPageLayout
      module="proposals"
      title="New Estimate"
      breadcrumbs={[{ label: "Estimates", href: "/estimates" }, { label: "New" }]}
      onSubmit={saveAndSend}
      onCancel={() => router.push("/estimates")}
      submitLabel="Save & Send"
      loading={createMutation.isPending}
      extraActions={
        <Button
          type="button"
          variant="secondary"
          onClick={saveDraft}
          disabled={createMutation.isPending}
        >
          Save as Draft
        </Button>
      }
    >
      <DocumentBuilder mode="estimate" state={state} onChange={patch} partyType="client" />
    </FormPageLayout>
  );
}
