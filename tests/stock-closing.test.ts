import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStockPresentation } from '../src/domain/stockModel.ts';
import type { CanonicalInventoryProduct } from '../src/domain/canonical.ts';

test('item da Carteira somente em caixas continua Sem Winthor sem inventar unidades', () => {
  const item = {
    code: 'EAN-7500000000001',
    description: 'Lançamento sem cadastro',
    ean: '7500000000001',
    quantity: 0,
    costUnit: 0,
    saleUnit: 0,
    pendingQty: 0,
    pendingCases: 2,
    pendingCost: 100,
    pendingSale: 140,
    isLaunch: true,
    hasWinthor: false,
    factoryCode: 'MAT-NOVO',
    physicalCases: 0,
    physicalUnits: 0,
    grossKg: 0,
    internalUnitsPerCase: null,
    industryUnitsPerCase: null,
    physicalSource105: false,
  } as CanonicalInventoryProduct;

  const result = buildStockPresentation({ inventory: [item], hasStock105: true });
  assert.equal(result.products[0].pendingUnits, 0);
  assert.equal(result.products[0].pendingCases, 2);
  assert.equal(result.summary.noWinthorCount, 1);
  assert.ok(result.products[0].alerts.some(alert => alert.kind === 'SEM_WINTHOR'));
});

test('Produtos usa a mesma coleção exibida para validar listas importadas', () => {
  const source = readFileSync(new URL('../src/pages/EstoquePage.tsx', import.meta.url), 'utf8');
  assert.match(source, /presentation\.products\.map\(item => \(\{ codigo: item\.code, factoryCode: item\.factoryCode, ean: item\.ean \}\)\)/);
  assert.match(source, /activeFilter === 'sem-winthor' && \(product\.hasWinthor \|\| !hasPendingPortfolio\(product\)\)/);
});

test('Lançamentos mantém hooks estáveis entre estado vazio e carregado', () => {
  const source = readFileSync(new URL('../src/pages/LancamentosPage.tsx', import.meta.url), 'utf8');
  const emptyState = source.indexOf('if (!canonical)');
  const lastMemo = source.indexOf('const totals = useMemo');
  assert.ok(lastMemo >= 0 && emptyState > lastMemo);
  assert.match(source, /hasPendingPortfolio\(product\)/);
  assert.match(source, /Cobertura ritmo faturado/);
});
