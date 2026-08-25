import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/pages/SellOutPage.tsx', import.meta.url), 'utf8');
const dailyWindow = fs.readFileSync(new URL('../src/ui/charts/DailyMovementWindow.tsx', import.meta.url), 'utf8');

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
  assert.equal(page.includes('PanelAlert tone="success"'), false);
});

test('Resumo usa cards modernos na ordem operacional definida', () => {
  const labels = ['Meta T&C', 'Sell Out', 'Faturado', 'Meta positivação', 'Positivado', 'Pos. faturada'];
  let previous = -1;
  for (const label of labels) {
    const index = page.indexOf(`label="${label}"`);
    assert.ok(index > previous, `${label} deve aparecer na ordem definida`);
    previous = index;
  }
  assert.ok(page.includes('className="sellout-metric-grid"'));
  assert.equal(page.includes('sellout-kpi-strip'), false);
});

test('Resumo recebe série e totais prontos do dashboard model', () => {
  assert.ok(page.includes('buildSellOutDashboardModel'));
  assert.ok(page.includes('<Summary dashboard={dashboard} />'));
  assert.ok(dailyWindow.includes('Sell Out acumulado'));
  assert.ok(dailyWindow.includes('Positivados acumulados'));
  assert.ok(dailyWindow.includes('Pos. faturada'));
  assert.equal(dailyWindow.includes('visible.reduce'), false);
});

test('Leitura por linhas usa o mesmo padrão de cards do topo', () => {
  assert.ok(page.includes('className="sellout-line-grid"'));
  assert.ok(page.includes('dashboard.lineRows.map'));
});
