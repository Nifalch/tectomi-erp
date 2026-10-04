"use client";

import { useEffect, useState } from "react";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useOrgSettings } from "@/lib/api/hooks";
import { useSaveOrgSettings } from "@/lib/api/mutations";

interface State {
  name: string; legalName: string; email: string; phone: string; website: string;
  addressLine1: string; addressLine2: string; city: string; state: string; postalCode: string; country: string;
  taxId: string; fiscalYearStart: string; baseCurrency: string;
  invoicePrefix: string; estimatePrefix: string; billPrefix: string; creditNotePrefix: string;
  paymentTerms: number; invoiceTerms: string; invoiceFooter: string;
  logoUrl: string; stampUrl: string;
  bankName: string; bankAccountNumber: string; bankAccountHolder: string;
  bankBranch: string; bankIfsc: string; bankUpi: string;
  aboutCompany: string;
}

const empty: State = {
  name: "", legalName: "", email: "", phone: "", website: "",
  addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "India",
  taxId: "", fiscalYearStart: "APRIL", baseCurrency: "INR",
  invoicePrefix: "INV-", estimatePrefix: "EST-", billPrefix: "BILL-", creditNotePrefix: "CN-",
  paymentTerms: 30, invoiceTerms: "", invoiceFooter: "", logoUrl: "", stampUrl: "",
  bankName: "", bankAccountNumber: "", bankAccountHolder: "",
  bankBranch: "", bankIfsc: "", bankUpi: "",
  aboutCompany: "",
};

export default function OrganizationSettingsPage() {
  const query = useOrgSettings();
  const saveMutation = useSaveOrgSettings();
  const [form, setForm] = useState<State>(empty);
  const [logoFiles, setLogoFiles] = useState<File[]>([]);

  useEffect(() => {
    const s = query.data as Record<string, unknown> | undefined;
    if (!s) return;
    // Only carry over fields that exist on our local State, not server metadata
    // (id, createdAt, updatedAt) — those are rejected by the DTO whitelist on save.
    const allowed = Object.keys(empty);
    const filtered: Record<string, unknown> = {};
    for (const k of allowed) {
      const v = s[k];
      if (v !== null && v !== undefined) filtered[k] = v;
    }
    setForm({ ...empty, ...filtered } as State);
  }, [query.data]);

  if (query.isLoading) return <LoadingState label="Loading settings..." />;
  if (query.isError) return <ErrorState label="Unable to load settings." />;

  const update = <K extends keyof State>(k: K, v: State[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    // form is already restricted to the known State keys, but spread defensively
    // anyway so any future field additions don't accidentally leak server metadata.
    const payload: Record<string, unknown> = {};
    for (const k of Object.keys(empty) as Array<keyof State>) {
      payload[k as string] = form[k];
    }
    saveMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organization Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Company profile, branding, and invoicing defaults.</p>
      </div>

      <div className="space-y-6 rounded-2xl border border-border bg-white p-6 dark:bg-slate-900/80">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Logo</h2>
          <FileUpload value={logoFiles} onChange={setLogoFiles} accept={{ "image/*": [".png", ".jpg", ".jpeg", ".svg"] }} maxSize={2 * 1024 * 1024} />
          {form.logoUrl && <p className="mt-2 text-xs text-slate-500">Current: {form.logoUrl}</p>}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Company</h2>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Name" required><Input value={form.name} onChange={(e) => update("name", e.target.value)} /></FormField>
            <FormField label="Legal Name"><Input value={form.legalName} onChange={(e) => update("legalName", e.target.value)} /></FormField>
            <FormField label="Email"><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></FormField>
            <FormField label="Phone"><Input value={form.phone} onChange={(e) => update("phone", e.target.value)} /></FormField>
            <FormField label="Website"><Input value={form.website} onChange={(e) => update("website", e.target.value)} /></FormField>
            <FormField label="Tax ID / GSTIN"><Input value={form.taxId} onChange={(e) => update("taxId", e.target.value)} /></FormField>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Address</h2>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Address Line 1"><Input value={form.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} /></FormField>
            <FormField label="Address Line 2"><Input value={form.addressLine2} onChange={(e) => update("addressLine2", e.target.value)} /></FormField>
            <FormField label="City"><Input value={form.city} onChange={(e) => update("city", e.target.value)} /></FormField>
            <FormField label="State"><Input value={form.state} onChange={(e) => update("state", e.target.value)} /></FormField>
            <FormField label="Postal Code"><Input value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} /></FormField>
            <FormField label="Country"><Input value={form.country} onChange={(e) => update("country", e.target.value)} /></FormField>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Finance Defaults</h2>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Fiscal Year Start">
              <Select value={form.fiscalYearStart} onValueChange={(v) => update("fiscalYearStart", v)}
                options={[{ value: "APRIL", label: "April" }, { value: "JANUARY", label: "January" }]} />
            </FormField>
            <FormField label="Base Currency">
              <Select value={form.baseCurrency} onValueChange={(v) => update("baseCurrency", v)}
                options={[{ value: "INR", label: "INR" }, { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "GBP", label: "GBP" }]} />
            </FormField>
            <FormField label="Payment Terms (days)">
              <NumberInput value={form.paymentTerms} onChange={(v) => update("paymentTerms", v ?? 0)} suffix="days" />
            </FormField>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Prefixes</h2>
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Invoice"><Input value={form.invoicePrefix} onChange={(e) => update("invoicePrefix", e.target.value)} /></FormField>
            <FormField label="Estimate"><Input value={form.estimatePrefix} onChange={(e) => update("estimatePrefix", e.target.value)} /></FormField>
            <FormField label="Bill"><Input value={form.billPrefix} onChange={(e) => update("billPrefix", e.target.value)} /></FormField>
            <FormField label="Credit Note"><Input value={form.creditNotePrefix} onChange={(e) => update("creditNotePrefix", e.target.value)} /></FormField>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Bank Details</h2>
          <p className="mb-3 text-xs text-slate-500">Shown on the invoice template under "BANK DETAILS".</p>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Bank Name"><Input value={form.bankName} onChange={(e) => update("bankName", e.target.value)} placeholder="Federal Bank" /></FormField>
            <FormField label="Account Holder"><Input value={form.bankAccountHolder} onChange={(e) => update("bankAccountHolder", e.target.value)} placeholder="Your full name" /></FormField>
            <FormField label="Account Number"><Input value={form.bankAccountNumber} onChange={(e) => update("bankAccountNumber", e.target.value)} placeholder="11200100348872" /></FormField>
            <FormField label="Branch"><Input value={form.bankBranch} onChange={(e) => update("bankBranch", e.target.value)} placeholder="Pandikad" /></FormField>
            <FormField label="IFSC / SWIFT"><Input value={form.bankIfsc} onChange={(e) => update("bankIfsc", e.target.value)} placeholder="FDRL0001120" /></FormField>
            <FormField label="UPI"><Input value={form.bankUpi} onChange={(e) => update("bankUpi", e.target.value)} placeholder="name@bank" /></FormField>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Invoice Template</h2>
          <div className="space-y-4">
            <FormField label="Stamp / Seal URL">
              <Input value={form.stampUrl} onChange={(e) => update("stampUrl", e.target.value)} placeholder="https://… (round seal image, optional)" />
            </FormField>
            <FormField label="Terms & Conditions"><TextArea value={form.invoiceTerms} onChange={(e) => update("invoiceTerms", e.target.value)} /></FormField>
            <FormField label="Footer"><TextArea value={form.invoiceFooter} onChange={(e) => update("invoiceFooter", e.target.value)} /></FormField>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Proposal Template</h2>
          <p className="mb-3 text-xs text-slate-500">"About Us" narrative shown at the top of every proposal you send to clients.</p>
          <FormField label="About Us">
            <TextArea
              value={form.aboutCompany}
              onChange={(e) => update("aboutCompany", e.target.value)}
              rows={5}
              placeholder="Brief intro to your company — who you are, what you do, why clients choose you."
            />
          </FormField>
        </section>
      </div>

      <div className="flex justify-end gap-3">
        <Button onClick={save} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save Settings"}</Button>
      </div>
    </div>
  );
}
