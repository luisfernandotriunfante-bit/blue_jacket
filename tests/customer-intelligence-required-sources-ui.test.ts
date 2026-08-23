import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Configurações expõe as fontes necessárias de Clientes & Sortimento na ingestão global', () => {
  const config = fs.readFileSync(new URL('../src/pages/ConfiguracoesPage.tsx', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../src/pages/ClientesSortimentoUnifiedPage.tsx', import.meta.url), 'utf8');
  assert.match(config, /Sortimento Oficial/);
  assert.match(config, /310 total 2026/);
  assert.match(config, /Carteira de Clientes/);
  assert.match(config, /Base de Premissas/);
  assert.match(config, /type="file"[^>]*multiple/);
  assert.doesNotMatch(page, /Adicionar arquivos/);
});
