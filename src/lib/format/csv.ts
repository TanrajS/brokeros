export type CsvCell = string | number | null | undefined | boolean;

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  // Guard against spreadsheet formula injection as well as delimiters.
  const needsQuote = /[",\r\n]/.test(s) || /^[=+\-@]/.test(s);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180 CSV with CRLF line endings and a header row. */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header.map(escapeCell).join(","), ...rows.map((r) => r.map(escapeCell).join(","))];
  return lines.join("\r\n") + "\r\n";
}
