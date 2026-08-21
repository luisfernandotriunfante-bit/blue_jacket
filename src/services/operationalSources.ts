import * as XLSX from 'xlsx';
import type { CanonicalInventoryProduct, CanonicalState, ManualConfiguration } from '../domain/canonical';
import { parseInvoiceIdentity } from '../domain/invoiceIdentity';
import { packagingFactorsAgree, type UnitsPerCaseSource } from '../domain/packaging';
import type { MetricasEstoque, ProdutoEstoque } from '../store/DataContext';
import { cleanCode, cleanDigits, normalizeText, parseNumber, toIsoDate } from './canonical/utils';

const STORAGE_KEY = 'blue-jacket:operational-sources:v1';

export type SupplementalSourceKind = 'winthorTablePrices' | 'entryNotes218' | 'receivedNotes12322';

export interface OperationalReceivedInvoice {
  invoice: string;
  invoiceRaw?: string;
  invoiceNumber?: string;
  invoiceSeries?: string;
  invoiceNormalized?: string;
  entryDate: string;
  issueDate: string;
  totalValue: number;
  source: '218' | '12.322';
}

export interface OperationalReceiptItem {
  invoice: string;
  invoiceRaw?: string;
  invoiceNumber?: string;
  invoiceSeries?: string;
  invoiceNormalized?: string;
  entryDate: string;
  issueDate: string;
  sku: string;
  product: string;
  units: number;
  unitPrice: number;
  supplierName: string;
  supplierDocument: string;
}

export interface OperationalPortfolioRow {
  sourceRow: number;
  materialCode: string;
  description: string;
  orderQty: number;
  billQty: number;
  costValue: number;
  invoice: string;
  invoiceRaw?: string;
  invoiceNumber?: string;
  invoiceSeries?: string;
  invoiceNormalized?: string;
}

export interface OperationalSourceState {
  version: 1;
  tablePriceFileName: string;
  tablePrices: Record<string, number>;
  entry218FileName: string;
  currentInvoices: OperationalReceivedInvoice[];
  receiptItems: OperationalReceiptItem[];
  legacy12322FileName: string;
  legacyInvoices: OperationalReceivedInvoice[];
  portfolioFileName: string;
  portfolioRows: OperationalPortfolioRow[];
  portfolioInvoiceColumnDetected: boolean;
  portfolioHeader: string[];
  persistenceError?: string;
}

const EMPTY_STATE: OperationalSourceState = {
  version: 1,
  tablePriceFileName: '',
  tablePrices: {},
  entry218FileName: '',
  currentInvoices: [],
  receiptItems: [],
  legacy12322FileName: '',
  legacyInvoices: [],
  portfolioFileName: '',
  portfolioRows: [],
  portfolioInvoiceColumnDetected: false,
  portfolioHeader: [],
};

function storageAvailable(storage?: Storage | null): storage is Storage {
  return Boolean(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function');
}

export function loadOperationalSourceState(storage?: Storage | null): OperationalSourceState {
  const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!storageAvailable(target)) return { ...EMPTY_STATE, persistenceError: 'Persistência das fontes operacionais indisponível neste navegador.' };
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_STATE };
    const parsed = JSON.parse(raw) as Partial<OperationalSourceState>;
    return {
      ...EMPTY_STATE,
      ...parsed,
      persistenceError: undefined,
      tablePrices: parsed.tablePrices || {},
      currentInvoices: parsed.currentInvoices || [],
      receiptItems: parsed.receiptItems || [],
      legacyInvoices: parsed.legacyInvoices || [],
      portfolioRows: parsed.portfolioRows || [],
      portfolioHeader: parsed.portfolioHeader || [],
    };
  } catch (error) {
    return { ...EMPTY_STATE, persistenceError: `Falha ao restaurar fontes operacionais: ${error instanceof Error ? error.message : 'conteúdo persistido inválido'}. A carga anterior não foi tratada como inexistente silenciosamente.` };
  }
}

export function saveOperationalSourceState(state: OperationalSourceState, storage?: Storage | null) {
  const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!storageAvailable(target)) throw new Error('Persistência das fontes operacionais indisponível neste navegador.');
  target.setItem(STORAGE_KEY, JSON.stringify({ ...state, persistenceError: undefined }));
}

export function supplementalSourceKind(fileName: string): SupplementalSourceKind | null {
  const name = normalizeText(fileName);
  const compactName = name.replace(/[^A-Z0-9]/g, '');
  if (name.includes('PCTABPR')) return 'winthorTablePrices';
  if ((name.includes('218') && name.includes('ENTRADA')) || name.includes('ENTRADA-NOTAS') || name.includes('ENTRADA NOTAS')) return 'entryNotes218';
  if (compactName.includes('12322')) return 'receivedNotes12322';
  return null;
}

export function supplementalSourceLabel(fileName: string): string {
  const kind = supplementalSourceKind(fileName);
  if (kind === 'winthorTablePrices') return 'Tabela de Preços Winthor';
  if (kind === 'entryNotes218') return 'Entrada de Notas 218';
  if (kind === 'receivedNotes12322') return 'Notas Recebidas 12.322';
  return '';
}

function firstRows(workbook: XLSX.WorkBook): unknown[][] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true }) : [];
}

export function parseWinthorTablePrices(rows: unknown[][]): Record<string, number> {
  const headerIndex = rows.findIndex(row => {
    const normalized = row.map(normalizeText);
    return normalized.includes('CODPROD') && (normalized.includes('PVENDA1') || normalized.includes('PTABELA'));
  });
  if (headerIndex < 0) throw new Error('Tabela de Preços Winthor: cabeçalho CODPROD/PVENDA1 não encontrado.');
  const header = rows[headerIndex].map(normalizeText);
  const col = (name: string) => header.findIndex(value => value === name);
  const codeCol = col('CODPROD');
  const regionCol = col('NUMREGIAO');
  const branchCol = col('CODFILIAL');
  const regionNameCol = col('REGIAO');
  const statusCol = col('STATUSREGIAO');
  const price1Col = col('PVENDA1');
  const legacyTableCol = col('PTABELA');
  const tableCol = price1Col >= 0 ? price1Col : legacyTableCol;
  const prices: Record<string, number> = {};
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const code = cleanCode(row[codeCol]);
    if (!/^\d+$/.test(code)) continue;
    const region = regionCol >= 0 ? cleanCode(row[regionCol]) : '';
    const branch = branchCol >= 0 ? cleanCode(row[branchCol]) : '';
    const regionName = regionNameCol >= 0 ? normalizeText(row[regionNameCol]) : '';
    const status = statusCol >= 0 ? normalizeText(row[statusCol]) : 'A';
    const isMcdCampoGrande = region === '11' || branch === '11' || regionName.includes('CAMPO GRANDE') && regionName.includes('MCD');
    if (!isMcdCampoGrande || (status && status !== 'A')) continue;
    const rawPrice = parseNumber(row[tableCol]);
    const price = Math.round((rawPrice + Number.EPSILON) * 100) / 100;
    if (price <= 0) continue;
    const existing = prices[code];
    if (existing !== undefined && Math.abs(existing - price) > 0.005) throw new Error(`Tabela de Preços Winthor: conflito para CODPROD ${code}; preços elegíveis ${existing.toFixed(2)} e ${price.toFixed(2)}. Nenhum critério "última linha vence" foi aplicado.`);
    prices[code] = price;
  }
  if (!Object.keys(prices).length) throw new Error('Tabela de Preços Winthor: nenhum Preço 1 (PVENDA1) ativo da região MCD/Campo Grande foi encontrado.');
  return prices;
}

export function parseEntryNotes218(rows: unknown[][]): { invoices: OperationalReceivedInvoice[]; items: OperationalReceiptItem[] } {
  const invoices = new Map<string, OperationalReceivedInvoice>();
  const items: OperationalReceiptItem[] = [];
  let current: { invoice: string; invoiceRaw: string; invoiceNumber: string; invoiceSeries: string; invoiceNormalized: string; entryDate: string; issueDate: string; supplierName: string; supplierDocument: string } | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const normalized = row.map(normalizeText);
    const noteHeader = normalized.some(value => value.includes('DT. ENTRADA')) && normalized.some(value => value.includes('NOTA FISCAL')) && normalized.some(value => value.includes('VL. TOTAL'));
    if (noteHeader) {
      const next = rows[i + 1] || [];
      const identity = parseInvoiceIdentity(next[4]);
      if (identity.number) {
        current = {
          invoice: identity.number,
          invoiceRaw: identity.raw,
          invoiceNumber: identity.number,
          invoiceSeries: identity.series,
          invoiceNormalized: identity.normalized,
          entryDate: toIsoDate(next[0]),
          issueDate: toIsoDate(next[8]),
          supplierName: String(next[12] ?? '').trim(),
          supplierDocument: cleanDigits(next[18]),
        };
        invoices.set(identity.normalized || identity.number, { ...current, totalValue: parseNumber(next[21]), source: '218' });
      }
      continue;
    }
    const itemHeader = normalized.some(value => value === 'CODIGO') && normalized.some(value => value === 'PRODUTO') && normalized.some(value => value.includes('P.UNIT'));
    if (itemHeader || !current) continue;
    const sku = cleanCode(row[4]);
    const product = String(row[5] ?? '').trim();
    const units = Math.max(parseNumber(row[15]), 0);
    const unitPrice = Math.max(parseNumber(row[17]), 0);
    if (!/^\d+$/.test(sku) || !product || units <= 0) continue;
    items.push({ ...current, sku, product, units, unitPrice });
  }
  return { invoices: Array.from(invoices.values()), items };
}

export function parseReceivedNotes12322(text: string): OperationalReceivedInvoice[] {
  const invoices = new Map<string, OperationalReceivedInvoice>();
  const pattern = /^\s*(\d{6,9})\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+\d{11,15}\s+.+?\s{2,}\d{3}\.\d{2}\s+\d{4}\s+([\d.,]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const identity = parseInvoiceIdentity(match[1]);
    if (!identity.number) continue;
    invoices.set(identity.normalized || identity.number, { invoice: identity.number, invoiceRaw: identity.raw, invoiceNumber: identity.number, invoiceSeries: identity.series, invoiceNormalized: identity.normalized, issueDate: toIsoDate(match[2]), entryDate: toIsoDate(match[3]), totalValue: parseNumber(match[4]), source: '12.322' });
  }
  return Array.from(invoices.values());
}

export function isOperationalPortfolioRows(rows: unknown[][]): boolean {
  return rows.some(row => {
    const values = row.map(normalizeText);
    return values.some(value => value === 'MATERIAL' || value.includes('MATERIAL CODE'))
      && values.some(value => value.includes('ORDER QTY'))
      && values.some(value => value.includes('BILL QTY'))
      && values.some(value => value.includes('NET VALUE'));
  });
}

function portfolioHeaderColumns(rows: unknown[][]) {
  const headerIndex = rows.findIndex(row => {
    const values = row.map(normalizeText);
    return values.some(value => value === 'MATERIAL' || value.includes('MATERIAL CODE'))
      && values.some(value => value.includes('ORDER QTY'))
      && values.some(value => value.includes('BILL QTY'))
      && values.some(value => value.includes('NET VALUE'));
  });
  const sampleHeaders = (rows.slice(0, 12).find(row => row.some(cell => String(cell ?? '').trim())) || []).map(value => String(value ?? '').trim()).filter(Boolean).slice(0, 20);
  if (headerIndex < 0) throw new Error(`Carteira: layout não reconhecido. Campos obrigatórios: MATERIAL, ORDER QTY, BILL QTY e NET VALUE. Cabeçalhos encontrados: ${sampleHeaders.join(' | ') || '(nenhum)'}. Nenhuma posição fixa de coluna foi usada.`);

  const header = rows[headerIndex].map(normalizeText);
  const required = (label: string, predicate: (value: string) => boolean) => {
    const index = header.findIndex(predicate);
    if (index < 0) throw new Error(`Carteira: campo obrigatório ${label} ausente. Cabeçalhos encontrados: ${header.filter(Boolean).join(' | ')}.`);
    return index;
  };
  const invoice = header.findIndex(value => value === 'NF' || value === 'NFE' || value === 'NOTA' || value.includes('NOTA FISCAL') || value.includes('INVOICE') || value.includes('BILLING DOC'));
  return {
    headerIndex,
    header,
    material: required('MATERIAL', value => value === 'MATERIAL' || value.includes('MATERIAL CODE')),
    description: header.findIndex(value => value.includes('MATERIAL DESC') || value === 'DESCRIPTION' || value === 'DESCRICAO'),
    orderQty: required('ORDER QTY', value => value.includes('ORDER QTY')),
    billQty: required('BILL QTY', value => value.includes('BILL QTY')),
    cost: required('NET VALUE', value => value.includes('NET VALUE')),
    invoice,
  };
}

export function parseOperationalPortfolio(rows: unknown[][]): { rows: OperationalPortfolioRow[]; invoiceColumnDetected: boolean; header: string[] } {
  const columns = portfolioHeaderColumns(rows);
  const result: OperationalPortfolioRow[] = [];
  for (let i = columns.headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const materialCode = cleanCode(row[columns.material]);
    if (!materialCode || normalizeText(materialCode) === 'MATERIAL') continue;
    const orderQty = Math.max(parseNumber(row[columns.orderQty]), 0);
    const billQty = Math.max(parseNumber(row[columns.billQty]), 0);
    const costValue = Math.max(parseNumber(row[columns.cost]), 0);
    if (orderQty + billQty <= 0 && costValue <= 0) continue;
    const identity = columns.invoice >= 0 ? parseInvoiceIdentity(row[columns.invoice]) : parseInvoiceIdentity('');
    result.push({
      sourceRow: i + 1,
      materialCode,
      description: columns.description >= 0 ? String(row[columns.description] ?? '').trim() : '',
      orderQty,
      billQty,
      costValue,
      invoice: identity.number,
      invoiceRaw: identity.raw,
      invoiceNumber: identity.number,
      invoiceSeries: identity.series,
      invoiceNormalized: identity.normalized,
    });
  }
  return { rows: result, invoiceColumnDetected: columns.invoice >= 0, header: columns.header };
}

async function decodeTextFile(file: File) {
  const buffer = await file.arrayBuffer();
  try { return new TextDecoder('windows-1252').decode(buffer); } catch { return new TextDecoder().decode(buffer); }
}

export async function prepareOperationalSources(files: File[], storage?: Storage | null): Promise<{ engineFiles: File[]; state: OperationalSourceState }> {
  let state = loadOperationalSourceState(storage);
  const engineFiles: File[] = [];
  for (const file of files) {
    const supplemental = supplementalSourceKind(file.name);
    if (supplemental === 'winthorTablePrices') {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      state = { ...state, persistenceError: undefined, tablePriceFileName: file.name, tablePrices: parseWinthorTablePrices(firstRows(workbook)) };
      continue;
    }
    if (supplemental === 'entryNotes218') {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const parsed = parseEntryNotes218(firstRows(workbook));
      state = { ...state, persistenceError: undefined, entry218FileName: file.name, currentInvoices: parsed.invoices, receiptItems: parsed.items };
      continue;
    }
    if (supplemental === 'receivedNotes12322') {
      state = { ...state, persistenceError: undefined, legacy12322FileName: file.name, legacyInvoices: parseReceivedNotes12322(await decodeTextFile(file)) };
      continue;
    }

    const name = normalizeText(file.name);
    if (name.includes('CARTEIRA')) {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = firstRows(workbook);
      if (isOperationalPortfolioRows(rows)) {
        const parsed = parseOperationalPortfolio(rows);
        state = { ...state, persistenceError: undefined, portfolioFileName: file.name, portfolioRows: parsed.rows, portfolioInvoiceColumnDetected: parsed.invoiceColumnDetected, portfolioHeader: parsed.header };
      } else if (!name.includes('CLIENT')) {
        throw new Error(`${file.name}: o nome sugere Carteira, mas a assinatura de conteúdo não contém MATERIAL + ORDER QTY + BILL QTY + NET VALUE. O arquivo não foi aplicado como Carteira de estoque.`);
      }
    }
    engineFiles.push(file);
  }
  saveOperationalSourceState(state, storage);
  return { engineFiles, state };
}

type InventoryWithPackaging = CanonicalInventoryProduct & {
  unitsPerCase?: number;
  unitsPerCaseSource?: UnitsPerCaseSource;
  unitsPerCaseConflict?: boolean;
  portfolioLines?: unknown[];
};

function cloneInventory(canonical: CanonicalState): InventoryWithPackaging[] {
  return canonical.inventory.map(item => ({ ...item, portfolioLines: [] } as InventoryWithPackaging));
}

function reconciledUnitsPerCase(product: InventoryWithPackaging, masterFactor: number): number {
  const productFactor = product.unitsPerCaseConflict || product.unitsPerCaseSource === 'CONFLICT' || product.unitsPerCaseSource === 'UNKNOWN' ? 0 : Math.max(Number(product.unitsPerCase) || 0, 0);
  const supportFactor = Math.max(Number(masterFactor) || 0, 0);
  if (productFactor > 0 && supportFactor > 0 && !packagingFactorsAgree(productFactor, supportFactor)) return 0;
  return productFactor || supportFactor;
}

/**
 * Aplica somente overrides que NÃO representam recebimento: preço e reconstrução
 * da Carteira bruta/comparável. A baixa de 12.322/218 pertence exclusivamente a
 * applyReceiptReconciliation, impedindo dupla dedução no pipeline real.
 */
export function applyOperationalOverrides(canonical: CanonicalState, state: OperationalSourceState, config: ManualConfiguration): { canonical: CanonicalState; priceMatched: number; priceDivergences: number; portfolioDeductedRows: number; portfolioDeductedCost: number; portfolioBlocked: boolean } {
  const inventory = cloneInventory(canonical);
  const byCode = new Map(inventory.map(item => [cleanCode(item.code), item]));
  const byFactory = new Map(inventory.filter(item => cleanCode(item.factoryCode)).map(item => [cleanCode(item.factoryCode), item]));
  const byEan = new Map(inventory.filter(item => cleanDigits(item.ean)).map(item => [cleanDigits(item.ean), item]));
  const itemByInternal = new Map((canonical.support.itemCodes || []).map(item => [cleanCode(item.internalCode), item]));
  const internalByFactory = new Map((canonical.support.itemCodes || []).filter(item => cleanCode(item.factoryCode)).map(item => [cleanCode(item.factoryCode), cleanCode(item.internalCode)]));
  const productBySku = new Map((canonical.support.products || []).filter(item => cleanCode(item.sku)).map(item => [cleanCode(item.sku), item]));
  const productByEan = new Map((canonical.support.products || []).filter(item => cleanDigits(item.ean)).map(item => [cleanDigits(item.ean), item]));

  let priceMatched = 0;
  let priceDivergences = 0;
  inventory.forEach(item => {
    const authoritative = Number(state.tablePrices[cleanCode(item.code)] || 0);
    if (authoritative <= 0) return;
    priceMatched += 1;
    if (item.saleUnit > 0 && Math.abs(item.saleUnit - authoritative) > 0.005) priceDivergences += 1;
    item.saleUnit = authoritative;
  });

  const canRebuildPortfolio = state.portfolioRows.length > 0;
  if (canRebuildPortfolio) {
    inventory.forEach(item => { item.pendingQty = 0; item.pendingCases = 0; item.pendingCost = 0; item.pendingSale = 0; item.portfolioLines = []; });
    for (const row of state.portfolioRows) {
      const material = cleanCode(row.materialCode);
      const mappedInternal = itemByInternal.has(material) ? material : internalByFactory.get(material) || '';
      const cad = mappedInternal ? itemByInternal.get(mappedInternal) : undefined;
      const ean = cleanDigits(cad?.ean || '');
      const master = productBySku.get(material) || (ean ? productByEan.get(ean) : undefined);
      const product = (mappedInternal ? byCode.get(mappedInternal) : undefined) || byCode.get(material) || byFactory.get(material) || (ean ? byEan.get(ean) : undefined);
      if (!product) continue;
      const unitsPerCase = reconciledUnitsPerCase(product, Number(master?.unitsPerCase) || 0);
      const cases = row.orderQty + row.billQty;
      const units = unitsPerCase > 0 ? cases * unitsPerCase : 0;
      const sale = row.costValue * (1 + Math.max(Number(config.portfolioSaleMarkup) || 0, 0));
      product.pendingCases += cases;
      product.pendingQty += units;
      product.pendingCost += row.costValue;
      product.pendingSale += sale;
      product.portfolioLines = [...(product.portfolioLines || []), { sourceRow: row.sourceRow, materialCode: material, orderQty: row.orderQty, billQty: row.billQty, totalCases: cases, unitsPerCase, totalUnits: units, costValue: row.costValue, saleValue: sale, internalCode: product.code, ean: product.ean, description: product.description, hasWinthor: product.hasWinthor }];
    }
  }

  const stockCost = inventory.reduce((sum, item) => sum + item.quantity * item.costUnit, 0);
  const stockSale = inventory.reduce((sum, item) => sum + item.quantity * item.saleUnit, 0);
  const pendingCost = inventory.reduce((sum, item) => sum + item.pendingCost, 0);
  const pendingSale = inventory.reduce((sum, item) => sum + item.pendingSale, 0);
  const historyAverage = canonical.history.average3ClosedMonths || 0;
  const coverageCurrentDays = historyAverage > 0 ? Math.round(stockSale / historyAverage * 30) : 0;
  const coverageProjectedDays = historyAverage > 0 ? Math.round((stockSale + pendingSale) / historyAverage * 30) : 0;
  const coverageCostCurrentDays = historyAverage > 0 ? Math.round(stockCost / historyAverage * 30) : 0;
  const coverageCostProjectedDays = historyAverage > 0 ? Math.round((stockCost + pendingCost) / historyAverage * 30) : 0;

  const warnings = canonical.warnings.filter(warning => !warning.startsWith('Tabela PCTABPR:') && !warning.startsWith('Entrada de notas:') && !warning.startsWith('Abatimento da Carteira:') && !warning.startsWith('Persistência operacional:'));
  if (Object.keys(state.tablePrices).length) warnings.push(`Tabela PCTABPR: ${Object.keys(state.tablePrices).length} preço(s) ativo(s) carregado(s); ${priceMatched} SKU(s) do estoque receberam Preço 1 (PVENDA1) como prioridade${priceDivergences ? `, com ${priceDivergences} divergência(s) contra a fonte anterior` : ', sem divergência nos SKUs comparáveis'}.`);
  if (state.currentInvoices.length || state.legacyInvoices.length) warnings.push(`Entrada de notas: ${state.currentInvoices.length} NF(s) do 218 + ${state.legacyInvoices.length} NF(s) históricas do 12.322 registradas. A baixa é aplicada exclusivamente pela reconciliação de recebimentos.`);
  if (canRebuildPortfolio) warnings.push(`Abatimento da Carteira: Carteira bruta/comparável reconstruída com ${state.portfolioRows.length} linha(s); nenhum recebimento foi abatido nesta camada.`);
  if (state.persistenceError) warnings.push(`Persistência operacional: ${state.persistenceError}`);

  const next: CanonicalState = {
    ...canonical,
    inventory,
    stock: {
      ...canonical.stock,
      costValue: stockCost,
      saleValue: stockSale,
      pendingPurchaseCost: pendingCost,
      pendingPurchaseSale: pendingSale,
      projectedCostValue: stockCost + pendingCost,
      projectedSaleValue: stockSale + pendingSale,
      coverageCurrentDays,
      coverageProjectedDays,
      coverageCostCurrentDays,
      coverageCostProjectedDays,
    },
    warnings,
  };
  return { canonical: next, priceMatched, priceDivergences, portfolioDeductedRows: 0, portfolioDeductedCost: 0, portfolioBlocked: false };
}

export function operationalLegacyData(canonical: CanonicalState, coverageTarget: number): { produtos: ProdutoEstoque[]; metricas: MetricasEstoque } {
  const produtos: ProdutoEstoque[] = canonical.inventory.map(item => ({ codigo: item.code, descricao: item.description, ean: item.ean, quantidade: item.quantity, saldoMinimo: 0, custoUnitario: item.costUnit, vendaUnitario: item.saleUnit, entradas: 0, saidas: 0, saldoPedido: item.pendingQty, saldoPedidoCaixas: item.pendingCases, saldoPedidoValorCusto: item.pendingCost, saldoPedidoValorVenda: item.pendingSale, isLancamento: item.isLaunch, hasWinthor: item.hasWinthor, factoryCode: item.factoryCode, physicalCases: item.physicalCases, physicalUnits: item.physicalUnits, grossKg: item.grossKg }));
  const metricas: MetricasEstoque = { valorEstoqueCompra: canonical.stock.costValue, valorEstoqueVenda: canonical.stock.saleValue, saldoPedidoCusto: canonical.stock.pendingPurchaseCost, saldoPedidoVenda: canonical.stock.pendingPurchaseSale, coberturaDiasAtual: canonical.stock.coverageCurrentDays, coberturaEstoqueMaisSaldo: canonical.stock.coverageProjectedDays, coberturaDiasAtualCusto: canonical.stock.coverageCostCurrentDays, coberturaEstoqueMaisSaldoCusto: canonical.stock.coverageCostProjectedDays, produtosRuptura: canonical.inventory.filter(item => item.hasWinthor && item.quantity <= 0).length, metaCobertura: coverageTarget };
  return { produtos, metricas };
}

export function operationalReceiptMovements(state = loadOperationalSourceState()) {
  return state.receiptItems.map((item, index) => ({
    id: `218:${item.invoiceNormalized || item.invoice}:${item.sku}:${index}`,
    direction: 'ENTRADA' as const,
    stage: 'REALIZADA' as const,
    kind: 'ENTRADA_REALIZADA' as const,
    status: 'Entrada realizada',
    movement: 'Recebimento NF',
    date: item.entryDate,
    document: item.invoiceRaw || item.invoice,
    order: '',
    invoice: item.invoiceRaw || item.invoice,
    sku: item.sku,
    ean: '',
    product: item.product,
    partner: item.supplierName || 'Colgate',
    partnerDocument: item.supplierDocument,
    cases: 0,
    looseUnits: item.units,
    totalUnits: item.units,
    value: 0,
    origin: 'ENTRADA 218',
  }));
}
