import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOperationalOverrides,
  isOperationalPortfolioRows,
  parseEntryNotes218,
  parseOperationalPortfolio,
  parseReceivedNotes12322,
  parseWinthorTablePrices,
  type OperationalSourceState,
} from '../src/services/operationalSources';
import { applyReceiptReconciliation } from '../src/services/receiptReconciliation';
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

test('PCTABPR consolida preço elegível repetido quando os valores são iguais',()=>{
  const rows=[['CODPROD','NUMREGIAO','STATUSREGIAO','PVENDA1'],[565,11,'A',20.27],[565,11,'A',20.27]];
  assert.deepEqual(parseWinthorTablePrices(rows),{'565':20.27});
});

test('PCTABPR bloqueia conflito de preço em vez de usar última linha',()=>{
  const rows=[['CODPROD','NUMREGIAO','STATUSREGIAO','PVENDA1'],[565,11,'A',20.27],[565,11,'A',21.99]];
  assert.throws(()=>parseWinthorTablePrices(rows),/conflito.*565.*20\.27.*21\.99/i);
});

test('218 identifica nota, preserva identidade e itens recebidos', () => {
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
  assert.equal(parsed.invoices[0].invoiceNumber, '2953129');
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].sku, '988');
  assert.equal(parsed.items[0].units, 11520);
});

test('12.322 identifica notas históricas já recebidas', () => {
  const text = '   2942484 13/07/26 30/07/26    382468003375 A-COLGATE       212.01 0000     81.230,90       0,00       0,00 001 SP                           0';
  const parsed = parseReceivedNotes12322(text);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].invoice, '2942484');
  assert.equal(parsed[0].invoiceNumber, '2942484');
  assert.equal(parsed[0].entryDate, '2026-07-30');
  assert.equal(parsed[0].totalValue, 81230.9);
});

test('Carteira reconhece assinatura estrutural, preserva NF/série, material, quantidades e valor', () => {
  const rows = [
    ['Order Date', 'Invoice', 'x', 'x', 'Material', 'Material Desc', 'Order Qty', 'Bill Qty', 'Net Value'],
    ['01/08/26', '002953129-1', '', '', '565', 'Produto A', 10, 2, 1000],
  ];
  assert.equal(isOperationalPortfolioRows(rows),true);
  const parsed = parseOperationalPortfolio(rows);
  assert.equal(parsed.invoiceColumnDetected, true);
  assert.equal(parsed.rows[0].invoice, '2953129');
  assert.equal(parsed.rows[0].invoiceRaw, '002953129-1');
  assert.equal(parsed.rows[0].invoiceSeries, '1');
  assert.equal(parsed.rows[0].orderQty, 10);
  assert.equal(parsed.rows[0].billQty, 2);
});

test('Carteira de Clientes não possui assinatura de Carteira operacional',()=>{
  const rows=[['COD CLIENTE','CNPJ','RAZAO SOCIAL','VENDEDOR','LIMITE'],['123','00123456000199','Cliente A','RCA 1',1000]];
  assert.equal(isOperationalPortfolioRows(rows),false);
});

test('layout desconhecido de Carteira é bloqueado sem fallback por posição física',()=>{
  const rows=[['A','B','C','D','E','F','G','H','I'],['x','y','','','565','Produto A',10,2,1000]];
  assert.throws(()=>parseOperationalPortfolio(rows),/layout não reconhecido.*MATERIAL.*ORDER QTY.*BILL QTY.*NET VALUE/i);
});

function canonicalFixture():any {
  return {
    inventory: [{ code: '565', description: 'Produto A', ean: '', quantity: 10, costUnit: 10, saleUnit: 19, pendingQty: 999, pendingCases: 999, pendingCost: 999, pendingSale: 999, isLaunch: false, hasWinthor: true, factoryCode: '', physicalCases: 0, physicalUnits: 0, grossKg: 0, unitsPerCase: 12, unitsPerCaseSource:'105_DERIVED', portfolioLines: [] }],
    support: { itemCodes: [{ internalCode: '565', description: 'Produto A', ean: '', factoryCode: '' }], products: [], rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {} },
    stock: { costValue: 100, saleValue: 190, pendingPurchaseCost: 999, pendingPurchaseSale: 999, projectedCostValue: 1099, projectedSaleValue: 1189, physicalUnits: 0, physicalCases: 0, grossKg: 0, coverageCurrentDays: 0, coverageProjectedDays: 0, coverageCostCurrentDays: 0, coverageCostProjectedDays: 0, coverageTargetDays: 60 },
    history: { average3ClosedMonths: 1000 }, warnings: [],
  };
}

test('override aplica PCTABPR e reconstrói Carteira bruta sem baixar recebimentos', () => {
  const canonical=canonicalFixture();
  const state: OperationalSourceState = {
    version: 1,
    tablePriceFileName: 'pctabpr 13.xlsx', tablePrices: { '565': 20.27 },
    entry218FileName: '', currentInvoices: [], receiptItems: [],
    legacy12322FileName: '12.322.txt', legacyInvoices: [{invoice:'2953129',entryDate:'2026-07-30',issueDate:'2026-07-28',totalValue:100,source:'12.322'}],
    portfolioFileName: 'CARTEIRA.xlsx', portfolioInvoiceColumnDetected: true, portfolioHeader: ['INVOICE', 'MATERIAL'],
    portfolioRows: [
      { sourceRow: 2, materialCode: '565', description: 'Produto A', orderQty: 10, billQty: 0, costValue: 100, invoice: '2953129' },
      { sourceRow: 3, materialCode: '565', description: 'Produto A', orderQty: 3, billQty: 0, costValue: 30, invoice: '9999999' },
    ],
  };
  const adjusted = applyOperationalOverrides(canonical, state, DEFAULT_MANUAL_CONFIGURATION);
  assert.equal(adjusted.canonical.inventory[0].saleUnit, 20.27);
  assert.equal(adjusted.priceDivergences, 1);
  assert.equal(adjusted.portfolioDeductedRows, 0);
  assert.equal(adjusted.canonical.inventory[0].pendingCases, 13);
  assert.equal(adjusted.canonical.inventory[0].pendingQty, 156);
  assert.equal(adjusted.canonical.stock.pendingPurchaseCost, 130);
  const final=applyReceiptReconciliation(adjusted.canonical,state,DEFAULT_MANUAL_CONFIGURATION);
  assert.equal(final.canonical.inventory[0].pendingCases,3);
  assert.equal(final.canonical.inventory[0].pendingQty,36);
  assert.equal(final.canonical.stock.pendingPurchaseCost,30);
});

test('ausência de coluna NF não provoca baixa por aproximação nem bloqueia reconstrução bruta', () => {
  const canonical=canonicalFixture();
  const state: OperationalSourceState = { version: 1, tablePriceFileName: '', tablePrices: {}, entry218FileName: '', currentInvoices: [{ invoice: '1', entryDate: '', issueDate: '', totalValue: 0, source: '218' }], receiptItems: [], legacy12322FileName: '', legacyInvoices: [], portfolioFileName: 'CARTEIRA.xlsx', portfolioRows: [{ sourceRow: 2, materialCode: '565', description: '', orderQty: 2, billQty: 0, costValue: 20, invoice: '' }], portfolioInvoiceColumnDetected: false, portfolioHeader: [] };
  const result = applyOperationalOverrides(canonical, state, DEFAULT_MANUAL_CONFIGURATION);
  assert.equal(result.portfolioBlocked, false);
  assert.equal(result.portfolioDeductedRows, 0);
  assert.equal(result.canonical.inventory[0].pendingCases, 2);
  assert.equal(result.canonical.inventory[0].pendingQty,24);
});
