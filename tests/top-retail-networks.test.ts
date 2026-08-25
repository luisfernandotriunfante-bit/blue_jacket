import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopRetailNetworksViewModel } from '../src/canonical/topRetailNetworksModel.ts';

const base = { sources: [], generatedAt: '2026-08-25T00:00:00Z', competence: '2026-08', snapshotDate: '2026-08-25', warnings: [], errors: [] };
const m2 = { ...base, id: 'M2_CLIENTE_RCA' as const, records: [
  { cnpj: '00111111000100', top_network: 'REDE A', manager_cnpj: '00111111000100', top_group_code: 'GRUPO A', top_target: 500, premise_network: 'OUTRA TAXONOMIA' },
  { cnpj: '00222222000100', top_network: 'Rede A', manager_cnpj: '00111111000100', top_group_code: 'GRUPO A', top_target: 300 },
  { cnpj: '00333333000100', premise_network: 'REDE FORA DO ROTEIRO' },
] };
const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [
  { fact_type: 'SALE', cnpj: '00111111000100', value: 100, order_status: 'FATURADO' },
  { fact_type: 'SALE', cnpj: '00333333000100', value: 300, order_status: 'FATURADO' },
  { fact_type: 'TARGET', sales_target: 1200 },
  { fact_type: 'TARGET', sales_target: 800 },
] };

test('Redes usa somente CNPJs do Roteiro Ativo e agrupa pelo gestor, não pelo texto da rede', () => {
  const view = buildTopRetailNetworksViewModel({ m2, m3, sellOutTarget: 1000, networkTargetTotal: 300, generatedAt: '2026-08-25T12:00:00Z' });
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]?.network, 'REDE A');
  assert.equal(view.rows[0]?.managerCnpj, '00111111000100');
  assert.equal(view.rows[0]?.customers, 2);
  assert.equal(view.rows[0]?.customersWithSales, 1);
  assert.equal(view.rows[0]?.topTarget, 800);
  assert.equal(view.rows[0]?.realized, 100);
  assert.equal(view.totals.overallSellOut, 400);
  assert.equal(view.rows[0]?.share, 0.25);
});

test('Meta da rede preserva Meta Redes Geral e usa representatividade do Roteiro referenciada por Meta T&C / Meta Indústria', () => {
  const multiM2 = { ...m2, records: [
    { cnpj: '00111111000100', top_network: 'REDE A', manager_cnpj: '00111111000100', top_group_code: 'GRUPO A', top_target: 500 },
    { cnpj: '00222222000100', top_network: 'REDE B', manager_cnpj: '00222222000100', top_group_code: 'GRUPO B', top_target: 300 },
  ] };
  const view = buildTopRetailNetworksViewModel({ m2: multiM2, m3, sellOutTarget: 1000, networkTargetTotal: 400, generatedAt: '2026-08-25T12:00:00Z' });
  const a = view.rows.find(row => row.network === 'REDE A')!;
  const b = view.rows.find(row => row.network === 'REDE B')!;
  assert.equal(view.totals.industryTarget, 2000);
  assert.equal(a.tcReferenceTarget, 250);
  assert.equal(b.tcReferenceTarget, 150);
  assert.equal(a.networkTarget, 250);
  assert.equal(b.networkTarget, 150);
  assert.equal(view.totals.networkTarget, 400);
  assert.equal(a.targetWeight, 0.625);
  assert.equal(b.targetWeight, 0.375);
});

test('Meta Top Varejista e seus atingimentos permanecem separados da Meta Redes', () => {
  const view = buildTopRetailNetworksViewModel({ m2, m3, sellOutTarget: 1000, networkTargetTotal: 300, generatedAt: '2026-08-25T12:00:00Z' });
  const row = view.rows[0]!;
  assert.equal(row.topTarget, 800);
  assert.equal(row.networkTarget, 300);
  assert.equal(row.achievement, 100 / 300);
  assert.equal(row.topAchievement, 100 / 800);
  assert.equal(view.totals.gap, 200);
});

test('duas grafias de Gauchão com o mesmo CNPJ gestor viram um único grupo e somam metas e vendas', () => {
  const gauchaoM2 = { ...base, id: 'M2_CLIENTE_RCA' as const, records: [
    { cnpj: '35831943000140', top_network: 'GAUCHÃO', manager_cnpj: '35831943000140', top_group_code: 'GAUCHAO', top_target: 50039 },
    { cnpj: '35831943000302', top_network: 'GAUCHÃO', manager_cnpj: '35831943000140', top_group_code: 'GAUCHAO', top_target: 0 },
    { cnpj: '35831943000221', top_network: 'Gauchão', manager_cnpj: '35831943000140', top_group_code: 'GAUCHAO', top_target: 0 },
  ] };
  const gauchaoM3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [
    { fact_type: 'SALE', cnpj: '35831943000302', value: 31666.36, order_status: 'FATURADO' },
    { fact_type: 'SALE', cnpj: '35831943000221', value: 17813.87, order_status: 'A FATURAR' },
    { fact_type: 'TARGET', sales_target: 5000000 },
  ] };
  const view = buildTopRetailNetworksViewModel({ m2: gauchaoM2, m3: gauchaoM3, sellOutTarget: 4850000, networkTargetTotal: 2500000 });
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]?.network, 'GAUCHÃO');
  assert.equal(view.rows[0]?.customers, 3);
  assert.equal(view.rows[0]?.topTarget, 50039);
  assert.equal(view.rows[0]?.realized, 49480.23);
});
