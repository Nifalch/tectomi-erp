/**
 * Tiny CSV writer for client-side exports (attendance, leave, etc.).
 *
 * Handles the three things that bite naive concatenation:
 *   - Cells containing commas / newlines → wrapped in double quotes
 *   - Cells containing double quotes → quotes escaped as ""
 *   - Excel BOM prefix so non-ASCII (₹, é, etc.) renders correctly when
 *     the user double-clicks the downloaded .csv on macOS or Windows.
 */
function escapeCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface CsvColumn<T> {
  label: string;
  // Either pluck a property by key, OR derive a value via `map`. `map`
  // takes precedence when both are provided so callers can format
  // dates / enums / nested objects without a separate transform pass.
  key?: keyof T;
  map?: (row: T) => unknown;
}

export function rowsToCsv<T>(rows: T[], columns: Array<CsvColumn<T>>): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          if (c.map) return escapeCell(c.map(row));
          if (c.key != null) return escapeCell((row as Record<string, unknown>)[c.key as string]);
          return "";
        })
        .join(","),
    )
    .join("\n");
  // ﻿ = UTF-8 BOM — makes Excel use UTF-8 instead of the legacy code page.
  return `﻿${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke the object URL on the next tick so the browser has time to
  // trigger the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * RFC-4180-aware CSV parser. Handles:
 *   - Quoted cells containing commas, newlines, and escaped double quotes ("")
 *   - Both \n and \r\n row separators
 *   - A UTF-8 BOM at the start of the file (Excel exports include one)
 *   - Trailing empty lines
 *
 * Returns the parsed header array and a list of row objects keyed by header.
 * Cells where the row has fewer columns than the header are filled with "".
 *
 * This is the SOLE CSV parser the app should use for imports — the naive
 * `text.split(',')` approach in the older clients import broke on any CSV
 * containing a comma inside a quoted cell (very common in Meta Lead Ads
 * exports where the "Full Name" field can be "Naushal, Mr." etc.).
 */
export function parseCsv(text: string): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        // Lookahead: "" inside a quoted cell is an escaped double quote.
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\r") {
        // Skip — \r\n handled when we see the \n
      } else if (ch === "\n") {
        row.push(cell);
        records.push(row);
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }
  }
  // Flush the last cell + row if the file doesn't end with a newline.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    records.push(row);
  }

  // Drop fully-empty trailing rows (a common Excel artefact).
  while (records.length > 0 && records[records.length - 1].every((v) => v === "")) {
    records.pop();
  }
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((cells) => {
    const out: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      out[headers[i]] = (cells[i] ?? "").trim();
    }
    return out;
  });
  return { headers, rows };
}
