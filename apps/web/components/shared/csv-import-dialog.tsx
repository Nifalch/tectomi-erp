"use client";

/**
 * Shared CSV import dialog used by Leads and Clients (and reusable for any
 * future bulk import). Three steps:
 *
 *   1. UPLOAD   — drag-drop or click to pick a .csv. Parses on the client
 *                 with the RFC-4180 parser in lib/utils/csv.ts (handles
 *                 quoted commas, escaped quotes, BOM).
 *   2. MAP      — for each detected CSV column, a Select of target fields.
 *                 Auto-detection runs once on load: every target field
 *                 declares aliases ("full_name", "phone_number", etc.) and
 *                 we lowercase+strip CSV headers to match. The user can
 *                 override; "(skip)" is always available.
 *   3. PREVIEW  — first 5 mapped rows shown in a small table, plus pre-flight
 *                 validation (required fields, invalid email format).
 *                 Click Import → calls the supplied mutation. On response
 *                 the dialog flips to a result view with per-row skip reasons.
 *
 * The CSV → target-field mapping happens entirely client-side. The backend
 * receives clean `{ rows: [{ ourField: value, ... }] }` arrays so it has no
 * source-format knowledge — it just validates and inserts.
 */

import { useEffect, useMemo, useState } from "react";
import { Upload, FileText, AlertTriangle, Loader2, CheckCircle2, X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { parseCsv } from "@/lib/utils/csv";

/** Definition of a target field the CSV can map into. */
export interface ImportField {
  /** The field key the backend expects (e.g. "companyName"). */
  key: string;
  /** Human-friendly label shown in the mapping dropdown. */
  label: string;
  /** Required for a row to be considered importable. */
  required?: boolean;
  /** Lowercase header strings that hint this field. Match is case-/separator-insensitive. */
  aliases?: string[];
  /** Field-level validator. Return a string error message OR null/undefined to pass. */
  validate?: (value: string) => string | null | undefined;
}

interface ImportResult {
  createdCount: number;
  skippedCount: number;
  skipped: Array<{ row: number; reason: string }>;
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What we're importing — used in copy + dialog title. */
  entityLabel: string;
  /** Target fields available for mapping. Required ones are flagged. */
  fields: ImportField[];
  /** The mutation hook's result. We call .mutate({ rows }) on Import. */
  mutation: {
    mutate: (
      vars: { rows: Array<Record<string, string>> },
      opts?: { onSuccess?: (data: ImportResult) => void },
    ) => void;
    isPending: boolean;
  };
}

/** Normalize a header string for alias matching: lowercase + strip non-alphanumerics. */
function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "(skip)" sentinel for the mapping dropdown — leaves that CSV column out. */
const SKIP = "__skip__";

export function CsvImportDialog({
  open,
  onOpenChange,
  entityLabel,
  fields,
  mutation,
}: CsvImportDialogProps) {
  const [phase, setPhase] = useState<"upload" | "map" | "result">("upload");
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Reset everything when the dialog closes so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setPhase("upload");
      setFileName("");
      setHeaders([]);
      setRows([]);
      setMapping({});
      setParseError("");
      setResult(null);
      setDragOver(false);
    }
  }, [open]);

  // Lookup: normalized alias → field key. Built once per `fields` change.
  const aliasIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fields) {
      map.set(normalizeHeader(f.key), f.key);
      map.set(normalizeHeader(f.label), f.key);
      for (const alias of f.aliases ?? []) map.set(normalizeHeader(alias), f.key);
    }
    return map;
  }, [fields]);

  /** Auto-detect mapping based on CSV headers. */
  const autoDetect = (detectedHeaders: string[]): Record<string, string> => {
    const used = new Set<string>();
    const result: Record<string, string> = {};
    for (const h of detectedHeaders) {
      const guess = aliasIndex.get(normalizeHeader(h));
      if (guess && !used.has(guess)) {
        result[h] = guess;
        used.add(guess);
      } else {
        result[h] = SKIP;
      }
    }
    return result;
  };

  const onFile = async (file: File) => {
    setParseError("");
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setParseError("The file is empty or has no data rows.");
        return;
      }
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoDetect(parsed.headers));
      setPhase("map");
    } catch (err) {
      setParseError((err as Error).message ?? "Could not read the file.");
    }
  };

  const onPickFile = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (file) void onFile(file);
    // Reset so the same file can be picked twice.
    input.value = "";
  };

  // Per-target-field availability — used to grey out already-used target
  // fields in OTHER dropdowns (a field can only receive one CSV column).
  const usedTargets = useMemo(() => {
    const used = new Set<string>();
    for (const v of Object.values(mapping)) if (v && v !== SKIP) used.add(v);
    return used;
  }, [mapping]);

  // Build the field options shown in the mapping dropdown. Each option
  // is greyed (disabled) if it's already used by ANOTHER CSV column.
  const fieldOptions = (forHeader: string) => {
    const currentChoice = mapping[forHeader];
    return [
      { value: SKIP, label: "(skip this column)" },
      ...fields.map((f) => ({
        value: f.key,
        label: `${f.label}${f.required ? " *" : ""}`,
        disabled: f.key !== currentChoice && usedTargets.has(f.key),
      })),
    ];
  };

  // Which required fields haven't been mapped yet — gates the Import button.
  const missingRequired = useMemo(() => {
    const used = new Set(Object.values(mapping).filter((v) => v && v !== SKIP));
    return fields.filter((f) => f.required && !used.has(f.key));
  }, [fields, mapping]);

  // Apply the user's mapping to produce the clean payload rows the API expects.
  const mappedRows = useMemo<Array<Record<string, string>>>(() => {
    return rows.map((row) => {
      const out: Record<string, string> = {};
      for (const [csvHeader, targetKey] of Object.entries(mapping)) {
        if (!targetKey || targetKey === SKIP) continue;
        const value = (row[csvHeader] ?? "").trim();
        if (value) out[targetKey] = value;
      }
      return out;
    });
  }, [rows, mapping]);

  // Pre-flight validation per row — surfaces issues before we hit the API.
  const previewIssues = useMemo(() => {
    return mappedRows.map((row) => {
      const issues: string[] = [];
      for (const f of fields) {
        const v = row[f.key] ?? "";
        if (f.required && !v) issues.push(`${f.label} is required`);
        else if (v && f.validate) {
          const err = f.validate(v);
          if (err) issues.push(err);
        }
      }
      return issues;
    });
  }, [mappedRows, fields]);

  const validRowCount = previewIssues.filter((i) => i.length === 0).length;

  const runImport = () => {
    // Only POST rows that pass pre-flight validation. The backend will
    // double-check (defense in depth) but we don't waste a round trip
    // on rows the UI already knows are broken.
    const goodRows = mappedRows.filter((_, i) => previewIssues[i].length === 0);
    mutation.mutate(
      { rows: goodRows },
      {
        onSuccess: (data) => {
          setResult(data);
          setPhase("result");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-5" />
            Import {entityLabel} from CSV
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {/* ── STEP 1 · UPLOAD ── */}
          {phase === "upload" && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void onFile(file);
                }}
                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition ${
                  dragOver
                    ? "border-primary/50 bg-primary/5"
                    : "border-slate-300 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/30"
                }`}
              >
                <div className="grid size-12 place-items-center rounded-full bg-white shadow-sm dark:bg-slate-900">
                  <Upload className="size-5 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Drop a CSV here, or click to choose a file
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Meta Lead Ads, HubSpot, Zoho, plain spreadsheet exports — we&apos;ll auto-detect the columns.
                  </p>
                </div>
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => onPickFile(e.target)}
                  />
                  <span className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full bg-primary px-4 text-xs font-semibold text-white shadow-panel hover:opacity-90">
                    Choose file
                  </span>
                </label>
                {parseError && (
                  <div className="mt-2 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertTriangle className="size-4" />
                    {parseError}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                <p className="font-semibold text-slate-700 dark:text-slate-200">What we&apos;ll do</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  <li>Read the column headers and auto-match them to {entityLabel.toLowerCase()} fields</li>
                  <li>Let you remap any column or skip the ones you don&apos;t need</li>
                  <li>Preview the first rows and flag invalid data before importing</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── STEP 2 · MAP + PREVIEW ── */}
          {phase === "map" && (
            <div className="space-y-5">
              {/* File header strip */}
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/30">
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <FileText className="size-4 text-slate-500" />
                  <span className="font-mono">{fileName}</span>
                  <Badge tone="info" size="sm">{rows.length} row{rows.length === 1 ? "" : "s"}</Badge>
                </div>
                <button
                  type="button"
                  onClick={() => { setPhase("upload"); setFileName(""); setHeaders([]); setRows([]); }}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                >
                  <X className="size-3.5" /> Choose a different file
                </button>
              </div>

              {/* Mapping table */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Match columns</p>
                    <p className="text-xs text-slate-500">
                      Each CSV column maps to one {entityLabel.toLowerCase().replace(/s$/, "")} field. Required fields marked with *.
                    </p>
                  </div>
                  {missingRequired.length > 0 && (
                    <Badge tone="destructive" size="sm">
                      {missingRequired.length} required field{missingRequired.length === 1 ? "" : "s"} unmapped
                    </Badge>
                  )}
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-800/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">CSV Column</th>
                        <th className="px-3 py-2 text-left font-semibold">Sample value</th>
                        <th className="px-3 py-2 text-left font-semibold">Maps to</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {headers.map((h) => {
                        const sample = rows.find((r) => (r[h] ?? "").trim())?.[h] ?? "";
                        return (
                          <tr key={h}>
                            <td className="px-3 py-2 align-middle text-[13px] font-medium text-slate-700 dark:text-slate-200">
                              {h}
                            </td>
                            <td className="px-3 py-2 align-middle text-[12px] text-slate-500">
                              <span className="line-clamp-1 max-w-[200px]">{sample || <em className="text-slate-400">empty</em>}</span>
                            </td>
                            <td className="px-3 py-2 align-middle">
                              <Select
                                value={mapping[h] ?? SKIP}
                                onValueChange={(v) => setMapping({ ...mapping, [h]: v })}
                                options={fieldOptions(h)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {missingRequired.length > 0 && (
                  <p className="mt-2 text-xs text-rose-600">
                    Required but not mapped: {missingRequired.map((f) => f.label).join(", ")}
                  </p>
                )}
              </div>

              {/* Preview — first 5 mapped rows */}
              {mappedRows.length > 0 && missingRequired.length === 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Preview · first {Math.min(5, mappedRows.length)} of {mappedRows.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge tone="positive" size="sm">{validRowCount} valid</Badge>
                      {previewIssues.some((i) => i.length > 0) && (
                        <Badge tone="destructive" size="sm">
                          {previewIssues.filter((i) => i.length > 0).length} with issues
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-800/50">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold">#</th>
                          {fields
                            .filter((f) => Object.values(mapping).includes(f.key))
                            .map((f) => (
                              <th key={f.key} className="px-2 py-1.5 text-left font-semibold">{f.label}</th>
                            ))}
                          <th className="px-2 py-1.5 text-left font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {mappedRows.slice(0, 5).map((row, i) => {
                          const issues = previewIssues[i];
                          return (
                            <tr key={i} className={issues.length > 0 ? "bg-rose-50/30" : ""}>
                              <td className="px-2 py-1.5 align-top font-mono text-slate-400">{i + 1}</td>
                              {fields
                                .filter((f) => Object.values(mapping).includes(f.key))
                                .map((f) => (
                                  <td key={f.key} className="px-2 py-1.5 align-top">
                                    <span className="line-clamp-1 max-w-[180px] text-slate-700 dark:text-slate-200">
                                      {row[f.key] || <em className="text-slate-400">—</em>}
                                    </span>
                                  </td>
                                ))}
                              <td className="px-2 py-1.5 align-top">
                                {issues.length === 0 ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700">
                                    <CheckCircle2 className="size-3.5" /> OK
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-rose-700" title={issues.join("; ")}>
                                    <AlertTriangle className="size-3.5" /> {issues.length} issue{issues.length === 1 ? "" : "s"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3 · RESULT ── */}
          {phase === "result" && result && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
                <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900">
                    Imported {result.createdCount} {entityLabel.toLowerCase()}
                  </p>
                  {result.skippedCount > 0 ? (
                    <p className="text-xs text-emerald-800/80">
                      {result.skippedCount} row{result.skippedCount === 1 ? "" : "s"} skipped — review below.
                    </p>
                  ) : (
                    <p className="text-xs text-emerald-800/80">No rows skipped.</p>
                  )}
                </div>
              </div>
              {result.skipped.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-800/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold w-16">Row</th>
                        <th className="px-3 py-2 text-left font-semibold">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {result.skipped.map((s) => (
                        <tr key={s.row}>
                          <td className="px-3 py-2 align-top font-mono text-slate-500">{s.row}</td>
                          <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-200">{s.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {phase === "upload" && (
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {phase === "map" && (
            <>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={mutation.isPending || missingRequired.length > 0 || validRowCount === 0}
                onClick={runImport}
              >
                {mutation.isPending ? (
                  <><Loader2 className="mr-2 size-4 animate-spin" /> Importing…</>
                ) : (
                  <>Import {validRowCount} row{validRowCount === 1 ? "" : "s"}</>
                )}
              </Button>
            </>
          )}
          {phase === "result" && (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
