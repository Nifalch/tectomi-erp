"use client";

import { useParams, useRouter } from "next/navigation";
import { FormPageLayout } from "@/components/layouts/form-page-layout";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { DocumentBuilder, useBuilderState, type BuilderState } from "@/components/accounting/document-builder";
import { useInvoice } from "@/lib/api/hooks";
import { useUpdateInvoice } from "@/lib/api/mutations";

/**
 * Edit a DRAFT invoice. The API rejects updates once the invoice has been
 * sent/paid/voided; the UI here doesn't gate it (the toast surfaces the 400
 * from the server). The list page only shows the pencil-edit icon for DRAFT
 * rows anyway.
 */
export default function EditInvoicePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";
  const query = useInvoice(id);

  if (query.isLoading) return <LoadingState label="Loading invoice..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load invoice." />;

  // Render the form ONLY after the invoice data is in hand, so useBuilderState
  // can seed itself from real values. Avoids the Radix Select race where the
  // value got cleared when assigned before its matching option existed.
  return <EditInvoiceForm id={id} inv={query.data as Record<string, unknown>} onDone={() => router.push("/invoices")} />;
}

interface EditInvoiceFormProps {
  id: string;
  inv: Record<string, unknown>;
  onDone: () => void;
}

function EditInvoiceForm({ id, inv, onDone }: EditInvoiceFormProps) {
  const updateMutation = useUpdateInvoice(id);

  const initial: Partial<BuilderState> = {
    partyId: (inv.clientId as string) ?? "",
    projectId: (inv.projectId as string) ?? "",
    issueDate: inv.issueDate ? new Date(inv.issueDate as string) : new Date(),
    dueDate: inv.dueDate ? new Date(inv.dueDate as string) : undefined,
    notes: (inv.notes as string) ?? "",
    discount: Number(inv.discountAmount ?? 0),
    items: Array.isArray(inv.items) && inv.items.length > 0
      ? (inv.items as Array<Record<string, unknown>>).map((it) => ({
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
        dueDate: state.dueDate?.toISOString(),
        notes: state.notes,
        discountAmount: state.discount,
        items: state.items.map((i) => ({
          description: i.description,
          duration: i.duration?.trim() ? i.duration.trim() : undefined,
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
      module="invoices"
      title="Edit Invoice"
      breadcrumbs={[{ label: "Invoices", href: "/invoices" }, { label: "Edit" }]}
      onSubmit={save}
      onCancel={onDone}
      submitLabel="Save changes"
      loading={updateMutation.isPending}
    >
      <DocumentBuilder mode="invoice" state={state} onChange={patch} partyType="client" />
    </FormPageLayout>
  );
}
