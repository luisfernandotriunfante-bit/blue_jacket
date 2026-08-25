import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/pages/EstoquePage.tsx', import.meta.url), 'utf8');

test('Visão Geral de Estoque recebe M1/M3/M4 e não aciona parser, motor ou arquivo original', () => {
  assert.ok(page.includes("loadCandidateList('M1_ITEM_ESTOQUE')"));
  assert.ok(page.includes("loadCandidateList('M3_MOVIMENTO_VENDAS')"));
  assert.ok(page.includes("loadCandidateList('M4_HISTORICO_TRANSICAO')"));
  assert.doesNotMatch(page, /parseSource|buildCanonicalBundleFromStaging|loadSourceStaging|FileReader|\.xlsx|\.xls|\.txt/);
});
