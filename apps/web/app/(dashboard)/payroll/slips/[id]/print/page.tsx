"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Download } from "lucide-react";
import { usePaySlip, useOrgSettings } from "@/lib/api/hooks";
import { LoadingState, ErrorState } from "@/components/ui/state";
import { formatCurrency } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface SlipData {
  id: string;
  month?: number;
  year?: number;
  employee?: {
    designation?: string | null;
    department?: string | null;
    user?: { firstName?: string; lastName?: string; email?: string };
  };
  basic?: number | string;
  hra?: number | string;
  allowances?: number | string;
  grossSalary?: number | string;
  pfDeduction?: number | string;
  taxDeduction?: number | string;
  otherDeductions?: number | string;
  netSalary?: number | string;
  drawnAmount?: number | string | null;
  deferredAmount?: number | string | null;
  workingDays?: number;
  paidDays?: number;
  leaveDays?: number;
  status?: string;
  paidAt?: string;
  paymentReference?: string | null;
}

interface OrgInfo {
  name?: string;
  legalName?: string;
  companyName?: string;
  logoUrl?: string;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  return Number(v ?? 0) || 0;
}

function joinAddress(o: OrgInfo): string {
  const cityLine = [
    [o.city, o.state].filter(Boolean).join(", "),
    o.postalCode,
  ].filter(Boolean).join(" - ");
  return [o.addressLine1, o.addressLine2, cityLine].filter(Boolean).join("\n");
}

export default function PaySlipPrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const slipQuery = usePaySlip(id);
  const orgQuery = useOrgSettings();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const downloadPdf = async () => {
    if (!sheetRef.current || downloading) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      const node = sheetRef.current;

      // Same image-decode dance as the invoice exporter — without this
      // the logo occasionally captures as a blank rectangle.
      const waitForImage = async (img: HTMLImageElement) => {
        if (!(img.complete && img.naturalWidth > 0)) {
          await new Promise<void>((resolve) => {
            const finish = () => resolve();
            img.addEventListener("load", finish, { once: true });
            img.addEventListener("error", finish, { once: true });
          });
        }
        try { await img.decode(); } catch { /* decode unsupported / failed */ }
      };
      await Promise.all(
        Array.from(node.querySelectorAll<HTMLImageElement>("img")).map(waitForImage),
      );

      const canvas = await html2canvas(node, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 0,
        letterRendering: true,
        onclone: async (_doc: Document, cloned: HTMLElement) => {
          const clonedImgs = Array.from(cloned.querySelectorAll<HTMLImageElement>("img"));
          await Promise.all(clonedImgs.map(waitForImage));
        },
      } as Parameters<typeof html2canvas>[1]);
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      let imgW = pageW;
      let imgH = pageW / ratio;
      if (imgH > pageH) {
        imgH = pageH;
        imgW = pageH * ratio;
      }
      pdf.addImage(imgData, "JPEG", (pageW - imgW) / 2, (pageH - imgH) / 2, imgW, imgH, undefined, "FAST");
      const slip = slipQuery.data as unknown as SlipData | undefined;
      const empName = slip?.employee?.user
        ? `${slip.employee.user.firstName ?? ""}-${slip.employee.user.lastName ?? ""}`.replace(/^-|-$/g, "")
        : "employee";
      const monthLabel = slip?.month ? MONTHS[slip.month - 1] : "";
      const filename = `Payslip-${empName || "employee"}-${monthLabel}-${slip?.year ?? ""}.pdf`.replace(/\s+/g, "_");
      pdf.save(filename);
    } finally {
      setDownloading(false);
    }
  };

  if (slipQuery.isLoading) return <LoadingState label="Loading pay slip..." />;
  if (slipQuery.isError || !slipQuery.data) return <ErrorState label="Unable to load pay slip." />;

  const slip = slipQuery.data as unknown as SlipData;
  const org = (orgQuery.data ?? {}) as OrgInfo;
  const employeeUser = slip.employee?.user;

  const basic = num(slip.basic);
  const hra = num(slip.hra);
  const allowances = num(slip.allowances);
  const gross = num(slip.grossSalary) || basic + hra + allowances;

  const pf = num(slip.pfDeduction);
  const tax = num(slip.taxDeduction);
  const other = num(slip.otherDeductions);
  const totalDeductions = pf + tax + other;

  const net = num(slip.netSalary) || gross - totalDeductions;
  const drawn = slip.drawnAmount != null ? num(slip.drawnAmount) : net;
  const deferred = slip.deferredAmount != null
    ? num(slip.deferredAmount)
    : Math.max(0, net - drawn);

  const orgName = org.companyName ?? org.name ?? "Tectomi ERP";
  const orgAddress = joinAddress(org);
  const logo = org.logoUrl;

  return (
    <>
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0; }
          nav, aside, header.app-header, .no-print { display: none !important; }
          html, body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .payslip-page { margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      {/* Toolbar — screen only, hidden in print. */}
      <div className="no-print mx-auto mt-4 flex items-center justify-end gap-2 px-2 print:hidden" style={{ width: "794px" }}>
        <button
          type="button"
          onClick={downloadPdf}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Download className="size-4" />
          {downloading ? "Generating PDF…" : "Download PDF"}
        </button>
      </div>

      {/* A4 portrait: 794 × 1123 px @ 96dpi (210 × 297 mm). */}
      <div
        ref={sheetRef}
        className="payslip-page relative mx-auto my-6 flex flex-col overflow-hidden bg-white px-10 pt-12 pb-10 text-slate-900 shadow-lg print:my-0 print:shadow-none"
        style={{ width: "794px", minHeight: "1123px" }}
      >
        {/* Status watermark for PAID slips. */}
        {slip.status?.toUpperCase() === "PAID" && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ zIndex: 0 }}
          >
            <span
              className="select-none text-[140px] font-extrabold tracking-[0.15em]"
              style={{ transform: "rotate(-22deg)", opacity: 0.1, color: "#059669", whiteSpace: "nowrap" }}
            >
              PAID
            </span>
          </div>
        )}

        <div className="relative flex flex-1 flex-col" style={{ zIndex: 10 }}>
          {/* ── HEADER ── matches the invoice template's logo/headline layout. */}
          <header className="flex items-start justify-between">
            {logo ? (
              <div className="flex items-center gap-3">
                <Image src={logo} alt={orgName} width={56} height={56} className="h-14 w-14 object-contain" unoptimized />
                <span className="text-3xl font-bold tracking-tight">{orgName.toUpperCase()}</span>
              </div>
            ) : (
              <Image
                src="/logo-white.png"
                alt={orgName}
                width={320}
                height={80}
                className="h-14 w-auto object-contain"
                unoptimized
                priority
              />
            )}
            <div className="text-5xl font-extrabold tracking-tight">PAY SLIP</div>
          </header>

          {/* ── ORG + PERIOD BLOCK ── */}
          <section className="mt-10 grid grid-cols-2 gap-8">
            <div className="space-y-1 text-sm text-slate-700">
              {org.legalName && <div className="font-semibold">{org.legalName}</div>}
              {orgAddress && <div className="whitespace-pre-line">{orgAddress}</div>}
              {org.email && <div>{org.email}</div>}
              {org.phone && <div>{org.phone}</div>}
            </div>
            <div className="space-y-1 text-right text-sm text-slate-700">
              <div>Period: {slip.month ? MONTHS[slip.month - 1] : ""} {slip.year ?? ""}</div>
              {slip.paidAt && <div>Pay Date: {new Date(slip.paidAt).toLocaleDateString()}</div>}
              {slip.paymentReference && <div>Ref: {slip.paymentReference}</div>}
              {slip.status && (
                <div className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wider text-slate-600">
                  {slip.status}
                </div>
              )}
            </div>
          </section>

          {/* ── EMPLOYEE ── */}
          <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">Employee</div>
                <div className="mt-1 text-base font-semibold">
                  {employeeUser ? `${employeeUser.firstName ?? ""} ${employeeUser.lastName ?? ""}`.trim() || "—" : "—"}
                </div>
                {employeeUser?.email && <div className="text-xs text-slate-500">{employeeUser.email}</div>}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">Designation</div>
                <div className="mt-1 text-sm">
                  {slip.employee?.designation ?? "—"}
                  {slip.employee?.department && <span className="text-slate-500"> • {slip.employee.department}</span>}
                </div>
              </div>
            </div>
          </section>

          {/* ── ATTENDANCE STRIP ── */}
          <section className="mt-4 grid grid-cols-3 gap-4 rounded-lg bg-slate-50 p-3 text-center text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Working Days</div>
              <div className="mt-1 font-semibold tabular-nums">{slip.workingDays ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Paid Days</div>
              <div className="mt-1 font-semibold tabular-nums">{slip.paidDays ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Leave</div>
              <div className="mt-1 font-semibold tabular-nums">{slip.leaveDays ?? 0}</div>
            </div>
          </section>

          {/* ── EARNINGS / DEDUCTIONS ── */}
          <section className="mt-6 grid grid-cols-2 gap-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-600">Earnings</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100"><td className="py-2 text-slate-600">Basic</td><td className="py-2 text-right tabular-nums">{formatCurrency(basic)}</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-2 text-slate-600">HRA</td><td className="py-2 text-right tabular-nums">{formatCurrency(hra)}</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-2 text-slate-600">Allowances</td><td className="py-2 text-right tabular-nums">{formatCurrency(allowances)}</td></tr>
                  <tr><td className="py-2 font-semibold">Gross</td><td className="py-2 text-right font-semibold tabular-nums">{formatCurrency(gross)}</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-600">Deductions</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100"><td className="py-2 text-slate-600">PF</td><td className="py-2 text-right tabular-nums">{formatCurrency(pf)}</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-2 text-slate-600">Tax</td><td className="py-2 text-right tabular-nums">{formatCurrency(tax)}</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-2 text-slate-600">Other</td><td className="py-2 text-right tabular-nums">{formatCurrency(other)}</td></tr>
                  <tr><td className="py-2 font-semibold">Total</td><td className="py-2 text-right font-semibold tabular-nums">{formatCurrency(totalDeductions)}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ── NET PAY ── */}
          <section className="mt-8 rounded-xl bg-slate-100 p-6 text-center">
            <div className="text-xs uppercase tracking-wider text-slate-500">Net Pay</div>
            <div className="mt-2 text-4xl font-bold tabular-nums">{formatCurrency(net)}</div>
            {/* Deferred-comp split: if drawn < net, the founder/employee took a
                partial draw and the balance is recorded as company-payable. */}
            {deferred > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-md bg-white/70 p-2">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Paid this run</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-emerald-700">{formatCurrency(drawn)}</div>
                </div>
                <div className="rounded-md bg-white/70 p-2">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Deferred (owed)</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-amber-700">{formatCurrency(deferred)}</div>
                </div>
              </div>
            )}
            {slip.paidAt && (
              <div className="mt-3 text-xs text-slate-500">
                Paid on {new Date(slip.paidAt).toLocaleDateString()}
                {slip.paymentReference ? ` • Ref: ${slip.paymentReference}` : ""}
              </div>
            )}
          </section>

          {/* ── SIGNATURES ── pushed to the bottom of the page. */}
          <div className="mt-auto grid grid-cols-2 gap-12 pt-16 text-sm">
            <div>
              <div className="border-t border-slate-300 pt-2 text-center text-slate-500">Employee Signature</div>
            </div>
            <div>
              <div className="border-t border-slate-300 pt-2 text-center text-slate-500">Authorized Signatory</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
