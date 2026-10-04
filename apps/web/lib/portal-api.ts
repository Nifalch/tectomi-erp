import { getApiBaseUrl } from "@/lib/api/client";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}/client-portal${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    // Defeat Next.js / browser fetch caching so usePortalRefresh always
    // gets a fresh server response when the tab regains focus.
    cache: "no-store",
    ...init,
  });
  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/portal/login";
    throw new Error("unauthenticated");
  }
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const portalApi = {
  me: () =>
    call<{
      contactId: string;
      clientId: string;
      name: string | null;
      email: string;
      orgName: string;
      orgLogoUrl: string | null;
      baseCurrency: string;
      orgEmail: string | null;
      orgPhone: string | null;
      orgWebsite: string | null;
      orgAddress: string | null;
      orgLegalName: string | null;
      orgStampUrl: string | null;
      orgAddressLine1: string | null;
      orgAddressLine2: string | null;
      orgCity: string | null;
      orgState: string | null;
      orgPostalCode: string | null;
      orgCountry: string | null;
      bankName: string | null;
      bankAccountNumber: string | null;
      bankAccountHolder: string | null;
      bankBranch: string | null;
      bankIfsc: string | null;
      bankUpi: string | null;
      invoiceTerms: string | null;
    }>("/me"),
  dashboard: () => call<any>("/dashboard"),
  projects: {
    list: () => call<any[]>("/projects"),
    detail: (id: string) => call<any>(`/projects/${id}`),
    tasks: (id: string) => call<any[]>(`/projects/${id}/tasks`),
  },
  invoices: {
    list: () => call<any[]>("/invoices"),
    detail: (id: string) => call<any>(`/invoices/${id}`),
    pdfUrl: (id: string) => `${getApiBaseUrl()}/client-portal/invoices/${id}/pdf`,
  },
  proposals: {
    list: () => call<any[]>("/proposals"),
    detail: (id: string) => call<any>(`/proposals/${id}`),
    decide: (id: string, decision: "ACCEPTED" | "REJECTED", note?: string) =>
      call<{ ok: true }>(`/proposals/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, note }),
      }),
  },
  chat: {
    list: (projectId: string) => call<Array<{ id: string; content: string; createdAt: string; side: "team" | "client"; authorName: string; avatarUrl: string | null }>>(`/projects/${projectId}/chat`),
    post: (projectId: string, content: string) =>
      call<{ id: string; ok: true }>(`/projects/${projectId}/chat`, { method: "POST", body: JSON.stringify({ content }) }),
  },
  requests: {
    list: (status?: string) => call<any[]>(`/requests${status ? `?status=${status}` : ""}`),
    detail: (id: string) => call<any>(`/requests/${id}`),
    create: (input: { title: string; body: string; projectId?: string }) =>
      call<any>("/requests", { method: "POST", body: JSON.stringify(input) }),
    reply: (id: string, body: string) =>
      call<{ ok: true }>(`/requests/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
  },
  auth: {
    requestLink: (email: string) =>
      call<{ ok: true }>("/auth/request-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    logout: () => call<{ ok: true }>("/auth/logout", { method: "POST" }),
  },
};
