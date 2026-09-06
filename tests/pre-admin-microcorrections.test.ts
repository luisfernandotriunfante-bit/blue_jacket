import test from 'node:test';
import assert from 'node:assert/strict';
import { CANONICAL_ENGINE_VERSION } from '../src/canonical/sourceImport.ts';
import { rebuildForCanonicalEngine } from '../src/canonical/engineMigration.ts';
import { buildCanonicalBundleFromStaging } from '../src/canonical/motors.ts';
import type { ActiveCanonicalBundle } from '../src/canonical/runtime.ts';
import type { CanonicalList, ParsedSource, RawTyped } from '../src/canonical/types.ts';
import { buildTopRetailNetworksViewModel } from '../src/canonical/topRetailNetworksModel.ts';
import { createCanonicalProductResolver } from '../src/canonical/productResolver.ts';
import { beginBundleLoad, completeBundleLoad } from '../src/canonical/bundleLoadState.ts';
import { buildStockForecastBuckets, stockOperationalCivilDate, type StockInboundForecast } from '../src/canonical/stockOverviewModel.ts';
import { legacyTargetsPendingFor, loadReportSettings, migrateLegacyTargetsToCompetence, restoreReportSettings, sellOutTargetsFor } from '../src/canonical/reportSettings.ts';
import { competenceFromFileName } from '../src/canonical/competence.ts';

const rt = (typed: unknown): RawTyped => ({ raw: typed, typed });
const listBase = { sources: [], generatedAt: '2026-09-05T00:00:00Z', competence: '2026-09', snapshotDate: '2026-09-05', warnings: [], errors: [] };
const active = (engineVersion: string, motorBuildId: string): ActiveCanonicalBundle => ({
  status: 'ACTIVE', motorBuildId, stagingManifestHash: 'hash', schemaVersion: 'v1', engineVersion, approvedAt: '2026-09-05T00:00:00Z',
  rowCounts: { M1_ITEM_ESTOQUE: 0, M2_CLIENTE_RCA: 0, M3_MOVIMENTO_VENDAS: 0, M4_HISTORICO_TRANSICAO: 0 },
  factTypeCounts: { SALE: 0, INBOUND_ORDER: 0, RECEIPT: 0, TARGET: 0 },
});

test('engine anterior reconstrói listas atuais e ativa novo build v18', async () => {
  const previous = active('browser-stage4-product-assortment-v17', 'motor-antigo');
  let materializedCompetence = '';
  const rebuilt = await rebuildForCanonicalEngine(previous, CANONICAL_ENGINE_VERSION, async () => {
    const staging: ParsedSource[] = [{
      source: 'vendas-8022.xls', fileName: '8022 setembro 2026.xls', sheet: 'vendas-8022', audits: [],
      rows: [{ movement_date: rt('2026-09-05'), order_status: rt('FATURADO'), sale_value: rt(10), customer_document: rt('00111111000100'), seller_code: rt('10'), __source_row: rt(1) }],
    }];
    const bundle = buildCanonicalBundleFromStaging(staging);
    materializedCompetence = bundle.lists.M3_MOVIMENTO_VENDAS.competence;
    const next = active(CANONICAL_ENGINE_VERSION, 'motor-reconstruido');
    next.rowCounts.M3_MOVIMENTO_VENDAS = bundle.lists.M3_MOVIMENTO_VENDAS.records.length;
    next.factTypeCounts.SALE = 1;
    return next;
  });
  assert.equal(materializedCompetence, '2026-09');
  assert.equal(rebuilt.engineVersion, CANONICAL_ENGINE_VERSION);
  assert.equal(rebuilt.motorBuildId, 'motor-reconstruido');
  assert.equal(rebuilt.rowCounts.M3_MOVIMENTO_VENDAS, 1);
});

test('Roteiro agosto funciona com 8022 agosto e bloqueia 8022 setembro', () => {
  const m2 = { ...listBase, competence: '2026-09', id: 'M2_CLIENTE_RCA' as const, records: [{ cnpj: '00111111000100', top_network: 'REDE A', top_route_competence: '2026-08', top_target: 100 }] };
  const augustM3 = { ...listBase, competence: '2026-08', id: 'M3_MOVIMENTO_VENDAS' as const, records: [{ fact_type: 'SALE', competence: '2026-08', event_date: '2026-08-01', cnpj: '00111111000100', order_status: 'FATURADO', value: 10 }] };
  const septemberM3 = { ...listBase, id: 'M3_MOVIMENTO_VENDAS' as const, records: [{ fact_type: 'SALE', competence: '2026-09', event_date: '2026-09-01', cnpj: '00111111000100', order_status: 'FATURADO', value: 10 }] };
  const august = buildTopRetailNetworksViewModel({ m2, m3: augustM3, sellOutTarget: null, networkTargetTotal: null });
  const september = buildTopRetailNetworksViewModel({ m2, m3: septemberM3, sellOutTarget: null, networkTargetTotal: null });
  assert.equal(august.rows.length, 1);
  assert.equal(august.routeCompetence, '2026-08');
  assert.equal(september.rows.length, 0);
  assert.ok(september.audits.some(audit => audit.code === 'TOP_ROUTE_COMPETENCE_MISMATCH'));
});

test('competência do Roteiro é extraída do próprio nome homologado', () => {
  assert.equal(competenceFromFileName("08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx"), '2026-08');
  assert.equal(competenceFromFileName("Roteiro Ativo Top Varejistas Set'26.xlsx"), '2026-09');
  assert.equal(competenceFromFileName('roteiro-top.xlsx'), null);
});

test('Roteiro sem competência não herda silenciosamente a competência do 8022', () => {
  const m2 = { ...listBase, id: 'M2_CLIENTE_RCA' as const, records: [{ cnpj: '00111111000100', top_network: 'REDE A', top_target: 100 }] };
  const m3 = { ...listBase, id: 'M3_MOVIMENTO_VENDAS' as const, records: [{ fact_type: 'SALE', competence: '2026-09', event_date: '2026-09-01', cnpj: '00111111000100', order_status: 'FATURADO', value: 10 }] };
  const view = buildTopRetailNetworksViewModel({ m2, m3, sellOutTarget: null, networkTargetTotal: null });
  assert.equal(view.routeCompetence, 'UNRESOLVED');
  assert.equal(view.rows.length, 0);
  assert.ok(view.audits.some(audit => audit.code === 'TOP_ROUTE_COMPETENCE_UNRESOLVED'));
});

test('resolver canônico encontra todos os aliases EAN e bloqueia alias ambíguo', () => {
  const m1: CanonicalList = { ...listBase, id: 'M1_ITEM_ESTOQUE', records: [
    { item_canonical_id: 'ITEM:1', internal_ean: '7891000000001', industry_ean: '7892000000002' },
  ] };
  const resolver = createCanonicalProductResolver(m1);
  assert.equal(resolver.resolve({ ean_product: '7891000000001' }).item?.item_canonical_id, 'ITEM:1');
  assert.equal(resolver.resolve({ ean_product: '7892000000002' }).item?.item_canonical_id, 'ITEM:1');
  const ambiguous = createCanonicalProductResolver({ ...m1, records: [...m1.records, { item_canonical_id: 'ITEM:2', internal_ean: '7892000000002' }] });
  assert.equal(ambiguous.resolve({ ean_product: '7892000000002' }).status, 'AMBIGUOUS');
  assert.equal(ambiguous.resolve({ ean_product: '7892000000002' }).item, undefined);
});

test('troca do bundle A para B limpa A antes da resposta assíncrona e ignora resposta atrasada', () => {
  const dataA = { label: 'A' };
  let state = completeBundleLoad(beginBundleLoad<typeof dataA>('A'), 'A', dataA);
  assert.equal(state.data?.label, 'A');
  state = beginBundleLoad('B');
  assert.equal(state.loading, true);
  assert.equal(state.data, null);
  state = completeBundleLoad(state, 'A', dataA);
  assert.equal(state.data, null);
  state = completeBundleLoad(state, 'B', { label: 'B' });
  assert.equal(state.data?.label, 'B');
});

test('buckets usam fronteiras civis locais: ontem, hoje, +7, +8, +15 e +16', () => {
  const entries: StockInboundForecast[] = [
    ['2026-09-04', 'ONTEM'], ['2026-09-05', 'HOJE'], ['2026-09-12', 'D7'], ['2026-09-13', 'D8'], ['2026-09-20', 'D15'], ['2026-09-21', 'D16'],
  ].map(([date, invoice]) => ({ date, totalValue: 1, invoices: [{ invoice, value: 1, items: [] }] }));
  const buckets = buildStockForecastBuckets(entries, '2026-09-05');
  assert.deepEqual(Object.fromEntries(buckets.map(bucket => [bucket.key, bucket.invoices.map(invoice => invoice.invoice)])), {
    OVERDUE: ['ONTEM'], '0-7': ['HOJE', 'D7'], '8-15': ['D8', 'D15'], '16+': ['D16'], NONE: [],
  });
  assert.equal(stockOperationalCivilDate(new Date('2026-09-06T01:30:00.000Z')), '2026-09-05');
});

test('meta legada só migra por ação explícita, apenas para agosto e é limpa após gravação', () => {
  const storage = new Map<string, string>();
  Object.assign(globalThis, { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
  restoreReportSettings({ sellOutTarget: 5000, positivityTarget: 50 });
  assert.deepEqual(legacyTargetsPendingFor('2026-08'), { sellOutTarget: 5000, positivityTarget: 50 });
  assert.deepEqual(sellOutTargetsFor('2026-08'), { sellOutTarget: null, positivityTarget: null });
  migrateLegacyTargetsToCompetence('2026-08');
  assert.deepEqual(sellOutTargetsFor('2026-08'), { sellOutTarget: 5000, positivityTarget: 50 });
  assert.deepEqual(sellOutTargetsFor('2026-09'), { sellOutTarget: null, positivityTarget: null });
  assert.equal(loadReportSettings().legacySellOutTarget, null);
  assert.equal(loadReportSettings().legacyPositivityTarget, null);
});

test('falha de gravação não apaga meta legada antes da migração validada', () => {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  Object.assign(globalThis, { localStorage });
  restoreReportSettings({ sellOutTarget: 7000, positivityTarget: 70 });
  localStorage.setItem = () => { throw new Error('storage indisponível'); };
  assert.throws(() => migrateLegacyTargetsToCompetence('2026-08'), /storage indisponível/);
  assert.equal(JSON.parse(storage.values().next().value!).legacySellOutTarget, 7000);
  assert.equal(JSON.parse(storage.values().next().value!).legacyPositivityTarget, 70);
});
