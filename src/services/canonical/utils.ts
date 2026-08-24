import * as XLSX from 'xlsx';
import type { CnpjNormalizationStatus, LineName, SourceKind } from '../../domain/canonical';
import type { Row } from './runtime';

export function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

export function cleanDigits(value: unknown): string { return String(value ?? '').replace(/\D/g, '').replace(/^0+/, ''); }
export function cleanCode(value: unknown): string {
  let raw = String(value ?? '').trim();
  // Relatórios exportados pelo Excel podem serializar códigos inteiros como
  // texto decimal (ex.: "123.0"). Código Winthor/RCA/SKU não é decimal;
  // remover somente a parte decimal zerada evita perder correspondências.
  if (/^\d+\.0+$/.test(raw)) raw = raw.replace(/\.0+$/, '');
  return raw.replace(/^0+/, '');
}
export interface CnpjNormalization {
  raw:string;
  digits:string;
  canonical:string;
  status:CnpjNormalizationStatus;
  note:string;
}

export function normalizeCnpj(value: unknown,options:{declaredCnpj?:boolean}={}): CnpjNormalization {
  const raw=String(value??'').trim();
  let digits=raw.replace(/\D/g,'');
  if(!digits)return{raw,digits:'',canonical:'',status:'EMPTY',note:'CNPJ ausente.'};
  if(digits.length===14)return{raw,digits,canonical:digits,status:'EXACT_14',note:'CNPJ já possui 14 dígitos.'};
  if(digits.length===12||digits.length===13){const canonical=digits.padStart(14,'0');return{raw,digits,canonical,status:'PADDED_EXCEL',note:`Excel removeu ${14-digits.length} zero(s) inicial(is); valor recomposto e mantido na auditoria.`}}
  if(digits.length===11&&options.declaredCnpj){const canonical=digits.padStart(14,'0');return{raw,digits,canonical,status:'PADDED_EXCEL',note:'Excel removeu 3 zeros iniciais; valor recomposto porque a própria fonte declara o identificador como CNPJ.'}}
  if(digits.length>14&&/^0+/.test(digits)){
    const original=digits;
    while(digits.length>14&&digits.startsWith('0'))digits=digits.slice(1);
    if(digits.length===14)return{raw,digits:original,canonical:digits,status:'TRIMMED_LEADING_ZERO',note:'Zeros excedentes à esquerda foram removidos; ocorrência mantida na auditoria.'};
  }
  if(digits.length===11)return{raw,digits,canonical:digits,status:'CPF_OR_AMBIGUOUS',note:'Valor possui 11 dígitos e não foi transformado artificialmente em CNPJ.'};
  return{raw,digits,canonical:digits,status:'INVALID_LENGTH',note:`Identificador possui ${digits.length} dígito(s); não foi completado silenciosamente.`};
}

export function cleanCnpj(value: unknown): string { return normalizeCnpj(value).canonical; }

export function canonicalCoordinatorName(value: unknown): string {
  const original = String(value ?? '').trim();
  const normalized = normalizeText(original);
  if (normalized.includes('CLAUDIO')) return 'FLAVIO';
  if (normalized === 'THIAGO' || normalized.includes('THIAGO DA SILVA CONEGUNDES')) return 'THIAGO';
  return original;
}

export function parseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === '') return 0;
  let s = String(value).replace(/R\$/gi, '').replace(/\s/g, '').trim(); if (!s) return 0;
  let negative = false;
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith('(') && s.endsWith(')')) { negative = true; s = s.slice(1, -1); }
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (s.includes(',')) s = s.replace(',', '.');
  const parsed = Number(s.replace(/[^0-9+\-.]/g, '')); if (!Number.isFinite(parsed)) return 0; return negative ? -parsed : parsed;
}

export function toIsoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Serial do Excel no sistema de datas 1900. Fazer a conversão diretamente
    // evita depender de XLSX.SSF, que não existe em alguns modos ESM/SSR do Vite.
    // 1899-12-30 também absorve corretamente o dia fictício 29/02/1900.
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const raw = String(value ?? '').trim(); if (!raw) return '';
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (br) { const year = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]); return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`; }
  const date = new Date(raw); return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function networkKey(name: string): string { return normalizeText(name).replace(/^REDEMS\b/, 'REDE').replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim(); }
export function displayNetwork(name: string): string { return String(name ?? '').replace(/\s+/g, ' ').trim() || 'SEM REDE'; }

export function detectSource(fileName: string): SourceKind {
  const n = normalizeText(fileName);
  if (n.includes('379') && /(^|\D)25(\D|$)/.test(n)) return 'history379_2025';
  if (n.includes('379') && /(^|\D)26(\D|$)/.test(n)) return 'history379_2026';
  if (n.includes('LANCAMENTO')) return 'launchList';
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
  return 'unknown';
}

function firstSheetName(workbook: XLSX.WorkBook): string | undefined {
  return workbook.SheetNames.find(candidate => Boolean(workbook.Sheets[candidate])) || Object.keys(workbook.Sheets)[0];
}

function rawSheetRows(workbook: XLSX.WorkBook): Row[] {
  const name = firstSheetName(workbook);
  if (!name) return [];
  return XLSX.utils.sheet_to_json<Row>(workbook.Sheets[name], { header: 1, defval: '' });
}

function hasStock105Header(rows: Row[]): boolean {
  return rows.some(row => {
    const cells = row.map(normalizeText);
    return cells.some(cell => cell === 'CODIGO' || cell === 'COD')
      && cells.some(cell => cell.includes('DESCR'))
      && cells.some(cell => cell.includes('VENDA'));
  });
}

/**
 * O Winthor passou a exportar a Posição 105 em dois formatos:
 * 1) relatório completo, com capa/cabeçalho e 25 colunas;
 * 2) relatório compacto, já começando nos produtos e com 16 colunas úteis.
 *
 * No formato compacto observado em 17/08/2026:
 * código=0, descrição=1, estoque=4, custo unitário Real+ICMS=6 e P.Venda=9.
 * Inserimos apenas um cabeçalho sintético em memória para que o restante do motor
 * continue trabalhando com uma única regra, sem alterar o arquivo do usuário.
 */
function normalizeCompactStock105(workbook: XLSX.WorkBook): XLSX.WorkBook {
  const name = firstSheetName(workbook);
  if (!name) return workbook;
  const rows = rawSheetRows(workbook);
  if (!rows.length || hasStock105Header(rows)) return workbook;

  const sample = rows.find(row => {
    const code = cleanCode(row[0]);
    return /^\d+$/.test(code)
      && String(row[1] ?? '').trim().length > 0
      && row.length >= 15
      && Number.isFinite(parseNumber(row[4]))
      && Number.isFinite(parseNumber(row[6]))
      && Number.isFinite(parseNumber(row[9]));
  });
  if (!sample) return workbook;

  const header: Row = [
    'CODIGO', 'DESCRICAO', 'EMB', 'FL', 'ESTOQUE', 'MASTER',
    'CUSTO REAL+ICMS', 'CUSTO REAL', 'CUSTO FINANC', 'P VENDA', 'PR COMP',
    'TOTAL CUSTO REAL+ICMS', 'TOTAL CUSTO REAL', 'TOTAL CUSTO FINANC', 'TOTAL P VENDA', 'TOTAL PR COMP',
  ];
  workbook.Sheets[name] = XLSX.utils.aoa_to_sheet([header, ...rows]);
  return workbook;
}

/**
 * O Cadastro 286 também passou a ser exportado sem a capa do relatório e com as
 * colunas vazias removidas. No formato compacto atual há 21 colunas e os campos
 * fundamentais estão em: filial=0, código Winthor=1, descrição=2, EAN=17,
 * código de fábrica=18, master=19 e principal=20.
 *
 * Expandimos essas linhas para as posições do formato antigo (26 colunas), que é
 * o contrato já usado pelo parser de cadastro. Assim aceitamos os dois formatos.
 */
function normalizeCompactCadastro286(workbook: XLSX.WorkBook): XLSX.WorkBook {
  const name = firstSheetName(workbook);
  if (!name) return workbook;
  const rows = rawSheetRows(workbook);
  if (!rows.length) return workbook;

  const looksCompact = rows.slice(0, Math.min(rows.length, 30)).some(row => {
    const ean = cleanDigits(row[17]);
    return String(row[0] ?? '').trim() === '11'
      && /^\d+$/.test(cleanCode(row[1]))
      && String(row[2] ?? '').trim().length > 0
      && [8, 12, 13, 14].includes(ean.length)
      && cleanCode(row[18]).length > 0
      && row.length <= 21;
  });
  if (!looksCompact) return workbook;

  const expanded = rows.map(row => {
    if (String(row[0] ?? '').trim() !== '11' || !/^\d+$/.test(cleanCode(row[1]))) return row;
    const out: Row = Array(26).fill('');
    out[0] = row[0];
    out[1] = row[1];
    out[2] = row[2];
    out[5] = row[3];
    out[7] = row[4];
    out[8] = row[5];
    out[9] = row[6];
    out[10] = row[7];
    out[11] = row[8];
    out[12] = row[9];
    out[13] = row[10];
    out[14] = row[11];
    out[15] = row[12];
    out[16] = row[13];
    out[17] = row[14];
    out[18] = row[15];
    out[19] = row[16];
    out[20] = row[17];
    out[23] = row[18];
    out[24] = row[19];
    out[25] = row[20];
    return out;
  });
  workbook.Sheets[name] = XLSX.utils.aoa_to_sheet(expanded);
  return workbook;
}

export async function readWorkbook(file: File, kind: SourceKind): Promise<XLSX.WorkBook> {
  const data = await file.arrayBuffer();
  const preferredSheets: Partial<Record<SourceKind, string[]>> = { compassTargets: ['Metas'], activeRoute: ['Roteiro Ativo'] };
  const sheets = preferredSheets[kind];
  let workbook = XLSX.read(data, { type: 'array', cellDates: false, ...(sheets ? { sheets } : {}) });
  if (kind === 'stock105') workbook = normalizeCompactStock105(workbook);
  if (kind === 'items286') workbook = normalizeCompactCadastro286(workbook);
  return workbook;
}

export function sheetRows(workbook: XLSX.WorkBook, sheetName?: string): Row[] {
  const name = sheetName && workbook.Sheets[sheetName] ? sheetName : firstSheetName(workbook);
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
