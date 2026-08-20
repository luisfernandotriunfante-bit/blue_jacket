import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/pages/CriacaoComboPage.tsx', import.meta.url), 'utf8');
const filter = fs.readFileSync(new URL('../src/ui/stock/StockCodeListFilter.tsx', import.meta.url), 'utf8');

test('criação de combo exclui produto diretamente na própria linha da tabela', () => {
  assert.match(page, /onClick=\{\(\) => removeProduct\(product\)\}/);
  assert.match(page, /aria-label=\{`Excluir item \$\{product\.codigo\}`\}/);
  assert.match(page, /<th className="is-right">Ações<\/th>/);
});

test('código importado não encontrado fica na mesma tabela e também pode ser excluído', () => {
  assert.match(page, /unmatchedCodes\.map\(code =>/);
  assert.match(page, /Item não encontrado/);
  assert.match(page, /onClick=\{\(\) => removeSelectedCode\(code\)\}/);
});

test('filtro de entrada não cria uma segunda lista visual de códigos', () => {
  assert.doesNotMatch(filter, /Array\.from\(codes\)\.map\(code =>/);
  assert.doesNotMatch(filter, /aria-label=\{`Excluir código \$\{code\}`\}/);
});
