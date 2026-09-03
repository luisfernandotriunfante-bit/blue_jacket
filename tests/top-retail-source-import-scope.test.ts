import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceImport = fs.readFileSync(new URL('../src/canonical/sourceImport.ts', import.meta.url), 'utf8');

test('Roteiro Top é materializado no M2 antes de salvar o build ativo', () => {
  assert.ok(sourceImport.includes('materializeTopRetailRouteInM2'));
  assert.ok(sourceImport.includes('bundle.lists.M2_CLIENTE_RCA = materializeTopRetailRouteInM2'));
  assert.ok(sourceImport.includes('browser-stage4-subbrand-composition-v6'));
});
