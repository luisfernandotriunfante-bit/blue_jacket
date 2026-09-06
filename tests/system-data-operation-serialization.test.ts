import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalAdminRegistryHash, canonicalInputHash } from '../src/canonical/adminRegistryIdentity.ts';
import {
  cloudSyncTestHelpers,
  type CloudUploadDependencies,
  type DeviceSyncIdentity,
} from '../src/canonical/cloudSync.ts';
import { sourceStorageSnapshotManifestHash } from '../src/canonical/sourceSnapshotIdentity.ts';
import {
  createSystemDataOperationCoordinator,
} from '../src/canonical/systemDataOperationCoordinator.ts';
import {
  CANONICAL_ENGINE_VERSION,
  REQUIRED_SOURCE_IDS,
  type SourceStorageSnapshot,
} from '../src/canonical/sourceImport.ts';
import { syncActiveBuildIfPaired, type BaseAutoSyncDependencies } from '../src/pages/admin/baseAutoSync.ts';
import { activateBuildAndWaitForAutoSync } from '../src/pages/admin/baseUpdateFlow.ts';

const NOW = '2026-09-06T16:00:00.000Z';
const sourceText = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const identity: DeviceSyncIdentity = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
};

const build = async (motorBuildId: string, stagingManifestHash = 'HASH') => {
  const adminRegistryHash = await canonicalAdminRegistryHash(null);
  return {
    status: 'ACTIVE',
    motorBuildId,
    stagingManifestHash,
    adminRegistryHash,
    canonicalInputHash: await canonicalInputHash(stagingManifestHash, adminRegistryHash),
    schemaVersion: 'v1',
    engineVersion: CANONICAL_ENGINE_VERSION,
    approvedAt: NOW,
    rowCounts: {},
    factTypeCounts: {},
  } as any;
};

function makeSources(seed: string): SourceStorageSnapshot {
  return {
    format: 'blue-jacket-source-storage/v1',
    exportedAt: NOW,
    staging: REQUIRED_SOURCE_IDS.map((source, index) => ({
      source,
      manifest: {
        source,
        fileName: `${source}-${seed}`,
        fileHash: `${seed}-hash-${index}`,
        parserVersion: `${seed}-parser-${index}`,
        schemaVersion: 'v1',
        parsedRows: 0,
        warnings: 0,
        errors: 0,
        updatedAt: NOW,
        status: 'VALID',
      },
      parsed: { source, fileName: `${source}-${seed}`, sheet: 'test', rows: [], audits: [] },
    })),
  } as SourceStorageSnapshot;
}

function uploadDependencies(options: {
  sources: SourceStorageSnapshot;
  actives: any[];
  onPut: () => void;
}): CloudUploadDependencies {
  let activeRead = 0;
  return {
    getActive: () => options.actives[Math.min(activeRead++, options.actives.length - 1)] ?? null,
    exportSources: async () => options.sources,
    sourceManifestHash: sourceStorageSnapshotManifestHash,
    registryHash: canonicalAdminRegistryHash,
    inputHash: canonicalInputHash,
    loadSettings: () => ({
      networkTargetByCompetence: {}, networkAllocationByCompetence: {}, sellOutTargetByCompetence: {}, positivityTargetByCompetence: {}, legacySellOutTarget: null, legacyPositivityTarget: null, inboundForecastByInvoice: {},
    }),
    loadCompetence: () => null,
    loadAdminRegistry: async () => null,
    encryptSnapshot: async () => new Uint8Array([1, 2, 3]),
    uploadPayload: async () => {
      options.onPut();
      return { updatedAt: NOW, bytes: 3 };
    },
    saveState: () => undefined,
    now: () => NOW,
  };
}

test('S1 — BASE_UPDATE pendente bloqueia SYNC_SEND antes do upload', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  const pending = deferred<void>();
  let uploads = 0;
  const base = coordinator.run('BASE_UPDATE', async () => pending.promise);
  await tick();

  const send = await coordinator.run('SYNC_SEND', async () => { uploads += 1; });
  assert.deepEqual(send, { status: 'BUSY', owner: 'BASE_UPDATE' });
  assert.equal(uploads, 0);
  assert.match(sourceText('../src/pages/admin/BasesPage.tsx'), /systemDataOperationCoordinator\.run\('BASE_UPDATE'/);
  assert.match(sourceText('../src/pages/admin/SincronizacaoPage.tsx'), /systemDataOperationCoordinator\.run\('SYNC_SEND'/);

  pending.resolve();
  await base;
});

test('S2 — SYNC_SEND pendente bloqueia BASE_UPDATE antes de processSourceUpdates', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  const pending = deferred<void>();
  let processCalls = 0;
  const send = coordinator.run('SYNC_SEND', async () => pending.promise);
  await tick();

  const base = await coordinator.run('BASE_UPDATE', async () => { processCalls += 1; });
  assert.deepEqual(base, { status: 'BUSY', owner: 'SYNC_SEND' });
  assert.equal(processCalls, 0);

  pending.resolve();
  await send;
});

test('S3 — unsubscribe/remount não libera gate de SYNC_SEND', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  const pending = deferred<void>();
  let observed = coordinator.getState();
  const unsubscribe = coordinator.subscribe(state => { observed = state; });
  const send = coordinator.run('SYNC_SEND', async () => pending.promise);
  await tick();
  assert.deepEqual(observed, { busy: true, owner: 'SYNC_SEND' });

  unsubscribe();
  let remounted = coordinator.getState();
  const unsubscribeRemounted = coordinator.subscribe(state => { remounted = state; });
  assert.deepEqual(remounted, { busy: true, owner: 'SYNC_SEND' });
  const base = await coordinator.run('BASE_UPDATE', async () => undefined);
  assert.deepEqual(base, { status: 'BUSY', owner: 'SYNC_SEND' });
  assert.match(sourceText('../src/pages/admin/SincronizacaoPage.tsx'), /systemDataOperationCoordinator\.subscribe\(setOperationState\)/);
  assert.match(sourceText('../src/pages/admin/BasesPage.tsx'), /systemDataOperationCoordinator\.subscribe\(setOperationState\)/);

  pending.resolve();
  await send;
  unsubscribeRemounted();
});

test('S4 — BASE_UPDATE sobrevive remount e mantém Send/Restore/Bundle bloqueados', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  const pending = deferred<void>();
  let calls = 0;
  const base = coordinator.run('BASE_UPDATE', async () => pending.promise);
  await tick();
  const first = await coordinator.run('SYNC_SEND', async () => { calls += 1; });
  const second = await coordinator.run('SYNC_RESTORE', async () => { calls += 1; });
  const third = await coordinator.run('BUNDLE_RECOVERY', async () => { calls += 1; });
  assert.equal(first.status, 'BUSY'); assert.equal(second.status, 'BUSY'); assert.equal(third.status, 'BUSY');
  assert.equal(calls, 0);

  pending.resolve();
  await base;
});

test('S5 — auto-sync dentro de BASE_UPDATE não readquire gate nem deadlocka e faz um upload', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  const active = await build('BUILD_S5');
  let uploads = 0;
  const deps: BaseAutoSyncDependencies = {
    getIdentity: () => identity,
    getActive: () => active,
    upload: async () => {
      uploads += 1;
      return { bytes: 10, active, updatedAt: NOW };
    },
  };

  const result = await coordinator.run('BASE_UPDATE', async () => activateBuildAndWaitForAutoSync(
    active,
    () => undefined,
    async () => syncActiveBuildIfPaired(active.motorBuildId, deps),
  ));
  assert.equal(result.status, 'DONE');
  if (result.status === 'DONE') assert.deepEqual(result.value, { status: 'SYNCED', bytes: 10, motorBuildId: 'BUILD_S5' });
  assert.equal(uploads, 1);
  assert.deepEqual(coordinator.getState(), { busy: false, owner: null });
  assert.doesNotMatch(sourceText('../src/pages/admin/baseAutoSync.ts'), /systemDataOperationCoordinator/);
});

test('S6 — SYNC_RESTORE pendente bloqueia BASE_UPDATE', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  const pending = deferred<void>();
  let processCalls = 0;
  const restore = coordinator.run('SYNC_RESTORE', async () => pending.promise);
  await tick();
  const base = await coordinator.run('BASE_UPDATE', async () => { processCalls += 1; });
  assert.deepEqual(base, { status: 'BUSY', owner: 'SYNC_RESTORE' });
  assert.equal(processCalls, 0);
  assert.match(sourceText('../src/pages/admin/SincronizacaoPage.tsx'), /run\('SYNC_RESTORE'/);
  pending.resolve();
  await restore;
});

test('S7 — BASE_UPDATE pendente bloqueia restore antes da restauração', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  const pending = deferred<void>();
  let restores = 0;
  const base = coordinator.run('BASE_UPDATE', async () => pending.promise);
  await tick();
  const restore = await coordinator.run('SYNC_RESTORE', async () => { restores += 1; });
  assert.deepEqual(restore, { status: 'BUSY', owner: 'BASE_UPDATE' });
  assert.equal(restores, 0);
  pending.resolve();
  await base;
});

test('S8 — BUNDLE_RECOVERY pendente bloqueia BASE_UPDATE', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  const pending = deferred<void>();
  let processCalls = 0;
  const bundle = coordinator.run('BUNDLE_RECOVERY', async () => pending.promise);
  await tick();
  const base = await coordinator.run('BASE_UPDATE', async () => { processCalls += 1; });
  assert.deepEqual(base, { status: 'BUSY', owner: 'BUNDLE_RECOVERY' });
  assert.equal(processCalls, 0);
  pending.resolve();
  await bundle;
});

test('S9 — BASE_UPDATE pendente bloqueia Bundle antes de inspect/persist/recover', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  const pending = deferred<void>();
  let inspect = 0; let persist = 0; let recover = 0;
  const base = coordinator.run('BASE_UPDATE', async () => pending.promise);
  await tick();
  const bundle = await coordinator.run('BUNDLE_RECOVERY', async () => {
    inspect += 1; persist += 1; recover += 1;
  });
  assert.deepEqual(bundle, { status: 'BUSY', owner: 'BASE_UPDATE' });
  assert.deepEqual({ inspect, persist, recover }, { inspect: 0, persist: 0, recover: 0 });
  assert.match(sourceText('../src/pages/admin/SincronizacaoPage.tsx'), /run\('BUNDLE_RECOVERY'/);
  pending.resolve();
  await base;
});

test('S10 — source hash igual ao active permite exatamente um PUT', async () => {
  const sources = makeSources('A');
  const hash = await sourceStorageSnapshotManifestHash(sources);
  const active = await build('BUILD_A', hash);
  let puts = 0;
  const result = await cloudSyncTestHelpers.uploadCurrentDeviceSnapshotWithDependencies(
    identity,
    uploadDependencies({ sources, actives: [active, active], onPut: () => { puts += 1; } }),
  );
  assert.equal(result.active.motorBuildId, 'BUILD_A');
  assert.equal(puts, 1);
  const cloud = sourceText('../src/canonical/cloudSync.ts');
  assert.match(cloud, /exportedSourcesManifestHash !== activeBefore\.stagingManifestHash/);
  assert.equal((cloud.match(/method: 'PUT'/g) ?? []).length, 1);
});

test('S11 — sources em transição abortam antes do PUT mesmo com active BUILD_A estável', async () => {
  const sourcesA = makeSources('A');
  const sourcesB = makeSources('B');
  const hashA = await sourceStorageSnapshotManifestHash(sourcesA);
  const activeA = await build('BUILD_A', hashA);
  let puts = 0;
  await assert.rejects(
    () => cloudSyncTestHelpers.uploadCurrentDeviceSnapshotWithDependencies(
      identity,
      uploadDependencies({ sources: sourcesB, actives: [activeA, activeA], onPut: () => { puts += 1; } }),
    ),
    /SYNC_SNAPSHOT_CHANGED_DURING_CAPTURE/,
  );
  assert.equal(puts, 0);
});

test('S12 — active mudando durante a captura aborta antes do PUT', async () => {
  const sources = makeSources('A');
  const hash = await sourceStorageSnapshotManifestHash(sources);
  const activeA = await build('BUILD_A', hash);
  const activeB = await build('BUILD_B', hash);
  let puts = 0;
  await assert.rejects(
    () => cloudSyncTestHelpers.uploadCurrentDeviceSnapshotWithDependencies(
      identity,
      uploadDependencies({ sources, actives: [activeA, activeB], onPut: () => { puts += 1; } }),
    ),
    /SYNC_SNAPSHOT_CHANGED_DURING_CAPTURE/,
  );
  assert.equal(puts, 0);
});

test('S13 — dois envios manuais concorrentes resultam em um único PUT', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  const pending = deferred<void>();
  let puts = 0;
  const first = coordinator.run('SYNC_SEND', async () => { puts += 1; await pending.promise; });
  await tick();
  const second = await coordinator.run('SYNC_SEND', async () => { puts += 1; });
  assert.deepEqual(second, { status: 'BUSY', owner: 'SYNC_SEND' });
  assert.equal(puts, 1);
  pending.resolve();
  await first;
});

test('S14 — Restore e Send se bloqueiam nos dois sentidos', async () => {
  const restoreCoordinator = createSystemDataOperationCoordinator();
  const restorePending = deferred<void>();
  const restore = restoreCoordinator.run('SYNC_RESTORE', async () => restorePending.promise);
  await tick();
  assert.deepEqual(await restoreCoordinator.run('SYNC_SEND', async () => undefined), { status: 'BUSY', owner: 'SYNC_RESTORE' });
  restorePending.resolve(); await restore;

  const sendCoordinator = createSystemDataOperationCoordinator();
  const sendPending = deferred<void>();
  const send = sendCoordinator.run('SYNC_SEND', async () => sendPending.promise);
  await tick();
  assert.deepEqual(await sendCoordinator.run('SYNC_RESTORE', async () => undefined), { status: 'BUSY', owner: 'SYNC_SEND' });
  sendPending.resolve(); await send;
});

test('S15 — STARTUP_REMOTE_RESTORE bloqueia Bases e libera após conclusão', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  const pending = deferred<void>();
  let bases = 0;
  const startup = coordinator.run('STARTUP_REMOTE_RESTORE', async () => pending.promise);
  await tick();
  assert.deepEqual(await coordinator.run('BASE_UPDATE', async () => { bases += 1; }), { status: 'BUSY', owner: 'STARTUP_REMOTE_RESTORE' });
  assert.equal(bases, 0);
  assert.match(sourceText('../src/main.tsx'), /run\('STARTUP_REMOTE_RESTORE'/);
  pending.resolve(); await startup;
  const next = await coordinator.run('BASE_UPDATE', async () => { bases += 1; });
  assert.equal(next.status, 'DONE');
  assert.equal(bases, 1);
});

test('S16 — erro da operação libera o gate para a próxima ação', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  await assert.rejects(() => coordinator.run('SYNC_SEND', async () => { throw new Error('SEND_FAILED'); }), /SEND_FAILED/);
  assert.deepEqual(coordinator.getState(), { busy: false, owner: null });
  const next = await coordinator.run('BASE_UPDATE', async () => 'OK');
  assert.deepEqual(next, { status: 'DONE', value: 'OK' });
});

test('S17 — sucesso da operação libera o gate para a próxima ação', async () => {
  const coordinator = createSystemDataOperationCoordinator();
  const first = await coordinator.run('SYNC_SEND', async () => 'SENT');
  assert.deepEqual(first, { status: 'DONE', value: 'SENT' });
  assert.deepEqual(coordinator.getState(), { busy: false, owner: null });
  const next = await coordinator.run('BUNDLE_RECOVERY', async () => 'RECOVERED');
  assert.deepEqual(next, { status: 'DONE', value: 'RECOVERED' });
  assert.match(sourceText('../src/pages/admin/SincronizacaoPage.tsx'), /run\('SYNC_CREATE_AND_SEND'/);
  assert.match(sourceText('../src/pages/admin/SincronizacaoPage.tsx'), /run\('SYNC_PAIR_AND_RESTORE'/);
});
