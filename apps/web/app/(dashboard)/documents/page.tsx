"use client";

import { useState } from "react";
import { Upload, ExternalLink } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useDocuments, useDocumentUpload } from "@/lib/api/hooks";
import { toArray } from "@/lib/utils";
import { useAuthStore } from "@/lib/store/auth-store";
import { toast } from "@/lib/hooks/use-toast";
import type { ColumnDef } from "@tanstack/react-table";

interface DocRow {
  id: string;
  fileName: string;
  entityType: string;
  fileUrl: string;
  uploadedBy?: { firstName: string; lastName: string };
  createdAt: string;
}

export default function DocumentsPage() {
  const query = useDocuments();
  const uploadMutation = useDocumentUpload();
  const role = useAuthStore((s) => s.user?.roles[0] ?? "EMPLOYEE");
  const canUpload = ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "HR_MANAGER", "FINANCE_MANAGER"].includes(role);

  if (query.isLoading) return <LoadingState label="Loading documents..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load documents." />;

  const docs = toArray<DocRow>(query.data);

  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        uploadMutation.mutate(formData, {
          onSuccess: () => toast({ variant: "success", title: "File uploaded" }),
          onError: () => toast({ variant: "error", title: "Upload failed" }),
        });
      }
    };
    input.click();
  };

  const columns: ColumnDef<DocRow, unknown>[] = [
    { accessorKey: "fileName", header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.fileName}</span> },
    { accessorKey: "entityType", header: "Type", cell: ({ row }) => <Badge tone="neutral" size="sm">{row.original.entityType}</Badge> },
    { id: "uploadedBy", header: "Uploaded By", cell: ({ row }) => row.original.uploadedBy ? `${row.original.uploadedBy.firstName} ${row.original.uploadedBy.lastName}` : "—" },
    { accessorKey: "createdAt", header: "Date", cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString() },
    {
      id: "open",
      header: "",
      cell: ({ row }) => (
        <a href={row.original.fileUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-primary">
          <ExternalLink className="size-4" />
        </a>
      ),
      enableSorting: false,
    },
  ];

  return (
    <ListPageLayout
      module="documents"
      title="Documents"
      description="Shared files linked to projects, clients, and employees."
      primaryAction={canUpload ? { label: "Upload", icon: <Upload className="mr-1 size-4" />, onClick: handleUpload } : undefined}
    >
      <DataTable columns={columns} data={docs} searchPlaceholder="Search documents..." moduleColor="documents" emptyState={{ title: "No documents", description: "Upload your first document." }} />
    </ListPageLayout>
  );
}
