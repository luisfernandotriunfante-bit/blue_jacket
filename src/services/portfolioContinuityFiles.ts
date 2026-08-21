import * as XLSX from 'xlsx';
import {
  applyPortfolioContinuity,
  portfolioContinuityWarning,
  type PortfolioContinuitySnapshot,
  type PortfolioContinuityRowLike,
} from '../domain/portfolioContinuity';
import { normalizeText, parseNumber, toIsoDate } from './canonical/utils';
import type { OperationalPortfolioRow, OperationalSourceState } from './operationalSources';

const STORAGE_KEY = 'blue-jacket:portfolio-continuity:v1';

interface ParsedPortfolioContinuityRow extends PortfolioContinuityRowLike { sourceRow: number; }
export interface PortfolioContinuityApplication { state: OperationalSourceState; snapshot: PortfolioContinuitySnapshot; warning: string; }
export interface PortfolioContinuityLoadResult { snapshot: PortfolioContinuitySnapshot | null; error: string; }

function storageAvailable(storage?: Storage | null): storage is Storage { return Boolean(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'); }

export function loadPortfolioContinuityResult(storage?: Storage | null): PortfolioContinuityLoadResult {
  const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!storageAvailable(target)) return { snapshot:null, error:'Persistência da continuidade da Carteira indisponível neste navegador.' };
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return { snapshot:null, error:'' };
    const parsed = JSON.parse(raw) as Partial<PortfolioContinuitySnapshot>;
    if (!parsed.snapshotDate || !Array.isArray(parsed.orderNumbers)) return { snapshot:null, error:'Snapshot persistido da continuidade da Carteira está incompleto ou incompatível.' };
    return { snapshot:parsed as PortfolioContinuitySnapshot, error:'' };
  } catch (error) {
    return { snapshot:null, error:`Falha ao restaurar a continuidade da Carteira: ${error instanceof Error ? error.message : 'conteúdo persistido inválido'}.` };
  }
}

export function loadPortfolioContinuity(storage?: Storage | null): PortfolioContinuitySnapshot | null {
  return loadPortfolioContinuityResult(storage).snapshot;
}

export function savePortfolioContinuity(snapshot: PortfolioContinuitySnapshot, storage?: Storage | null) {
  const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!storageAvailable(target)) throw new Error('Persistência da continuidade da Carteira indisponível; o novo snapshot não foi aplicado como se houvesse continuidade salva.');
  target.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function isPortfolioFile(fileName: string) { const name = normalizeText(fileName); return name.includes('CARTEIRA') && !name.includes('CLIENT'); }

function parseRows(workbook: XLSX.WorkBook): ParsedPortfolioContinuityRow[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]; if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  const headerIndex = rows.findIndex(row => { const values = row.map(normalizeText); return values.some(value => value === 'ORDER NUMBER') && values.some(value => value === 'ORDER DATE') && values.some(value => value.includes('ORDER QTY')) && values.some(value => value.includes('BILL QTY')) && values.some(value => value.includes('NET VALUE')); });
  if (headerIndex < 0) throw new Error('Carteira: cabeçalho Order Date / Order Number / Order Qty / Bill Qty / Net Value não encontrado para a leitura comparável.');
  const header = rows[headerIndex].map(normalizeText);
  const required=(label:string,predicate:(value:string)=>boolean)=>{const index=header.findIndex(predicate);if(index<0)throw new Error(`Carteira: coluna obrigatória ${label} ausente na continuidade.`);return index};
  const orderDateCol = required('ORDER DATE',value=>value==='ORDER DATE');
  const orderNumberCol = required('ORDER NUMBER',value=>value==='ORDER NUMBER');
  const orderQtyCol = required('ORDER QTY',value=>value.includes('ORDER QTY'));
  const billQtyCol = required('BILL QTY',value=>value.includes('BILL QTY'));
  const costCol = required('NET VALUE',value=>value.includes('NET VALUE'));
  const result: ParsedPortfolioContinuityRow[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]; const orderNumber = String(row[orderNumberCol] ?? '').trim().replace(/\.0+$/, '').replace(/\D/g, ''); if (!orderNumber) continue;
    const orderQty = Math.max(parseNumber(row[orderQtyCol]), 0); const billQty = Math.max(parseNumber(row[billQtyCol]), 0); const costValue = Math.max(parseNumber(row[costCol]), 0); if (orderQty + billQty <= 0 && costValue <= 0) continue;
    result.push({ sourceRow: i + 1, orderDate: toIsoDate(row[orderDateCol]), orderNumber, orderQty, billQty, costValue });
  }
  return result;
}

export async function applyPortfolioContinuityToPreparedState(files: File[], preparedState: OperationalSourceState, storage?: Storage | null): Promise<PortfolioContinuityApplication | null> {
  const portfolioFiles = files.filter(file => isPortfolioFile(file.name)); if (!portfolioFiles.length) return null;
  const loaded=loadPortfolioContinuityResult(storage);
  if (loaded.error) throw new Error(`Continuidade da Carteira bloqueada: ${loaded.error}`);
  let previous = loaded.snapshot; let latest: PortfolioContinuityApplication | null = null;
  for (const file of portfolioFiles) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true }); const parsedRows = parseRows(workbook); const result = applyPortfolioContinuity(parsedRows, file.name, previous); const validSourceRows = new Set(result.rows.map(row => row.sourceRow)); const filteredPortfolioRows: OperationalPortfolioRow[] = preparedState.portfolioRows.filter(row => validSourceRows.has(row.sourceRow));
    const nextState: OperationalSourceState = { ...preparedState, portfolioFileName: file.name, portfolioRows: filteredPortfolioRows };
    previous = result.snapshot; savePortfolioContinuity(result.snapshot, storage); latest = { state: nextState, snapshot: result.snapshot, warning: portfolioContinuityWarning(result.snapshot) };
  }
  return latest;
}
