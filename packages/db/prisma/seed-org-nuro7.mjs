// One-off seed: populate OrganizationSettings with the real Nuro 7 details
// and the 5 standard invoice T&Cs from the brand reference invoice.
//
// Run: node packages/db/prisma/seed-org-nuro7.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Universal T&Cs — apply to every invoice. The stage-specific line
// ("This invoice covers the 50% advance...") belongs on each invoice's
// own `notes` field, not here, because it changes per payment stage.
// Universal T&Cs printed on every INVOICE. Kept short — invoice readers are
// looking for "what do I owe and how do I pay it", not contract clauses.
const STANDARD_TERMS = [
  "Payment Schedule: 50% Advance | 30% on Milestone | 20% Before Final Handover.",
  "Client Responsibility: This quote covers development costs only. All other fees (Hosting, Domain, APIs, & Third-Party services) are the client's responsibility.",
  "Late Fees: A 2% monthly penalty applies if payment is delayed by more than 7 days.",
  "Ownership: Source code and IP remain the property of Nuro 7 until full payment is received.",
].join("\n");

// Comprehensive Terms & Conditions printed on every PROPOSAL. Proposals are the
// commercial contract before work starts, so the protective clauses live here —
// scope freezes, change-request handling, IP, warranty, force majeure, etc.
const PROPOSAL_TERMS = [
  "Scope Freeze: This proposal lists the exact features and deliverables Nuro 7 will produce. Anything not explicitly listed here is treated as a Change Request and quoted separately before any additional work begins.",
  "Change Requests: New features, scope additions, redesign of approved work, or pivots after acceptance are billed at the prevailing hourly rate or via a separate fixed-scope addendum, whichever the client prefers.",
  "Out of Scope (always client-provided / client-paid): hosting, domain registration & DNS, SSL certificates, third-party API & SaaS subscriptions (Stripe, OpenAI, Twilio, Mailgun, Klaviyo, Yotpo, etc.), content writing & copy, stock photography & video, graphic design & branding assets unless explicitly listed, translation & localization, paid marketing / ads / SEO services, long-term maintenance & support, native mobile apps (web only unless specified), data migration beyond the volumes stated, and access to third-party platforms (client provides admin credentials).",
  "Approvals & Sign-off: Each phase requires written sign-off (email is acceptable) within 5 business days of delivery. If we don't hear back, we'll send two reminders before treating the deliverable as accepted by default. Delayed approvals push downstream phases proportionally and are not counted against the agreed timeline.",
  "Client-Side Dependencies: The project timeline assumes timely delivery of client-provided inputs — content, brand assets, credentials, third-party platform access, stakeholder reviews, and approvals. Every business day of delay in any of these shifts the project end-date by the same number of days. Nuro 7 is not liable for missed launch dates caused by client-side delays.",
  "Response SLA (client): During an active phase the client agrees to respond to clarifying questions, share required inputs, and approve deliverables within 2 business days. Slower responses pause the active phase; the pause is logged and added to the timeline.",
  "Project Pause: If the project is dormant on the client's side for more than 14 consecutive days (no responses, no inputs, no approvals), the engagement is automatically paused. Resumption after a pause requires a 5% ramp-up fee on the remaining contract value to cover context-restoration and rescheduling.",
  "Stale Engagements: A project paused beyond 60 calendar days for any client-side reason is considered stale. Resumption requires a fresh proposal at then-current rates; any advance already paid is credited toward the new engagement.",
  "Missed Meetings: Scheduled meetings missed by the client without 4 hours notice will be re-scheduled at Nuro 7's earliest availability. The lost slot is not made up at the expense of the agreed timeline.",
  "Revisions: Two rounds of revisions are included per design/build phase. Additional rounds are billed at the prevailing hourly rate.",
  "Communication: Standard support is async over the agreed channel during business hours (10:00–18:00 IST, Mon–Fri). After-hours work, weekend launches, and same-day turnarounds are billed at 1.5× the standard rate.",
  "Payment Schedule: 50% Advance on signing · 30% on agreed milestone delivery · 20% before final handover. Work pauses if any milestone payment is overdue by more than 7 days.",
  "Late Fees: A 2% monthly penalty applies on overdue invoices after 7 days. Project resumes only after the overdue balance is cleared.",
  "Currency & Taxes: All amounts are in INR and exclude applicable taxes. Foreign clients are responsible for any wire-transfer or FX fees.",
  "Ownership & IP: All source code, design files, and deliverables remain the property of Nuro 7 until 100% of the invoiced amount is received, after which IP transfers in full to the client. Pre-existing Nuro 7 frameworks, internal libraries, and tooling remain Nuro 7 property under a perpetual, royalty-free licence to the client.",
  "Warranty: 30 calendar days of bug-fix warranty from final handover for issues in the delivered scope. New features, environment changes, third-party breakage, and content edits are not warranty items.",
  "Confidentiality: Both parties keep project artefacts, code, and business information confidential. Nuro 7 reserves the right to mention the client's name and high-level project description in its portfolio unless explicitly excluded in writing.",
  "Force Majeure: Neither party is liable for delays caused by events beyond reasonable control (outages, governmental restrictions, natural events, third-party platform changes).",
  "Liability Cap: Nuro 7's total liability for any claim arising from this engagement is capped at the fees paid by the client under this proposal.",
  "Cancellation: Either party may terminate with 14 days written notice. On termination, Nuro 7 invoices for all work delivered and in-progress up to that date; any portion of the advance not yet earned is credited back or refunded within 30 days.",
  "Validity: This proposal is valid for the period stated under 'Valid Until'. Pricing and timelines may be re-quoted thereafter.",
].join("\n");

async function main() {
  const existing = await prisma.organizationSettings.findFirst();

  const data = {
    name: "Tectomi ERP",
    legalName: "Tectomi ERP",
    ceoName: "Muhammed Nifal C H",
    ceoTitle: "CEO",
    email: "info@nuro7.com",
    phone: "+91 9446617877",
    website: "www.nuro7.com",
    addressLine1: null,
    addressLine2: null,
    city: "Pandikkad",
    state: "Kerala",
    postalCode: "676521",
    country: null,
    baseCurrency: "INR",
    defaultHourlyRate: 900,
    invoicePrefix: "INV-",
    invoiceTerms: STANDARD_TERMS,
    proposalTerms: PROPOSAL_TERMS,
    bankName: "Federal Bank",
    bankAccountNumber: "11200100348872",
    bankAccountHolder: "Mohammed Nifli A P",
    bankBranch: "Pandikad",
    bankIfsc: "FDRL0001120",
    bankUpi: "918943737227@federal",
  };

  if (existing) {
    await prisma.organizationSettings.update({ where: { id: existing.id }, data });
    console.log(`Updated OrganizationSettings ${existing.id}`);
  } else {
    const created = await prisma.organizationSettings.create({ data });
    console.log(`Created OrganizationSettings ${created.id}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
