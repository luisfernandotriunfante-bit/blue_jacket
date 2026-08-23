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

test('motor unificado recebe 105, lançamentos, PCTABPR e Bússola diretamente', () => {
  const source = read('src/services/motors/unifiedEngine.ts');
  assert.match(source, /runItemMotor\s*\(/);
  assert.match(source, /stock105Rows\s*:\s*await\s+rows\(is105\)/);
  assert.match(source, /launchRows\s*:\s*await\s+rows\(isLaunchList\)/);
  assert.match(source, /pctabprWorkbook\s*:\s*await\s+workbook\(isPctabpr\)/);
  assert.match(source, /runSalesMotor\s*\(/);
  assert.match(source, /compassWorkbook\s*:\s*await\s+workbook\(isCompass\)/);
  assert.doesNotMatch(source, /processCanonicalFiles/);
  assert.doesNotMatch(source, /inventory\s*:\s*base\.inventory/);
  assert.doesNotMatch(source, /sales\s*:\s*base\.transactions/);
  assert.doesNotMatch(source, /support\s*:\s*base\.support/);
});
