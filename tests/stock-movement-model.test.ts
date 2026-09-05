import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildStockSaleDocuments, stockSaleMatches, stockSaleSummary } from '../src/canonical/stockMovementModel.ts';
import type { CanonicalList } from '../src/canonical/types.ts';

const m3 = (records: Array<Record<string, unknown>>): CanonicalList => ({ id: 'M3_MOVIMENTO_VENDAS', records, sources: [], generatedAt: '', competence: '2026-09', snapshotDate: '2026-09-05', warnings: [], errors: [] });

test('saídas canônicas separam faturado, a faturar e devolução', () => {
  const documents = buildStockSaleDocuments(m3([
    { fact_type: 'SALE', source: '8022', fact_id: '1', order_status: 'FATURADO', invoice_number: '100', order_winthor: '5000', customer_name: 'Cliente A', winthor_product_code: '10', ean_product: '7891', product_description: 'Produto A', units: 10, cases: 1, value: 100 },
    { fact_type: 'SALE', source: '8022', fact_id: '2', order_status: 'A FATURAR', order_winthor: '5001', customer_name: 'Cliente B', winthor_product_code: '11', units: 20, cases: 2, value: 200 },
    { fact_type: 'SALE', source: '8022', fact_id: '3', order_status: 'FATURADO', invoice_number: '101', sale_type: 'DEVOLUÇÃO', customer_name: 'Cliente C', winthor_product_code: '12', units: 5, cases: 1, value: -50 },
  ]));
  assert.equal(documents.filter(row => row.kind === 'FATURADO' && !row.isReturn).length, 1);
  assert.equal(documents.filter(row => row.kind === 'A_FATURAR').length, 1);
  assert.equal(documents.filter(row => row.isReturn).length, 1);
  assert.equal(stockSaleSummary(documents.filter(row => row.isReturn)).value, 50);
});

test('pedido Winthor curto não é apresentado como pedido válido', () => {
  const [document] = buildStockSaleDocuments(m3([{ fact_type: 'SALE', source: '8022', fact_id: '1', order_status: 'FATURADO', invoice_number: '100', order_winthor: '1', value: 10 }]));
  assert.equal(document?.order, null);
});

test('busca de saídas encontra NF, pedido, cliente, EAN e código', () => {
  const [document] = buildStockSaleDocuments(m3([{ fact_type: 'SALE', source: '8022', fact_id: '1', order_status: 'FATURADO', invoice_number: '100', order_winthor: '5000', customer_name: 'Cliente A', cnpj: '12345678000190', winthor_product_code: '565', ean_product: '7890000000565', product_description: 'Creme Dental', value: 10 }]));
  assert.ok(document);
  for (const query of ['100', '5000', 'Cliente A', '12345678000190', '565', '7890000000565', 'Creme Dental']) assert.equal(stockSaleMatches(document!, query), true);
  assert.equal(stockSaleMatches(document!, '999'), false);
});

test('Entradas e Saídas trata erro de carga antes do estado de loading e usa o filtro correto na Carteira', () => {
  const page = fs.readFileSync(new URL('../src/pages/EntradasNotasPage.tsx', import.meta.url), 'utf8');
  assert.ok(page.indexOf('if (loadError)') < page.indexOf('if (!model)'));
  assert.match(page, /description=\{openQuery \|\| forecastFilter/);
  assert.doesNotMatch(page, /description=\{query \?/);
});

test('Auxiliar de Pedidos não permanece como placeholder operacional sem fórmula homologada', () => {
  const main = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const stockPage = fs.readFileSync(new URL('../src/pages/EstoquePage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /Auxiliar de Pedidos|purchase-helper/);
  assert.doesNotMatch(stockPage, /MigrationPage|purchase-helper/);
});
