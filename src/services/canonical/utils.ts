import * as XLSX from 'xlsx';
import type { LineName, SourceKind } from '../../domain/canonical';
import type { Row } from './runtime';

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function cleanDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

export function cleanCode(value: unknown): string {
  return String(value ?? '').trim().replace(/^0+/, '');
}

export function parseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === '') return 0;
  let s = String(value).replace(/R\$/gi, '').replace(/\s/g, '').trim();
  if (!s) return 0;
  let negative = false;
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith('(') && s.endsWith(')')) { negative = true; s = s.slice(1, -1); }
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const parsed = Number(s.replace(/[^0-9+\-.]/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

export function toIsoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const decoded = XLSX.SSF.parse_date_code(value);
    if (decoded) return `${decoded.y}-${String(decoded.m).padStart(2, '0')}-${String(decoded.d).padStart(2, '0')}`;
  }
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function networkKey(name: string): string {
  return normalizeText(name).replace(/^REDEMS\b/, 'REDE').replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim();
}

export function displayNetwork(name: string): string {
  return String(name ?? '').replace(/\s+/g, ' ').trim() || 'SEM REDE';
}

export function detectSource(fileName: string): SourceKind {
  const n = normalizeText(fileName);
  if (n.includes('8022') || n.includes('VENDAS')) return 'sales8022';
  if (n.includes('POSICAO') || n.includes('105')) return 'stock105';
  if (n.includes('8013')) return 'stock8013';
  if (n.includes('CADASTRO') || n.includes('286')) return 'items286';
  if (n.includes('CARTEIRA')) return 'purchasePortfolio';
  if (n.includes('NOVOS RCA') || n.includes('RCAS')) return 'rcaMap';
  if (n.includes('LISTA') && n.includes('PRECO')) return 'priceList';
  if (n.includes('PREMISSAS')) return 'premises';
  if (n.includes('BUSSOLA')) return 'compassTargets';
  if (n.includes('ROTEIRO ATIVO')) return 'activeRoute';
  if (n.includes('TOP REDES')) return 'legacyTopNetworks';
  return 'unknown';
}

export async function readWorkbook(file: File, kind: SourceKind): Promise<XLSX.WorkBook> {
  const data = await file.arrayBuffer();
  const preferredSheets: Partial<Record<SourceKind, string[]>> = {
    compassTargets: ['Metas'], activeRoute: ['Roteiro Ativo'], legacyTopNetworks: ['Top Redes'],
  };
  const sheets = preferredSheets[kind];
  return XLSX.read(data, { type: 'array', cellDates: false, ...(sheets ? { sheets } : {}) });
}

export function sheetRows(workbook: XLSX.WorkBook, sheetName?: string): Row[] {
  const name = sheetName && workbook.Sheets[sheetName]
    ? sheetName
    : workbook.SheetNames.find(candidate => Boolean(workbook.Sheets[candidate])) || Object.keys(workbook.Sheets)[0];
  if (!name) return [];
  return XLSX.utils.sheet_to_json<Row>(workbook.Sheets[name], { header: 1, defval: '' });
}

export function classifyLine(description: string, category = '', subcategory = ''): LineName | '' {
  const sub = normalizeText(subcategory); const cat = normalizeText(category); const d = normalizeText(description);
  if (sub.includes('TOOTHPASTE')) return 'Creme Dental';
  if (sub.includes('MANUAL TB') || sub.includes('TOOTHBRUSH') || sub.includes('MOUTHWASH') || sub.includes('INTERDENTAL') || sub.includes('FLOSS')) return 'Esc + Enx + Fio';
  if (sub.includes('BAR SOAP') || sub.includes('LIQUID SOAP') || sub.includes('HAND SOAP') || sub.includes('BODY WASH')) return 'Sabonetes';
  if (sub.includes('SHAMPOO') || sub.includes('CONDITIONER') || sub.includes('HAIR')) return 'Hair';
  if (sub.includes('CLEAN') || sub.includes('LAUNDRY') || sub.includes('FABRIC')) return 'Limpeza';
  if (/^CD\b/.test(d) || d.includes('CREME DENTAL') || d.includes('DENTIFRICIO')) return 'Creme Dental';
  if (/^(ED|ENX|ENXAG|FITA DENT|FIO|GD)\b/.test(d) || d.includes('ESCOVA DENTAL') || d.includes('ENXAGUANTE') || d.includes('FIO DENTAL')) return 'Esc + Enx + Fio';
  if (/^SAB\b/.test(d) || d.includes('SABONETE')) return 'Sabonetes';
  if (/^(SH|COND|CR PENT|KIT SH)\b/.test(d) || d.includes('SHAMPOO') || d.includes('CONDICIONADOR')) return 'Hair';
  if (/^(PINHO SOL|LIMP|LAVA ROUPA|AJAX|DESINF|DESENG)\b/.test(d) || d.includes('LIMPADOR') || d.includes('DESINFETANTE')) return 'Limpeza';
  if (cat.includes('HOME CARE')) return 'Limpeza';
  return '';
}
