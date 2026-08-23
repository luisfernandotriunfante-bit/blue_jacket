import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('Configurações possui um único orquestrador canônico e não reaplica overlays antigos', () => {
  const source = read('src/pages/ConfiguracoesPage.tsx');
  assert.match(source, /processUnifiedFiles/);
  assert.doesNotMatch(source, /processCanonicalFiles/);
  assert.doesNotMatch(source, /applyOperationalOverrides/);
  assert.doesNotMatch(source, /applyReceiptReconciliation/);
});

test('rota ativa de Clientes & Sortimento é consumidora da base unificada e não possui uploader próprio', () => {
  const main = read('src/main.tsx');
  const page = read('src/pages/ClientesSortimentoUnifiedPage.tsx');
  assert.match(main, /ClientesSortimentoUnifiedPage/);
  assert.doesNotMatch(main, /\.\/pages\/ClientesSortimentoPage['"]/);
  assert.match(page, /customerIntelligenceFromUnified/);
  assert.doesNotMatch(page, /processCustomerIntelligenceFiles/);
  assert.doesNotMatch(page, /saveCustomerIntelligenceSupport/);
  assert.doesNotMatch(page, /SourceUploader/);
});

test('serviço de cálculo não usa base.inventory como fallback de negócio', () => {
  const source = read('src/services/motors/calculationService.ts');
  assert.doesNotMatch(source, /base\.inventory/);
  assert.match(source, /buildInventoryFromUnified/);
  assert.match(source, /costUnit:item\.costUnit105/);
  assert.match(source, /saleUnit:item\.salePricePvenDa1/);
});

test('motor unificado recebe 105, lançamentos e Bússola diretamente', () => {
  const source = read('src/services/motors/unifiedEngine.ts');
  assert.match(source, /stock105Rows:await rows\(is105\)/);
  assert.match(source, /launchRows:await rows\(isLaunchList\)/);
  assert.match(source, /compassWorkbook:await workbook\(isCompass\)/);
  assert.doesNotMatch(source, /inventory:base\.inventory/);
  assert.doesNotMatch(source, /sales:base\.transactions/);
  assert.doesNotMatch(source, /support:base\.support/);
});
