import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/ClientesSortimentoPage.tsx', import.meta.url), 'utf8');

test('Clientes & Sortimento mantém seleção múltipla de arquivos no mesmo upload', () => {
  assert.match(page, /type="file"[^>]*multiple/);
  assert.match(page, /Adicionar arquivos/);
  assert.match(page, /processCustomerIntelligenceFiles\(files, support\)/);
});
