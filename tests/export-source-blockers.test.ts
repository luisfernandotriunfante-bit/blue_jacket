import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const generator = fs.readFileSync(new URL('../src/services/documentGenerator.ts', import.meta.url), 'utf8');

test('TOP REDES não fabrica dados da aba 319 enquanto os campos fonte permanecem indisponíveis', () => {
  assert.match(generator, /clearRows\('319',2,50000,1,19\)/);
  assert.doesNotMatch(generator, /patchCells\('319'/);
});

test('TOP REDES não sintetiza pedido\/setor na aba 12.326 a partir de CNPJ e RCA', () => {
  assert.match(generator, /clearRows\('12\.326',2,50000,1,22\)/);
  assert.doesNotMatch(generator, /patchCells\('12\.326'/);
  assert.doesNotMatch(generator, /const grouped = new Map/);
});

test('atingimento e gap total de rede na exportação consomem o resultado materializado do motor', () => {
  assert.match(generator, /values\[ref\('J',row\)\] = network\.gapToNetworkTarget/);
  assert.match(generator, /values\[ref\('K',row\)\] = network\.networkAttainment/);
  assert.match(generator, /values\[ref\('L',row\)\] = network\.topAttainment/);
});
