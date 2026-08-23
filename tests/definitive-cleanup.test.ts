import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('design system possui uma única família de tokens e navegação touch explícita', () => {
  const tokens = read('src/ui/theme/tokens.css');
  const foundation = read('src/ui/theme/foundation.css');
  const panel = read('src/ui/pattern/PanelVisual.tsx');
  const main = read('src/main.tsx');
  assert.equal(tokens.includes('--bj-'), false);
  assert.equal(existsSync('src/ui/primitives/GlassSurface.tsx'), false);
  assert.equal(panel.includes('RED_SELL_OUT_KPIS'), false);
  assert.match(main, /bj-sidebar-trigger/);
  assert.match(foundation, /@media \(hover: hover\)/);
  assert.match(foundation, /:focus-visible/);
});

test('fontes e contratos substituídos não podem voltar ao runtime', () => {
  const config = read('src/pages/ConfiguracoesPage.tsx');
  const unified = read('src/services/motors/unifiedEngine.ts');
  const canonical = read('src/domain/canonical.ts');
  assert.equal(config.includes('legacyTopNetworks'), false);
  assert.equal(config.includes('TOP REDES · Referência legada'), false);
  assert.equal(unified.includes('LEGACY_TOP_NETWORKS'), false);
  assert.equal(unified.includes('legacyReference'), false);
  assert.equal(unified.includes('parseLegacyNetwork'), false);
  assert.equal(canonical.includes('legacyNetworkTargets'), false);
  assert.equal(canonical.includes('legacyNetworkOwners'), false);
  assert.equal(canonical.includes('legacyClientNetworks'), false);
  assert.equal(canonical.includes('legacyClientOwners'), false);
  assert.equal(canonical.includes('detectedNetworkTarget'), false);
});

test('páginas operacionais consomem apenas canonical', () => {
  const sellOut = read('src/pages/SellOutPage.tsx');
  const stock = read('src/pages/EstoquePage.tsx');
  const launches = read('src/pages/LancamentosPage.tsx');
  const combo = read('src/pages/CriacaoComboPage.tsx');
  const dataContext = read('src/store/DataContext.tsx');
  assert.match(sellOut, /const \{ canonical \} = useData\(\)/);
  assert.equal(sellOut.includes('sellOut } = useData'), false);
  assert.equal(stock.includes('produtos'), false);
  assert.equal(stock.includes('metricas'), false);
  assert.equal(launches.includes('produtos'), false);
  assert.equal(launches.includes('metricas'), false);
  assert.equal(combo.includes('buildComboPortfolioLookup'), false);
  assert.equal(combo.includes('importClientPortfolio'), false);
  assert.match(combo, /PVENDA1/);
  assert.equal(dataContext.includes('bj_produtos'), false);
  assert.equal(dataContext.includes('bj_metricas'), false);
  assert.equal(dataContext.includes('bj_sellout'), false);
  assert.equal(dataContext.includes('applyOperationalOverrides'), false);
  assert.equal(dataContext.includes('applyReceiptReconciliation'), false);
});

test('arquivos e templates substituídos foram removidos', () => {
  assert.equal(existsSync('src/pages/ClientesSortimentoPage.tsx'), false);
  assert.equal(existsSync('src/services/legacyStockReport.ts'), false);
  assert.equal(existsSync('src/services/legacyStockReportSummary.ts'), false);
  assert.equal(existsSync('src/services/legacyStockReference.ts'), false);
  assert.equal(existsSync('scripts/prepare-top-redes-template.mjs'), false);
  assert.equal(existsSync('public/templates/top-redes-padrao.xlsx'), false);
  const pkg = read('package.json');
  assert.equal(pkg.includes('prepare-top-redes-template'), false);
});

test('exports atuais nascem da base canônica', () => {
  const docs = read('src/pages/DocumentosPage.tsx');
  const stockWorkbook = read('src/services/stockWorkbook.ts');
  const networkWorkbook = read('src/services/networkWorkbook.ts');
  assert.match(docs, /downloadCanonicalStockWorkbook/);
  assert.match(docs, /downloadCanonicalNetworkWorkbook/);
  assert.match(stockWorkbook, /state\.inventory/);
  assert.match(networkWorkbook, /state\.networks/);
  assert.equal(docs.includes('padrão antigo'), false);
});
