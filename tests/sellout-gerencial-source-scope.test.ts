import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/pages/SellOutPage.tsx', import.meta.url), 'utf8');

test('Gerencial não lê fontes originais nem aciona parser/motor', () => {
  assert.doesNotMatch(page, /parseSource|buildCanonicalBundleFromStaging|loadSourceStaging|FileReader|\.xlsx|\.xls/);
  assert.ok(page.includes("loadCandidateList('M2_CLIENTE_RCA')"));
  assert.ok(page.includes("loadCandidateList('M3_MOVIMENTO_VENDAS')"));
  assert.ok(page.includes('model.vendorRows'));
});
