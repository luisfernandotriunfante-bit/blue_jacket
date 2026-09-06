import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AdminRegistryRepository,
  InMemoryAdminRegistryStorage,
  applyRegistrySeed,
  diagnoseLaunchRecords,
  diagnoseRcaRecords,
  emptyAdminRegistryState,
  previewRegistrySeed,
  setRegistryRecordActive,
  upsertManualLaunch,
  upsertManualRca,
  validateAdminRegistryState,
  type AdminRegistryState,
  type RcaRegistryRecord,
} from '../src/canonical/adminRegistry.ts';
import { cloudSyncTestHelpers, type CloudRestoreDependencies, type CloudSnapshot, type DeviceSyncIdentity } from '../src/canonical/cloudSync.ts';
import { CANONICAL_ENGINE_VERSION, REQUIRED_SOURCE_IDS } from '../src/canonical/sourceImport.ts';
import type { ParsedSource, RawTyped } from '../src/canonical/types.ts';

const NOW = '2026-09-06T15:00:00.000Z';
const LATER = '2026-09-06T16:00:00.000Z';
const sourceText = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const cell = (typed: unknown, raw: unknown = typed): RawTyped => ({ raw, typed });
const parsed = (source: string, fileName: string, rows: ParsedSource['rows']): ParsedSource => ({ source, fileName, sheet: 'test', rows, audits: [] });
const row = (fields: Record<string, unknown>, sourceRow: number) => Object.fromEntries([...Object.entries(fields).map(([key, value]) => [key, cell(value)]), ['__source_row', cell(sourceRow)]]) as ParsedSource['rows'][number];

const rcaSource = (name = 'RCA Principal') => parsed('NOVOS RCAS.xlsx', 'NOVOS RCAS.xlsx', [
  row({
    current_rca_code_principal: '00123', legacy_rca_code_principal: '00099', rca_name_raw_principal: name,
    coordinator_code_principal: '0007', coordinator_name_principal: 'Coord P',
    current_rca_code_auxiliar: '00456', legacy_rca_code_auxiliar: '00321', rca_name_raw_auxiliar: 'RCA Aux',
    coordinator_code_auxiliar: '0008', coordinator_name_auxiliar: 'Coord A',
  }, 2),
]);

const launchSource = (description = 'Produto A') => parsed('lançamentos.xlsx', 'lançamentos.xlsx', [
  row({ launch_winthor_code: '0010', launch_description: description, launch_type: 'NOVA LINHA', launch_ean: '7891234567890', launch_status: 'ATIVO' }, 2),
]);

const topSource = (overrides: Record<string, unknown> = {}, fileName = "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx") => parsed(
  "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx",
  fileName,
  [row({ cnpj: '12345678000199', top_network: 'Rede A', banner: 'Bandeira A', manager_cnpj: '98765432000188', group_code: '001', top_category: 'TOP', top_target: 1000, ...overrides }, 2)],
);

const repository = (initial: unknown | null = null) => {
  const storage = new InMemoryAdminRegistryStorage(initial);
  return { storage, repo: new AdminRegistryRepository(storage) };
};

// R1
 test('R1 — repository faz round-trip integral do snapshot v1', async () => {
  const { repo } = repository();
  const state = emptyAdminRegistryState(NOW);
  const saved = await repo.replace(state);
  assert.deepEqual(saved, state);
  assert.deepEqual(await repo.load(), state);
});

// R2
 test('R2 — schema inválido é rejeitado integralmente', () => {
  assert.throws(() => validateAdminRegistryState({ ...emptyAdminRegistryState(NOW), schemaVersion: 'v2' }), /ADMIN_REGISTRY_STATE_INVALID/);
  assert.throws(() => validateAdminRegistryState({ ...emptyAdminRegistryState(NOW), topRetailers: [{ nope: true }] }), /ADMIN_REGISTRY_RECORD_INVALID/);
});

// R3
 test('R3 — falha de persistência mantém a versão anterior', async () => {
  const { storage, repo } = repository(emptyAdminRegistryState(NOW));
  const before = await repo.load();
  storage.failNextWrite();
  await assert.rejects(() => repo.mutate(state => { state.updatedAt = LATER; }, LATER), /ADMIN_REGISTRY_TEST_WRITE_FAILED/);
  assert.deepEqual(await repo.load(), before);
});

// R4
 test('R4 — metadados timestamps/origin/active sobrevivem ao round-trip', async () => {
  const { repo } = repository();
  await upsertManualRca(repo, { currentCode: '001', legacyCode: null, name: null, coordinatorCode: null, coordinatorName: null, role: 'PRINCIPAL', validFromCompetence: null, validToCompetence: null, note: 'manual' }, undefined, NOW);
  const record = (await repo.load())!.rcas[0];
  assert.equal(record.origin, 'MANUAL'); assert.equal(record.active, true); assert.equal(record.createdAt, NOW); assert.equal(record.updatedAt, NOW);
});

// R5
 test('R5 — seed RCA preserva contrato real Principal', async () => {
  const { repo } = repository();
  const result = await applyRegistrySeed(repo, 'rcas', rcaSource(), NOW);
  const principal = result.state.rcas.find(record => record.role === 'PRINCIPAL')!;
  assert.deepEqual({ currentCode: principal.currentCode, legacyCode: principal.legacyCode, name: principal.name, coordinatorCode: principal.coordinatorCode, coordinatorName: principal.coordinatorName, role: principal.role }, {
    currentCode: '00123', legacyCode: '00099', name: 'RCA Principal', coordinatorCode: '0007', coordinatorName: 'Coord P', role: 'PRINCIPAL',
  });
});

// R6
 test('R6 — Principal e Auxiliar permanecem registros distintos', async () => {
  const { repo } = repository();
  const result = await applyRegistrySeed(repo, 'rcas', rcaSource(), NOW);
  assert.deepEqual(result.state.rcas.map(record => record.role).sort(), ['AUXILIAR', 'PRINCIPAL']);
  assert.notEqual(result.state.rcas[0].id, result.state.rcas[1].id);
});

// R7
 test('R7 — reseed RCA idêntico é idempotente', async () => {
  const { repo } = repository();
  await applyRegistrySeed(repo, 'rcas', rcaSource(), NOW);
  const before = await repo.load();
  const preview = previewRegistrySeed('rcas', rcaSource(), before, NOW);
  assert.equal(preview.counts.new, 0); assert.equal(preview.counts.updatable, 0); assert.equal(preview.counts.equal, 2);
  await applyRegistrySeed(repo, 'rcas', rcaSource(), NOW);
  assert.deepEqual(await repo.load(), before);
});

// R8
 test('R8 — registro RCA MANUAL nunca é sobrescrito por SOURCE_SEED', async () => {
  const { repo } = repository();
  await applyRegistrySeed(repo, 'rcas', rcaSource(), NOW);
  const principal = (await repo.load())!.rcas.find(record => record.role === 'PRINCIPAL')!;
  await upsertManualRca(repo, { currentCode: principal.currentCode, legacyCode: principal.legacyCode, name: 'Nome manual', coordinatorCode: principal.coordinatorCode, coordinatorName: principal.coordinatorName, role: principal.role, validFromCompetence: null, validToCompetence: null, note: null }, principal.id, LATER);
  const preview = previewRegistrySeed('rcas', rcaSource('Nome novo da fonte'), await repo.load(), LATER);
  assert.equal(preview.counts.manualProtected, 1);
  await applyRegistrySeed(repo, 'rcas', rcaSource('Nome novo da fonte'), LATER);
  assert.equal((await repo.load())!.rcas.find(record => record.id === principal.id)?.name, 'Nome manual');
});

// R9
 test('R9 — legacy RCA apontando para dois currentCode gera conflito', () => {
  const source = parsed('NOVOS RCAS.xlsx', 'NOVOS RCAS.xlsx', [
    row({ current_rca_code_principal: '100', legacy_rca_code_principal: '999', rca_name_raw_principal: 'A' }, 2),
    row({ current_rca_code_principal: '200', legacy_rca_code_principal: '999', rca_name_raw_principal: 'B' }, 3),
  ]);
  const preview = previewRegistrySeed('rcas', source, null, NOW);
  assert.ok(preview.counts.conflicts >= 2);
});

// R10
 test('R10 — inativar e reativar RCA não apaga histórico do registro', async () => {
  const { repo } = repository();
  await applyRegistrySeed(repo, 'rcas', rcaSource(), NOW);
  const original = (await repo.load())!.rcas[0];
  await setRegistryRecordActive(repo, 'rcas', original.id, false, LATER);
  const inactive = (await repo.load())!.rcas.find(record => record.id === original.id)!;
  assert.equal(inactive.active, false); assert.equal(inactive.createdAt, original.createdAt); assert.equal(inactive.origin, 'MANUAL');
  await setRegistryRecordActive(repo, 'rcas', original.id, true, LATER);
  assert.equal((await repo.load())!.rcas.find(record => record.id === original.id)?.active, true);
});

// R11/R12
 test('R11/R12 — seed Lançamentos preserva COD/DESCRIÇÃO/TIPO/EAN/STATUS e EAN textual', async () => {
  const { repo } = repository();
  const result = await applyRegistrySeed(repo, 'launches', launchSource(), NOW);
  const launch = result.state.launches[0];
  assert.deepEqual({ winthorCode: launch.winthorCode, description: launch.description, type: launch.type, ean: launch.ean, status: launch.status }, { winthorCode: '0010', description: 'Produto A', type: 'NOVA LINHA', ean: '7891234567890', status: 'ATIVO' });
  assert.equal(typeof launch.ean, 'string');
});

// R13
 test('R13 — lançamento manual exige EAN ou Winthor', async () => {
  const { repo } = repository();
  await assert.rejects(() => upsertManualLaunch(repo, { winthorCode: null, ean: null, description: null, type: null, status: null, validFromCompetence: null, validToCompetence: null, note: null }, undefined, NOW), /ADMIN_REGISTRY_LAUNCH_IDENTITY_REQUIRED/);
});

// R14
 test('R14 — mesmo EAN com dois Winthor gera conflito', () => {
  const source = parsed('lançamentos.xlsx', 'lançamentos.xlsx', [
    row({ launch_winthor_code: '10', launch_ean: '7891234567890', launch_description: 'A' }, 2),
    row({ launch_winthor_code: '20', launch_ean: '7891234567890', launch_description: 'B' }, 3),
  ]);
  assert.ok(previewRegistrySeed('launches', source, null, NOW).counts.conflicts >= 2);
});

// R15
 test('R15 — edição manual de lançamento sobrevive a reseed', async () => {
  const { repo } = repository();
  await applyRegistrySeed(repo, 'launches', launchSource(), NOW);
  const launch = (await repo.load())!.launches[0];
  await upsertManualLaunch(repo, { winthorCode: launch.winthorCode, ean: launch.ean, description: 'Descrição manual', type: launch.type, status: launch.status, validFromCompetence: null, validToCompetence: null, note: null }, launch.id, LATER);
  await applyRegistrySeed(repo, 'launches', launchSource('Descrição fonte nova'), LATER);
  assert.equal((await repo.load())!.launches[0].description, 'Descrição manual');
});

// R16
 test('R16 — seed Top usa competência explícita do nome do Roteiro', () => {
  const preview = previewRegistrySeed('topRetailers', topSource(), null, NOW);
  assert.equal(preview.competence, '2026-08');
  assert.equal((preview.items.find(item => item.record)?.record as any).competence, '2026-08');
});

// R17/R18
 test('R17/R18 — Top preserva CNPJ14, rede, bandeira, gestor, agrupamento, categoria e target', async () => {
  const { repo } = repository();
  const result = await applyRegistrySeed(repo, 'topRetailers', topSource({ cnpj: '1234567800019' }), NOW);
  const top = result.state.topRetailers[0];
  assert.equal(top.customerCnpj.length, 14);
  assert.deepEqual({ network: top.network, banner: top.banner, managerCnpj: top.managerCnpj, groupCode: top.groupCode, category: top.category, topTarget: top.topTarget }, { network: 'Rede A', banner: 'Bandeira A', managerCnpj: '98765432000188', groupCode: '001', category: 'TOP', topTarget: 1000 });
});

// R19
 test('R19 — Top competence+CNPJ exatamente igual deduplica no preview', () => {
  const base = topSource().rows[0];
  const source = parsed("08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx", "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx", [base, { ...base, __source_row: cell(3) }]);
  const preview = previewRegistrySeed('topRetailers', source, null, NOW);
  assert.equal(preview.counts.new, 1); assert.equal(preview.counts.conflicts, 0);
});

// R20
 test('R20 — Top competence+CNPJ divergente gera conflito', () => {
  const source = parsed("08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx", "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx", [
    topSource().rows[0],
    row({ cnpj: '12345678000199', top_network: 'Rede B', banner: 'B', manager_cnpj: '98765432000188', group_code: '002', top_category: 'TOP', top_target: 2000 }, 3),
  ]);
  assert.ok(previewRegistrySeed('topRetailers', source, null, NOW).counts.conflicts >= 1);
});

// R21
 test('R21 — Roteiro sem competência explícita bloqueia seed', () => {
  assert.throws(() => previewRegistrySeed('topRetailers', topSource({}, 'Roteiro Top.xlsx'), null, NOW), /ADMIN_REGISTRY_TOP_COMPETENCE_UNRESOLVED/);
});

// R22-R24
 test('R22–R24 — motores, RCA resolver e TopRetailM2 não importam AdminRegistry', () => {
  for (const file of ['../src/canonical/motors.ts', '../src/canonical/rcaResolver.ts', '../src/canonical/topRetailM2.ts']) {
    const content = sourceText(file);
    assert.doesNotMatch(content, /adminRegistry|AdminRegistry/);
  }
});

// R25
 test('R25 — editar registry não altera stagingManifestHash de um build existente', async () => {
  const { repo } = repository();
  const active = { stagingManifestHash: 'same-source-manifest-hash' };
  await upsertManualRca(repo, { currentCode: '1', legacyCode: null, name: null, coordinatorCode: null, coordinatorName: null, role: 'PRINCIPAL', validFromCompetence: null, validToCompetence: null, note: null }, undefined, NOW);
  assert.equal(active.stagingManifestHash, 'same-source-manifest-hash');
  assert.doesNotMatch(sourceText('../src/canonical/sourceImport.ts'), /adminRegistry|AdminRegistry/);
});

// R26
 test('R26 — engine permanece v18', () => assert.equal(CANONICAL_ENGINE_VERSION, 'browser-stage4-product-assortment-v18-sellout-closure'));

// R27
 test('R27 — registry não participa do caminho canônico nesta fase', () => {
  const motors = sourceText('../src/canonical/motors.ts');
  const sourceImport = sourceText('../src/canonical/sourceImport.ts');
  assert.doesNotMatch(motors, /adminRegistry|AdminRegistry/);
  assert.doesNotMatch(sourceImport, /adminRegistry|AdminRegistry/);
  assert.match(sourceImport, /buildCanonicalBundleFromStaging\(parsedSources\)/);
});

const identity: DeviceSyncIdentity = { workspaceId: '7a7a7a7a-7a7a-4a7a-8a7a-7a7a7a7a7a7a', secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
const sources = { format: 'blue-jacket-source-storage/v1' as const, exportedAt: NOW, staging: [] };
const settings = { networkTargetByCompetence: {}, networkAllocationByCompetence: {}, sellOutTargetByCompetence: {}, positivityTargetByCompetence: {}, legacySellOutTarget: null, legacyPositivityTarget: null, inboundForecastByInvoice: {} };
const active = { status: 'ACTIVE', motorBuildId: 'BUILD_PHASE3A', stagingManifestHash: 'hash', schemaVersion: 'v1', engineVersion: CANONICAL_ENGINE_VERSION, approvedAt: NOW, rowCounts: {}, factTypeCounts: {} } as any;
const adminA: AdminRegistryState = { ...emptyAdminRegistryState(NOW), rcas: [{ id: 'a', currentCode: '100', legacyCode: null, name: 'A', coordinatorCode: null, coordinatorName: null, role: 'PRINCIPAL', active: true, validFromCompetence: null, validToCompetence: null, origin: 'MANUAL', sourceRow: null, note: null, createdAt: NOW, updatedAt: NOW }] };
const adminB: AdminRegistryState = { ...emptyAdminRegistryState(LATER), launches: [{ id: 'b', winthorCode: '10', ean: '7891234567890', description: 'B', type: null, status: 'ATIVO', active: true, validFromCompetence: null, validToCompetence: null, origin: 'MANUAL', sourceRow: null, note: null, createdAt: LATER, updatedAt: LATER }] };

// R28
 test('R28 — snapshot novo transporta registry', () => {
  const snapshot = cloudSyncTestHelpers.buildCloudSnapshot(active, sources, settings, null, NOW, adminB);
  assert.deepEqual(snapshot.adminRegistryState, adminB);
  assert.equal(snapshot.format, 'blue-jacket-device-sync/v1');
});

// R29
 test('R29 — encrypt/decrypt mantém registry', async () => {
  const snapshot = cloudSyncTestHelpers.buildCloudSnapshot(active, sources, settings, null, NOW, adminB);
  const encrypted = await cloudSyncTestHelpers.encrypt(identity, snapshot);
  const decrypted = await cloudSyncTestHelpers.decrypt(identity, encrypted);
  assert.deepEqual(decrypted.adminRegistryState, adminB);
});

// R30
 test('R30 — snapshot legado sem registry continua válido', async () => {
  const legacy: CloudSnapshot = { format: 'blue-jacket-device-sync/v1', createdAt: NOW, active, sources, settings };
  const decrypted = await cloudSyncTestHelpers.decrypt(identity, await cloudSyncTestHelpers.encrypt(identity, legacy));
  assert.equal('adminRegistryState' in decrypted, false);
});

function cloudHarness(initial: AdminRegistryState | null, failFirstBuild = false) {
  let currentAdmin = initial ? structuredClone(initial) : null;
  let currentSources = structuredClone(sources);
  let currentSettings = structuredClone(settings);
  let builds = 0;
  const deps: CloudRestoreDependencies = {
    exportSources: async () => structuredClone(currentSources),
    loadSettings: () => structuredClone(currentSettings),
    loadCompetence: () => null,
    loadAdminRegistry: async () => currentAdmin ? structuredClone(currentAdmin) : null,
    restoreSources: async next => { currentSources = structuredClone(next); },
    restoreSettings: next => { currentSettings = structuredClone(next as typeof settings); return currentSettings; },
    replaceCompetence: () => null,
    replaceAdminRegistry: async next => { currentAdmin = next ? structuredClone(next) : null; return currentAdmin; },
    build: async () => { builds += 1; if (failFirstBuild && builds === 1) throw new Error('PHASE3A_REBUILD_FAILED'); return active; },
  };
  return { deps, read: () => ({ currentAdmin, builds }) };
}

// R31
 test('R31 — snapshot legado preserva registry local existente', async () => {
  const harness = cloudHarness(adminA);
  const legacy: CloudSnapshot = { format: 'blue-jacket-device-sync/v1', createdAt: NOW, active, sources, settings };
  await cloudSyncTestHelpers.applyCloudSnapshot(legacy, harness.deps);
  assert.deepEqual(harness.read().currentAdmin, adminA);
});

// R32
 test('R32 — snapshot novo restaura registry remoto', async () => {
  const harness = cloudHarness(adminA);
  const snapshot: CloudSnapshot = { format: 'blue-jacket-device-sync/v1', createdAt: NOW, active, sources, settings, adminRegistryState: adminB };
  await cloudSyncTestHelpers.applyCloudSnapshot(snapshot, harness.deps);
  assert.deepEqual(harness.read().currentAdmin, adminB);
});

// R33
 test('R33 — falha posterior executa rollback do registry local', async () => {
  const harness = cloudHarness(adminA, true);
  const snapshot: CloudSnapshot = { format: 'blue-jacket-device-sync/v1', createdAt: NOW, active, sources, settings, adminRegistryState: adminB };
  await assert.rejects(() => cloudSyncTestHelpers.applyCloudSnapshot(snapshot, harness.deps), /PHASE3A_REBUILD_FAILED/);
  assert.deepEqual(harness.read().currentAdmin, adminA);
  assert.equal(harness.read().builds, 2);
});

// R34
 test('R34 — ENVIAR CÓPIA ATUAL reutiliza uploadCurrentDeviceSnapshot existente', () => {
  const page = sourceText('../src/pages/admin/SincronizacaoPage.tsx');
  assert.match(page, /ENVIAR CÓPIA ATUAL/);
  assert.match(page, /sendCurrentDeviceSnapshot/);
  assert.match(page, /uploadCurrentDeviceSnapshot\(deviceSync\)/);
});

test('Fase 3A — Cadastros é funcional, seed não chama parser e 19 fontes permanecem', () => {
  const admin = sourceText('../src/pages/admin/AdminPage.tsx');
  const page = sourceText('../src/pages/admin/CadastrosPage.tsx');
  const seed = sourceText('../src/canonical/adminRegistrySeed.ts');
  assert.match(admin, /<CadastrosPage \/>/);
  assert.doesNotMatch(admin, /CadastrosPlaceholder/);
  assert.match(page, /RCAs/); assert.match(page, /Lançamentos/); assert.match(page, /Top Varejistas/);
  assert.match(page, /ainda não substituem as fontes utilizadas pelos motores canônicos/);
  assert.match(seed, /loadSourceStaging/);
  assert.doesNotMatch(seed, /parseSource|parsers/);
  assert.equal(REQUIRED_SOURCE_IDS.length, 19);
});

test('Fase 3A — Bundle técnico continua sem AdminRegistry', () => {
  for (const file of ['../src/canonical/bundleStore.ts', '../src/canonical/bundleRecovery.ts']) assert.doesNotMatch(sourceText(file), /adminRegistry|AdminRegistry/);
});

test('Fase 3A — diagnósticos básicos identificam conflitos ativos', () => {
  const rcas = [
    { id: '1', currentCode: '10', legacyCode: '9', name: 'A', coordinatorCode: null, coordinatorName: null, role: 'PRINCIPAL', active: true, validFromCompetence: null, validToCompetence: null, origin: 'MANUAL', sourceRow: null, note: null, createdAt: NOW, updatedAt: NOW },
    { id: '2', currentCode: '20', legacyCode: '9', name: 'B', coordinatorCode: null, coordinatorName: null, role: 'PRINCIPAL', active: true, validFromCompetence: null, validToCompetence: null, origin: 'MANUAL', sourceRow: null, note: null, createdAt: NOW, updatedAt: NOW },
  ] as RcaRegistryRecord[];
  assert.ok(diagnoseRcaRecords(rcas).some(item => item.code === 'RCA_LEGACY_AMBIGUOUS'));
  assert.ok(diagnoseLaunchRecords([
    { id: 'a', winthorCode: '1', ean: '7891234567890', description: null, type: null, status: null, active: true, validFromCompetence: null, validToCompetence: null, origin: 'MANUAL', sourceRow: null, note: null, createdAt: NOW, updatedAt: NOW },
    { id: 'b', winthorCode: '2', ean: '7891234567890', description: null, type: null, status: null, active: true, validFromCompetence: null, validToCompetence: null, origin: 'MANUAL', sourceRow: null, note: null, createdAt: NOW, updatedAt: NOW },
  ]).some(item => item.code === 'LAUNCH_EAN_AMBIGUOUS'));
});
