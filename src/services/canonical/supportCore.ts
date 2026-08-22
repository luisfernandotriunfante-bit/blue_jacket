import type * as XLSX from 'xlsx';
import type { Row, RcaMap, CompassTarget, PremiseClient, RouteStore, ProductMaster, ReferenceClientNetwork } from './runtime';
import { canonicalCoordinatorName, cleanCnpj, cleanCode, cleanDigits, classifyLine, displayNetwork, networkKey, normalizeCnpj, normalizeText, parseNumber, sheetRows } from './utils';

/**
 * Não basta um campo ter 8-14 dígitos para ele ser EAN/GTIN. O Cadastro 286
 * também contém códigos SAP/fornecedor de 8 dígitos e eles estavam sendo
 * confundidos com código de barras, quebrando a conciliação com o 8013.
 */
function validEan(value: unknown): string {
  const digits = cleanDigits(value);
  if (![8, 12, 13, 14].includes(digits.length)) return '';
  const body = digits.slice(0, -1);
  const expected = Number(digits.at(-1));
  let sum = 0;
  for (let i = body.length - 1, pos = 0; i >= 0; i--, pos++) sum += Number(body[i]) * (pos % 2 === 0 ? 3 : 1);
  const check = (10 - (sum % 10)) % 10;
  return check === expected ? digits : '';
}

function cadastroEan(row: Row): string {
  const preferred = [20, 21, 22, 19, 24];
  const candidates = preferred.map(index => validEan(row[index])).filter(Boolean);
  return candidates.find(value => value.length === 13) || candidates[0] || '';
}

export function parseRcaMap(rows: Row[]): RcaMap[] {
  const result = new Map<string, RcaMap>();
  const add = (newCode: unknown, name: unknown, coordCode: unknown, coordName: unknown, oldCode: unknown) => {
    const n = cleanCode(newCode);
    if (!n || normalizeText(n) === 'COD') return;
    result.set(n, { newCode: n, oldCode: cleanCode(oldCode), name: String(name ?? '').trim(), coordinatorCode: cleanCode(coordCode), coordinatorName: canonicalCoordinatorName(coordName) });
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
    result.push({ oldCode, name: String(row[4] ?? '').trim(), supervisorName: canonicalCoordinatorName(row[0]), salesTarget: parseNumber(row[16]), positivityTarget: parseNumber(row[21]) });
  }
  return result;
}

export function parsePremises(rows: Row[]): PremiseClient[] {
  const result: PremiseClient[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (normalizeText(row[10]) && normalizeText(row[10]) !== 'MILENIO') continue;
    const normalizedCnpj = normalizeCnpj(row[2],{declaredCnpj:normalizeText(row[13])==='CNPJ'});
    const cnpj = normalizedCnpj.canonical;
    if (!cnpj || normalizedCnpj.status === 'INVALID_LENGTH') continue;
    const profile = String(row[12] ?? '').trim();
    const rawNetwork = String(row[15] ?? '').trim();
    result.push({ cnpj, cnpjRaw:normalizedCnpj.raw, cnpjNormalizationStatus:normalizedCnpj.status, name: String(row[3] ?? '').trim(), city: String(row[6] ?? '').trim(), network: rawNetwork ? displayNetwork(rawNetwork) : '', profile, isTop: normalizeText(profile).includes('TOP VAREJISTA') });
  }
  return result;
}

export function parseActiveRoute(workbook: XLSX.WorkBook): RouteStore[] {
  const rows = sheetRows(workbook, 'Roteiro Ativo');
  const result: RouteStore[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (normalizeText(row[1]) !== 'MILENIO') continue;
    const normalizedCnpj = normalizeCnpj(row[2]);
    const cnpj = normalizedCnpj.canonical;
    if (!/^\d{14}$/.test(cnpj)) continue;
    const normalizedManager=normalizeCnpj(row[8]);
    const routeClass = String(row[10] ?? '').trim();
    // No Roteiro Top Varejistas atual a coluna 10 é CATEGORIA (OURO/PRATA),
    // não FAIXA. Só reutilizamos como faixa em layouts que declarem de fato
    // um valor de faixa/canal reconhecível.
    const tier = /FAIXA\s*\d|C\s*&\s*C|^CC$/i.test(routeClass) ? routeClass : '';
    result.push({ cnpj, cnpjRaw:normalizedCnpj.raw, cnpjNormalizationStatus:normalizedCnpj.status, name: String(row[3] ?? '').trim(), fantasyName: String(row[15] ?? '').trim(), city: String(row[16] ?? '').trim(), networkRaw: String(row[5] ?? '').trim(), managerCnpj: normalizedManager.canonical, managerCnpjRaw:normalizedManager.raw, managerCnpjNormalizationStatus:normalizedManager.status, groupingCode: String(row[9] ?? '').trim(), tier, storeType: String(row[11] ?? '').trim(), target: parseNumber(row[18]) });
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

export function parseLegacyNetworkOwners(workbook: XLSX.WorkBook): Map<string, { teamCode:string; vendorCode:string }> {
  const rows = sheetRows(workbook, 'Top Redes');
  const result = new Map<string, { teamCode:string; vendorCode:string }>();
  const header = rows.findIndex(row => normalizeText(row[0]) === 'REDE' && normalizeText(row[1]).includes('EQUIPE'));
  if (header < 0) return result;
  for (let i = header + 1; i < rows.length; i++) {
    const name = displayNetwork(String(rows[i][0] ?? ''));
    if (!name || normalizeText(name) === 'TOTAL') continue;
    const teamCode = cleanCode(rows[i][1]);
    const vendorCode = cleanCode(rows[i][2]);
    if (teamCode || vendorCode) result.set(networkKey(name), { teamCode, vendorCode });
  }
  return result;
}

export function parseLegacyClientNetworkRecords(workbook: XLSX.WorkBook): ReferenceClientNetwork[] {
  const rows = sheetRows(workbook, 'redes');
  const result:ReferenceClientNetwork[] = [];
  const headerIndex = rows.findIndex(row => row.some(cell => normalizeText(cell) === 'CNPJ') && row.some(cell => normalizeText(cell) === 'REDE'));
  if (headerIndex < 0) return result;
  const header = rows[headerIndex].map(normalizeText);
  const cnpjColumn = header.findIndex(value => value === 'CNPJ');
  const networkColumn = header.findIndex(value => value === 'REDE');
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const normalizedCnpj=normalizeCnpj(rows[i][cnpjColumn]);
    const cnpj = normalizedCnpj.canonical;
    const rawNetwork = String(rows[i][networkColumn] ?? '').trim();
    if (/^\d{14}$/.test(cnpj) && rawNetwork) result.push({cnpj,cnpjRaw:normalizedCnpj.raw,cnpjNormalizationStatus:normalizedCnpj.status,network:displayNetwork(rawNetwork)});
  }
  return result;
}

export function parseLegacyClientNetworks(workbook: XLSX.WorkBook): Map<string, string> {
  return new Map(parseLegacyClientNetworkRecords(workbook).map(row=>[row.cnpj,row.network]));
}

export function parseLegacyClientOwners(workbook: XLSX.WorkBook): Map<string, { teamCode:string; vendorCode:string }> {
  const teamRows = sheetRows(workbook, 'Equipe');
  const teamByVendor = new Map<string, string>();
  const teamHeader = teamRows.findIndex(row => row.some(cell => normalizeText(cell) === 'COD') && row.some(cell => normalizeText(cell) === 'COORD'));
  if (teamHeader >= 0) {
    const header = teamRows[teamHeader].map(normalizeText);
    const vendorColumn = header.findIndex(value => value === 'COD');
    const teamColumn = header.findIndex(value => value === 'COORD');
    for (let i = teamHeader + 1; i < teamRows.length; i++) {
      const vendor = cleanCode(teamRows[i][vendorColumn]);
      const team = cleanCode(teamRows[i][teamColumn]);
      if (vendor) teamByVendor.set(vendor, team);
    }
  }
  const rows = sheetRows(workbook, '319');
  const result = new Map<string, { teamCode:string; vendorCode:string }>();
  const headerIndex = rows.findIndex(row => row.some(cell => normalizeText(cell) === 'CNPJ') && row.some(cell => normalizeText(cell) === 'REP'));
  if (headerIndex < 0) return result;
  const header = rows[headerIndex].map(normalizeText);
  const cnpjColumn = header.findIndex(value => value === 'CNPJ');
  const vendorColumn = header.findIndex(value => value === 'REP');
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cnpj = cleanCnpj(rows[i][cnpjColumn]);
    const vendorCode = cleanCode(rows[i][vendorColumn]);
    if (/^\d{14}$/.test(cnpj) && vendorCode) result.set(cnpj, { vendorCode, teamCode: teamByVendor.get(vendorCode) || '' });
  }
  return result;
}

export function parsePriceList(rows: Row[]): { bySku: Map<string, ProductMaster>; byEan: Map<string, ProductMaster> } {
  const bySku = new Map<string, ProductMaster>();
  const byEan = new Map<string, ProductMaster>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sku = cleanCode(row[8]);
    const ean = validEan(row[10]);
    if (!sku && !ean) continue;
    const description = String(row[9] ?? '').trim();
    const category = String(row[39] ?? '').trim();
    const subcategory = String(row[40] ?? '').trim();
    const item: ProductMaster = { sku, ean, description, category, subcategory, brand: String(row[41] ?? '').trim(), isLaunch: false, boxPrice: parseNumber(row[65]) || parseNumber(row[56]), unitPrice: parseNumber(row[66]) || parseNumber(row[57]), unitsPerCase: Math.max(parseNumber(row[17]), 0), line: classifyLine(description, category, subcategory) };
    if (sku) bySku.set(sku, item);
    if (ean) byEan.set(ean, item);
  }
  return { bySku, byEan };
}

export function parseCadastro286(rows: Row[]) {
  const byInternal = new Map<string, { description: string; ean: string; factoryCode: string; unitsPerCase?: number }>();
  const factoryToInternal = new Map<string, string>();
  for (const row of rows) {
    if (String(row[0] ?? '').trim() !== '11') continue;
    const code = cleanCode(row[1]);
    if (!code || !/^\d+$/.test(code)) continue;
    const factoryCode = cleanCode(row[23]);
    const ean = cadastroEan(row);
    const unitsPerCase = Math.max(parseNumber(row[24]), 0);
    byInternal.set(code, { description: String(row[2] ?? '').trim(), ean, factoryCode, ...(unitsPerCase > 0 ? { unitsPerCase } : {}) });
    if (factoryCode) factoryToInternal.set(factoryCode, code);
  }
  return { byInternal, factoryToInternal };
}