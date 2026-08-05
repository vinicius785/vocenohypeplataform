/** Parser de CSV/TSV simples mas robusto: aspas, vírgula/ponto-e-vírgula/tab
 * como delimitador (auto-detectado pela primeira linha — colar uma seleção
 * de linhas de uma tabela do ClickUp normalmente cola como TSV), e quebras
 * de linha dentro de campos entre aspas. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = clean.slice(0, clean.indexOf("\n") === -1 ? undefined : clean.indexOf("\n"));
  const counts = {
    "\t": (firstLine.match(/\t/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    ",": (firstLine.match(/,/g) ?? []).length,
  };
  const delimiter = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ",") as
    | "\t"
    | ";"
    | ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const DATE_RE = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;

/** Converte "10/08", "10/08/2026", "10-8-26" etc pra ISO yyyy-mm-dd. Sem
 * ano, assume o ano corrente (ou o próximo, se a data já passou bastante —
 * fatura vencida de dezembro colada em janeiro não devia virar dezembro do
 * ano que vem por engano, mas isso é raro o bastante pra não valer a
 * complexidade extra; assume ano corrente sempre). */
export function parseFlexibleDate(input: string): string {
  const m = input.match(DATE_RE);
  if (!m) return "";
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : new Date().getFullYear();
  if (year < 100) year += 2000;
  if (!day || !month || month > 12 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
