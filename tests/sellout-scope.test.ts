import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/pages/SellOutPage.tsx', import.meta.url), 'utf8');

test('Sell Out não renderiza bloco de estoque', () => {
  assert.equal(page.includes('Posição física canônica'), false);
  assert.equal(page.includes('eyebrow="ESTOQUE"'), false);
});

test('exportações do Sell Out permanecem junto ao movimento', () => {
  const movementIndex = page.indexOf('eyebrow="MOVIMENTO"');
  const excelIndex = page.indexOf('exportSellOutExcel(model)');
  const jsonIndex = page.indexOf('exportSellOutJson(model)');
  assert.ok(movementIndex >= 0);
  assert.ok(excelIndex > movementIndex);
  assert.ok(jsonIndex > movementIndex);
});

test('Sell Out não expõe identificador técnico do build no cabeçalho', () => {
  assert.equal(page.includes('metricLabel="Build canônico"'), false);
  assert.equal(page.includes('BUILD ATIVO:'), false);
  assert.equal(page.includes('stagingManifestHash:'), false);
});

test('Resumo usa faixa compacta própria para os KPIs', () => {
  assert.ok(page.includes('className="panel-grid sellout-kpi-strip"'));
});
