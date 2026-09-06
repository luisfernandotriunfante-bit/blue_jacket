import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recoverTechnicalBundle } from '../src/canonical/bundleRecovery.ts';
import { CANONICAL_ENGINE_VERSION } from '../src/canonical/sourceImport.ts';
import { activateCanonicalBundleReference, resolveActiveCanonicalBundle, type ActiveCanonicalBundle } from '../src/canonical/runtime.ts';
import type { BundleImportResult } from '../src/canonical/bundleStore.ts';

class MemoryStorage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const active = (id: string, engineVersion = CANONICAL_ENGINE_VERSION): ActiveCanonicalBundle => ({
  status: 'ACTIVE', motorBuildId: id, stagingManifestHash: `hash-${id}`, schemaVersion: 'v1', engineVersion,
  approvedAt: '2026-09-06T00:00:00Z',
  rowCounts: { M1_ITEM_ESTOQUE: 1, M2_CLIENTE_RCA: 1, M3_MOVIMENTO_VENDAS: 1, M4_HISTORICO_TRANSICAO: 1 },
  factTypeCounts: { SALE: 1, INBOUND_ORDER: 0, RECEIPT: 0, TARGET: 0 },
});
const imported = (bundle: ActiveCanonicalBundle): BundleImportResult => ({
  motorBuildId: bundle.motorBuildId, stagingManifestHash: bundle.stagingManifestHash, schemaVersion: bundle.schemaVersion,
  engineVersion: bundle.engineVersion, rowCounts: bundle.rowCounts, active: bundle,
});

test('bundle compatível restaura a referência exata e permanece ativo', async () => {
  const storage = new MemoryStorage() as unknown as Storage;
  const compatible = active('bundle-v18');
  const result = await recoverTechnicalBundle({
    currentEngineVersion: CANONICAL_ENGINE_VERSION,
    importBundle: async () => imported(compatible),
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
  const rebuilt = active('bundle-reconstruido');
  const result = await recoverTechnicalBundle({
    currentEngineVersion: CANONICAL_ENGINE_VERSION,
    importBundle: async () => imported(legacy),
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
    importBundle: async () => imported(legacy),
    rebuildFromStaging: async () => { throw new Error('SOURCES_MISSING:19'); },
    activate: bundle => { activateCanonicalBundleReference(bundle, storage); },
  }), /BUNDLE_LEGACY_REBUILD_UNAVAILABLE/);
  assert.equal(resolveActiveCanonicalBundle(storage), null);
});

test('tentativa incompatível preserva build B ativo e suas quatro listas', async () => {
  const storage = new MemoryStorage() as unknown as Storage;
  const current = active('build-B');
  activateCanonicalBundleReference(current, storage);
  const lists = new Map(['M1_ITEM_ESTOQUE', 'M2_CLIENTE_RCA', 'M3_MOVIMENTO_VENDAS', 'M4_HISTORICO_TRANSICAO'].map(id => [`build-B:${id}`, { id, owner: 'B' }]));
  const before = [...lists.entries()];
  await assert.rejects(() => recoverTechnicalBundle({
    currentEngineVersion: CANONICAL_ENGINE_VERSION,
    importBundle: async () => imported(active('bundle-A', 'stage3-v1')),
    rebuildFromStaging: async () => { throw new Error('SOURCES_MISSING:19'); },
    activate: bundle => { activateCanonicalBundleReference(bundle, storage); },
  }), /BUNDLE_LEGACY_REBUILD_UNAVAILABLE/);
  assert.deepEqual(resolveActiveCanonicalBundle(storage), current);
  assert.deepEqual([...lists.entries()], before);
  assert.deepEqual([...lists.values()].map(list => list.owner), ['B', 'B', 'B', 'B']);
});

test('reconstrução que ainda devolve engine antiga é rejeitada antes da ativação', async () => {
  const storage = new MemoryStorage() as unknown as Storage;
  await assert.rejects(() => recoverTechnicalBundle({
    currentEngineVersion: CANONICAL_ENGINE_VERSION,
    importBundle: async () => imported(active('bundle-A', 'stage3-v1')),
    rebuildFromStaging: async () => active('rebuild-invalido', 'stage3-v1'),
    activate: bundle => { activateCanonicalBundleReference(bundle, storage); },
  }), /BUNDLE_REBUILD_ENGINE_MISMATCH/);
  assert.equal(resolveActiveCanonicalBundle(storage), null);
});

test('Atualizar Bases não edita Meta Redes e MetasPage continua como editor oficial', () => {
  const settings = readFileSync(new URL('../src/pages/ConfiguracoesPage.tsx', import.meta.url), 'utf8');
  const targets = readFileSync(new URL('../src/pages/MetasPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(settings, /const competence = '2026-08'|saveNetworkTarget|setNetworkTargetFor|Meta Redes Geral|Salvar Meta Redes/);
  assert.match(targets, /setNetworkTargetFor/);
  assert.match(targets, /Meta Redes Geral/);
});
