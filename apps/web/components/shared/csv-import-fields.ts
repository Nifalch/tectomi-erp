/**
 * Reusable target-field schemas for the CsvImportDialog.
 *
 * Each entry declares the field key the backend expects, a human label,
 * a `required` flag, optional validator, and a list of `aliases` —
 * lowercase-stripped header strings that hint this field. The dialog's
 * auto-detection normalises CSV headers the same way (lowercase + strip
 * non-alphanumerics) and looks them up in this alias table.
 *
 * Aliases include the obvious snake_case / Title Case variants AND the
 * column names emitted by common sources we expect users to import from:
 * Meta Lead Ads, HubSpot, Zoho, Salesforce reports, plain spreadsheets.
 */

import type { ImportField } from "./csv-import-dialog";

const isEmail = (v: string): string | null =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : `Invalid email: ${v}`;

export const LEAD_IMPORT_FIELDS: ImportField[] = [
  // Company name is OPTIONAL on import — Meta Lead Ads, Google Forms, and
  // many other sources only capture person-level fields (name, phone,
  // email). Backend falls back to the contact name when missing so we can
  // ingest the lead anyway; the user fills in the real company later.
  {
    key: "companyName",
    label: "Company name",
    aliases: [
      "company", "companyname", "company name", "company_name",
      "business", "business name", "organization", "organisation",
      "account", "account name",
    ],
  },
  {
    key: "contactName",
    label: "Contact name",
    required: true,
    aliases: [
      "name", "fullname", "full name", "full_name",
      "contact", "contact name", "contact_name",
      "lead name", "person", "owner", "first name last name",
    ],
  },
  {
    key: "email",
    label: "Email",
    aliases: ["email", "email address", "emailaddress", "email_address", "e-mail", "mail"],
    validate: isEmail,
  },
  {
    key: "phone",
    label: "Phone",
    aliases: [
      "phone", "phone number", "phonenumber", "phone_number",
      "mobile", "mobile number", "cell", "contact number", "tel", "telephone",
    ],
  },
  {
    key: "source",
    label: "Source",
    aliases: [
      "source", "lead source", "leadsource", "lead_source",
      "channel", "campaign", "form name", "form_name",
      "referral", "referral source",
    ],
  },
  {
    key: "status",
    label: "Status",
    aliases: ["status", "lead status", "leadstatus", "lead_status", "stage"],
  },
  {
    key: "estimatedValue",
    label: "Estimated value",
    aliases: [
      "value", "estimated value", "estimated_value", "estimatedvalue",
      "deal size", "deal value", "amount", "budget",
    ],
  },
  {
    key: "notes",
    label: "Notes",
    aliases: ["notes", "note", "comments", "comment", "description", "remarks", "message"],
  },
];

export const CLIENT_IMPORT_FIELDS: ImportField[] = [
  // Company name is OPTIONAL on import — same reason as leads: many lead
  // sources only carry person-level data. Backend falls back to the
  // contact person (or the email localpart) when missing.
  {
    key: "companyName",
    label: "Company name",
    aliases: [
      "company", "companyname", "company name", "company_name",
      "business", "business name", "organization", "organisation",
      "account", "account name", "client", "client name",
    ],
  },
  {
    key: "contactPerson",
    label: "Contact person",
    aliases: [
      "contact", "contact person", "contact_person", "contactperson",
      "name", "fullname", "full name", "full_name",
      "primary contact", "point of contact", "poc",
    ],
  },
  {
    key: "email",
    label: "Email",
    aliases: ["email", "email address", "emailaddress", "email_address", "e-mail", "mail"],
    validate: isEmail,
  },
  {
    key: "phone",
    label: "Phone",
    aliases: [
      "phone", "phone number", "phonenumber", "phone_number",
      "mobile", "mobile number", "cell", "contact number", "tel", "telephone",
    ],
  },
  {
    key: "website",
    label: "Website",
    aliases: ["website", "url", "site", "web", "homepage"],
  },
  {
    key: "address",
    label: "Address",
    aliases: ["address", "street", "street address", "billing address", "office address"],
  },
  {
    key: "city",
    label: "City",
    aliases: ["city", "town"],
  },
  {
    key: "country",
    label: "Country",
    aliases: ["country", "region"],
  },
  {
    key: "industry",
    label: "Industry",
    aliases: ["industry", "sector", "vertical", "category"],
  },
  {
    key: "priority",
    label: "Priority",
    aliases: ["priority", "tier", "importance"],
  },
  {
    key: "status",
    label: "Status",
    aliases: ["status", "state", "stage"],
  },
  {
    key: "referralSource",
    label: "Referral source",
    aliases: [
      "source", "referral", "referral source", "referral_source",
      "lead source", "leadsource", "lead_source", "channel",
    ],
  },
  {
    key: "tags",
    label: "Tags (comma-separated)",
    aliases: ["tags", "labels", "categories"],
  },
  {
    key: "notes",
    label: "Notes",
    aliases: ["notes", "note", "comments", "comment", "description", "remarks"],
  },
];
