import type * as XLSX from 'xlsx';
import type { Row, RcaMap, CompassTarget, PremiseClient, RouteStore, ProductMaster } from './runtime';
import { cleanCode, cleanDigits, classifyLine, displayNetwork, networkKey, normalizeText, parseNumber, sheetRows } from './utils';

export function parseRcaMap(rows: Row[]): RcaMap[] {
  const result = new Map<string, RcaMap>();
  const add = (newCode: unknown, name: unknown, coordCode: unknown, coordName: unknown, oldCode: unknown) => {
    const n = cleanCode(newCode);
    if (!n || normalizeText(n) === 'COD') return;
    result.set(n, { newCode: n, oldCode: cleanCode(oldCode), name: String(name ?? '').trim(), coordinatorCode: cleanCode(coordCode), coordinatorName: String(coordName ?? '').trim() });
  };
  rows.forEach(row => { add(row[0], row[2], row[3], row[4], row[5]); add(row[9], row[10], row[11], row[12], row[13]); });
  return Array.from(result.values());
}

export function parseCompassTargets(workbook: XLSX.WorkBook): CompassTarget[] {
  const rows = sheetRows(workbook, 'Metas');
  if (!rows.length) return [];
  let headerIndex = rows.findIndex(row => row.some(cell => normalizeText(cell) === 'META PNA'));
  if (headerIndex < 0) headerIndex = 2;
  const result: CompassTarget[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (normalizeText(row[3]) !== 'MCD' || !normalizeText(row[7]).includes('COLGATE')) continue;
    const oldCode = cleanCode(row[1]);
    if (!oldCode) continue;
    result.push({ oldCode, name: String(row[4] ?? '').trim(), supervisorName: String(row[0] ?? '').trim(), salesTarget: parseNumber(row[16]), positivityTarget: parseNumber(row[21]) });
  }
  return result;
}

export function parsePremises(rows: Row[]): PremiseClient[] {
  const result: PremiseClient[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (normalizeText(row[10]) && normalizeText(row[10]) !== 'MILENIO') continue;
    const cnpj = cleanDigits(row[2]);
    if (!cnpj) continue;
    const profile = String(row[12] ?? '').trim();
    result.push({ cnpj, name: String(row[3] ?? '').trim(), city: String(row[6] ?? '').trim(), network: displayNetwork(String(row[15] ?? '')), profile, isTop: normalizeText(profile).includes('TOP VAREJISTA') });
  }
  return result;
}

export function parseActiveRoute(workbook: XLSX.WorkBook): RouteStore[] {
  const rows = sheetRows(workbook, 'Roteiro Ativo');
  const result: RouteStore[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (normalizeText(row[1]) !== 'MILENIO') continue;
    const cnpj = cleanDigits(row[2]);
    if (!cnpj) continue;
    result.push({ cnpj, name: String(row[3] ?? '').trim(), fantasyName: String(row[15] ?? '').trim(), city: String(row[16] ?? '').trim(), networkRaw: String(row[5] ?? '').trim(), managerCnpj: cleanDigits(row[8]), groupingCode: String(row[9] ?? '').trim(), tier: String(row[10] ?? '').trim(), storeType: String(row[11] ?? '').trim(), target: parseNumber(row[18]) });
  }
  return result;
}

export function parseLegacyNetworkTargets(workbook: XLSX.WorkBook): Map<string, number> {
  const rows = sheetRows(workbook, 'Top Redes');
  const result = new Map<string, number>();
  const header = rows.findIndex(row => normalizeText(row[0]) === 'REDE' && normalizeText(row[3]).includes('META REDES'));
  if (header < 0) return result;
  for (let i = header + 1; i < rows.length; i++) {
    const name = displayNetwork(String(rows[i][0] ?? ''));
    if (!name || normalizeText(name) === 'TOTAL') continue;
    const target = parseNumber(rows[i][3]);
    if (target > 0) result.set(networkKey(name), target);
  }
  return result;
}

export function parsePriceList(rows: Row[]): { bySku: Map<string, ProductMaster>; byEan: Map<string, ProductMaster> } {
  const bySku = new Map<string, ProductMaster>(); const byEan = new Map<string, ProductMaster>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]; const sku = cleanCode(row[8]); const ean = cleanDigits(row[10]);
    if (!sku && !ean) continue;
    const description = String(row[9] ?? '').trim(); const category = String(row[39] ?? '').trim(); const subcategory = String(row[40] ?? '').trim();
    const item: ProductMaster = { sku, ean, description, category, subcategory, brand: String(row[41] ?? '').trim(), isLaunch: normalizeText(row[71]).includes('LANC'), boxPrice: parseNumber(row[65]) || parseNumber(row[56]), unitPrice: parseNumber(row[66]) || parseNumber(row[57]), line: classifyLine(description, category, subcategory) };
    if (sku) bySku.set(sku, item); if (ean) byEan.set(ean, item);
  }
  return { bySku, byEan };
}

export function parseCadastro286(rows: Row[]) {
  const byInternal = new Map<string, { description: string; ean: string; factoryCode: string }>();
  const factoryToInternal = new Map<string, string>();
  for (const row of rows) {
    if (String(row[0] ?? '').trim() !== '11') continue;
    const code = cleanCode(row[1]); if (!code || !/^\d+$/.test(code)) continue;
    const factoryCode = cleanCode(row[23]); const ean = cleanDigits(row[20] || row[21]);
    byInternal.set(code, { description: String(row[2] ?? '').trim(), ean, factoryCode });
    if (factoryCode) factoryToInternal.set(factoryCode, code);
  }
  return { byInternal, factoryToInternal };
}
