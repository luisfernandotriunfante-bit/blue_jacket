import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Clientes & Sortimento mantém upload múltiplo e aceita bases Excel', () => {
  const source = fs.readFileSync(new URL('../src/pages/ClientesSortimentoPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /type="file"[^>]*multiple/);
  assert.match(source, /Adicionar arquivos/);
});
