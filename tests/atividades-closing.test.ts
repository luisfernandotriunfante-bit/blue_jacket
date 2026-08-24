import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { buildComboWorkbook } from '../src/services/comboWorkbook';

const page = () => readFileSync('src/pages/CriacaoComboPage.tsx', 'utf8');
const filter = () => readFileSync('src/ui/stock/StockCodeListFilter.tsx', 'utf8');
const main = () => readFileSync('src/main.tsx', 'utf8');
const calculation = () => readFileSync('src/services/motors/calculationService.ts', 'utf8');

test('Atividades possui uma única tela funcional: Criação de Combo', () => {
  const source = main();
  const start = source.indexOf('const atividadesTopTabs');
  const end = source.indexOf('const clientesTopTabs');
  const tabs = source.slice(start, end);
  assert.match(tabs, /Criação de Combo/);
  assert.equal((tabs.match(/\{ id:/g) || []).length, 1);
  assert.match(source, /activeTab === 'atividades' && activeAtividadesTopTab === 'combo' \? <CriacaoComboPage \/>/);
});

test('Combo usa PVENDA1 canônico e não o preço de venda do 105', () => {
  const pageSource = page();
  const calculationSource = calculation();
  assert.match(pageSource, /PVENDA1 canônico da PCTABPR \(Região 11\)/);
  assert.match(calculationSource, /saleUnit: item\.salePricePvenDa1 \?\? 0/);
  assert.doesNotMatch(pageSource, /P\.Venda do 105|preço válido do 105/i);
});

test('produto conhecido sem Winthor ou PVENDA1 fica bloqueado e impede exportação parcial silenciosa', () => {
  const source = page();
  assert.match(source, /SEM WINTHOR/);
  assert.match(source, /SEM PVENDA1 REGIÃO 11/);
  assert.match(source, /const unresolvedProductCount = blockedSelections\.length \+ unmatchedCodes\.length/);
  assert.match(source, /unresolvedProductCount === 0/);
  assert.match(source, /Um item selecionado sem Winthor, sem PVENDA1 ou não localizado bloqueia o Excel/);
  assert.match(source, /Item não encontrado/);
});

test('importação inválida de produtos preserva seleção atual e importação adicional soma itens no combo', () => {
  const source = filter();
  const start = source.indexOf('const importFile');
  const end = source.indexOf('const addManualCode');
  const importSource = source.slice(start, end);
  assert.doesNotMatch(importSource, /onChange\(new Set\(\)\)/);
  assert.match(importSource, /A seleção atual foi preservada/);
  assert.match(importSource, /onChange\(allowManual \? new Set\(\[\.\.\.codes, \.\.\.imported\]\) : imported\)/);
});

test('workbook não fabrica preço praticado ou desconto zero quando o dado está ausente', () => {
  const workbook = buildComboWorkbook([
    { codigo: '100', descricao: 'Produto sem preço praticado', tablePrice: 10, practicedPrice: null },
  ], [], {
    includeClients: false,
    includeTablePrice: true,
    includePracticedPrice: true,
    includeDiscount: true,
  });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Produtos, { header: 1, raw: true, defval: '' }) as unknown[][];
  assert.deepEqual(rows[1], ['100', 'Produto sem preço praticado', 10, '', '']);
});

test('Customer Master permanece autoridade e divergência com 8022 fica visível', () => {
  const source = page();
  assert.match(source, /const automaticCode = masterCode \|\| \(observedCodes\.length === 1 \? observedCodes\[0\] : ''\)/);
  assert.match(source, /CUSTOMER MASTER · DIVERGE 8022/);
  assert.match(source, /Customer Master: \{client\.masterCode \|\| '—'\} · 8022 observado:/);
  assert.match(source, /CONFLITO 8022/);
});

test('cliente sem código Winthor continua não bloqueando o Excel', () => {
  const source = page();
  assert.match(source, /const clientsReady = !exportOptions\.includeClients \|\| selectedClients\.length > 0/);
  assert.doesNotMatch(source, /clientsReady = [^;]*unresolvedClientCount === 0/);
  assert.match(source, /O Excel será gerado normalmente e esses códigos ficarão em branco/);
});
