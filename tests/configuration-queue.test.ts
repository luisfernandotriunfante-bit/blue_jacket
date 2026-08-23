import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Configurações substitui arquivo da mesma fonte e permite limpar a fila',()=>{
  const page=readFileSync('src/pages/ConfiguracoesPage.tsx','utf8');
  assert.match(page,/existingSourceId !== sourceId/);
  assert.match(page,/const clearQueue/);
  assert.match(page,/Limpar fila/);
});
