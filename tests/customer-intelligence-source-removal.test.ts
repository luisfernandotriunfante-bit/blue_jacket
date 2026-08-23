import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../src/domain/customerIntelligenceTypes.ts';
import { removeCustomerIntelligenceSource } from '../src/services/customerIntelligenceRepository.ts';

function supportFixture() {
  return {
    ...EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT,
    updatedAt: '2026-08-21T00:00:00.000Z',
    sources: [
      { kind: 'OFFICIAL_ASSORTMENT', fileName: 'sortimento.xlsx', loadedAt: '2026-08-21T00:00:00.000Z', note: 'oficial' },
      { kind: 'PURCHASE_310', fileName: '310.xlsx', loadedAt: '2026-08-21T00:00:00.000Z', note: 'compras' },
      { kind: 'UNKNOWN:$SOM DIARIO.xlsx', fileName: '$SOM DIARIO.xlsx', loadedAt: '2026-08-21T00:00:00.000Z', note: 'não reconhecido' },
      { kind: 'UNKNOWN:379 25.txt', fileName: '379 25.txt', loadedAt: '2026-08-21T00:00:00.000Z', note: 'não reconhecido' },
    ],
    assortmentCompetences: [{ key: '2026-08_09' } as any],
    lineage: [{ oldEan: '1' } as any],
    customers: [{ cnpj: '00123456000199' } as any],
    purchases: [{ cnpj: '00123456000199', winthorCode: '11100001' } as any],
    promotions: [
      { id: 'p1', source: '$SOM DIARIO.xlsx' } as any,
      { id: 'p2', source: 'outra-fonte.xlsx' } as any,
    ],
    pricingRules: [
      { id: 'r1', source: '$SOM DIARIO.xlsx' } as any,
      { id: 'r2', source: 'outra-fonte.xlsx' } as any,
    ],
    warnings: [
      '$SOM DIARIO.xlsx: fonte não reconhecida; nenhum dado foi aplicado.',
      '379 25.txt: fonte não reconhecida; nenhum dado foi aplicado.',
      'Aviso independente.',
    ],
  };
}

test('função de migração remove somente a fonte UNKNOWN solicitada', () => {
  const original = supportFixture();
  const next = removeCustomerIntelligenceSource(original, 'UNKNOWN:$SOM DIARIO.xlsx');
  assert.equal(next.sources.some(source => source.kind === 'UNKNOWN:$SOM DIARIO.xlsx'), false);
  assert.equal(next.sources.some(source => source.kind === 'UNKNOWN:379 25.txt'), true);
  assert.equal(next.sources.some(source => source.kind === 'OFFICIAL_ASSORTMENT'), true);
  assert.equal(next.assortmentCompetences.length, 1);
  assert.equal(next.purchases.length, 1);
  assert.equal(next.promotions.some(rule => rule.id === 'p1'), false);
  assert.equal(next.promotions.some(rule => rule.id === 'p2'), true);
});

test('função de migração da base 310 não toca no Sortimento Oficial', () => {
  const next = removeCustomerIntelligenceSource(supportFixture(), 'PURCHASE_310');
  assert.deepEqual(next.customers, []);
  assert.deepEqual(next.purchases, []);
  assert.equal(next.assortmentCompetences.length, 1);
  assert.equal(next.lineage.length, 1);
});

test('função de migração do Sortimento Oficial limpa somente sortimento e linhagem', () => {
  const next = removeCustomerIntelligenceSource(supportFixture(), 'OFFICIAL_ASSORTMENT');
  assert.deepEqual(next.assortmentCompetences, []);
  assert.deepEqual(next.lineage, []);
  assert.equal(next.customers.length, 1);
  assert.equal(next.purchases.length, 1);
});

test('fonte inexistente não altera o estado', () => {
  const original = supportFixture();
  assert.equal(removeCustomerIntelligenceSource(original, 'INEXISTENTE'), original);
});

test('UI ativa não permite exclusão ou persistência paralela de fontes', () => {
  const page = readFileSync('src/pages/ClientesSortimentoUnifiedPage.tsx', 'utf8');
  const repository = readFileSync('src/services/customerIntelligenceRepository.ts', 'utf8');
  assert.doesNotMatch(page, /deleteCustomerIntelligenceSource/);
  assert.doesNotMatch(page, /saveCustomerIntelligenceSupport/);
  assert.doesNotMatch(page, /window\.confirm\(`Excluir a base/);
  assert.match(repository, /alimentado exclusivamente em Configurações pela base canônica unificada/);
});
