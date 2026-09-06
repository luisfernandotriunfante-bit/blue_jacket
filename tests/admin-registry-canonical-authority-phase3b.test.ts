import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
  emptyAdminRegistryState,
  type AdminRegistryState,
  type LaunchRegistryRecord,
  type RcaRegistryRecord,
  type TopRetailRegistryRecord,
} from '../src/canonical/adminRegistry.ts';
import { canonicalAdminRegistryHash, canonicalInputHash } from '../src/canonical/adminRegistryIdentity.ts';
import { applyAdminRegistryCanonicalAuthority } from '../src/canonical/adminRegistryCanonicalAuthority.ts';
import { resolveLaunchAuthority, resolveTopAuthority } from '../src/canonical/adminRegistryAuthority.ts';
import { createRcaResolver } from '../src/canonical/rcaResolver.ts';
import { materializeTopRetailRouteInM2 } from '../src/canonical/topRetailM2.ts';
import { buildCanonicalBundleFromStaging } from '../src/canonical/motors.ts';
import {
  CANONICAL_ENGINE_VERSION,
  REQUIRED_SOURCE_IDS,
  sourceImportTestHelpers,
  type SourceStorageSnapshot,
} from '../src/canonical/sourceImport.ts';
import { createSystemDataOperationCoordinator } from '../src/canonical/systemDataOperationCoordinator.ts';
import {
  createRegistryUpdateCoordinator,
  executeRegistryUpdateTransaction,
  type RegistryTransactionDependencies,
  type RegistryUpdateRuntime,
} from '../src/pages/admin/registryUpdateFlow.ts';
import { cloudSyncTestHelpers, type CloudRestoreDependencies, type CloudSnapshot, type CloudUploadDependencies, type DeviceSyncIdentity } from '../src/canonical/cloudSync.ts';
import { recoverTechnicalBundle } from '../src/canonical/bundleRecovery.ts';
import { canonicalBundleTestHelpers } from '../src/canonical/bundleStore.ts';
import { createExcelWorkbook, exportPayload } from '../src/canonical/exporters.ts';
import type { ActiveCanonicalBundle } from '../src/canonical/runtime.ts';
import type { CanonicalBundle, CanonicalList, ParsedSource, RawTyped } from '../src/canonical/types.ts';

const NOW = '2026-09-06T16:30:00.000Z';
const LATER = '2026-09-06T17:30:00.000Z';
const ENGINE = 'browser-stage4-product-assortment-v19-admin-registry-authority';
const sourceText = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const cell = (typed: unknown, raw: unknown = typed): RawTyped => ({ raw, typed });
const row = (fields: Record<string, unknown>, sourceRow = 2) => Object.fromEntries([...Object.entries(fields).map(([key, value]) => [key, cell(value)]), ['__source_row', cell(sourceRow)]]) as Record<string, RawTyped>;
const parsed = (source: string, fileName: string, rows: ParsedSource['rows']): ParsedSource => ({ source, fileName, sheet: 'test', rows, audits: [] });

const rcaPhysical = (current = '10', legacy = '9', name = 'Fonte A', coordinator = '1') => parsed('NOVOS RCAS.xlsx', 'NOVOS RCAS.xlsx', [row({
  current_rca_code_principal: current,
  legacy_rca_code_principal: legacy,
  rca_name_raw_principal: name,
  coordinator_code_principal: coordinator,
  coordinator_name_principal: `Coord ${coordinator}`,
})]);
const launchPhysical = (status = 'A') => parsed('lançamentos.xlsx', 'lançamentos.xlsx', [row({
  launch_winthor_code: '10', launch_ean: '7891234567890', launch_description: 'Produto', launch_type: 'NOVA LINHA', launch_status: status,
})]);
const topPhysical = (competence: '2026-08' | '2026-09' = '2026-08', network = 'Fonte Rede') => parsed(
  "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx",
  competence === '2026-08' ? "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx" : "09.26 Roteiro Ativo Top Varejistas Set'26 - Final.xlsx",
  [row({ cnpj: '12345678000199', top_network: network, banner: 'Fonte Banner', manager_cnpj: '98765432000188', group_code: 'F1', top_category: 'FONTE', top_target: 100 })],
);

function rca(overrides: Partial<RcaRegistryRecord> = {}): RcaRegistryRecord {
  return { id: 'R1', currentCode: '10', legacyCode: '9', name: 'Registry B', coordinatorCode: '2', coordinatorName: 'Coord 2', role: 'PRINCIPAL', active: true, validFromCompetence: null, validToCompetence: null, origin: 'MANUAL', sourceRow: null, note: null, createdAt: NOW, updatedAt: NOW, ...overrides };
}
function launch(overrides: Partial<LaunchRegistryRecord> = {}): LaunchRegistryRecord {
  return { id: 'L1', winthorCode: '10', ean: '7891234567890', description: 'Produto', type: 'NOVA LINHA', status: 'B', active: true, validFromCompetence: null, validToCompetence: null, origin: 'MANUAL', sourceRow: null, note: null, createdAt: NOW, updatedAt: NOW, ...overrides };
}
function top(overrides: Partial<TopRetailRegistryRecord> = {}): TopRetailRegistryRecord {
  return { id: 'T1', competence: '2026-08', customerCnpj: '12345678000199', network: 'Registry Rede', banner: 'Registry Banner', managerCnpj: '11111111000111', groupCode: 'R1', category: 'REGISTRY', topTarget: 200, active: true, origin: 'MANUAL', sourceRow: null, note: null, createdAt: NOW, updatedAt: NOW, ...overrides };
}
function registry(parts: Partial<Pick<AdminRegistryState, 'rcas' | 'launches' | 'topRetailers'>> = {}): AdminRegistryState {
  return { ...emptyAdminRegistryState(NOW), rcas: parts.rcas ?? [], launches: parts.launches ?? [], topRetailers: parts.topRetailers ?? [] };
}
function list(id: CanonicalList['id'], records: CanonicalList['records'] = [], competence = '2026-09'): CanonicalList {
  return { id, records, sources: [], generatedAt: NOW, competence, snapshotDate: `${competence}-06`, warnings: [], errors: [] };
}
function emptyBundle(overrides: Partial<Record<CanonicalList['id'], CanonicalList>> = {}): CanonicalBundle {
  return { version: 'v1', generatedAt: NOW, parsedSources: [], lists: {
    M1_ITEM_ESTOQUE: overrides.M1_ITEM_ESTOQUE ?? list('M1_ITEM_ESTOQUE'),
    M2_CLIENTE_RCA: overrides.M2_CLIENTE_RCA ?? list('M2_CLIENTE_RCA'),
    M3_MOVIMENTO_VENDAS: overrides.M3_MOVIMENTO_VENDAS ?? list('M3_MOVIMENTO_VENDAS'),
    M4_HISTORICO_TRANSICAO: overrides.M4_HISTORICO_TRANSICAO ?? list('M4_HISTORICO_TRANSICAO'),
  } };
}
function completeActive(id: string, sourceHash: string, registryHash: string, inputHash: string, engineVersion = ENGINE): ActiveCanonicalBundle {
  return { status: 'ACTIVE', motorBuildId: id, stagingManifestHash: sourceHash, adminRegistryHash: registryHash, canonicalInputHash: inputHash, schemaVersion: 'v1', engineVersion, approvedAt: NOW, rowCounts: { M1_ITEM_ESTOQUE: 0, M2_CLIENTE_RCA: 0, M3_MOVIMENTO_VENDAS: 0, M4_HISTORICO_TRANSICAO: 0 }, factTypeCounts: { SALE: 0, INBOUND_ORDER: 0, RECEIPT: 0, TARGET: 0 } };
}
const identity: DeviceSyncIdentity = { workspaceId: '11111111-1111-4111-8111-111111111111', secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' };
const settings = { networkTargetByCompetence: {}, networkAllocationByCompetence: {}, sellOutTargetByCompetence: {}, positivityTargetByCompetence: {}, legacySellOutTarget: null, legacyPositivityTarget: null, inboundForecastByInvoice: {} };
const sourceSnapshot = { format: 'blue-jacket-source-storage/v1' as const, exportedAt: NOW, staging: [] } as SourceStorageSnapshot;

// C1
test('C1 — adminRegistryHash é determinístico com arrays em ordem diferente', async () => {
  const stateA = registry({ rcas: [rca({ id: 'R1' }), rca({ id: 'R2', currentCode: '20', legacyCode: '19' })], launches: [launch({ id: 'L1' }), launch({ id: 'L2', winthorCode: '20', ean: '7891234567891' })], topRetailers: [top({ id: 'T1' }), top({ id: 'T2', customerCnpj: '22345678000199' })] });
  const stateB = { ...stateA, rcas: [...stateA.rcas].reverse(), launches: [...stateA.launches].reverse(), topRetailers: [...stateA.topRetailers].reverse() };
  assert.equal(await canonicalAdminRegistryHash(stateA), await canonicalAdminRegistryHash(stateB));
});

// C2
test('C2 — metadados não canônicos não alteram adminRegistryHash', async () => {
  const a = registry({ rcas: [rca()] });
  const b = structuredClone(a); b.rcas[0].createdAt = LATER; b.rcas[0].updatedAt = LATER; b.rcas[0].sourceRow = 999; b.rcas[0].note = 'mudou';
  assert.equal(await canonicalAdminRegistryHash(a), await canonicalAdminRegistryHash(b));
});

// C3
test('C3 — qualquer mudança semântica de RCA, Launch ou Top altera adminRegistryHash', async () => {
  const base = registry({ rcas: [rca()], launches: [launch()], topRetailers: [top()] });
  const h = await canonicalAdminRegistryHash(base);
  assert.notEqual(h, await canonicalAdminRegistryHash({ ...base, rcas: [rca({ name: 'Outro' })] }));
  assert.notEqual(h, await canonicalAdminRegistryHash({ ...base, launches: [launch({ status: 'OUTRO' })] }));
  assert.notEqual(h, await canonicalAdminRegistryHash({ ...base, topRetailers: [top({ topTarget: 999 })] }));
});

// C4
test('C4 — canonicalInputHash depende somente de sourceHash + registryHash + formato', async () => {
  const a = await canonicalInputHash('SOURCE_A', 'REG_A');
  assert.equal(a, await canonicalInputHash('SOURCE_A', 'REG_A'));
  assert.notEqual(a, await canonicalInputHash('SOURCE_B', 'REG_A'));
  assert.notEqual(a, await canonicalInputHash('SOURCE_A', 'REG_B'));
});

// C5
test('C5 — ActiveCanonicalBundle v19 contém identidade completa', () => {
  const lists = emptyBundle().lists;
  const active = sourceImportTestHelpers.activeFromLists(lists, 'SOURCE', 'REGISTRY', 'INPUT');
  assert.equal(active.stagingManifestHash, 'SOURCE'); assert.equal(active.adminRegistryHash, 'REGISTRY'); assert.equal(active.canonicalInputHash, 'INPUT'); assert.equal(active.engineVersion, ENGINE);
});

// C6
test('C6 — motorBuildId usa prefixo do canonicalInputHash', () => {
  const input = 'abcdef1234567890';
  const active = sourceImportTestHelpers.activeFromLists(emptyBundle().lists, 'S', 'R', input);
  assert.match(active.motorBuildId, new RegExp(`-${input.slice(0, 10)}$`));
});

// C7
test('C7 — Registry null preserva semanticamente M1-M4 físicos', () => {
  const before = emptyBundle({ M1_ITEM_ESTOQUE: list('M1_ITEM_ESTOQUE', [{ a: 1 }]), M2_CLIENTE_RCA: list('M2_CLIENTE_RCA', [{ b: 2 }]), M3_MOVIMENTO_VENDAS: list('M3_MOVIMENTO_VENDAS', [{ c: 3 }]), M4_HISTORICO_TRANSICAO: list('M4_HISTORICO_TRANSICAO', [{ d: 4 }]) });
  const snapshot = structuredClone(before);
  assert.deepEqual(applyAdminRegistryCanonicalAuthority(before, [], null), snapshot);
});

// C8
test('C8 — SOURCE_SEED idêntico reproduz autoridade da fonte física', () => {
  const physicalRca = createRcaResolver([rcaPhysical()]).resolveCurrent('10');
  const seededRca = createRcaResolver([rcaPhysical()], registry({ rcas: [rca({ origin: 'SOURCE_SEED', name: 'Fonte A', coordinatorCode: '1', coordinatorName: 'Coord 1' })] })).resolveCurrent('10');
  assert.deepEqual([seededRca.currentCode, seededRca.legacyCode, seededRca.name, seededRca.coordinatorCode], [physicalRca.currentCode, physicalRca.legacyCode, physicalRca.name, physicalRca.coordinatorCode]);
  const physicalLaunch = resolveLaunchAuthority(null, launchPhysical().rows[0], { winthorCode: '10', eans: ['7891234567890'], competence: '2026-09' });
  const seededLaunch = resolveLaunchAuthority(registry({ launches: [launch({ origin: 'SOURCE_SEED', status: 'A' })] }), launchPhysical().rows[0], { winthorCode: '10', eans: ['7891234567890'], competence: '2026-09' });
  assert.equal(physicalLaunch.authority, 'IMPORTED_SOURCE'); assert.equal(seededLaunch.authority, 'ADMIN_REGISTRY');
  assert.equal((seededLaunch.record as LaunchRegistryRecord).status, 'A');
});

// C9
test('C9 — RCA MANUAL CURRENT vence fonte em M2/M3', () => {
  const resolved = createRcaResolver([rcaPhysical()], registry({ rcas: [rca()] })).resolveCurrent('10', undefined, '2026-09');
  assert.equal(resolved.name, 'Registry B'); assert.equal(resolved.coordinatorCode, '2'); assert.equal(resolved.authority, 'MANUAL_REGISTRY');
});

// C10
test('C10 — RCA SOURCE_SEED vence fonte física', () => {
  const resolved = createRcaResolver([rcaPhysical()], registry({ rcas: [rca({ origin: 'SOURCE_SEED', name: 'Seed B' })] })).resolveCurrent('10', undefined, '2026-09');
  assert.equal(resolved.name, 'Seed B'); assert.equal(resolved.authority, 'ADMIN_REGISTRY');
});

// C11
test('C11 — RCA MANUAL inativo funciona como tombstone', () => {
  const resolved = createRcaResolver([rcaPhysical()], registry({ rcas: [rca({ active: false })] })).resolveCurrent('10', undefined, '2026-09');
  assert.equal(resolved.canonicalId, null); assert.equal(resolved.authority, 'MANUAL_REGISTRY'); assert.equal(resolved.auditCode, 'ADMIN_REGISTRY_RCA_TOMBSTONE');
});

// C12
test('C12 — RCA MANUAL ambíguo não cai para fonte inferior', () => {
  const state = registry({ rcas: [rca({ id: 'R1', name: 'Manual A' }), rca({ id: 'R2', name: 'Manual B', coordinatorCode: '3' })] });
  const resolved = createRcaResolver([rcaPhysical()], state).resolveCurrent('10', undefined, '2026-09');
  assert.equal(resolved.status, 'AMBIGUOUS_RCA_CODE'); assert.equal(resolved.canonicalId, null); assert.equal(resolved.authority, 'MANUAL_REGISTRY'); assert.equal(resolved.auditCode, 'ADMIN_REGISTRY_RCA_AMBIGUOUS');
});

// C13
test('C13 — namespace LEGACY respeita de-para MANUAL do Registry', () => {
  const resolved = createRcaResolver([rcaPhysical()], registry({ rcas: [rca({ currentCode: '20', legacyCode: '9' })] })).resolveLegacy('9', undefined, '2026-09');
  assert.equal(resolved.currentCode, '20'); assert.equal(resolved.canonicalId, 'RCA:20');
});

// C14
test('C14 — vigência RCA em M3 usa competência do fato', () => {
  const resolver = createRcaResolver([rcaPhysical()], registry({ rcas: [rca({ name: 'Setembro', validFromCompetence: '2026-09' })] }));
  assert.equal(resolver.resolveCurrent('10', undefined, '2026-08').name, 'Fonte A');
  assert.equal(resolver.resolveCurrent('10', undefined, '2026-09').name, 'Setembro');
});

// C15
test('C15 — M4 LEGACY aplica vigência pela movement_date', () => {
  const bundle = emptyBundle({ M4_HISTORICO_TRANSICAO: list('M4_HISTORICO_TRANSICAO', [
    { legacy_rca_code: '9', movement_date: '2026-08-20', rca_canonical_id: 'RCA:10', row_type: 'SALE_379' },
    { legacy_rca_code: '9', movement_date: '2026-09-20', rca_canonical_id: 'RCA:10', row_type: 'SALE_379' },
  ]) });
  applyAdminRegistryCanonicalAuthority(bundle, [rcaPhysical()], registry({ rcas: [rca({ currentCode: '20', legacyCode: '9', validFromCompetence: '2026-09' })] }));
  assert.equal(bundle.lists.M4_HISTORICO_TRANSICAO.records[0].rca_canonical_id, 'RCA:10');
  assert.equal(bundle.lists.M4_HISTORICO_TRANSICAO.records[1].rca_canonical_id, 'RCA:20');
});

// C16
test('C16 — vigência limitada sem competência não é adivinhada; ilimitada aplica', () => {
  const limited = createRcaResolver([rcaPhysical()], registry({ rcas: [rca({ validFromCompetence: '2026-09' })] })).resolveCurrent('10');
  assert.equal(limited.status, 'ADMIN_REGISTRY_VALIDITY_UNRESOLVED'); assert.equal(limited.canonicalId, null);
  const unlimited = createRcaResolver([rcaPhysical()], registry({ rcas: [rca()] })).resolveCurrent('10');
  assert.equal(unlimited.name, 'Registry B');
});

function launchBundle(competence = '2026-09') { return emptyBundle({ M1_ITEM_ESTOQUE: list('M1_ITEM_ESTOQUE', [{ item_canonical_id: 'ITEM:10', winthor_code: '10', internal_ean: '7891234567890', industry_ean: null, is_launch: true, launch_status: 'A', mapping_status: 'MATCHED', source_lineage: 'lançamentos.xlsx' }], competence) }); }

// C17
test('C17 — Lançamento MANUAL vence status da planilha', () => {
  const bundle = launchBundle(); applyAdminRegistryCanonicalAuthority(bundle, [launchPhysical('A')], registry({ launches: [launch({ status: 'B' })] }));
  assert.equal(bundle.lists.M1_ITEM_ESTOQUE.records[0].is_launch, true); assert.equal(bundle.lists.M1_ITEM_ESTOQUE.records[0].launch_status, 'B');
});

// C18
test('C18 — Lançamento SOURCE_SEED vence fonte física', () => {
  const bundle = launchBundle(); applyAdminRegistryCanonicalAuthority(bundle, [launchPhysical('A')], registry({ launches: [launch({ origin: 'SOURCE_SEED', status: 'SEED' })] }));
  assert.equal(bundle.lists.M1_ITEM_ESTOQUE.records[0].launch_status, 'SEED');
});

// C19
test('C19 — tombstone de Lançamento impede ressurreição pela planilha', () => {
  const bundle = launchBundle(); applyAdminRegistryCanonicalAuthority(bundle, [launchPhysical('A')], registry({ launches: [launch({ active: false })] }));
  assert.equal(bundle.lists.M1_ITEM_ESTOQUE.records[0].is_launch, false); assert.equal(bundle.lists.M1_ITEM_ESTOQUE.records[0].launch_status, null);
});

// C20
test('C20 — ambiguidade de Lançamento não seleciona fonte inferior e gera audit', () => {
  const state = registry({ launches: [launch({ id: 'L1', status: 'B' }), launch({ id: 'L2', status: 'C' })] });
  const bundle = launchBundle(); applyAdminRegistryCanonicalAuthority(bundle, [launchPhysical('A')], state);
  assert.equal(bundle.lists.M1_ITEM_ESTOQUE.records[0].is_launch, false);
  assert.ok(bundle.lists.M1_ITEM_ESTOQUE.warnings.some(audit => audit.code === 'ADMIN_REGISTRY_LAUNCH_AMBIGUOUS'));
});

// C21
test('C21 — Lançamento Registry fora da vigência não substitui fonte', () => {
  const bundle = launchBundle('2026-09'); applyAdminRegistryCanonicalAuthority(bundle, [launchPhysical('A')], registry({ launches: [launch({ status: 'OUTUBRO', validFromCompetence: '2026-10' })] }));
  assert.equal(bundle.lists.M1_ITEM_ESTOQUE.records[0].launch_status, 'A');
});

function topM2(competence = '2026-08') { return list('M2_CLIENTE_RCA', [{ customer_canonical_id: 'CUSTOMER:12345678000199', cnpj: '12345678000199', top_network: null, top_banner: null, manager_cnpj: null, top_group_code: null, top_category: null, top_target: null, source_lineage: 'BASE' }], competence); }

// C22
test('C22 — Top MANUAL vence Roteiro na mesma competência', () => {
  const m2 = materializeTopRetailRouteInM2(topM2('2026-08'), [topPhysical('2026-08')], registry({ topRetailers: [top()] }));
  const record = m2.records[0]; assert.equal(record.top_network, 'Registry Rede'); assert.equal(record.top_banner, 'Registry Banner'); assert.equal(record.manager_cnpj, '11111111000111'); assert.equal(record.top_group_code, 'R1'); assert.equal(record.top_category, 'REGISTRY'); assert.equal(record.top_target, 200);
});

// C23
test('C23 — Top SOURCE_SEED vence fonte', () => {
  const m2 = materializeTopRetailRouteInM2(topM2('2026-08'), [topPhysical('2026-08')], registry({ topRetailers: [top({ origin: 'SOURCE_SEED', network: 'Seed Rede' })] }));
  assert.equal(m2.records[0].top_network, 'Seed Rede'); assert.equal(m2.records[0].network_resolution_status, 'ADMIN_REGISTRY');
});

// C24
test('C24 — Top MANUAL inativo remove cliente do universo Top mensal', () => {
  const m2 = materializeTopRetailRouteInM2(topM2('2026-08'), [topPhysical('2026-08')], registry({ topRetailers: [top({ active: false })] }));
  assert.equal(m2.records[0].top_network, null);
});

// C25
test('C25 — Roteiro agosto nunca vira fallback de setembro', () => {
  const m2 = materializeTopRetailRouteInM2(topM2('2026-09'), [topPhysical('2026-08')], null);
  assert.equal(m2.records[0].top_network, null); assert.ok(!m2.sources.includes("08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx"));
});

// C26
test('C26 — Registry setembro materializa Top mesmo com Roteiro físico agosto', () => {
  const sept = top({ competence: '2026-09', network: 'Setembro Registry' });
  const m2 = materializeTopRetailRouteInM2(topM2('2026-09'), [topPhysical('2026-08')], registry({ topRetailers: [sept] }));
  assert.equal(m2.records[0].top_network, 'Setembro Registry'); assert.equal(m2.records[0].top_route_competence, '2026-09'); assert.ok(m2.sources.includes('AdminRegistry:TopRetailers'));
});

// C27
test('C27 — Top MANUAL ambíguo não escolhe vencedor silencioso', () => {
  const state = registry({ topRetailers: [top({ id: 'T1' }), top({ id: 'T2', network: 'Conflito' })] });
  const m2 = materializeTopRetailRouteInM2(topM2('2026-08'), [topPhysical('2026-08')], state);
  assert.equal(m2.records[0].top_network, null); assert.ok(m2.warnings.some(audit => audit.code === 'ADMIN_REGISTRY_TOP_AMBIGUOUS'));
});

async function transactionHarness(options: { failBuild?: boolean; failSync?: boolean } = {}) {
  let currentRegistry: AdminRegistryState | null = registry({ rcas: [rca({ name: 'A' })] });
  const sourceHash = 'SOURCE';
  const oldRegistryHash = await canonicalAdminRegistryHash(currentRegistry);
  const oldInputHash = await canonicalInputHash(sourceHash, oldRegistryHash);
  let active: ActiveCanonicalBundle | null = completeActive('BUILD_A', sourceHash, oldRegistryHash, oldInputHash);
  const next = registry({ rcas: [rca({ name: 'B' })] });
  const phases: string[] = [];
  const runtime: RegistryUpdateRuntime = { getActive: () => active, activate: value => { active = value; }, deactivate: () => { active = null; } };
  const deps: RegistryTransactionDependencies = {
    loadRegistry: async () => currentRegistry ? structuredClone(currentRegistry) : null,
    replaceRegistry: async state => { currentRegistry = state ? structuredClone(state) : null; return currentRegistry; },
    build: async state => {
      if (options.failBuild) throw new Error('BUILD_FAIL');
      const rh = await canonicalAdminRegistryHash(state); const ih = await canonicalInputHash(sourceHash, rh);
      return completeActive('BUILD_B', sourceHash, rh, ih);
    },
    registryHash: canonicalAdminRegistryHash,
    inputHash: canonicalInputHash,
    sync: async () => { if (options.failSync) throw new Error('SYNC_FAIL'); return { status: 'NOT_PAIRED' }; },
    engineVersion: ENGINE,
  };
  const mutate = async () => { currentRegistry = structuredClone(next); return 'OK'; };
  const controls = { setPhase: (phase: string) => { phases.push(phase); } } as any;
  return { read: () => ({ currentRegistry, active, phases }), mutate, runtime, deps, controls, next };
}

// C28
test('C28 — Registry SAVE → BUILD → ACTIVATE produz hashes correspondentes', async () => {
  const h = await transactionHarness();
  const result = await executeRegistryUpdateTransaction(h.mutate, h.runtime, h.controls, h.deps);
  assert.equal(result.phase, 'SUCCESS'); assert.equal(h.read().active?.motorBuildId, 'BUILD_B'); assert.equal((h.read().currentRegistry?.rcas[0] as RcaRegistryRecord).name, 'B'); assert.deepEqual(h.read().phases, ['MUTATING', 'BUILDING', 'ACTIVATING', 'SYNCING']);
  assert.equal(h.read().active?.adminRegistryHash, await canonicalAdminRegistryHash(h.read().currentRegistry));
});

// C29
test('C29 — falha de build restaura Registry A e Build A', async () => {
  const h = await transactionHarness({ failBuild: true });
  await assert.rejects(() => executeRegistryUpdateTransaction(h.mutate, h.runtime, h.controls, h.deps), /BUILD_FAIL/);
  assert.equal((h.read().currentRegistry?.rcas[0] as RcaRegistryRecord).name, 'A'); assert.equal(h.read().active?.motorBuildId, 'BUILD_A');
});

// C30
test('C30 — falha de sync preserva Registry B e Build B localmente', async () => {
  const h = await transactionHarness({ failSync: true });
  const result = await executeRegistryUpdateTransaction(h.mutate, h.runtime, h.controls, h.deps);
  assert.equal(result.phase, 'LOCAL_SUCCESS_SYNC_FAILED'); assert.equal((h.read().currentRegistry?.rcas[0] as RcaRegistryRecord).name, 'B'); assert.equal(h.read().active?.motorBuildId, 'BUILD_B');
});

// C31
test('C31 — REGISTRY_UPDATE é global single-flight contra Bases/Sync/Restore/Bundle e vice-versa', async () => {
  const coordinator = createSystemDataOperationCoordinator(); let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  const registryRun = coordinator.run('REGISTRY_UPDATE', async () => pending); await Promise.resolve();
  for (const owner of ['BASE_UPDATE', 'SYNC_SEND', 'SYNC_RESTORE', 'BUNDLE_RECOVERY'] as const) assert.deepEqual(await coordinator.run(owner, async () => undefined), { status: 'BUSY', owner: 'REGISTRY_UPDATE' });
  release(); await registryRun;
  let releaseBase!: () => void; const basePending = new Promise<void>(resolve => { releaseBase = resolve; }); const base = coordinator.run('BASE_UPDATE', async () => basePending); await Promise.resolve();
  assert.deepEqual(await coordinator.run('REGISTRY_UPDATE', async () => undefined), { status: 'BUSY', owner: 'BASE_UPDATE' }); releaseBase(); await base;
});

// C32
test('C32 — lifecycle de Registry Update sobrevive unsubscribe/remount', async () => {
  const coordinator = createRegistryUpdateCoordinator(); let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }); let first = coordinator.getState(); const unsub = coordinator.subscribe(state => { first = state; });
  const run = coordinator.run(async controls => { controls.setPhase('BUILDING'); await pending; return { phase: 'SUCCESS', status: 'OK', error: '' }; }); await Promise.resolve(); assert.equal(first.phase, 'BUILDING'); assert.equal(first.busy, true); unsub();
  let remounted = coordinator.getState(); const unsub2 = coordinator.subscribe(state => { remounted = state; }); assert.equal(remounted.phase, 'BUILDING'); assert.equal(remounted.busy, true); release(); await run; assert.equal(remounted.phase, 'SUCCESS'); unsub2();
});

// C33
test('C33 — Base Update usa Registry atual e não o reseta', () => {
  const content = sourceText('../src/canonical/sourceImport.ts');
  assert.match(content, /loadAdminRegistryState\(\)/); assert.match(content, /canonicalAdminRegistryHash\(registry\)/); assert.doesNotMatch(content, /replaceAdminRegistryState|clearAdminRegistry/);
});

// C34
test('C34 — incremental é proibido quando registryHash ou engine diferem', () => {
  const content = sourceText('../src/canonical/sourceImport.ts');
  assert.match(content, /incrementalBase!\.active\.engineVersion === CANONICAL_ENGINE_VERSION/); assert.match(content, /incrementalBase!\.active\.adminRegistryHash === registryHash/); assert.match(content, /buildCanonicalFromStoredSources\(onProgress, registry\)/);
});

// C35
test('C35 — build v18 é migrado automaticamente para v19 pelas fontes', () => {
  assert.equal(CANONICAL_ENGINE_VERSION, ENGINE);
  const data = sourceText('../src/store/DataContext.tsx'); assert.match(data, /legacyToMigrate/); assert.match(data, /rebuildForCanonicalEngine/); assert.match(data, /activeCanonical.*engineVersion===CANONICAL_ENGINE_VERSION/);
});

// C36
test('C36 — migração v18 usa Registry existente da Fase 3A', () => {
  const data = sourceText('../src/store/DataContext.tsx'); const sourceImport = sourceText('../src/canonical/sourceImport.ts');
  assert.match(data, /buildCanonicalFromStoredSources/); assert.match(sourceImport, /loadAdminRegistryState/); assert.match(sourceImport, /applyAdminRegistryCanonicalAuthority/);
});

function uploadDeps(active: ActiveCanonicalBundle, reg: AdminRegistryState | null, onPut: () => void): CloudUploadDependencies {
  return { getActive: () => active, exportSources: async () => sourceSnapshot, sourceManifestHash: async () => active.stagingManifestHash, registryHash: canonicalAdminRegistryHash, inputHash: canonicalInputHash, loadSettings: () => settings, loadCompetence: () => null, loadAdminRegistry: async () => reg, encryptSnapshot: async () => new Uint8Array([1]), uploadPayload: async () => { onPut(); return { updatedAt: NOW, bytes: 1 }; }, saveState: () => undefined, now: () => NOW };
}

// C37
test('C37 — Cloud snapshot consistente valida source/registry/input e faz 1 PUT', async () => {
  const reg = registry({ rcas: [rca()] }); const rh = await canonicalAdminRegistryHash(reg); const ih = await canonicalInputHash('SOURCE', rh); const active = completeActive('BUILD', 'SOURCE', rh, ih); let puts = 0;
  const result = await cloudSyncTestHelpers.uploadCurrentDeviceSnapshotWithDependencies(identity, uploadDeps(active, reg, () => { puts += 1; })); assert.equal(result.active.canonicalInputHash, ih); assert.equal(puts, 1);
});

// C38
test('C38 — Registry diferente durante captura aborta antes do PUT', async () => {
  const regA = registry({ rcas: [rca({ name: 'A' })] }); const regB = registry({ rcas: [rca({ name: 'B' })] }); const rhA = await canonicalAdminRegistryHash(regA); const ihA = await canonicalInputHash('SOURCE', rhA); const active = completeActive('BUILD', 'SOURCE', rhA, ihA); let puts = 0;
  await assert.rejects(() => cloudSyncTestHelpers.uploadCurrentDeviceSnapshotWithDependencies(identity, uploadDeps(active, regB, () => { puts += 1; })), /SYNC_SNAPSHOT_CHANGED_DURING_CAPTURE/); assert.equal(puts, 0);
});

// C39
test('C39 — restore Cloud sources+Registry produz build com hashes restaurados', async () => {
  const remote = registry({ rcas: [rca({ name: 'Remote' })] }); const rh = await canonicalAdminRegistryHash(remote); const ih = await canonicalInputHash('SOURCE', rh); const remoteActive = completeActive('REMOTE', 'SOURCE', rh, ih); let current: AdminRegistryState | null = registry({ rcas: [rca({ name: 'Local' })] });
  const deps: CloudRestoreDependencies = { exportSources: async () => sourceSnapshot, loadSettings: () => settings, loadCompetence: () => null, loadAdminRegistry: async () => current, restoreSources: async () => undefined, restoreSettings: () => settings, replaceCompetence: () => null, replaceAdminRegistry: async state => { current = state; return current; }, build: async () => remoteActive };
  const snapshot: CloudSnapshot = { format: 'blue-jacket-device-sync/v1', createdAt: NOW, active: remoteActive, sources: sourceSnapshot, settings, adminRegistryState: remote };
  const rebuilt = await cloudSyncTestHelpers.applyCloudSnapshot(snapshot, deps); assert.equal(rebuilt.adminRegistryHash, rh); assert.equal((current?.rcas[0] as RcaRegistryRecord).name, 'Remote');
});

// C40
test('C40 — snapshot legado sem Registry preserva Registry local', async () => {
  const local = registry({ rcas: [rca({ name: 'Local' })] }); let current: AdminRegistryState | null = local; const rh = await canonicalAdminRegistryHash(local); const ih = await canonicalInputHash('SOURCE', rh); const rebuilt = completeActive('NEW', 'SOURCE', rh, ih);
  const deps: CloudRestoreDependencies = { exportSources: async () => sourceSnapshot, loadSettings: () => settings, loadCompetence: () => null, loadAdminRegistry: async () => current, restoreSources: async () => undefined, restoreSettings: () => settings, replaceCompetence: () => null, replaceAdminRegistry: async state => { current = state; return current; }, build: async () => rebuilt };
  const legacy: CloudSnapshot = { format: 'blue-jacket-device-sync/v1', createdAt: NOW, active: null, sources: sourceSnapshot, settings };
  await cloudSyncTestHelpers.applyCloudSnapshot(legacy, deps); assert.deepEqual(current, local);
});

function prepared(active: ActiveCanonicalBundle) { return { motorBuildId: active.motorBuildId, stagingManifestHash: active.stagingManifestHash, adminRegistryHash: active.adminRegistryHash, canonicalInputHash: active.canonicalInputHash, schemaVersion: active.schemaVersion, engineVersion: active.engineVersion, rowCounts: active.rowCounts, active, bytes: new Uint8Array(), manifest: {} } as any; }

// C41
test('C41 — Bundle v19 com registryHash local correspondente ativa compatível', async () => {
  const active = completeActive('BUNDLE', 'SOURCE', 'REG', await canonicalInputHash('SOURCE', 'REG')); let persisted = 0; let activated: ActiveCanonicalBundle | null = null;
  const result = await recoverTechnicalBundle({ currentEngineVersion: ENGINE, inspectBundle: async () => prepared(active), persistBundle: async value => { persisted += 1; return value; }, rebuildFromStaging: async () => { throw new Error('NO_REBUILD'); }, activate: value => { activated = value; }, localAdminRegistryHash: async () => 'REG' });
  assert.equal(result.mode, 'COMPATIBLE'); assert.equal(persisted, 1); assert.equal(activated?.motorBuildId, 'BUNDLE');
});

// C42
test('C42 — Bundle v19 com Registry diferente não ativa listas importadas', async () => {
  const imported = completeActive('BUNDLE_A', 'SOURCE', 'REG_A', await canonicalInputHash('SOURCE', 'REG_A')); const rebuilt = completeActive('BUILD_B', 'SOURCE', 'REG_B', await canonicalInputHash('SOURCE', 'REG_B')); let persisted = 0; let activated = '';
  const result = await recoverTechnicalBundle({ currentEngineVersion: ENGINE, inspectBundle: async () => prepared(imported), persistBundle: async value => { persisted += 1; return value; }, rebuildFromStaging: async () => rebuilt, activate: value => { activated = value.motorBuildId; }, localAdminRegistryHash: async () => 'REG_B' });
  assert.equal(result.mode, 'REBUILT'); assert.equal(persisted, 0); assert.equal(activated, 'BUILD_B');
});

// C43
test('C43 — Bundle v18 é legado e rebuilda v19', async () => {
  const legacy = { ...completeActive('V18', 'SOURCE', 'OLD', 'OLD_INPUT', 'browser-stage4-product-assortment-v18-sellout-closure'), adminRegistryHash: undefined, canonicalInputHash: undefined } as ActiveCanonicalBundle;
  const rebuilt = completeActive('V19', 'SOURCE', 'REG', await canonicalInputHash('SOURCE', 'REG')); const result = await recoverTechnicalBundle({ currentEngineVersion: ENGINE, inspectBundle: async () => prepared(legacy), persistBundle: async value => value, rebuildFromStaging: async () => rebuilt, activate: () => undefined, localAdminRegistryHash: async () => 'REG' });
  assert.equal(result.mode, 'REBUILT'); assert.equal(result.active.engineVersion, ENGINE);
});

// C44
test('C44 — mismatch de staging continua rejeitado no recovery', async () => {
  const imported = completeActive('A', 'SOURCE_A', 'REG', await canonicalInputHash('SOURCE_A', 'REG')); const rebuilt = completeActive('B', 'SOURCE_B', 'REG', await canonicalInputHash('SOURCE_B', 'REG'));
  await assert.rejects(() => recoverTechnicalBundle({ currentEngineVersion: ENGINE, inspectBundle: async () => prepared(imported), persistBundle: async value => value, rebuildFromStaging: async () => rebuilt, activate: () => undefined, localAdminRegistryHash: async () => 'OTHER' }), /BUNDLE_STAGING_SNAPSHOT_MISMATCH/);
});

// C45
test('C45 — colisão de motorBuildId exige identidade completa antes de preferir generated', async () => {
  const active = completeActive('SAME_ID', 'SOURCE', 'REG_A', await canonicalInputHash('SOURCE', 'REG_A'));
  const manifest = { motorBuildId: 'SAME_ID', stagingManifestHash: 'SOURCE', adminRegistryHash: 'REG_B', canonicalInputHash: await canonicalInputHash('SOURCE', 'REG_B'), engineVersion: ENGINE, schemaVersion: 'v1' } as any;
  assert.equal(canonicalBundleTestHelpers.manifestIdentityMatchesActive(manifest, active), false);
  assert.match(sourceText('../src/canonical/bundleStore.ts'), /generatedBuildMatchesActive\(active\)/);
});

// C46
test('C46 — persistência de Bundle mantém rollback da versão anterior', () => {
  const content = sourceText('../src/canonical/bundleStore.ts'); assert.match(content, /const previous = await repository\.get/); assert.match(content, /if \(previous\) await repository\.put\(previous\)/); assert.match(content, /BUNDLE_STORAGE_VERIFY_FAILED/);
});

// C47
test('C47 — JSON provenance inclui registryHash e canonicalInputHash', () => {
  const provenance = { motorBuildId: 'B', stagingManifestHash: 'S', adminRegistryHash: 'R', canonicalInputHash: 'I', schemaVersion: 'v1', engineVersion: ENGINE };
  const payload = exportPayload(list('M1_ITEM_ESTOQUE'), provenance); assert.equal(payload.adminRegistryHash, 'R'); assert.equal(payload.canonicalInputHash, 'I'); assert.equal(payload.engineVersion, ENGINE);
});

// C48
test('C48 — Excel METADATA inclui identidade canônica completa', () => {
  const provenance = { motorBuildId: 'B', stagingManifestHash: 'S', adminRegistryHash: 'R', canonicalInputHash: 'I', schemaVersion: 'v1', engineVersion: ENGINE };
  const workbook = createExcelWorkbook(list('M1_ITEM_ESTOQUE'), provenance); const values = XLSX.utils.sheet_to_json(workbook.Sheets.METADATA, { header: 1 }) as unknown[][];
  const map = new Map(values.slice(1).map(row => [row[0], row[1]])); assert.equal(map.get('adminRegistryHash'), 'R'); assert.equal(map.get('canonicalInputHash'), 'I'); assert.equal(map.get('engineVersion'), ENGINE);
});

test('Fase 3B — exatamente 19 fontes físicas permanecem presentes', () => {
  assert.equal(REQUIRED_SOURCE_IDS.length, 19); assert.ok(REQUIRED_SOURCE_IDS.includes('NOVOS RCAS.xlsx')); assert.ok(REQUIRED_SOURCE_IDS.includes('lançamentos.xlsx')); assert.ok(REQUIRED_SOURCE_IDS.includes("08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx"));
});

test('Fase 3B — motores não leem IndexedDB nem CompetenceStore diretamente', () => {
  for (const file of ['../src/canonical/motors.ts', '../src/canonical/rcaResolver.ts', '../src/canonical/topRetailM2.ts', '../src/canonical/adminRegistryCanonicalAuthority.ts']) { const content = sourceText(file); assert.doesNotMatch(content, /indexedDB|competenceStore|loadCompetenceState|currentCompetence/); }
});
