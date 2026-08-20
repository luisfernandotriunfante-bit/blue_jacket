import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOperationalOverrides,
  parseEntryNotes218,
  parseOperationalPortfolio,
  parseReceivedNotes12322,
  parseWinthorTablePrices,
  type OperationalSourceState,
} from '../src/services/operationalSources';
import { DEFAULT_MANUAL_CONFIGURATION } from '../src/domain/canonical';

test('PCTABPR usa PTABELA ativo da região 11 e ignora outra região', () => {
  const rows = [
    ['CODPROD', 'NUMREGIAO', 'REGIAO', 'CODFILIAL', 'STATUSREGIAO', 'PTABELA', 'PVENDA'],
    [565, 11, 'TABELA CAMPO GRANDE - MCD', 11, 'A', 20.27, 20.27],
    [612, 12, 'OUTRA REGIAO', 12, 'A', 99.99, 99.99],
    [857, 11, 'TABELA CAMPO GRANDE - MCD', 11, 'I', 50, 50],
  ];
  assert.deepEqual(parseWinthorTablePrices(rows), { '565': 20.27 });
});

test('218 identifica nota e itens recebidos', () => {
  const rows: unknown[][] = [];
  rows.push(['Dt. Entrada', '', '', '', 'Nota Fiscal', '', '', '', 'Dt. Emissão', '', '', 'Fornecedor', 'Razão', '', '', '', '', '', 'CGC', '', '', 'Vl. Total']);
  const note = Array(22).fill('');
  note[0] = '19/08/2026'; note[4] = '*2953129'; note[8] = '08/08/2026'; note[12] = 'A - COLGATE-PALMOLIVE COMERCIAL LTDA'; note[18] = '00382468003375'; note[21] = 261126.71;
  rows.push(note);
  rows.push(['', '', '', '', 'Código', 'Produto', '', '', '', '', '', '', '', '', 'UN', '', 'Qt.', 'P.Unit.']);
  const item = Array(18).fill('');
  item[4] = 988; item[5] = 'SAB PALM FRAMB AMORA 85G'; item[15] = 11520; item[17] = 4.442545;
  rows.push(item);
  const parsed = parseEntryNotes218(rows);
  assert.equal(parsed.invoices.length, 1);
  assert.equal(parsed.invoices[0].invoice, '2953129');
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].sku, '988');
  assert.equal(parsed.items[0].units, 11520);
});

test('12.322 identifica notas históricas já recebidas', () => {
  const text = '   2942484 13/07/26 30/07/26    382468003375 A-COLGATE       212.01 0000     81.230,90       0,00       0,00 001 SP                           0';
  const parsed = parseReceivedNotes12322(text);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].invoice, '2942484');
  assert.equal(parsed[0].entryDate, '2026-07-30');
  assert.equal(parsed[0].totalValue, 81230.9);
});

test('Carteira detecta coluna de NF e preserva material, quantidades e valor', () => {
  const rows = [
    ['Order Date', 'Invoice', 'x', 'x', 'Material', 'Material Desc', 'Order Qty', 'Bill Qty', 'Net Value'],
    ['01/08/26', '2953129', '', '', '565', 'Produto A', 10, 2, 1000],
  ];
  const parsed = parseOperationalPortfolio(rows);
  assert.equal(parsed.invoiceColumnDetected, true);
  assert.equal(parsed.rows[0].invoice, '2953129');
  assert.equal(parsed.rows[0].orderQty, 10);
  assert.equal(parsed.rows[0].billQty, 2);
});

test('preço PCTABPR tem prioridade e NF recebida é retirada da Carteira', () => {
  const canonical: any = {
    inventory: [{ code: '565', description: 'Produto A', ean: '', quantity: 10, costUnit: 10, saleUnit: 19, pendingQty: 999, pendingCases: 999, pendingCost: 999, pendingSale: 999, isLaunch: false, hasWinthor: true, factoryCode: '', physicalCases: 0, physicalUnits: 0, grossKg: 0, unitsPerCase: 12, portfolioLines: [] }],
    support: { itemCodes: [{ internalCode: '565', description: 'Produto A', ean: '', factoryCode: '' }], products: [], rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {} },
    stock: { costValue: 100, saleValue: 190, pendingPurchaseCost: 999, pendingPurchaseSale: 999, projectedCostValue: 1099, projectedSaleValue: 1189, physicalUnits: 0, physicalCases: 0, grossKg: 0, coverageCurrentDays: 0, coverageProjectedDays: 0, coverageCostCurrentDays: 0, coverageCostProjectedDays: 0, coverageTargetDays: 60 },
    history: { average3ClosedMonths: 1000 }, warnings: [],
  };
  const state: OperationalSourceState = {
    version: 1,
    tablePriceFileName: 'pctabpr 13.xlsx', tablePrices: { '565': 20.27 },
    entry218FileName: 'entrada-notas-218.xls', currentInvoices: [{ invoice: '2953129', entryDate: '2026-08-19', issueDate: '2026-08-08', totalValue: 100, source: '218' }], receiptItems: [],
    legacy12322FileName: '12.322.txt', legacyInvoices: [],
    portfolioFileName: 'CARTEIRA.xlsx', portfolioInvoiceColumnDetected: true, portfolioHeader: ['INVOICE', 'MATERIAL'],
    portfolioRows: [
      { sourceRow: 2, materialCode: '565', description: 'Produto A', orderQty: 10, billQty: 0, costValue: 100, invoice: '2953129' },
      { sourceRow: 3, materialCode: '565', description: 'Produto A', orderQty: 3, billQty: 0, costValue: 30, invoice: '9999999' },
    ],
  };
  const result = applyOperationalOverrides(canonical, state, DEFAULT_MANUAL_CONFIGURATION);
  assert.equal(result.canonical.inventory[0].saleUnit, 20.27);
  assert.equal(result.priceDivergences, 1);
  assert.equal(result.portfolioDeductedRows, 1);
  assert.equal(result.canonical.inventory[0].pendingCases, 3);
  assert.equal(result.canonical.inventory[0].pendingQty, 36);
  assert.equal(result.canonical.stock.pendingPurchaseCost, 30);
});

test('sem coluna de NF a Carteira não é abatida por aproximação', () => {
  const canonical: any = {
    inventory: [{ code: '565', description: 'Produto A', ean: '', quantity: 1, costUnit: 1, saleUnit: 1, pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: false, hasWinthor: true, factoryCode: '', physicalCases: 0, physicalUnits: 0, grossKg: 0, unitsPerCase: 12 }],
    support: { itemCodes: [{ internalCode: '565', description: '', ean: '', factoryCode: '' }], products: [], rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {} },
    stock: { costValue: 1, saleValue: 1, pendingPurchaseCost: 0, pendingPurchaseSale: 0, projectedCostValue: 1, projectedSaleValue: 1, physicalUnits: 0, physicalCases: 0, grossKg: 0, coverageCurrentDays: 0, coverageProjectedDays: 0, coverageCostCurrentDays: 0, coverageCostProjectedDays: 0, coverageTargetDays: 60 },
    history: { average3ClosedMonths: 0 }, warnings: [],
  };
  const state: OperationalSourceState = { version: 1, tablePriceFileName: '', tablePrices: {}, entry218FileName: '', currentInvoices: [{ invoice: '1', entryDate: '', issueDate: '', totalValue: 0, source: '218' }], receiptItems: [], legacy12322FileName: '', legacyInvoices: [], portfolioFileName: 'CARTEIRA.xlsx', portfolioRows: [{ sourceRow: 2, materialCode: '565', description: '', orderQty: 2, billQty: 0, costValue: 20, invoice: '' }], portfolioInvoiceColumnDetected: false, portfolioHeader: [] };
  const result = applyOperationalOverrides(canonical, state, DEFAULT_MANUAL_CONFIGURATION);
  assert.equal(result.portfolioBlocked, true);
  assert.equal(result.portfolioDeductedRows, 0);
  assert.equal(result.canonical.inventory[0].pendingCases, 2);
});
