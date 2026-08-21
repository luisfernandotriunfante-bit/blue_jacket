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

interface ParsedPortfolioContinuityRow extends PortfolioContinuityRowLike {
  sourceRow: number;
}

export interface PortfolioContinuityApplication {
  state: OperationalSourceState;
  snapshot: PortfolioContinuitySnapshot;
  warning: string;
}

function storageAvailable(storage?: Storage | null): storage is Storage {
  return Boolean(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function');
}

export function loadPortfolioContinuity(storage?: Storage | null): PortfolioContinuitySnapshot | null {
  const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!storageAvailable(target)) return null;
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PortfolioContinuitySnapshot>;
    if (!parsed.snapshotDate || !Array.isArray(parsed.orderNumbers)) return null;
    return parsed as PortfolioContinuitySnapshot;
  } catch {
    return null;
  }
}

export function savePortfolioContinuity(snapshot: PortfolioContinuitySnapshot, storage?: Storage | null) {
  const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!storageAvailable(target)) return;
  try { target.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* auditoria não deve derrubar a carga */ }
}

function isPortfolioFile(fileName: string) {
  const name = normalizeText(fileName);
  return name.includes('CARTEIRA') && !name.includes('CLIENT');
}

function parseRows(workbook: XLSX.WorkBook): ParsedPortfolioContinuityRow[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  const headerIndex = rows.findIndex(row => {
    const values = row.map(normalizeText);
    return values.some(value => value === 'ORDER NUMBER')
      && values.some(value => value === 'ORDER DATE')
      && values.some(value => value.includes('ORDER QTY'))
      && values.some(value => value.includes('BILL QTY'))
      && values.some(value => value.includes('NET VALUE'));
  });
  if (headerIndex < 0) throw new Error('Carteira: cabeçalho Order Date / Order Number / Order Qty / Bill Qty / Net Value não encontrado para a leitura comparável.');
  const header = rows[headerIndex].map(normalizeText);
  const col = (name: string, fallback: number) => {
    const index = header.findIndex(value => value === name || value.includes(name));
    return index >= 0 ? index : fallback;
  };
  const orderDateCol = col('ORDER DATE', 0);
  const orderNumberCol = col('ORDER NUMBER', 3);
  const orderQtyCol = col('ORDER QTY', 6);
  const billQtyCol = col('BILL QTY', 7);
  const costCol = col('NET VALUE', 8);
  const result: ParsedPortfolioContinuityRow[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const orderNumber = String(row[orderNumberCol] ?? '').trim().replace(/\.0+$/, '').replace(/\D/g, '');
    if (!orderNumber) continue;
    const orderQty = Math.max(parseNumber(row[orderQtyCol]), 0);
    const billQty = Math.max(parseNumber(row[billQtyCol]), 0);
    const costValue = Math.max(parseNumber(row[costCol]), 0);
    if (orderQty + billQty <= 0 && costValue <= 0) continue;
    result.push({
      sourceRow: i + 1,
      orderDate: toIsoDate(row[orderDateCol]),
      orderNumber,
      orderQty,
      billQty,
      costValue,
    });
  }
  return result;
}

export async function applyPortfolioContinuityToPreparedState(
  files: File[],
  preparedState: OperationalSourceState,
  storage?: Storage | null,
): Promise<PortfolioContinuityApplication | null> {
  const portfolioFiles = files.filter(file => isPortfolioFile(file.name));
  if (!portfolioFiles.length) return null;

  let previous = loadPortfolioContinuity(storage);
  let latest: PortfolioContinuityApplication | null = null;

  for (const file of portfolioFiles) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const parsedRows = parseRows(workbook);
    const result = applyPortfolioContinuity(parsedRows, file.name, previous);
    const validSourceRows = new Set(result.rows.map(row => row.sourceRow));
    const filteredPortfolioRows: OperationalPortfolioRow[] = preparedState.portfolioRows.filter(row => validSourceRows.has(row.sourceRow));
    const nextState: OperationalSourceState = {
      ...preparedState,
      portfolioFileName: file.name,
      portfolioRows: filteredPortfolioRows,
    };
    previous = result.snapshot;
    savePortfolioContinuity(result.snapshot, storage);
    latest = { state: nextState, snapshot: result.snapshot, warning: portfolioContinuityWarning(result.snapshot) };
  }

  return latest;
}
