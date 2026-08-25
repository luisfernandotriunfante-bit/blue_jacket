import test from 'node:test';
import assert from 'node:assert/strict';
import { createRcaResolver } from '../src/canonical/rcaResolver.ts';
import { buildCanonicalBundleFromStaging } from '../src/canonical/motors.ts';
import type { ParsedSource, RawTyped } from '../src/canonical/types.ts';

const rt = (value: unknown): RawTyped => ({ raw: value, typed: value });
const row = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, rt(value)]));
const source = (name: string, records: Array<Record<string, RawTyped>>): ParsedSource => ({ source: name, fileName: name, sheet: 'fixture', rows: records, audits: [] });

const rcaRows = [
  row({ current_rca_code_principal: '413', rca_name_raw_principal: 'Bruno de Souza Nunes', coordinator_code_principal: '10', coordinator_name_principal: 'Coord Bruno', legacy_rca_code_principal: '759', __source_row: 2 }),
  row({ current_rca_code_principal: '759', rca_name_raw_principal: 'Renata Atual', coordinator_code_principal: '11', coordinator_name_principal: 'Coord Renata', legacy_rca_code_principal: '759', __source_row: 3 }),
  row({ current_rca_code_principal: '1064', rca_name_raw_principal: 'Nilvania Leonel de Souza', coordinator_code_principal: '12', coordinator_name_principal: 'Coord Nilvania', legacy_rca_code_principal: '706', __source_row: 4 }),
];

const baseSources: ParsedSource[] = [
  source('NOVOS RCAS.xlsx', rcaRows),
  source('cadastro-itens-286.xls', []), source('posicao-estoque-105.xls', []), source('estoque-8013.xls', []), source('pctabpr 13.xlsx', []), source('Lista_de_Preco (8).xlsx', []), source('lançamentos.xlsx', []), source("Sortimento Recomendado - Q3'26.xlsx", []),
  source('Nova Base de Premissas - Q3.xlsx', [row({ customer_document_declared: '12345678000199', customer_name_premise: 'Cliente Teste' })]),
  source('relatorio_carteira_clientes.xls', [row({ customer_cnpj: '12345678000199', customer_name: 'Cliente Teste', representative_code: '413' })]),
  source("08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx", []),
  source('vendas-8022.xls', [
    row({ __source_row: 10, movement_date: '2026-08-25', customer_document: '12345678000199', seller_code: '759', sale_value: 100, order_status: 'FATURADO' }),
    row({ __source_row: 11, movement_date: '2026-08-25', customer_document: '12345678000199', seller_code: '413', sale_value: 50, order_status: 'FATURADO' }),
  ]),
  source('CARTEIRA 24.08.xlsx', []), source('entrada-notas-218.xls', []),
  source('Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx', [
    row({ __source_row: 20, pasta_type: 'MCD', industry_name: 'COLGATE', target_rca_code: '759', target_rca_name: 'Bruno de Souza Nunes', sales_target_pna: 1000, positivity_target: 10 }),
    row({ __source_row: 21, pasta_type: 'MCD', industry_name: 'COLGATE', target_rca_code: '706', target_rca_name: 'Nilvania Leonel de Souza', sales_target_pna: 2000, positivity_target: 20 }),
  ]),
  source('379 25.txt', [row({ __source_row: 30, movement_class: 'SALE', legacy_rca_code: '759', value_raw: 10 })]),
  source('379 26.txt', []),
  source('310 total 2026.txt', [row({ __source_row: 40, customer_document: '12345678000199', seller_code_legacy: '706', purchase_value: 100 })]),
  source('12.322.txt', []),
];

test('RCA resolver keeps current and legacy namespaces separate', () => {
  const resolver = createRcaResolver(baseSources);
  const current759 = resolver.resolveCurrent('759');
  assert.equal(current759.status, 'RESOLVED_CURRENT_CONTEXT');
  assert.equal(current759.canonicalId, 'RCA:759');
  assert.equal(current759.name, 'Renata Atual');

  const legacy759Bruno = resolver.resolveLegacy('759', 'Bruno de Souza Nunes');
  assert.equal(legacy759Bruno.status, 'RESOLVED_LEGACY_CONTEXT');
  assert.equal(legacy759Bruno.canonicalId, 'RCA:413');

  const legacy759WithoutContext = resolver.resolveLegacy('759');
  assert.equal(legacy759WithoutContext.status, 'AMBIGUOUS_RCA_CODE');
  assert.equal(legacy759WithoutContext.canonicalId, null);
});

test('M2, SALE, TARGET and historical facts use one canonical RCA resolver', () => {
  const bundle = buildCanonicalBundleFromStaging(baseSources);
  const m2 = bundle.lists.M2_CLIENTE_RCA.records[0];
  assert.equal(m2.rca_canonical_id, 'RCA:413');
  assert.equal(m2.rca_current_code, '413');
  assert.equal(m2.rca_name, 'Bruno de Souza Nunes');

  const sales = bundle.lists.M3_MOVIMENTO_VENDAS.records.filter(record => record.fact_type === 'SALE');
  assert.equal(sales[0].rca_canonical_id, 'RCA:759');
  assert.equal(sales[1].rca_canonical_id, 'RCA:413');

  const targets = bundle.lists.M3_MOVIMENTO_VENDAS.records.filter(record => record.fact_type === 'TARGET');
  assert.equal(targets[0].rca_canonical_id, 'RCA:413');
  assert.equal(targets[0].target_assignment_status, 'RESOLVED_LEGACY_CONTEXT');
  assert.equal(targets[1].rca_canonical_id, 'RCA:1064');

  const historical379 = bundle.lists.M4_HISTORICO_TRANSICAO.records.find(record => record.row_type === 'TRANSACTION_379');
  assert.equal(historical379?.rca_canonical_id, null);
  assert.equal(historical379?.audit_flags, 'AMBIGUOUS_RCA_CODE');

  const aggregate310 = bundle.lists.M4_HISTORICO_TRANSICAO.records.find(record => record.row_type === 'AGG_310');
  assert.equal(aggregate310?.seller_code_310, '706');
  assert.equal(aggregate310?.rca_canonical_id, 'RCA:1064');
});
