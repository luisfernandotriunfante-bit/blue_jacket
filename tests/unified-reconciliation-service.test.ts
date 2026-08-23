import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalReconciliation } from '../src/services/motors/reconciliationService.ts';

function baseCanonical() {
  return {
    sellOut: { invoiced: 100, toInvoice: 25, total: 125 },
    transactions: [{ value: 100 }, { value: 25 }],
    stock: { physicalUnits: 30 },
    vendors: [{ total: 125 }],
    clients: [{ total: 125 }],
    networks: [{ total: 125 }],
    lines: [{ total: 125 }],
  } as any;
}

function baseUnified() {
  return {
    sources: [
      { sourceType: '8022' }, { sourceType: '105' }, { sourceType: '286' }, { sourceType: 'PCTABPR' },
      { sourceType: 'LISTA_PRECO_COLGATE' }, { sourceType: 'NOVOS_RCAS' }, { sourceType: 'BUSSOLA' },
      { sourceType: 'CARTEIRA_COLGATE' }, { sourceType: '310' }, { sourceType: '379' },
    ],
    qualityIssues: [],
    items: [
      { itemCanonicalId: 'WINTHOR:1', winthorCode: '1', hasWinthor: true, physicalStockUnits: 10, sourceKeys: { '105': '1', '286': '1', LISTA_PRECO: 'SKU1', PCTABPR: '11' } },
      { itemCanonicalId: 'WINTHOR:2', winthorCode: '2', hasWinthor: true, physicalStockUnits: 20, sourceKeys: { '105': '2', '286': '2', LISTA_PRECO: 'SKU2', PCTABPR: '11' } },
    ],
    salesFacts: [
      { value: 100, cnpj: '00000000000001', rcaCanonicalId: 'R1' },
      { value: 25, cnpj: '00000000000002', rcaCanonicalId: 'R1' },
    ],
    rcas: [{ rcaCanonicalId: 'R1', isColgate: true }],
    targets: [{ salesTarget: 500, assignmentStatus: 'RESOLVED' }, { salesTarget: 50, assignmentStatus: 'UNRESOLVED_RCA' }],
    inboundOrders: [{ orderQtyCases: 4, billQtyCases: 3, pipelineQtyCases: 7 }],
    historicalSalesFacts: [
      { movementClass: 'SALE', valueRaw: 100, signedValue: 100 },
      { movementClass: 'RETURN', valueRaw: 20, signedValue: -20 },
    ],
    historicalCustomerProduct: [{
      cnpj: '00000000000001', legacyProductCode: '11111111', netSalesValue: 80, returnValue: 20,
      netSignedUnits: 8, returnUnits: 2, purchaseInvoiceCount: 1,
    }],
  } as any;
}

const support = {
  purchases: [{
    cnpj: '00000000000001', legacyProductCode: '11111111', winthorCode: '11111111',
    netValue: 80, returnValue: 20, volumes: 8, returnVolume: 2, quantity: 1,
  }],
} as any;

test('auditoria materializa checks reais nos três níveis e fecha fotografia coerente', () => {
  const reconciliation = buildCanonicalReconciliation(baseCanonical(), baseUnified(), support);
  assert.ok(reconciliation.checks.some(check => check.level === 'INTERNAL'));
  assert.ok(reconciliation.checks.some(check => check.level === 'SOURCE'));
  assert.ok(reconciliation.checks.some(check => check.level === 'SPREADSHEET'));
  assert.equal(reconciliation.checks.find(check => check.id === 'INTERNAL_SELL_OUT_CLOSURE')?.status, 'OK');
  assert.equal(reconciliation.checks.find(check => check.id === 'INTERNAL_STOCK_PROJECTION')?.status, 'OK');
  assert.equal(reconciliation.checks.find(check => check.id === 'INTERNAL_TARGET_CLOSURE')?.status, 'OK');
  assert.equal(reconciliation.checks.find(check => check.id === 'INTERNAL_NETWORK_PROJECTION')?.status, 'OK');
  assert.equal(reconciliation.checks.find(check => check.id === 'INTERNAL_LINE_CLOSURE')?.status, 'OK');
  assert.equal(reconciliation.checks.find(check => check.id === 'INTERNAL_LINE_UNCLASSIFIED')?.status, 'OK');
  assert.equal(reconciliation.checks.find(check => check.id === 'SPREADSHEET_310_VOLUMES')?.status, 'OK');
});

test('pendência cadastral de fonte fica BLOQUEADA e não é apresentada como erro de fórmula', () => {
  const unified = baseUnified();
  unified.qualityIssues = [{ code: 'STOCK_105_CODE_NOT_IN_ITEM_MASTER' }, { code: 'TARGET_UNASSIGNED_RCA' }] as any;
  unified.targets = [{ salesTarget: 550, assignmentStatus: 'UNRESOLVED_RCA' }];
  const reconciliation = buildCanonicalReconciliation(baseCanonical(), unified, support);
  const stockIdentity = reconciliation.checks.find(check => check.id === 'SOURCE_105_286_IDENTITY');
  const targetIdentity = reconciliation.checks.find(check => check.id === 'SOURCE_TARGET_RCA_IDENTITY');
  assert.equal(stockIdentity?.calculated, 1);
  assert.equal(stockIdentity?.status, 'BLOCKED');
  assert.equal(targetIdentity?.status, 'BLOCKED');
});

test('regressão demonstrada do 310 fica DIVERGENTE quando fórmula não reconcilia', () => {
  const brokenSupport = { purchases: [{ ...support.purchases[0], volumes: 9, netValue: 81 }] } as any;
  const reconciliation = buildCanonicalReconciliation(baseCanonical(), baseUnified(), brokenSupport);
  assert.equal(reconciliation.checks.find(check => check.id === 'SPREADSHEET_310_VOLUMES')?.status, 'DIVERGENT');
  assert.equal(reconciliation.checks.find(check => check.id === 'SPREADSHEET_310_NET_VALUE')?.status, 'DIVERGENT');
});

test('regressão contra planilha sem 310/379 fica BLOQUEADA, nunca OK', () => {
  const unified = baseUnified();
  unified.sources = unified.sources.filter((source: any) => !['310', '379'].includes(source.sourceType));
  unified.historicalCustomerProduct = [];
  const reconciliation = buildCanonicalReconciliation(baseCanonical(), unified, { purchases: [] } as any);
  const spreadsheet = reconciliation.checks.filter(check => check.level === 'SPREADSHEET');
  assert.equal(spreadsheet.length, 5);
  assert.ok(spreadsheet.every(check => check.status === 'BLOCKED'));
});
