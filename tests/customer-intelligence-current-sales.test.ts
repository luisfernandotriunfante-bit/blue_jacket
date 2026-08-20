import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerIntelligence } from '../src/domain/customerIntelligence.ts';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../src/domain/customerIntelligenceTypes.ts';

const cnpj = '04594132000140';

function product(ean: string, winthorCode: string, description: string, launchLabel = '') {
  return { ean, colgateSku: '', winthorCode, description, categoryMaster: '', category: '', subcategory: '', brand: '', subbrand: '', segment: '', subsegment: '', contents: '', amount: '', promoPack: '', launchLabel, lifecycleStatus: launchLabel || 'ATIVO', recommendations: [{ channel: 'Hiper', value: 1 }], sourceSheet: 'oficial' };
}

function support(products: any[], extra: any = {}) {
  return {
    ...EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT,
    assortmentCompetences: [{ key: '2026-08_09', label: 'Agosto/Setembro/26', validFrom: '2026-08-01', validTo: '2026-09-30', sourceSheet: 'oficial', products, expectedTotalsByChannel: { Hiper: { total: products.length, mandatory: products.length, important: 0 } } }],
    customers: [{ cnpj, cnpjRaw: cnpj, name: 'CLIENTE', clientCode: '', network: '', environment: 'H&S', profile: 'VAREJO', tier: 'FAIXA 1', assortmentChannel: 'Hiper', city: '', state: '', vendorCode: '', coordinatorCode: '', coordinatorName: '', source: 'TESTE' }],
    ...extra,
  };
}

function state(inventory: any[], transactions: any[], itemCodes: any[]) {
  return {
    referenceDate: '2026-08-17', sources: [], inventory, transactions,
    support: { products: [], itemCodes, clients: [], activeRoute: [], rcas: [], vendorTargets: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {} },
    clients: [], vendors: [], sellOut: { businessDaysElapsed: 10 }, stock: { costValue: 0, saleValue: 0 },
  } as any;
}

test('venda detalhada no 8022 confirma adoção mesmo antes de aparecer no 310 consolidado', () => {
  const ean = '7891000000011'; const winthor = '11100001';
  const result = buildCustomerIntelligence(
    state([{ code: winthor, description: 'Lançamento', ean, quantity: 24, costUnit: 1, saleUnit: 2, pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: false, hasWinthor: true, factoryCode: '', physicalCases: 0, physicalUnits: 0, grossKg: 0 }],
      [{ date: '2026-08-17', status: 'FATURADO', clientCode: '1', clientName: 'CLIENTE', cnpj, city: '', vendorCode: '1', vendorName: '', supervisorCode: '', supervisorName: '', manufacturerCode: '', ean, internalProductCode: winthor, productDescription: 'Lançamento', cases: 1, units: 12, value: 100, saleType: 'VENDA', line: '' }],
      [{ internalCode: winthor, description: 'Lançamento', ean, factoryCode: '' }]),
    support([product(ean, winthor, 'Lançamento', 'Lançamento Q3')]), cnpj, '2026-08-17');
  const item = result.products.find(entry => entry.ean === ean)!;
  assert.equal(item.bought, true);
  assert.equal(item.currentPeriodValue, 100);
  assert.equal(result.launches.adopted, 1);
  assert.equal(result.launches.missing, 0);
  assert.equal(result.opportunities.some(entry => entry.ean === ean), false);
});

test('SKU antigo em migração não duplica o denominador com o SKU sucessor vigente', () => {
  const oldEan = '7891000099992'; const newEan = '7891000099985';
  const oldWinthor = '11109999'; const newWinthor = '11109998';
  const result = buildCustomerIntelligence(
    state([{ code: newWinthor, description: 'Novo', ean: newEan, quantity: 12, costUnit: 1, saleUnit: 2, pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: false, hasWinthor: true, factoryCode: '', physicalCases: 0, physicalUnits: 0, grossKg: 0 }], [], [
      { internalCode: oldWinthor, description: 'Antigo', ean: oldEan, factoryCode: '' },
      { internalCode: newWinthor, description: 'Novo', ean: newEan, factoryCode: '' },
    ]),
    support([product(newEan, newWinthor, 'Novo')], {
      lineage: [{ oldSku: oldWinthor, oldEan, newSku: newWinthor, newEan, description: 'Troca', status: 'MIGRACAO_VIGENTE', effectiveFrom: '2026-08-01', sourceSheet: 'Hair' }],
      purchases: [{ cnpj, cnpjRaw: cnpj, winthorCode: oldWinthor, description: 'Antigo', volumes: 1, quantity: 1, purchaseValue: 50, returnVolume: 0, returnValue: 0, netValue: 50, vendorCode: '', groupingCode: '', groupingDescription: '' }],
    }), cnpj, '2026-08-17');
  assert.equal(result.officialAssortment, 1);
  assert.equal(result.products.filter(entry => entry.isRecommended).length, 1);
  const oldRow = result.products.find(entry => entry.ean === oldEan)!;
  const newRow = result.products.find(entry => entry.ean === newEan)!;
  assert.equal(oldRow.classification, 'FORA_DO_SORTIMENTO');
  assert.equal(oldRow.lineageStatus, 'MIGRACAO_VIGENTE');
  assert.equal(newRow.opportunityPriority, 'MIGRACAO');
  assert.equal(newRow.bought, false);
  assert.equal(result.boughtOutsideProducts.some(entry => entry.ean === oldEan), true);
});
