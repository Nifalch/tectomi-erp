"use client";

import { useParams, useRouter } from "next/navigation";
import { FormPageLayout } from "@/components/layouts/form-page-layout";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { DocumentBuilder, useBuilderState, type BuilderState } from "@/components/accounting/document-builder";
import { useEstimate } from "@/lib/api/hooks";
import { useUpdateEstimate } from "@/lib/api/mutations";

export default function EditEstimatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";
  const query = useEstimate(id);

  if (query.isLoading) return <LoadingState label="Loading estimate..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load estimate." />;

  return <EditEstimateForm id={id} est={query.data as Record<string, unknown>} onDone={() => router.push("/estimates")} />;
}

interface EditEstimateFormProps {
  id: string;
  est: Record<string, unknown>;
  onDone: () => void;
}

function EditEstimateForm({ id, est, onDone }: EditEstimateFormProps) {
  const updateMutation = useUpdateEstimate(id);

  const initial: Partial<BuilderState> = {
    partyId: (est.clientId as string) ?? "",
    projectId: (est.projectId as string) ?? "",
    issueDate: est.issueDate ? new Date(est.issueDate as string) : new Date(),
    expiryDate: est.expiryDate ? new Date(est.expiryDate as string) : undefined,
    notes: (est.notes as string) ?? "",
    terms: (est.terms as string) ?? "",
    discount: Number(est.discountAmount ?? est.discount ?? 0),
    items: Array.isArray(est.items) && est.items.length > 0
      ? (est.items as Array<Record<string, unknown>>).map((it) => ({
          itemId: (it.itemId as string) ?? undefined,
          description: (it.description as string) ?? "",
          duration: (it.duration as string) ?? undefined,
          quantity: Number(it.quantity ?? 1),
          price: Number(it.price ?? 0),
          taxRateId: (it.taxRateId as string) ?? undefined,
        }))
      : [{ description: "", quantity: 1, price: 0 }],
  };

  const [state, patch] = useBuilderState(initial);

  const save = () => {
    updateMutation.mutate(
      {
        clientId: state.partyId,
        projectId: state.projectId || undefined,
        issueDate: state.issueDate?.toISOString(),
        expiryDate: state.expiryDate?.toISOString(),
        notes: state.notes,
        terms: state.terms,
        discountAmount: state.discount,
        items: state.items.map((i) => ({
          itemId: i.itemId || undefined,
          description: i.description,
          quantity: i.quantity,
          price: i.price,
          taxRateId: i.taxRateId || undefined,
        })),
      },
      { onSuccess: onDone },
    );
  };

  return (
    <FormPageLayout
      module="proposals"
      title="Edit Estimate"
      breadcrumbs={[{ label: "Estimates", href: "/estimates" }, { label: "Edit" }]}
      onSubmit={save}
      onCancel={onDone}
      submitLabel="Save"
      loading={updateMutation.isPending}
    >
      <DocumentBuilder mode="estimate" state={state} onChange={patch} partyType="client" />
    </FormPageLayout>
  );
}
