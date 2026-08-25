import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSellOutViewModel, buildTopNetworksViewModel } from '../src/canonical/operationalViewModels.ts';
import { createSellOutWorkbook, createTopNetworksWorkbook, sellOutExportPayload, sellOutExportRows, topNetworksExportPayload, topNetworksExportRows } from '../src/canonical/operationalExporters.ts';
import * as XLSX from 'xlsx';

const base={sources:[],generatedAt:'2026-08-25T00:00:00Z',competence:'2026-08',snapshotDate:'2026-08-25',warnings:[],errors:[]};
const m2={...base,id:'M2_CLIENTE_RCA',records:[{cnpj:'00123456000100',premise_network:'REDE TESTE',network_resolution_status:'SOURCE_PRESERVED',rca_canonical_id:'RCA:10',rca_current_code:'10',rca_legacy_code:'900',rca_name:'VENDEDOR TESTE',coordinator_code:'77',coordinator_name:'SUPERVISOR TESTE'}]};
const m3={...base,id:'M3_MOVIMENTO_VENDAS',records:[{fact_type:'SALE',source:'8022',order_status:'FATURADO',value:100,event_date:'2026-08-01',cnpj:'00123456000100',transaction_rca_code:'10'},{fact_type:'SALE',source:'8022',order_status:'A FATURAR',value:20,event_date:'2026-08-02',cnpj:'00123456000100',transaction_rca_code:'10'},{fact_type:'TARGET',source:'BUSSOLA',rca_canonical_id:'RCA:10',transaction_rca_code:'900',sales_target:200,positivity_target:2}]};

test('Sell Out view is built solely from canonical M2/M3 and reconciles its visual universes', () => {
  const view = buildSellOutViewModel({ m2, m3, generatedAt: '2026-08-25T12:00:00.000Z' });
  assert.equal(view.motorBuildId, 'motor-1787651967348');
  assert.equal(view.sourceFacts.sales, 2);
  assert.equal(view.sourceFacts.targets, 1);
  assert.equal(view.totals.invoiced + view.totals.toInvoice, view.totals.realized);
  assert.equal(view.reconciliation.vendorsEqualTotal, true);
  assert.equal(view.reconciliation.dailyEqualTotal, true);
  assert.equal(view.vendorRows.filter(row => row.resolutionStatus === 'UNRESOLVED').length > 0, true);
  assert.equal(view.audits.some(audit => audit.code === 'UNRESOLVED_RCA_IN_VIEW'), true);
  const resolved = view.vendorRows.find(row => row.rcaCanonicalId === 'RCA:10');
  assert.equal(resolved?.rcaName, 'VENDEDOR TESTE');
  assert.equal(resolved?.rcaCurrentCode, '10');
  assert.equal(resolved?.rcaLegacyCode, '900');
  assert.equal(resolved?.supervisorCode, '77');
  assert.equal(resolved?.supervisorName, 'SUPERVISOR TESTE');
});

test('customer without network is a normal non-network customer, not an audit error', () => {
  const noNetworkM2={...base,id:'M2_CLIENTE_RCA',records:[{cnpj:'00999999000100',rca_canonical_id:'RCA:10',rca_current_code:'10',rca_name:'VENDEDOR TESTE',coordinator_code:'77',coordinator_name:'SUPERVISOR TESTE'}]};
  const noNetworkM3={...base,id:'M3_MOVIMENTO_VENDAS',records:[{fact_type:'SALE',source:'8022',order_status:'FATURADO',value:50,event_date:'2026-08-01',cnpj:'00999999000100',transaction_rca_code:'10',rca_canonical_id:'RCA:10'},{fact_type:'TARGET',source:'BUSSOLA',transaction_rca_code:'900',rca_canonical_id:'RCA:10',sales_target:100,positivity_target:1}]};
  const view=buildSellOutViewModel({m2:noNetworkM2,m3:noNetworkM3,generatedAt:'2026-08-25T12:00:00.000Z'});
  assert.equal(view.totals.realized,50);
  assert.equal(view.networkRows.length,0);
  assert.equal(view.audits.length,0);
});

test('Top Networks uses only M2 network relations and never allocates a customer twice', () => {
  const view = buildTopNetworksViewModel({ m2, m3, generatedAt: '2026-08-25T12:00:00.000Z' });
  assert.equal(view.rows.length, 1);
  assert.equal(view.reconciliation.rowsEqualTotal, true);
  assert.equal(view.totals.realized, view.reconciliation.mappedUniverseValue);
  assert.equal(view.rows.every(row => row.resolutionStatus === 'SOURCE_PRESERVED'), true);
});

test('screen models and operational export payloads use the exact same rows and totals', () => {
  const sellOut = buildSellOutViewModel({ m2, m3, generatedAt: '2026-08-25T12:00:00.000Z' });
  const networks = buildTopNetworksViewModel({ m2, m3, generatedAt: '2026-08-25T12:00:00.000Z' });
  const sellOutPayload = sellOutExportPayload(sellOut);
  const networksPayload = topNetworksExportPayload(networks);
  assert.deepEqual(sellOutPayload.records, sellOutExportRows(sellOut));
  assert.deepEqual(networksPayload.records, topNetworksExportRows(networks));
  assert.equal(sellOutPayload.totals.realized, sellOut.totals.realized);
  assert.equal(networksPayload.totals.realized, networks.totals.realized);
  assert.equal(sellOutPayload.motorBuildId, sellOut.motorBuildId);
  assert.equal(networksPayload.stagingManifestHash, networks.stagingManifestHash);
  const exported = sellOutPayload.records.find(row => row.rca_canonical_id === 'RCA:10');
  assert.equal(exported?.Supervisor, 'SUPERVISOR TESTE');
  assert.equal(exported?.['Código supervisor'], '77');
  assert.equal(exported?.['Código RCA atual'], '10');
  assert.equal(exported?.['Código RCA antigo'], '900');
});

test('operational UI and export modules never import parsers or motors', () => {
  for (const file of ['src/pages/SellOutPage.tsx', 'src/canonical/operationalViewModels.ts', 'src/canonical/operationalExporters.ts']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /from ['\"].*\/(parsers|motors)['\"]/);
  }
});

test('operational Excel exports reopen with the same view-model rows, numeric money and traceable metadata', () => {
  const sellOut = buildSellOutViewModel({ m2, m3, generatedAt: '2026-08-25T12:00:00.000Z' });
  const networks = buildTopNetworksViewModel({ m2, m3, generatedAt: '2026-08-25T12:00:00.000Z' });
  for (const [workbook, expectedRows, sheetName] of [[createSellOutWorkbook(sellOut), sellOut.vendorRows.length, 'Sell Out'], [createTopNetworksWorkbook(networks), networks.rows.length, 'Top Redes']] as const) {
    const reopened = XLSX.read(XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellDates: true }), { type: 'array', cellDates: true });
    const sheet = reopened.Sheets[sheetName]!;
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
    assert.equal(data.length, expectedRows);
    assert.equal(typeof data[0]!.Realizado, 'number');
    assert.equal(sheet.A2?.t, 's');
    const metadata = XLSX.utils.sheet_to_json<Record<string, string>>(reopened.Sheets.METADATA!, { defval: '' });
    assert.equal(metadata.find(row => row.key === 'motorBuildId')?.value, 'motor-1787651967348');
  }
});
