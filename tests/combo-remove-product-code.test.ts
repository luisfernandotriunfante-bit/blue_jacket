import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync(new URL('../src/ui/stock/StockCodeListFilter.tsx', import.meta.url), 'utf8');

test('criação de combo permite excluir um código individual sem limpar a lista inteira', () => {
  assert.match(component, /const removeCode = \(code: string\)/);
  assert.match(component, /next\.delete\(code\)/);
  assert.match(component, /onClick=\{\(\) => removeCode\(code\)\}/);
  assert.match(component, />Excluir<\/button>/);
});

test('lista individual mostra inclusive código importado não encontrado para poder corrigi-lo', () => {
  assert.match(component, /NÃO ENCONTRADO/);
  assert.match(component, /Array\.from\(codes\)\.map\(code =>/);
});
