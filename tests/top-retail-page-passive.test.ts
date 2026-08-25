import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/pages/TopRetailNetworksPage.tsx', import.meta.url), 'utf8');

test('aba Redes recebe percentuais prontos do view-model e não recalcula cards na página', () => {
  assert.ok(page.includes('model.progress'));
  assert.doesNotMatch(page, /model\.totals\.realized\s*\/\s*model\.totals\.networkTarget/);
  assert.doesNotMatch(page, /model\.totals\.customersWithSales\s*\/\s*model\.totals\.customers/);
  assert.doesNotMatch(page, /model\.totals\.realized\s*\/\s*model\.totals\.overallSellOut/);
});
