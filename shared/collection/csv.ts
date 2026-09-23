// Collection → CSV for spreadsheets / selling lists / other tools.

export interface CsvRow {
  name: string;
  quantity: number;
  condition?: string | null;
  printingCode?: string | null;
  rarity?: string | null;
  // Only a marking that was actually read ("1st Edition", "Limited Edition").
  // Blank is not "Unlimited": an unmarked card and a scan that missed the
  // mark look the same, so the export doesn't pretend to know.
  edition?: string | null;
  // The rarity is the app's best guess among several the set code allows,
  // not confirmed — worth knowing before listing a card for sale.
  rarityGuessed?: boolean;
  priceUsd?: number | null;
  tags?: string[] | null;
}

// RFC-4180-ish quoting: wrap in quotes when the value contains a comma,
// quote, or line break (CR or LF — Excel-pasted text often carries CRs);
// double any embedded quotes.
function cell(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function collectionToCsv(rows: CsvRow[]): string {
  const header =
    "Name,Quantity,Condition,Set Code,Rarity,Rarity Guessed,Edition,Unit Price USD,Total USD,Binders";
  const lines = rows.map((r) => {
    const unit = r.priceUsd ?? null;
    return [
      cell(r.name),
      cell(r.quantity),
      cell(r.condition ?? ""),
      cell(r.printingCode ?? ""),
      cell(r.rarity ?? ""),
      cell(r.rarityGuessed ? "yes" : ""),
      cell(r.edition ?? ""),
      cell(unit != null ? unit.toFixed(2) : ""),
      cell(unit != null ? (unit * r.quantity).toFixed(2) : ""),
      cell((r.tags ?? []).join("; ")),
    ].join(",");
  });
  return [header, ...lines].join("\n");
}
