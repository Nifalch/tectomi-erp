"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FormPageLayout } from "@/components/layouts/form-page-layout";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { DocumentBuilder, useBuilderState } from "@/components/accounting/document-builder";
import { useBill } from "@/lib/api/hooks";
import { useUpdateBill, useCreateVendor } from "@/lib/api/mutations";
import { toast } from "@/lib/hooks/use-toast";

export default function EditBillPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";
  const query = useBill(id);
  const updateMutation = useUpdateBill(id);
  const createVendor = useCreateVendor();
  const [state, patch, setState] = useBuilderState();
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const b = query.data as Record<string, unknown> | undefined;
    if (!b) return;
    setState({
      partyId: (b.vendorId as string) ?? "",
      projectId: (b.projectId as string) ?? "",
      issueDate: b.issueDate ? new Date(b.issueDate as string) : new Date(),
      dueDate: b.dueDate ? new Date(b.dueDate as string) : undefined,
      expiryDate: undefined,
      notes: (b.notes as string) ?? "",
      terms: (b.terms as string) ?? "",
      discount: Number(b.discountAmount ?? b.discount ?? 0),
      items: Array.isArray(b.items) ? (b.items as Array<Record<string, unknown>>).map((it) => ({
        itemId: (it.itemId as string) ?? undefined,
        description: (it.description as string) ?? "",
        quantity: Number(it.quantity ?? 1),
        price: Number(it.price ?? 0),
        taxRateId: (it.taxRateId as string) ?? undefined,
        accountId: (it.accountId as string) ?? undefined,
      })) : [{ description: "", quantity: 1, price: 0 }],
    });
  }, [query.data, setState]);

  if (query.isLoading) return <LoadingState label="Loading bill..." />;
  if (query.isError) return <ErrorState label="Unable to load bill." />;

  const save = async () => {
    let vendorId = state.partyId;
    const typedName = state.partyName?.trim();
    if (!vendorId && typedName) {
      setResolving(true);
      try {
        const created = await createVendor.mutateAsync({ companyName: typedName });
        vendorId = (created as { id?: string } | null)?.id ?? "";
      } catch {
        setResolving(false);
        return;
      }
      setResolving(false);
    }
    if (!vendorId) {
      toast({ variant: "error", title: "Vendor required" });
      return;
    }
    updateMutation.mutate({
      vendorId,
      projectId: state.projectId || undefined,
      issueDate: state.issueDate?.toISOString(),
      dueDate: state.dueDate?.toISOString(),
      notes: state.notes,
      terms: state.terms,
      discountAmount: state.discount,
      items: state.items.map((i) => ({
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
      title="Edit Bill"
      breadcrumbs={[{ label: "Bills", href: "/bills" }, { label: "Edit" }]}
      onSubmit={save}
      onCancel={() => router.push("/bills")}
      submitLabel="Save"
      loading={updateMutation.isPending || resolving}
    >
      <DocumentBuilder mode="bill" state={state} onChange={patch} partyType="vendor" showAccountPerLine />
    </FormPageLayout>
  );
}
