"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DetailPageLayout } from "@/components/layouts/detail-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/state";
import {
  useClients, useContacts, useDeals, useInvoices, useClientDocuments,
  useClientHistory, useCustomFields, useProposals,
} from "@/lib/api/hooks";
import { useUploadClientDocument } from "@/lib/api/mutations";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { PortalAccessPanel } from "@/components/clients/portal-access-panel";
import { ClientRequestsTab } from "@/components/clients/client-requests-tab";
import { formatCurrency, toArray, relativeTime, formatBytes } from "@/lib/utils";
import { Download as DownloadIcon, Upload, Plus, Pencil, Trash2, User as UserIcon, History as HistoryIcon, ExternalLink, Sparkles } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { CustomFieldDef } from "../_crm-helpers";

interface UserLite {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string | null;
}

interface PortalUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  lastLoginAt?: string | null;
}

interface Client {
  id: string;
  companyName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  accountManager?: UserLite | null;
  tags?: string[];
  nextFollowUpAt?: string | null;
  referralSource?: string;
  acquiredAt?: string | null;
  lastContactAt?: string | null;
  portalEnabled?: boolean;
  portalUser?: PortalUser | null;
  customFields?: Record<string, unknown> | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  details?: string;
  createdAt?: string;
  user?: { firstName?: string; lastName?: string; avatarUrl?: string | null } | null;
}

function historyIcon(action: string) {
  const a = action.toUpperCase();
  if (a.includes("CREATE")) return <Plus className="size-3.5 text-emerald-600" />;
  if (a.includes("DELETE")) return <Trash2 className="size-3.5 text-rose-600" />;
  if (a.includes("UPDATE")) return <Pencil className="size-3.5 text-amber-600" />;
  return <UserIcon className="size-3.5 text-slate-500" />;
}

function renderCustomFieldValue(def: CustomFieldDef, val: unknown) {
  if (val == null || val === "") return <span className="text-slate-400">—</span>;
  switch (def.type) {
    case "BOOLEAN":
      return <span>{val ? "Yes" : "No"}</span>;
    case "DATE":
      try { return <span>{new Date(val as string).toLocaleDateString()}</span>; } catch { return <span>{String(val)}</span>; }
    case "MULTI_SELECT":
      if (Array.isArray(val)) {
        return (
          <span className="inline-flex flex-wrap gap-1">
            {(val as string[]).map((v) => (
              <span key={v} className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{v}</span>
            ))}
          </span>
        );
      }
      return <span>{String(val)}</span>;
    case "URL":
      return <a href={String(val)} target="_blank" rel="noreferrer" className="text-primary hover:underline">{String(val)}</a>;
    default:
      return <span>{String(val)}</span>;
  }
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
  isPrimary?: boolean;
  clientId: string;
}

interface Deal {
  id: string;
  name: string;
  stage: string;
  amount?: number | null;
  probability?: number | null;
  expectedCloseDate?: string | null;
  clientId?: string;
}

interface Invoice {
  id: string;
  invoiceNumber?: string;
  status?: string;
  total?: number;
  dueDate?: string;
  clientId?: string;
}

interface DocumentRow {
  id: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  createdAt?: string;
  uploadedBy?: UserLite | null;
}

const stageTone: Record<string, "info" | "neutral" | "warning" | "positive" | "destructive"> = {
  PROSPECTING: "info", QUALIFICATION: "info", PROPOSAL: "warning",
  NEGOTIATION: "warning", CLOSED_WON: "positive", CLOSED_LOST: "destructive",
};

function userName(u?: UserLite | null) {
  if (!u) return "";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "";
}

function UserAvatar({ user, size = 28 }: { user: UserLite; size?: number }) {
  const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || (user.email?.[0] ?? "?").toUpperCase();
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt={initials} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-primary text-xs font-semibold text-white" style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params?.id ?? "";

  const clientsQuery = useClients(true);
  const contactsQuery = useContacts(clientId);
  const dealsQuery = useDeals({ clientId });
  const invoicesQuery = useInvoices();
  const documentsQuery = useClientDocuments(clientId);
  const historyQuery = useClientHistory(clientId);
  const customFieldsQuery = useCustomFields("client");
  // Server-side clientId filter on proposals (proposalsService filters by it),
  // so we don't need to slice() client-side.
  const proposalsQuery = useProposals({ clientId });

  const uploadDoc = useUploadClientDocument(clientId);

  const clients = toArray<Client>(clientsQuery.data);
  const client = useMemo(() => clients.find((c) => c.id === clientId), [clients, clientId]);

  if (clientsQuery.isLoading) return <LoadingState label="Loading client..." />;
  if (clientsQuery.isError || !client) return <ErrorState label="Client not found." />;

  const contacts = toArray<Contact>(contactsQuery.data).filter((c) => c.clientId === clientId);
  const deals = toArray<Deal>(dealsQuery.data).filter((d) => d.clientId === clientId);
  const invoices = toArray<Invoice>(invoicesQuery.data).filter((i) => i.clientId === clientId);
  const documents = toArray<DocumentRow>(documentsQuery.data);
  const history = (Array.isArray(historyQuery.data) ? (historyQuery.data as unknown as HistoryEntry[]) : []);
  // Proposals scoped to this client (server-side via useProposals({ clientId })).
  const proposals = toArray<{
    id: string;
    projectName?: string | null;
    status: string;
    pricing?: string | null;
    createdAt: string;
    validUntil?: string | null;
  }>(proposalsQuery.data);
  const customFieldDefs = (Array.isArray(customFieldsQuery.data) ? (customFieldsQuery.data as unknown as CustomFieldDef[]) : []);
  const clientCustomFields = (client.customFields ?? {}) as Record<string, unknown>;

  const contactColumns: ColumnDef<Contact, unknown>[] = [
    { id: "name", header: "Name", cell: ({ row }) => (
      <span className="font-medium">{row.original.firstName} {row.original.lastName}</span>
    )},
    { accessorKey: "title", header: "Title", cell: ({ row }) => row.original.title ?? "—" },
    { accessorKey: "email", header: "Email", cell: ({ row }) => row.original.email ?? "—" },
    { accessorKey: "phone", header: "Phone", cell: ({ row }) => row.original.phone ?? "—" },
    { id: "primary", header: "Primary", cell: ({ row }) => row.original.isPrimary ? (
      <Badge tone="positive" size="sm" dot>Primary</Badge>
    ) : <span className="text-xs text-slate-400">—</span> },
  ];

  const dealColumns: ColumnDef<Deal, unknown>[] = [
    { accessorKey: "name", header: "Deal", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "stage", header: "Stage", cell: ({ row }) => (
      <Badge tone={stageTone[row.original.stage] ?? "neutral"} dot size="sm">{row.original.stage.replace("_", " ")}</Badge>
    )},
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => row.original.amount != null ? formatCurrency(Number(row.original.amount)) : "—" },
    { accessorKey: "probability", header: "Probability", cell: ({ row }) => row.original.probability != null ? `${row.original.probability}%` : "—" },
    { id: "close", header: "Close", cell: ({ row }) => row.original.expectedCloseDate ? new Date(row.original.expectedCloseDate).toLocaleDateString() : "—" },
  ];

  const invoiceColumns: ColumnDef<Invoice, unknown>[] = [
    {
      accessorKey: "invoiceNumber",
      header: "Number",
      cell: ({ row }) => (
        <Link
          href={`/invoices/${row.original.id}/print`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.invoiceNumber ?? row.original.id.slice(0, 8)}
        </Link>
      ),
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge tone="neutral" size="sm">{row.original.status ?? "—"}</Badge> },
    { accessorKey: "total", header: "Total", cell: ({ row }) => row.original.total != null ? formatCurrency(Number(row.original.total)) : "—" },
    { accessorKey: "dueDate", header: "Due", cell: ({ row }) => row.original.dueDate ? new Date(row.original.dueDate).toLocaleDateString() : "—" },
    {
      id: "open",
      header: "",
      cell: ({ row }) => (
        <Link
          href={`/invoices/${row.original.id}/print`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary"
        >
          Open <ExternalLink className="size-3" />
        </Link>
      ),
    },
  ];

  type ProposalRow = (typeof proposals)[number];
  const proposalColumns: ColumnDef<ProposalRow, unknown>[] = [
    {
      accessorKey: "projectName",
      header: "Title",
      cell: ({ row }) => (
        <Link
          href={`/proposals/${row.original.id}/print`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.projectName ?? "Untitled"}
        </Link>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge tone="neutral" size="sm">{row.original.status}</Badge>,
    },
    {
      accessorKey: "pricing",
      header: "Pricing",
      cell: ({ row }) => row.original.pricing ?? "—",
    },
    {
      accessorKey: "createdAt",
      header: "Sent",
      cell: ({ row }) => row.original.createdAt ? new Date(row.original.createdAt).toLocaleDateString() : "—",
    },
    {
      accessorKey: "validUntil",
      header: "Valid until",
      cell: ({ row }) => row.original.validUntil ? new Date(row.original.validUntil).toLocaleDateString() : "—",
    },
    {
      id: "open",
      header: "",
      cell: ({ row }) => (
        <Link
          href={`/proposals/${row.original.id}/print`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary"
        >
          Open <ExternalLink className="size-3" />
        </Link>
      ),
    },
  ];

  const documentColumns: ColumnDef<DocumentRow, unknown>[] = [
    {
      id: "fileName", header: "File",
      cell: ({ row }) => (
        <a
          href={row.original.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.fileName ?? "—"}
        </a>
      ),
    },
    { id: "size", header: "Size", cell: ({ row }) => formatBytes(row.original.fileSize) },
    { id: "uploadedBy", header: "Uploaded by", cell: ({ row }) => userName(row.original.uploadedBy) || "—" },
    { id: "uploadedAt", header: "Uploaded", cell: ({ row }) => row.original.createdAt ? new Date(row.original.createdAt).toLocaleDateString() : "—" },
    {
      id: "actions", header: "",
      cell: ({ row }) => row.original.fileUrl ? (
        <a href={row.original.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary">
          <DownloadIcon className="size-3.5" /> Open
        </a>
      ) : null,
    },
  ];

  const onUploadFile = (file: File) => {
    uploadDoc.mutate(file);
  };

  return (
    <>
      <DetailPageLayout
        module="clients"
        title={client.companyName}
        description={client.contactPerson ?? ""}
        breadcrumbs={[
          { label: "Clients", href: "/clients" },
          { label: client.companyName },
        ]}
        tabs={[
          {
            key: "overview",
            label: "Overview",
            content: (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardTitle>Company</CardTitle>
                  <CardDescription>Contact details for this client.</CardDescription>
                  <div className="mt-4 space-y-2 text-sm">
                    <div><span className="text-slate-400">Email:</span> {client.email ?? "—"}</div>
                    <div><span className="text-slate-400">Phone:</span> {client.phone ?? "—"}</div>
                    <div><span className="text-slate-400">Website:</span> {client.website ?? "—"}</div>
                    <div><span className="text-slate-400">Address:</span> {client.address ?? "—"}</div>
                  </div>
                </Card>
                <Card>
                  <CardTitle>Relationship</CardTitle>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Account Manager:</span>
                      {client.accountManager ? (
                        <span className="inline-flex items-center gap-2">
                          <UserAvatar user={client.accountManager} size={22} />
                          <span>{userName(client.accountManager)}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400">Tags:</span>{" "}
                      {(client.tags ?? []).length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className="inline-flex flex-wrap gap-1">
                          {(client.tags ?? []).map((t) => (
                            <span key={t} className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{t}</span>
                          ))}
                        </span>
                      )}
                    </div>
                    <div><span className="text-slate-400">Referral source:</span> {client.referralSource ?? "—"}</div>
                    <div><span className="text-slate-400">Acquired at:</span> {client.acquiredAt ? new Date(client.acquiredAt).toLocaleDateString() : "—"}</div>
                    <div>
                      <span className="text-slate-400">Next follow-up:</span>{" "}
                      {client.nextFollowUpAt ? (
                        <span className={new Date(client.nextFollowUpAt).getTime() < Date.now() ? "font-semibold text-rose-600" : ""}>
                          {new Date(client.nextFollowUpAt).toLocaleDateString()}
                        </span>
                      ) : "—"}
                    </div>
                    <div><span className="text-slate-400">Last contact:</span> {relativeTime(client.lastContactAt)}</div>
                  </div>
                </Card>
                <Card>
                  <CardTitle>Pipeline</CardTitle>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div><div className="text-xs text-slate-400">Contacts</div><div className="text-2xl font-semibold">{contacts.length}</div></div>
                    <div><div className="text-xs text-slate-400">Deals</div><div className="text-2xl font-semibold">{deals.length}</div></div>
                    <div><div className="text-xs text-slate-400">Invoices</div><div className="text-2xl font-semibold">{invoices.length}</div></div>
                  </div>
                </Card>
                {customFieldDefs.length > 0 && (
                  <Card>
                    <CardTitle>Custom Fields</CardTitle>
                    <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      {customFieldDefs.map((def) => (
                        <div key={def.id} className="flex flex-col gap-0.5">
                          <span className="text-xs text-slate-400">{def.label}</span>
                          <span>{renderCustomFieldValue(def, clientCustomFields[def.key])}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            ),
          },
          {
            key: "contacts",
            label: "Contacts",
            count: contacts.length,
            content: (
              <DataTable
                columns={contactColumns}
                data={contacts}
                searchPlaceholder="Search contacts..."
                moduleColor="clients"
                emptyState={{ title: "No contacts yet", description: "Add contacts from the Contacts page." }}
              />
            ),
          },
          {
            key: "deals",
            label: "Deals",
            count: deals.length,
            content: (
              <DataTable
                columns={dealColumns}
                data={deals}
                searchPlaceholder="Search deals..."
                moduleColor="clients"
                emptyState={{ title: "No deals yet", description: "Create a deal from the Deals page." }}
              />
            ),
          },
          {
            key: "activities",
            label: "Activities",
            content: <ActivityTimeline scope={{ clientId }} />,
          },
          {
            key: "history",
            label: "History",
            count: history.length,
            content: (
              <div className="space-y-2">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-10 text-center text-sm text-slate-500">
                    <HistoryIcon className="size-6 text-slate-300" />
                    <div>No history yet.</div>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {history.map((h) => {
                      const name = `${h.user?.firstName ?? ""} ${h.user?.lastName ?? ""}`.trim() || "System";
                      const initials = `${h.user?.firstName?.[0] ?? ""}${h.user?.lastName?.[0] ?? ""}`.toUpperCase() || "S";
                      return (
                        <li key={h.id} className="flex items-start gap-3">
                          <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                            {historyIcon(h.action)}
                          </div>
                          {h.user?.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={h.user.avatarUrl} alt={name} className="mt-0.5 size-6 rounded-full object-cover" />
                          ) : (
                            <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">
                              {initials}
                            </span>
                          )}
                          <div className="flex-1 text-sm">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="font-medium">{name}</span>
                              <span className="text-slate-500">{h.action.toLowerCase()}</span>
                              {h.details && <span className="text-slate-600">— {h.details}</span>}
                            </div>
                            <div className="text-xs text-slate-400">{relativeTime(h.createdAt)}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ),
          },
          {
            key: "invoices",
            label: "Invoices",
            count: invoices.length,
            content: (
              <DataTable
                columns={invoiceColumns}
                data={invoices}
                searchPlaceholder="Search invoices..."
                moduleColor="invoices"
                emptyState={{ title: "No invoices yet" }}
              />
            ),
          },
          {
            key: "proposals",
            label: "Proposals",
            count: proposals.length,
            content: (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">All proposals shared with this client.</p>
                  <Link
                    href={`/proposals/new?clientId=${clientId}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    <Sparkles className="size-3.5" />
                    New proposal
                  </Link>
                </div>
                <DataTable
                  columns={proposalColumns}
                  data={proposals}
                  searchPlaceholder="Search proposals..."
                  moduleColor="proposals"
                  emptyState={{
                    title: "No proposals yet",
                    description: "Create the first proposal so this client can review and accept it.",
                  }}
                />
              </div>
            ),
          },
          {
            key: "documents",
            label: "Documents",
            count: documents.length,
            content: (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">Client-related files & attachments.</p>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
                    <Upload className="size-3.5" />
                    {uploadDoc.isPending ? "Uploading…" : "Upload"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUploadFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <DataTable
                  columns={documentColumns}
                  data={documents}
                  searchPlaceholder="Search files..."
                  moduleColor="clients"
                  emptyState={{ title: "No documents", description: "Upload the first file for this client." }}
                />
              </div>
            ),
          },
          {
            key: "requests",
            label: "Requests",
            content: <ClientRequestsTab clientId={clientId} />,
          },
          {
            key: "portal",
            label: "Portal",
            content: (
              /*
                One unified Client Portal section. The old single-user
                "Invite client to portal" card was replaced by this
                multi-contact PortalAccessPanel — they showed up as two
                competing sections on the tab. Legacy single-user portal
                rows (Client.portalUserId) continue to work for login;
                staff manage everything new through the panel below.
              */
              <div className="max-w-2xl">
                <PortalAccessPanel clientId={clientId} />
              </div>
            ),
          },
        ]}
      />

    </>
  );
}
