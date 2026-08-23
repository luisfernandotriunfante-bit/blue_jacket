import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/ClientesSortimentoUnifiedPage.tsx', import.meta.url), 'utf8');
const config = await readFile(new URL('../src/pages/ConfiguracoesPage.tsx', import.meta.url), 'utf8');

test('Clientes & Sortimento não possui upload próprio e as fontes entram por Configurações', () => {
  assert.doesNotMatch(page, /type="file"/);
  assert.doesNotMatch(page, /processCustomerIntelligenceFiles/);
  assert.match(page, /base canônica unificada/i);
  assert.match(config, /officialAssortment/);
  assert.match(config, /purchase310/);
  assert.match(config, /customerPortfolio/);
  assert.match(config, /multiple/);
  assert.match(config, /processUnifiedFiles/);
});
