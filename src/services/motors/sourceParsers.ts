import type * as XLSX from 'xlsx';
import type { Row } from '../canonical/runtime';
import { canonicalCoordinatorName, cleanCode, normalizeText, parseNumber, sheetRows } from '../canonical/utils';

export interface ParsedRcaMap {
  newCode: string;
  oldCode: string;
  name: string;
  coordinatorCode: string;
  coordinatorName: string;
}

export interface ParsedCompassTarget {
  oldCode: string;
  name: string;
  supervisorName: string;
  salesTarget: number;
  positivityTarget: number;
}

/**
 * População oficial Colgate: código atual, código legado, RCA e coordenação.
 * Mantém os dois blocos observados no arquivo NOVOS RCAS sem criar vínculo por nome.
 */
export function parseRcaMap(rows: Row[]): ParsedRcaMap[] {
  const result = new Map<string, ParsedRcaMap>();
  const add = (newCode: unknown, name: unknown, coordCode: unknown, coordName: unknown, oldCode: unknown) => {
    const current = cleanCode(newCode);
    if (!current || normalizeText(current) === 'COD') return;
    result.set(current, {
      newCode: current,
      oldCode: cleanCode(oldCode),
      name: String(name ?? '').trim(),
      coordinatorCode: cleanCode(coordCode),
      coordinatorName: canonicalCoordinatorName(coordName),
    });
  };
  rows.forEach(row => {
    add(row[0], row[2], row[3], row[4], row[5]);
    add(row[9], row[10], row[11], row[12], row[13]);
  });
  return Array.from(result.values());
}

/**
 * Bússola: somente linhas MCD/Colgate da aba Metas.
 * Meta PNA e Meta. Pos. Ind. são os únicos alvos canônicos importados.
 */
export function parseCompassTargets(workbook: XLSX.WorkBook): ParsedCompassTarget[] {
  const rows = sheetRows(workbook, 'Metas');
  if (!rows.length) return [];
  let headerIndex = rows.findIndex(row => row.some(cell => normalizeText(cell) === 'META PNA'));
  if (headerIndex < 0) headerIndex = 2;
  const result: ParsedCompassTarget[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (normalizeText(row[3]) !== 'MCD' || !normalizeText(row[7]).includes('COLGATE')) continue;
    const oldCode = cleanCode(row[1]);
    if (!oldCode) continue;
    result.push({
      oldCode,
      name: String(row[4] ?? '').trim(),
      supervisorName: canonicalCoordinatorName(row[0]),
      salesTarget: parseNumber(row[16]),
      positivityTarget: parseNumber(row[21]),
    });
  }
  return result;
}
