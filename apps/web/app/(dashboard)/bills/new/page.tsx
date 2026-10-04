"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormPageLayout } from "@/components/layouts/form-page-layout";
import { DocumentBuilder, useBuilderState } from "@/components/accounting/document-builder";
import { useCreateBill, useCreateVendor } from "@/lib/api/mutations";
import { toast } from "@/lib/hooks/use-toast";

export default function NewBillPage() {
  const router = useRouter();
  const [state, patch] = useBuilderState();
  const createMutation = useCreateBill();
  const createVendor = useCreateVendor();
  const [resolving, setResolving] = useState(false);

  const save = async () => {
    // Resolve vendor: if user picked an existing one (partyId set) we're
    // done. Otherwise we have a free-typed partyName — auto-create the
    // vendor first, then attach the new id to the bill.
    let vendorId = state.partyId;
    const typedName = state.partyName?.trim();
    if (!vendorId && typedName) {
      setResolving(true);
      try {
        const created = await createVendor.mutateAsync({ companyName: typedName });
        vendorId = (created as { id?: string } | null)?.id ?? "";
      } catch {
        setResolving(false);
        return; // toast already shown by mutation
      }
      setResolving(false);
    }
    if (!vendorId) {
      toast({ variant: "error", title: "Vendor required" });
      return;
    }
    createMutation.mutate({
      vendorId,
      projectId: state.projectId || undefined,
      issueDate: state.issueDate?.toISOString(),
      dueDate: state.dueDate?.toISOString(),
      notes: state.notes,
      terms: state.terms,
      discountAmount: state.discount,
      items: state.items.filter((i) => i.description).map((i) => ({
        itemId: i.itemId || undefined,
        description: i.description,
        quantity: i.quantity,
        price: i.price,
        taxRateId: i.taxRateId || undefined,
        accountId: i.accountId || undefined,
      })),
    }, { onSuccess: () => router.push("/bills") });
  };

  return (
    <FormPageLayout
      module="accounts"
      title="New Bill"
      breadcrumbs={[{ label: "Bills", href: "/bills" }, { label: "New" }]}
      onSubmit={save}
      onCancel={() => router.push("/bills")}
      submitLabel="Save Bill"
      loading={createMutation.isPending || resolving}
    >
      <DocumentBuilder mode="bill" state={state} onChange={patch} partyType="vendor" showAccountPerLine />
    </FormPageLayout>
  );
}
