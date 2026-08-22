import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../src/domain/customerIntelligenceTypes.ts';
import { removeCustomerIntelligenceSource } from '../src/services/customerIntelligenceRepository.ts';

test('excluir 310 não apaga segmentação carregada por CUSTOMER_PROFILE', () => {
  const support = {
    ...EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT,
    sources: [
      { kind: 'PURCHASE_310', fileName: '310.txt', loadedAt: '', note: '' },
      { kind: 'CUSTOMER_PROFILE', fileName: 'clientes.xlsx', loadedAt: '', note: '' },
    ],
    customers: [{ cnpj: '04757459000519', cnpjRaw: '4757459000519', name: 'ABV', clientCode: '', network: 'REDE ABV', environment: 'H&S', profile: 'VAREJO', tier: 'FAIXA 1', assortmentChannel: 'Hiper', city: 'DOURADOS', state: 'MS', vendorCode: '', coordinatorCode: '', coordinatorName: '', source: 'Exportação PDVs' }],
    purchases: [{ cnpj: '04757459000519', cnpjRaw: '4757459000519', winthorCode: '11100001', description: 'P', volumes: 1, quantity: 1, purchaseValue: 10, returnVolume: 0, returnValue: 0, netValue: 10, vendorCode: '721', groupingCode: '2', groupingDescription: 'COLGATE' }],
  };
  const next = removeCustomerIntelligenceSource(support, 'PURCHASE_310');
  assert.equal(next.purchases.length, 0);
  assert.equal(next.customers.length, 1);
});
