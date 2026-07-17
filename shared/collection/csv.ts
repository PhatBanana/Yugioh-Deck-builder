// Collection → CSV for spreadsheets / selling lists / other tools.

export interface CsvRow {
  name: string;
  quantity: number;
  condition?: string | null;
  printingCode?: string | null;
  rarity?: string | null;
  priceUsd?: number | null;
  tags?: string[] | null;
}

// RFC-4180-ish quoting: wrap in quotes when the value contains a comma,
// quote, or newline; double any embedded quotes.
function cell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function collectionToCsv(rows: CsvRow[]): string {
  const header = "Name,Quantity,Condition,Set Code,Rarity,Unit Price USD,Total USD,Binders";
  const lines = rows.map((r) => {
    const unit = r.priceUsd ?? null;
    return [
      cell(r.name),
      cell(r.quantity),
      cell(r.condition ?? ""),
      cell(r.printingCode ?? ""),
      cell(r.rarity ?? ""),
      cell(unit != null ? unit.toFixed(2) : ""),
      cell(unit != null ? (unit * r.quantity).toFixed(2) : ""),
      cell((r.tags ?? []).join("; ")),
    ].join(",");
  });
  return [header, ...lines].join("\n");
}
