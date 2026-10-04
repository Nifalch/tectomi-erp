"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus, Pencil, Trash2, Search, Filter, X, ArrowUpDown, Download, Upload,
  Building2, Crown, AlertTriangle, Eye, GitMerge,
} from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { CsvImportDialog } from "@/components/shared/csv-import-dialog";
import { CLIENT_IMPORT_FIELDS } from "@/components/shared/csv-import-fields";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { ErrorState, LoadingState } from "@/components/ui/state";
import {
  useClients, useUsers, useClientTags, useSavedViews, useCustomFields,
} from "@/lib/api/hooks";
import {
  useCreateClient, useUpdateClient, useDeleteClient,
  useBulkUpdateClients, useBulkDeleteClients, useImportClientsCsv,
  useMergeClients, useSaveView, useDeleteSavedView,
} from "@/lib/api/mutations";
import {
  CustomFieldsSection, MergeClientsDialog, SavedViewsStrip, SaveViewDialog,
  type CustomFieldDef, type SavedView,
} from "./_crm-helpers";
import { toArray, formatCurrency, relativeTime } from "@/lib/utils";
import { useAuthStore } from "@/lib/store/auth-store";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import type { ColumnDef } from "@tanstack/react-table";

type Priority = "LOW" | "MEDIUM" | "HIGH" | "VIP";

interface InvoiceRef {
  id: string;
  total?: number | string;
  status?: string;
  paidAt?: string | null;
}

interface UserLite {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string | null;
  // /users returns roles as `[{ role: { code } }]` (pivot). We use this to
  // exclude CLIENT users from staff-only pickers like Account Manager.
  roles?: Array<{ role?: { code?: string } } | string>;
}

/** Treat anyone with the CLIENT role as a client, not internal staff. */
function isClientUser(u: UserLite): boolean {
  if (!u.roles) return false;
  return u.roles.some((r) => {
    if (typeof r === "string") return r === "CLIENT";
    return r?.role?.code === "CLIENT";
  });
}

interface ClientRow {
  id: string;
  companyName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  notes?: string;
  industry?: string;
  city?: string;
  country?: string;
  priority?: Priority;
  status?: string;
  createdAt?: string;
  projects: Array<unknown>;
  invoices: InvoiceRef[];
  accountManagerId?: string | null;
  accountManager?: UserLite | null;
  tags?: string[];
  nextFollowUpAt?: string | null;
  referralSource?: string;
  acquiredAt?: string | null;
  lastContactAt?: string | null;
  portalEnabled?: boolean;
  customFields?: Record<string, unknown> | null;
}

const schema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  contactPerson: z.string().optional(),
  email: z.string().email({ message: "Invalid email address" }).optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  industry: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "VIP"]).optional(),
  status: z.string().optional(),
  accountManagerId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  nextFollowUpAt: z.date().optional().nullable(),
  referralSource: z.string().optional(),
  acquiredAt: z.date().optional().nullable(),
  customFields: z.record(z.string(), z.any()).optional(),
});
type FormValues = z.infer<typeof schema>;

const PRIORITY_TONES: Record<Priority, "neutral" | "info" | "warning" | "destructive"> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  VIP: "destructive",
};
const PRIORITY_RANK: Record<Priority, number> = { VIP: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const STATUS_TONES: Record<string, "positive" | "info" | "neutral" | "warning"> = {
  ACTIVE: "positive",
  PROSPECT: "info",
  CHURNED: "warning",
  ARCHIVED: "neutral",
};

function clientTotals(c: ClientRow) {
  const invs = c.invoices ?? [];
  const invoiced = invs.reduce((s, i) => s + Number(i.total ?? 0), 0);
  const outstanding = invs
    .filter((i) => i.status !== "PAID" && i.status !== "VOID")
    .reduce((s, i) => s + Number(i.total ?? 0), 0);
  return { invoiced, outstanding };
}

function userName(u?: UserLite | null) {
  if (!u) return "";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "";
}

function UserAvatar({ user, size = 22 }: { user: UserLite; size?: number }) {
  const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || (user.email?.[0] ?? "?").toUpperCase();
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt={initials} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white" style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}

// Tag chip input with autocomplete
function TagInput({ value, onChange, allTags = [] }: { value: string[]; onChange: (v: string[]) => void; allTags?: string[] }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (value.includes(t)) return;
    onChange([...value, t]);
    setDraft("");
  };
  const suggestions = useMemo(() => {
    const term = draft.trim().toLowerCase();
    if (!term) return [] as string[];
    return allTags
      .filter((t) => !value.includes(t) && t.toLowerCase().includes(term))
      .slice(0, 8);
  }, [draft, allTags, value]);
  return (
    <div className="relative">
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-white/80 px-3 py-2 dark:bg-slate-950/60">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} className="text-primary/70 hover:text-primary">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => setTimeout(() => add(draft), 150)}
          placeholder={value.length ? "" : "Type and hit Enter…"}
          className="flex-1 min-w-[80px] bg-transparent text-sm outline-none"
        />
      </div>
      {draft.length > 0 && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-white shadow-lg dark:bg-slate-900">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                add(s);
              }}
              className="block w-full px-3 py-1.5 text-left text-xs hover:bg-primary/10"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const query = useClients(showArchived);
  const usersQuery = useUsers();
  const tagsQuery = useClientTags();
  const savedViewsQuery = useSavedViews("clients");
  const customFieldsQuery = useCustomFields("client");
  const createMutation = useCreateClient();
  const deleteMutation = useDeleteClient();
  const bulkUpdateMutation = useBulkUpdateClients();
  const bulkDeleteMutation = useBulkDeleteClients();
  const importMutation = useImportClientsCsv();
  const mergeMutation = useMergeClients();
  const saveViewMutation = useSaveView();
  const deleteViewMutation = useDeleteSavedView();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canDelete = roles.includes("SUPER_ADMIN" as any);

  const [createOpen, setCreateOpen] = useState(false);
  const [editClient, setEditClient] = useState<ClientRow | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | undefined>();
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Filter + sort state
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [needsFollowUp, setNeedsFollowUp] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [withProjects, setWithProjects] = useState(false);
  const [hasOutstanding, setHasOutstanding] = useState(false);
  const [sortBy, setSortBy] = useState("recent");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOwnerId, setBulkOwnerId] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkTagDraft, setBulkTagDraft] = useState("");

  // CSV import — opens the shared dialog which handles upload/map/preview.
  const [importOpen, setImportOpen] = useState(false);

  const updateMutation = useUpdateClient(editClient?.id ?? "");
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (editClient) {
      form.reset({
        companyName: editClient.companyName,
        contactPerson: editClient.contactPerson ?? "",
        email: editClient.email ?? "",
        phone: editClient.phone ?? "",
        website: editClient.website ?? "",
        address: editClient.address ?? "",
        notes: editClient.notes ?? "",
        industry: editClient.industry ?? "",
        city: editClient.city ?? "",
        country: editClient.country ?? "",
        priority: editClient.priority ?? "MEDIUM",
        status: editClient.status ?? "ACTIVE",
        accountManagerId: editClient.accountManagerId ?? "",
        tags: editClient.tags ?? [],
        nextFollowUpAt: editClient.nextFollowUpAt ? new Date(editClient.nextFollowUpAt) : null,
        referralSource: editClient.referralSource ?? "",
        acquiredAt: editClient.acquiredAt ? new Date(editClient.acquiredAt) : null,
        customFields: (editClient.customFields ?? {}) as Record<string, unknown>,
      });
    } else {
      form.reset({
        companyName: "", contactPerson: "", email: "", phone: "",
        website: "", address: "", notes: "", industry: "", city: "",
        country: "", priority: "MEDIUM", status: "ACTIVE",
        accountManagerId: "", tags: [], nextFollowUpAt: null,
        referralSource: "", acquiredAt: null,
        customFields: {},
      });
    }
  }, [editClient, form]);

  const clients = useMemo(
    () => (query.data ? toArray<ClientRow>(query.data) : []),
    [query.data],
  );
  const users = useMemo(
    () => (usersQuery.data ? toArray<UserLite>(usersQuery.data) : []),
    [usersQuery.data],
  );
  const serverTags = useMemo(
    () => (Array.isArray(tagsQuery.data) ? (tagsQuery.data as string[]) : []),
    [tagsQuery.data],
  );
  const savedViews = useMemo<SavedView[]>(
    () => (Array.isArray(savedViewsQuery.data) ? (savedViewsQuery.data as unknown as SavedView[]) : []),
    [savedViewsQuery.data],
  );
  const customFieldDefs = useMemo<CustomFieldDef[]>(
    () => (Array.isArray(customFieldsQuery.data) ? (customFieldsQuery.data as unknown as CustomFieldDef[]) : []),
    [customFieldsQuery.data],
  );

  const industryOptions = useMemo(() => {
    const set = new Set(clients.map((c) => c.industry).filter(Boolean) as string[]);
    return [...set].sort();
  }, [clients]);
  const countryOptions = useMemo(() => {
    const set = new Set(clients.map((c) => c.country).filter(Boolean) as string[]);
    return [...set].sort();
  }, [clients]);
  const allTags = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => (c.tags ?? []).forEach((t) => set.add(t)));
    serverTags.forEach((t) => set.add(t));
    return [...set].sort();
  }, [clients, serverTags]);

  const now = Date.now();
  const THIRTY_DAYS = 30 * 86400000;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = clients.filter((c) => {
      if (term) {
        const hay = `${c.companyName} ${c.contactPerson ?? ""} ${c.email ?? ""} ${c.phone ?? ""} ${c.city ?? ""} ${c.country ?? ""} ${c.industry ?? ""} ${(c.tags ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (priorityFilter && c.priority !== priorityFilter) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      if (industryFilter && c.industry !== industryFilter) return false;
      if (countryFilter && c.country !== countryFilter) return false;
      if (ownerFilter && c.accountManagerId !== ownerFilter) return false;
      if (tagFilter && !(c.tags ?? []).includes(tagFilter)) return false;
      if (activeOnly && (c.invoices?.length ?? 0) === 0) return false;
      if (withProjects && (c.projects?.length ?? 0) === 0) return false;
      if (hasOutstanding) {
        const { outstanding } = clientTotals(c);
        if (outstanding <= 0) return false;
      }
      if (needsFollowUp) {
        const dueSoon = c.nextFollowUpAt && new Date(c.nextFollowUpAt).getTime() <= now;
        const stale = !c.lastContactAt || (now - new Date(c.lastContactAt).getTime()) > THIRTY_DAYS;
        if (!dueSoon && !stale) return false;
      }
      return true;
    });

    const byName = (a: ClientRow, b: ClientRow) => a.companyName.localeCompare(b.companyName);
    const byRecent = (a: ClientRow, b: ClientRow) =>
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();

    rows = [...rows].sort((a, b) => {
      switch (sortBy) {
        case "name": return byName(a, b);
        case "name-desc": return -byName(a, b);
        case "priority":
          return (PRIORITY_RANK[b.priority ?? "MEDIUM"] - PRIORITY_RANK[a.priority ?? "MEDIUM"]) || byName(a, b);
        case "most-projects":
          return ((b.projects?.length ?? 0) - (a.projects?.length ?? 0)) || byName(a, b);
        case "most-invoiced":
          return (clientTotals(b).invoiced - clientTotals(a).invoiced) || byName(a, b);
        case "outstanding":
          return (clientTotals(b).outstanding - clientTotals(a).outstanding) || byName(a, b);
        case "oldest-contact": {
          const ta = a.lastContactAt ? new Date(a.lastContactAt).getTime() : 0;
          const tb = b.lastContactAt ? new Date(b.lastContactAt).getTime() : 0;
          return ta - tb;
        }
        case "next-followup": {
          const ta = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : Number.POSITIVE_INFINITY;
          const tb = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : Number.POSITIVE_INFINITY;
          return ta - tb;
        }
        case "recent":
        default:
          return byRecent(a, b);
      }
    });
    return rows;
  }, [clients, search, priorityFilter, statusFilter, industryFilter, countryFilter, ownerFilter, tagFilter, activeOnly, withProjects, hasOutstanding, needsFollowUp, sortBy, now]);

  const hasFilters =
    !!search || !!priorityFilter || !!statusFilter || !!industryFilter ||
    !!countryFilter || !!ownerFilter || !!tagFilter || needsFollowUp ||
    activeOnly || withProjects || hasOutstanding;
  const clearFilters = () => {
    setSearch(""); setPriorityFilter(""); setStatusFilter("");
    setIndustryFilter(""); setCountryFilter(""); setOwnerFilter(""); setTagFilter("");
    setNeedsFollowUp(false); setActiveOnly(false); setWithProjects(false); setHasOutstanding(false);
  };

  const stats = useMemo(() => {
    const total = clients.length;
    const active = clients.filter((c) => (c.invoices?.length ?? 0) > 0).length;
    const vip = clients.filter((c) => c.priority === "VIP").length;
    const outstanding = clients.reduce((s, c) => s + clientTotals(c).outstanding, 0);
    return { total, active, vip, outstanding };
  }, [clients]);

  const rowActions: RowAction<ClientRow>[] = [
    { label: "Edit", icon: <Pencil className="size-4" />, onClick: (row) => { setEditClient(row); setCreateOpen(true); } },
    ...(canDelete
      ? [{
          label: "Delete",
          icon: <Trash2 className="size-4" />,
          onClick: (row: ClientRow) => setDeleteTarget(row),
          destructive: true,
          separator: true,
        } satisfies RowAction<ClientRow>]
      : []),
  ];

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = (ids: string[], all: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (all) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  };
  const allSelectedOnPage = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  const columns: ColumnDef<ClientRow, unknown>[] = [
    {
      id: "select",
      header: () => (
        <input
          type="checkbox"
          checked={allSelectedOnPage}
          onChange={(e) => toggleAll(filtered.map((c) => c.id), e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="size-4 cursor-pointer rounded border-slate-300"
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.original.id)}
          onChange={() => toggleRow(row.original.id)}
          onClick={(e) => e.stopPropagation()}
          className="size-4 cursor-pointer rounded border-slate-300"
          aria-label={`Select ${row.original.companyName}`}
        />
      ),
    },
    {
      accessorKey: "companyName",
      header: "Company",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.companyName}</span>
          {row.original.industry && <span className="text-xs text-slate-400">{row.original.industry}</span>}
        </div>
      ),
    },
    { accessorKey: "contactPerson", header: "Contact", cell: ({ row }) => row.original.contactPerson ?? "—" },
    {
      accessorKey: "priority", header: "Priority",
      cell: ({ row }) => {
        const p = (row.original.priority ?? "MEDIUM") as Priority;
        return <Badge tone={PRIORITY_TONES[p]} size="sm">{p}</Badge>;
      },
    },
    {
      id: "owner", header: "Owner",
      cell: ({ row }) => {
        const u = row.original.accountManager;
        if (!u) return <span className="text-slate-400">—</span>;
        return (
          <div className="flex items-center gap-1.5">
            <UserAvatar user={u} />
            <span className="text-xs">{u.firstName ?? userName(u)}</span>
          </div>
        );
      },
    },
    {
      id: "tags", header: "Tags",
      cell: ({ row }) => {
        const tags = row.original.tags ?? [];
        if (!tags.length) return <span className="text-slate-400">—</span>;
        const first = tags.slice(0, 2);
        const rest = tags.length - first.length;
        return (
          <div className="flex flex-wrap items-center gap-1">
            {first.map((t) => (
              <span key={t} className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{t}</span>
            ))}
            {rest > 0 && <span className="text-[10px] text-slate-400">+{rest}</span>}
          </div>
        );
      },
    },
    {
      accessorKey: "status", header: "Status",
      cell: ({ row }) => {
        const s = row.original.status ?? "ACTIVE";
        return <Badge tone={STATUS_TONES[s] ?? "neutral"} size="sm">{s}</Badge>;
      },
    },
    {
      id: "lastContact", header: "Last Contact",
      cell: ({ row }) => <span className="text-xs text-slate-500">{relativeTime(row.original.lastContactAt)}</span>,
    },
    {
      id: "nextFollowUp", header: "Next Follow-up",
      cell: ({ row }) => {
        const d = row.original.nextFollowUpAt;
        if (!d) return <span className="text-slate-400">—</span>;
        const past = new Date(d).getTime() < Date.now();
        return <span className={`text-xs ${past ? "font-semibold text-rose-600" : "text-slate-500"}`}>{new Date(d).toLocaleDateString()}</span>;
      },
    },
    { id: "projects", header: "Projects", cell: ({ row }) => <Badge tone="projects" size="sm">{row.original.projects.length}</Badge> },
    {
      id: "outstanding", header: "Outstanding",
      cell: ({ row }) => {
        const { outstanding } = clientTotals(row.original);
        if (outstanding <= 0) return <span className="text-slate-400">—</span>;
        return <span className="font-semibold text-rose-600">{formatCurrency(outstanding)}</span>;
      },
    },
    createActionsColumn(rowActions),
  ];

  const isEdit = !!editClient;

  const onSubmit = (values: FormValues) => {
    const payload: Record<string, unknown> = {
      ...values,
      accountManagerId: values.accountManagerId || undefined,
      tags: values.tags ?? [],
      nextFollowUpAt: values.nextFollowUpAt ? values.nextFollowUpAt.toISOString() : null,
      acquiredAt: values.acquiredAt ? values.acquiredAt.toISOString() : null,
      referralSource: values.referralSource || undefined,
      customFields: values.customFields ?? {},
    };
    if (isEdit) {
      updateMutation.mutate(payload, { onSuccess: () => { setCreateOpen(false); setEditClient(undefined); form.reset(); } });
    } else {
      createMutation.mutate(payload as any, { onSuccess: () => { setCreateOpen(false); form.reset(); } });
    }
  };

  const exportCsv = () => {
    const headers = ["Company", "Contact", "Email", "Phone", "Priority", "Status", "Industry", "City", "Country", "Tags", "Projects", "Invoices", "Invoiced", "Outstanding"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = filtered.map((c) => {
      const t = clientTotals(c);
      return [
        c.companyName, c.contactPerson ?? "", c.email ?? "", c.phone ?? "",
        c.priority ?? "", c.status ?? "", c.industry ?? "", c.city ?? "", c.country ?? "",
        (c.tags ?? []).join("|"),
        c.projects.length, c.invoices.length, t.invoiced, t.outstanding,
      ].map(esc).join(",");
    });
    const csv = [headers.map(esc).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV import flow moved into the shared CsvImportDialog. The dialog
  // parses the file, runs the column-mapping UI, and calls importMutation
  // with the mapped rows — no per-page handlers needed anymore.

  const chipClass = (active: boolean) =>
    `inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition ${
      active
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;

  const currentFilters = {
    search, priorityFilter, statusFilter, industryFilter, countryFilter,
    activeOnly, withProjects, hasOutstanding, sortBy, showArchived,
    accountManagerFilter: ownerFilter, tagFilter,
  };
  const applyView = (v: SavedView) => {
    const f = (v.filters ?? {}) as Record<string, unknown>;
    const s = (k: string, fn: (val: any) => void) => { if (k in f) fn(f[k]); };
    s("search", (v) => setSearch((v as string) ?? ""));
    s("priorityFilter", (v) => setPriorityFilter((v as string) ?? ""));
    s("statusFilter", (v) => setStatusFilter((v as string) ?? ""));
    s("industryFilter", (v) => setIndustryFilter((v as string) ?? ""));
    s("countryFilter", (v) => setCountryFilter((v as string) ?? ""));
    s("accountManagerFilter", (v) => setOwnerFilter((v as string) ?? ""));
    s("tagFilter", (v) => setTagFilter((v as string) ?? ""));
    s("activeOnly", (v) => setActiveOnly(!!v));
    s("withProjects", (v) => setWithProjects(!!v));
    s("hasOutstanding", (v) => setHasOutstanding(!!v));
    s("sortBy", (v) => setSortBy((v as string) ?? "recent"));
    s("showArchived", (v) => setShowArchived(!!v));
    setActiveViewId(v.id);
  };
  const saveCurrentView = (name: string, isDefault: boolean) => {
    saveViewMutation.mutate(
      { module: "clients", name, filters: currentFilters, isDefault },
      { onSuccess: () => setSaveViewOpen(false) },
    );
  };

  // Auto-detect an active view that matches current filters (shallow compare)
  useEffect(() => {
    const match = savedViews.find((v) => {
      const f = (v.filters ?? {}) as Record<string, unknown>;
      return Object.entries(currentFilters).every(([k, val]) => {
        const fv = f[k];
        if (fv === undefined && (val === "" || val === false)) return true;
        return fv === val;
      });
    });
    setActiveViewId(match?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    search, priorityFilter, statusFilter, industryFilter, countryFilter,
    ownerFilter, tagFilter, activeOnly, withProjects, hasOutstanding, sortBy,
    showArchived, savedViews,
  ]);

  if (query.isLoading) return <LoadingState label="Loading clients..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load clients." />;

  // Account Manager + Owner pickers: exclude CLIENT users — they can't own other clients.
  const staffUsers = users.filter((u) => !isClientUser(u));
  const userOptions = [{ value: "", label: "Unassigned" }, ...staffUsers.map((u) => ({ value: u.id, label: userName(u) || u.email || u.id }))];
  const ownerFilterOptions = [{ value: "", label: "All owners" }, ...staffUsers.map((u) => ({ value: u.id, label: userName(u) || u.email || u.id }))];
  const tagFilterOptions = [{ value: "", label: "All tags" }, ...allTags.map((t) => ({ value: t, label: t }))];

  const selectedCount = selectedIds.size;

  return (
    <ListPageLayout
      module="clients"
      title="Client Management"
      description="Client profiles, project history, billing context, and revenue."
      primaryAction={{ label: "New Client", icon: <Plus className="mr-1 size-4" />, onClick: () => { setEditClient(undefined); setCreateOpen(true); }, permission: "clients:create" }}
      counts={[
        { label: "active", value: stats.active, tone: "positive" },
        { label: "total", value: stats.total },
      ]}
    >
      {/* Stats strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-white p-4 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500"><Building2 className="size-3.5" /> Total</div>
          <div className="mt-1 text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-white p-4 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-emerald-600">Active</div>
          <div className="mt-1 text-2xl font-bold">{stats.active}</div>
          <div className="text-xs text-slate-400">with at least 1 invoice</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-white p-4 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-rose-600"><Crown className="size-3.5" /> VIPs</div>
          <div className="mt-1 text-2xl font-bold">{stats.vip}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-white p-4 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-600"><AlertTriangle className="size-3.5" /> Outstanding</div>
          <div className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">{formatCurrency(stats.outstanding)}</div>
        </div>
      </div>

      {/* Condensed toolbar — rows grow only when needed */}
      <div className="space-y-2">
        {/* Row 1 — Saved views (inline, no heavy container) */}
        <SavedViewsStrip
          views={savedViews}
          activeId={activeViewId}
          onApply={applyView}
          onDelete={(id) =>
            deleteViewMutation.mutate(id, {
              onSuccess: () => {
                if (activeViewId === id) setActiveViewId(null);
              },
            })
          }
          onSaveClick={() => setSaveViewOpen(true)}
        />

        {/* Row 2 — Search + select filters + sort + actions (all compact, one row on desktop) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative w-[240px] shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, contact, email…"
              className="h-8 border-slate-200 pl-8 text-xs dark:border-slate-700"
            />
          </div>
          <div className="w-[120px]">
            <Select
              size="sm"
              value={priorityFilter}
              onValueChange={setPriorityFilter}
              placeholder="Priority"
              options={[
                { value: "", label: "Any priority" },
                { value: "VIP", label: "VIP" },
                { value: "HIGH", label: "High" },
                { value: "MEDIUM", label: "Medium" },
                { value: "LOW", label: "Low" },
              ]}
            />
          </div>
          <div className="w-[120px]">
            <Select
              size="sm"
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Status"
              options={[
                { value: "", label: "Any status" },
                { value: "ACTIVE", label: "Active" },
                { value: "PROSPECT", label: "Prospect" },
                { value: "CHURNED", label: "Churned" },
                { value: "ARCHIVED", label: "Archived" },
              ]}
            />
          </div>
          <div className="w-[140px]">
            <Select size="sm" value={ownerFilter} onValueChange={setOwnerFilter} placeholder="Owner" options={ownerFilterOptions} />
          </div>
          {allTags.length > 0 && (
            <div className="w-[120px]">
              <Select size="sm" value={tagFilter} onValueChange={setTagFilter} placeholder="Tag" options={tagFilterOptions} />
            </div>
          )}
          {industryOptions.length > 0 && (
            <div className="w-[130px]">
              <Select
                size="sm"
                value={industryFilter}
                onValueChange={setIndustryFilter}
                placeholder="Industry"
                options={[{ value: "", label: "Any industry" }, ...industryOptions.map((i) => ({ value: i, label: i }))]}
              />
            </div>
          )}
          {countryOptions.length > 0 && (
            <div className="w-[130px]">
              <Select
                size="sm"
                value={countryFilter}
                onValueChange={setCountryFilter}
                placeholder="Country"
                options={[{ value: "", label: "Any country" }, ...countryOptions.map((c) => ({ value: c, label: c }))]}
              />
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-[170px]">
              <Select
                size="sm"
                value={sortBy}
                onValueChange={setSortBy}
                options={[
                  { value: "recent", label: "Recently added" },
                  { value: "name", label: "Name A → Z" },
                  { value: "name-desc", label: "Name Z → A" },
                  { value: "priority", label: "Priority (VIP first)" },
                  { value: "oldest-contact", label: "Oldest contact first" },
                  { value: "next-followup", label: "Next follow-up soonest" },
                  { value: "most-projects", label: "Most projects" },
                  { value: "most-invoiced", label: "Most invoiced" },
                  { value: "outstanding", label: "Highest outstanding" },
                ]}
              />
            </div>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              title="Import CSV"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Upload className="size-3.5" />
              <span className="hidden lg:inline">Import</span>
            </button>
            <button
              type="button"
              onClick={exportCsv}
              title="Export CSV"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Download className="size-3.5" />
              <span className="hidden lg:inline">Export</span>
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="size-3.5" /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Row 3 — Quick chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setPriorityFilter(priorityFilter === "VIP" ? "" : "VIP")} className={chipClass(priorityFilter === "VIP")}>
            <Crown className="size-3" /> VIP
          </button>
          <button type="button" onClick={() => setNeedsFollowUp((v) => !v)} className={chipClass(needsFollowUp)}>
            Needs follow-up
          </button>
          <button type="button" onClick={() => setActiveOnly((v) => !v)} className={chipClass(activeOnly)}>
            Has invoices
          </button>
          <button type="button" onClick={() => setWithProjects((v) => !v)} className={chipClass(withProjects)}>
            Has projects
          </button>
          <button type="button" onClick={() => setHasOutstanding((v) => !v)} className={chipClass(hasOutstanding)}>
            <AlertTriangle className="size-3" /> Outstanding
          </button>
          <button type="button" onClick={() => setShowArchived((v) => !v)} className={chipClass(showArchived)}>
            <Eye className="size-3" /> Archived
          </button>
          <span className="ml-auto text-[11px] text-slate-400">
            Showing {filtered.length} of {clients.length}
          </span>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-sm">
          <span className="font-semibold text-primary">{selectedCount} selected</span>
          <div className="min-w-[180px]">
            <Select
              value={bulkOwnerId}
              onValueChange={(v) => {
                setBulkOwnerId(v);
                bulkUpdateMutation.mutate(
                  { ids: [...selectedIds], accountManagerId: v || undefined },
                  { onSuccess: () => { setBulkOwnerId(""); } },
                );
              }}
              placeholder="Change owner…"
              options={userOptions}
            />
          </div>
          <div className="min-w-[140px]">
            <Select
              value={bulkStatus}
              onValueChange={(v) => {
                setBulkStatus(v);
                bulkUpdateMutation.mutate(
                  { ids: [...selectedIds], status: v },
                  { onSuccess: () => { setBulkStatus(""); } },
                );
              }}
              placeholder="Change status…"
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "PROSPECT", label: "Prospect" },
                { value: "CHURNED", label: "Churned" },
                { value: "ARCHIVED", label: "Archived" },
              ]}
            />
          </div>
          <div className="flex items-center gap-1">
            <Input
              value={bulkTagDraft}
              onChange={(e) => setBulkTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && bulkTagDraft.trim()) {
                  e.preventDefault();
                  bulkUpdateMutation.mutate(
                    { ids: [...selectedIds], addTags: [bulkTagDraft.trim()] },
                    { onSuccess: () => setBulkTagDraft("") },
                  );
                }
              }}
              placeholder="Add tag (Enter)…"
              className="h-9 w-[160px]"
            />
          </div>
          {selectedCount === 2 && (
            <button
              type="button"
              onClick={() => setMergeOpen(true)}
              className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-xs font-semibold text-white hover:opacity-90"
            >
              <GitMerge className="mr-1 size-3.5" /> Merge duplicates
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              className="inline-flex h-9 items-center rounded-full bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700"
            >
              <Trash2 className="mr-1 size-3.5" /> Delete
            </button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        hideToolbar
        moduleColor="clients"
        onRowClick={(row) => router.push(`/clients/${row.id}`)}
        emptyState={
          hasFilters
            ? { title: "No matches", description: "Try clearing some filters." }
            : { title: "No clients", description: "Add your first client to get started." }
        }
      />

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setEditClient(undefined); }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{isEdit ? "Edit Client" : "New Client"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Company Name" required error={form.formState.errors.companyName?.message}>
              <Input {...form.register("companyName")} error={!!form.formState.errors.companyName} placeholder="Acme Corp" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Contact Person"><Input {...form.register("contactPerson")} placeholder="John Doe" /></FormField>
              <FormField label="Phone"><Input {...form.register("phone")} placeholder="+91 9876543210" /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Email" error={form.formState.errors.email?.message}>
                <Input {...form.register("email")} error={!!form.formState.errors.email} placeholder="john@acme.com" type="email" />
              </FormField>
              <FormField label="Website"><Input {...form.register("website")} placeholder="acme.com" /></FormField>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Priority">
                <Select value={form.watch("priority") ?? "MEDIUM"} onValueChange={(v) => form.setValue("priority", v as FormValues["priority"])}
                  options={[
                    { value: "LOW", label: "Low" },
                    { value: "MEDIUM", label: "Medium" },
                    { value: "HIGH", label: "High" },
                    { value: "VIP", label: "VIP" },
                  ]} />
              </FormField>
              <FormField label="Status">
                <Select value={form.watch("status") ?? "ACTIVE"} onValueChange={(v) => form.setValue("status", v)}
                  options={[
                    { value: "ACTIVE", label: "Active" },
                    { value: "PROSPECT", label: "Prospect" },
                    { value: "CHURNED", label: "Churned" },
                    { value: "ARCHIVED", label: "Archived" },
                  ]} />
              </FormField>
              <FormField label="Industry"><Input {...form.register("industry")} placeholder="SaaS, Healthcare…" /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Account Manager">
                <Select value={form.watch("accountManagerId") ?? ""} onValueChange={(v) => form.setValue("accountManagerId", v)} options={userOptions} />
              </FormField>
              <FormField label="Referral Source">
                <Input {...form.register("referralSource")} placeholder="Google, Referral from ACME…" />
              </FormField>
            </div>
            <FormField label="Tags">
              <TagInput value={form.watch("tags") ?? []} onChange={(v) => form.setValue("tags", v)} allTags={allTags} />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Next Follow-up">
                <DatePicker value={form.watch("nextFollowUpAt") ?? undefined} onChange={(d) => form.setValue("nextFollowUpAt", d ?? null)} />
              </FormField>
              <FormField label="Acquired at">
                <DatePicker value={form.watch("acquiredAt") ?? undefined} onChange={(d) => form.setValue("acquiredAt", d ?? null)} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="City"><Input {...form.register("city")} placeholder="Bengaluru" /></FormField>
              <FormField label="Country"><Input {...form.register("country")} placeholder="India" /></FormField>
            </div>
            <FormField label="Address"><Input {...form.register("address")} placeholder="Street, area, pin code" /></FormField>
            <FormField label="Notes"><TextArea {...form.register("notes")} placeholder="Internal notes, context, preferences…" rows={3} /></FormField>

            <CustomFieldsSection
              defs={customFieldDefs}
              values={(form.watch("customFields") as Record<string, unknown>) ?? {}}
              onChange={(v) => form.setValue("customFields", v)}
            />

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : isEdit ? "Update Client" : "Create Client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityLabel="Clients"
        fields={CLIENT_IMPORT_FIELDS}
        mutation={importMutation}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete client"
        description={`Delete "${deleteTarget?.companyName}"? This cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending}
      />

      <MergeClientsDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        rows={clients
          .filter((c) => selectedIds.has(c.id))
          .map((c) => ({ id: c.id, companyName: c.companyName, contactPerson: c.contactPerson, email: c.email, phone: c.phone }))}
        loading={mergeMutation.isPending}
        onMerge={(primaryId, duplicateId) => {
          mergeMutation.mutate(
            { primaryId, duplicateId },
            {
              onSuccess: () => {
                setMergeOpen(false);
                setSelectedIds(new Set());
              },
            },
          );
        }}
      />

      <SaveViewDialog
        open={saveViewOpen}
        onOpenChange={setSaveViewOpen}
        onSave={saveCurrentView}
        loading={saveViewMutation.isPending}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedCount} client(s)?`}
        description="This cannot be undone."
        variant="destructive"
        confirmLabel="Delete all"
        onConfirm={() => {
          bulkDeleteMutation.mutate({ ids: [...selectedIds] }, {
            onSuccess: () => {
              setBulkDeleteOpen(false);
              setSelectedIds(new Set());
            },
          });
        }}
        loading={bulkDeleteMutation.isPending}
      />
    </ListPageLayout>
  );
}
