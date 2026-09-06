import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { recoverTechnicalBundle } from '../src/canonical/bundleRecovery.ts';
import { CANONICAL_ENGINE_VERSION } from '../src/canonical/sourceImport.ts';
import { activateCanonicalBundleReference, resolveActiveCanonicalBundle, type ActiveCanonicalBundle } from '../src/canonical/runtime.ts';
import { inspectCanonicalBundle, persistCanonicalBundle, type BundleImportResult, type CanonicalBundleRepository, type PreparedCanonicalBundle, type StoredCanonicalBundle } from '../src/canonical/bundleStore.ts';
import { loadCandidateList } from '../src/canonical/candidateLists.ts';

class MemoryStorage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const ids = ['M1_ITEM_ESTOQUE', 'M2_CLIENTE_RCA', 'M3_MOVIMENTO_VENDAS', 'M4_HISTORICO_TRANSICAO'] as const;
const active = (id: string, engineVersion = CANONICAL_ENGINE_VERSION, stagingManifestHash = `hash-${id}`): ActiveCanonicalBundle => ({
  status: 'ACTIVE', motorBuildId: id, stagingManifestHash, schemaVersion: 'v1', engineVersion,
  approvedAt: '2026-09-06T00:00:00Z',
  rowCounts: { M1_ITEM_ESTOQUE: 1, M2_CLIENTE_RCA: 1, M3_MOVIMENTO_VENDAS: 1, M4_HISTORICO_TRANSICAO: 1 },
  factTypeCounts: { SALE: 1, INBOUND_ORDER: 0, RECEIPT: 0, TARGET: 0 },
});
const imported = (bundle: ActiveCanonicalBundle): BundleImportResult => ({
  motorBuildId: bundle.motorBuildId, stagingManifestHash: bundle.stagingManifestHash, schemaVersion: bundle.schemaVersion,
  engineVersion: bundle.engineVersion, rowCounts: bundle.rowCounts, active: bundle,
});
const prepared = (bundle: ActiveCanonicalBundle): PreparedCanonicalBundle => ({
  ...imported(bundle), bytes: new Uint8Array(), manifest: {
    bundleFormat: 'blue-jacket-canonical-bundle/v1', motorBuildId: bundle.motorBuildId, stagingManifestHash: bundle.stagingManifestHash,
    schemaVersion: bundle.schemaVersion, engineVersion: bundle.engineVersion, rowCounts: bundle.rowCounts, files: {}, createdAt: bundle.approvedAt,
  },
});
const passthroughPersist = async (value: PreparedCanonicalBundle) => imported(value.active);

test('bundle compatível restaura a referência exata e permanece ativo', async () => {
  const storage = new MemoryStorage() as unknown as Storage;
  const compatible = active('bundle-v18');
  const result = await recoverTechnicalBundle({
    currentEngineVersion: CANONICAL_ENGINE_VERSION,
    inspectBundle: async () => prepared(compatible),
    persistBundle: passthroughPersist,
    rebuildFromStaging: async () => { throw new Error('não deve reconstruir'); },
    activate: bundle => { activateCanonicalBundleReference(bundle, storage); },
  });
  assert.equal(result.mode, 'COMPATIBLE');
  assert.deepEqual(resolveActiveCanonicalBundle(storage), compatible);
  assert.equal(resolveActiveCanonicalBundle(storage)?.engineVersion, CANONICAL_ENGINE_VERSION);
});

test('bundle antigo com stagings válidos ativa somente o novo build reconstruído', async () => {
  const storage = new MemoryStorage() as unknown as Storage;
  const legacy = active('bundle-legado', 'stage3-v1');
  const rebuilt = active('bundle-reconstruido', CANONICAL_ENGINE_VERSION, legacy.stagingManifestHash);
  const result = await recoverTechnicalBundle({
    currentEngineVersion: CANONICAL_ENGINE_VERSION,
    inspectBundle: async () => prepared(legacy),
    persistBundle: passthroughPersist,
    rebuildFromStaging: async () => rebuilt,
    activate: bundle => { activateCanonicalBundleReference(bundle, storage); },
  });
  assert.equal(result.mode, 'REBUILT');
  assert.equal(result.active.motorBuildId, 'bundle-reconstruido');
  assert.deepEqual(resolveActiveCanonicalBundle(storage), rebuilt);
  assert.notEqual(resolveActiveCanonicalBundle(storage)?.motorBuildId, legacy.motorBuildId);
});

test('bundle antigo sem stagings falha controladamente e nunca ativa engine antiga', async () => {
  const storage = new MemoryStorage() as unknown as Storage;
  const legacy = active('bundle-legado', 'stage3-v1');
  await assert.rejects(() => recoverTechnicalBundle({
    currentEngineVersion: CANONICAL_ENGINE_VERSION,
    inspectBundle: async () => prepared(legacy),
    persistBundle: passthroughPersist,
    rebuildFromStaging: async () => { throw new Error('SOURCES_MISSING:19'); },
    activate: bundle => { activateCanonicalBundleReference(bundle, storage); },
  }), /BUNDLE_LEGACY_REBUILD_UNAVAILABLE/);
  assert.equal(resolveActiveCanonicalBundle(storage), null);
});

test('reconstrução que ainda devolve engine antiga é rejeitada antes da ativação', async () => {
  const storage = new MemoryStorage() as unknown as Storage;
  await assert.rejects(() => recoverTechnicalBundle({
    currentEngineVersion: CANONICAL_ENGINE_VERSION,
    inspectBundle: async () => prepared(active('bundle-A', 'stage3-v1')),
    persistBundle: passthroughPersist,
    rebuildFromStaging: async () => active('rebuild-invalido', 'stage3-v1'),
    activate: bundle => { activateCanonicalBundleReference(bundle, storage); },
  }), /BUNDLE_REBUILD_ENGINE_MISMATCH/);
  assert.equal(resolveActiveCanonicalBundle(storage), null);
});

test('bundle legado somente reconstrói quando stagingManifestHash identifica o mesmo snapshot', async () => {
  const storage = new MemoryStorage() as unknown as Storage;
  const legacy = active('bundle-A', 'stage3-v1', 'HASH_A');
  const rebuilt = active('build-reconstruido', CANONICAL_ENGINE_VERSION, 'HASH_A');
  const result = await recoverTechnicalBundle({ currentEngineVersion: CANONICAL_ENGINE_VERSION, inspectBundle: async () => prepared(legacy), persistBundle: passthroughPersist, rebuildFromStaging: async () => rebuilt, activate: bundle => { activateCanonicalBundleReference(bundle, storage); } });
  assert.equal(result.mode, 'REBUILT');
  assert.deepEqual(resolveActiveCanonicalBundle(storage), rebuilt);
});

test('bundle legado rejeita rebuild de snapshot diferente antes de ativar', async () => {
  const storage = new MemoryStorage() as unknown as Storage;
  await assert.rejects(() => recoverTechnicalBundle({ currentEngineVersion: CANONICAL_ENGINE_VERSION, inspectBundle: async () => prepared(active('bundle-A', 'stage3-v1', 'HASH_A')), persistBundle: passthroughPersist, rebuildFromStaging: async () => active('build-B', CANONICAL_ENGINE_VERSION, 'HASH_B'), activate: bundle => { activateCanonicalBundleReference(bundle, storage); } }), /BUNDLE_STAGING_SNAPSHOT_MISMATCH/);
  assert.equal(resolveActiveCanonicalBundle(storage), null);
});

class MemoryBundleRepository implements CanonicalBundleRepository {
  readonly data = new Map<string, StoredCanonicalBundle>();
  puts = 0;
  async put(bundle: StoredCanonicalBundle) { this.puts += 1; this.data.set(bundle.id, bundle); }
  async get(id: string) { return this.data.get(id); }
  async delete(id: string) { this.data.delete(id); }
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function realBundleFile({ buildId, snapshotHash, engineVersion, owner }: { buildId: string; snapshotHash: string; engineVersion: string; owner: string }) {
  const payloads = Object.fromEntries(ids.map(id => {
    const records = id === 'M3_MOVIMENTO_VENDAS' ? [{ owner, fact_type: 'SALE' }] : [{ owner }];
    return [`${id}.json`, strToU8(JSON.stringify({ id, records, sources: [], generatedAt: '2026-09-06T00:00:00Z', competence: '2026-09', snapshotDate: '2026-09-06', warnings: [], errors: [] }))];
  }));
  const manifest = { bundleFormat: 'blue-jacket-canonical-bundle/v1', motorBuildId: buildId, stagingManifestHash: snapshotHash, schemaVersion: 'v1', engineVersion, createdAt: '2026-09-06T00:00:00Z', rowCounts: Object.fromEntries(ids.map(id => [id, 1])), files: Object.fromEntries(ids.map(id => { const path = `${id}.json`; const bytes = payloads[path]; return [path, { path, bytes: bytes.byteLength, sha256: hash(bytes) }]; })) };
  const bytes = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), ...payloads }, { level: 6 });
  return new File([bytes], `${buildId}.zip`, { type: 'application/zip' });
}
const bundleLoadOptions = (repository: CanonicalBundleRepository, activeStorage: Storage) => ({ repository, activeStorage, hasGeneratedBuild: async () => false });

test('inspeção não persiste; bundle compatível persiste, relê e ativa M1–M4 pelo storage de produção', async () => {
  const repository = new MemoryBundleRepository(); const storage = new MemoryStorage() as unknown as Storage;
  const inspected = await inspectCanonicalBundle(realBundleFile({ buildId: 'build-v18', snapshotHash: 'HASH_V18', engineVersion: CANONICAL_ENGINE_VERSION, owner: 'V18' }));
  assert.equal(repository.puts, 0);
  await recoverTechnicalBundle({ currentEngineVersion: CANONICAL_ENGINE_VERSION, inspectBundle: async () => inspected, persistBundle: value => persistCanonicalBundle(value, repository), rebuildFromStaging: async () => { throw new Error('não deve reconstruir'); }, activate: bundle => { activateCanonicalBundleReference(bundle, storage); } });
  for (const id of ids) assert.equal((await loadCandidateList(id, bundleLoadOptions(repository, storage))).records[0]?.owner, 'V18');
  assert.equal(repository.puts, 1);
  assert.equal(resolveActiveCanonicalBundle(storage)?.engineVersion, CANONICAL_ENGINE_VERSION);
});

test('mismatch com colisão de motorBuildId preserva referência e M1–M4 reais do BUILD_B', async () => {
  const repository = new MemoryBundleRepository(); const storage = new MemoryStorage() as unknown as Storage;
  const buildB = await inspectCanonicalBundle(realBundleFile({ buildId: 'COLLISION_X', snapshotHash: 'HASH_B', engineVersion: CANONICAL_ENGINE_VERSION, owner: 'B' }));
  await persistCanonicalBundle(buildB, repository); activateCanonicalBundleReference(buildB.active, storage);
  for (const id of ids) assert.equal((await loadCandidateList(id, bundleLoadOptions(repository, storage))).records[0]?.owner, 'B');
  const bundleA = await inspectCanonicalBundle(realBundleFile({ buildId: 'COLLISION_X', snapshotHash: 'HASH_A', engineVersion: 'stage3-v1', owner: 'A' }));
  const putsBefore = repository.puts;
  await assert.rejects(() => recoverTechnicalBundle({ currentEngineVersion: CANONICAL_ENGINE_VERSION, inspectBundle: async () => bundleA, persistBundle: value => persistCanonicalBundle(value, repository), rebuildFromStaging: async () => active('rebuild-A', CANONICAL_ENGINE_VERSION, 'HASH_OTHER'), activate: bundle => { activateCanonicalBundleReference(bundle, storage); } }), /BUNDLE_STAGING_SNAPSHOT_MISMATCH/);
  assert.equal(repository.puts, putsBefore);
  assert.deepEqual(resolveActiveCanonicalBundle(storage), buildB.active);
  assert.equal((await repository.get('COLLISION_X'))?.manifest.stagingManifestHash, 'HASH_B');
  for (const id of ids) assert.equal((await loadCandidateList(id, bundleLoadOptions(repository, storage))).records[0]?.owner, 'B');
});

test('falha de verificação da persistência restaura atomicamente o bundle anterior', async () => {
  const repository = new MemoryBundleRepository(); const storage = new MemoryStorage() as unknown as Storage;
  const buildB = await inspectCanonicalBundle(realBundleFile({ buildId: 'ATOMIC_X', snapshotHash: 'HASH_B', engineVersion: CANONICAL_ENGINE_VERSION, owner: 'B' }));
  await persistCanonicalBundle(buildB, repository); activateCanonicalBundleReference(buildB.active, storage);
  const bundleA = await inspectCanonicalBundle(realBundleFile({ buildId: 'ATOMIC_X', snapshotHash: 'HASH_A', engineVersion: CANONICAL_ENGINE_VERSION, owner: 'A' }));
  const originalPut = repository.put.bind(repository); let corruptNext = true;
  repository.put = async value => { await originalPut(value); if (corruptNext) { corruptNext = false; const stored = repository.data.get(value.id)!; repository.data.set(value.id, { ...stored, manifest: { ...stored.manifest, stagingManifestHash: 'CORRUPT' } }); } };
  await assert.rejects(() => recoverTechnicalBundle({ currentEngineVersion: CANONICAL_ENGINE_VERSION, inspectBundle: async () => bundleA, persistBundle: value => persistCanonicalBundle(value, repository), rebuildFromStaging: async () => { throw new Error('não deve reconstruir'); }, activate: bundle => { activateCanonicalBundleReference(bundle, storage); } }), /BUNDLE_STORAGE_VERIFY_FAILED/);
  assert.deepEqual(resolveActiveCanonicalBundle(storage), buildB.active);
  assert.equal((await repository.get('ATOMIC_X'))?.manifest.stagingManifestHash, 'HASH_B');
  for (const id of ids) assert.equal((await loadCandidateList(id, bundleLoadOptions(repository, storage))).records[0]?.owner, 'B');
});

test('Bases não edita Meta Redes e MetasPage continua como editor oficial', () => {
  const bases = readFileSync(new URL('../src/pages/admin/BasesPage.tsx', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8');
  const targets = readFileSync(new URL('../src/pages/MetasPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(bases, /const competence = '2026-08'|saveNetworkTarget|setNetworkTargetFor|Meta Redes Geral|Salvar Meta Redes/);
  assert.match(admin, /view === 'metas'\) return <MetasPage \/>/);
  assert.match(targets, /setNetworkTargetFor/);
  assert.match(targets, /Meta Redes Geral/);
});
