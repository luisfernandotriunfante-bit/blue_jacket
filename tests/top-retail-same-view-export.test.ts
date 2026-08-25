import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/pages/TopRetailNetworksPage.tsx', import.meta.url), 'utf8');

test('tela e exportações recebem o mesmo modelo Top Varejistas', () => {
  assert.ok(page.includes('const model = { ...built'));
  assert.ok(page.includes('exportTopNetworksExcel(model)'));
  assert.ok(page.includes('exportTopNetworksJson(model)'));
  assert.ok(page.includes('model.rows.map'));
});
