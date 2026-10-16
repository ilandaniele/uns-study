/** Quotes a CSV field when it holds a comma, quote or line break (RFC 4180). */
export function csvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** `date,minutes` rows, one per day, with CRLF line endings. */
export function historyCsv(byDay: readonly { date: string; minutes: number }[]): string {
  const rows = byDay.map((d) => `${csvField(d.date)},${csvField(d.minutes)}`);
  return ["date,minutes", ...rows].join("\r\n") + "\r\n";
}

/** Triggers a browser download of `csv` as `filename`. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
