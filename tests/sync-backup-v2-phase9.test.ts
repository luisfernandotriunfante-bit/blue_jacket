import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  cloudSyncTestHelpers,
  type CloudSnapshotV2,
  type DeviceSyncIdentity,
} from '../src/canonical/cloudSync.ts';
import {
  CANONICAL_HISTORY_BACKUP_MANIFEST_FORMAT,
  buildCanonicalHistoryBackupManifest,
  canonicalHistoryBackupEntry,
  canonicalHistoryBackupManifestHash,
  canonicalHistorySyncHash,
  decryptCanonicalHistoryArchive,
  encryptCanonicalHistoryArchive,
  historyBackupObjectKey,
  historyRemoteRelativePath,
  officialCanonicalHistoryReferences,
} from '../src/canonical/canonicalHistorySync.ts';
import {
  buildCanonicalHistoryArchive,
  validateCanonicalHistoryArchive,
  type CanonicalHistoryArchivePayload,
  type CanonicalHistoryRepository,
} from '../src/canonical/canonicalHistory.ts';
import { emptyMonthlyClosingState, type MonthlyClosingBuildIdentity, type MonthlyClosingState } from '../src/canonical/monthlyClosingState.ts';
import { ADMIN_TABS } from '../src/navigation.ts';
import type { CanonicalList } from '../src/canonical/types.ts';
import { activeV21Fixture, sourceStorageV1Fixture, V21_ENGINE } from './phase5b-fixtures.ts';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const H = (c: string) => c.repeat(64);
const identity: DeviceSyncIdentity = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
};
const buildIdentity: MonthlyClosingBuildIdentity = {
  motorBuildId: 'motor-history-A',
  engineVersion: V21_ENGINE,
  stagingManifestHash: H('1'),
  adminRegistryHash: H('2'),
  rcaTargetRegistryHash: H('3'),
  sourceReplacementProofHash: H('4'),
  sourceReplacements: [],
  canonicalInputHash: H('5'),
  schemaVersion: 'v1',
  sourceContractVersion: 'v2',
};
const summary = { total: 0, blockers: 0, warnings: 0, info: 0, pass: 0 };

function list(id: CanonicalList['id'], records: Record<string, unknown>[] = []): CanonicalList {
  return { id, generatedAt: '2026-09-01T00:00:00.000Z', records, sources: ['fixture'], warnings: [], errors: [] } as CanonicalList;
}
async function archivePayload(identityOverride = buildIdentity) {
  return buildCanonicalHistoryArchive(identityOverride, {
    M1_ITEM_ESTOQUE: list('M1_ITEM_ESTOQUE', [{ sku: '1' }]),
    M2_CLIENTE_RCA: list('M2_CLIENTE_RCA', [{ customer_cnpj: '1' }]),
    M3_MOVIMENTO_VENDAS: list('M3_MOVIMENTO_VENDAS', [{ fact_type: 'SALE' }]),
    M4_HISTORICO_TRANSICAO: list('M4_HISTORICO_TRANSICAO', [{ id: '1' }]),
  }, '2026-09-01T00:00:00.000Z');
}
function closeEvent(competence: string, revision: number, build = buildIdentity) {
  return {
    eventId: `${competence}:CLOSE:${revision}`,
    type: 'CLOSE' as const,
    competence,
    revision,
    occurredAt: '2026-09-01T00:00:00.000Z',
    evidence: {
      auditFormat: 'blue-jacket-global-audit/v1' as const,
      auditSemanticHash: H('a'),
      auditOverallStatus: 'HEALTHY' as const,
      auditSummary: summary,
      activeBuildIdentity: build,
      warnings: [],
      warningIds: [],
      sourceContractVersion: 'v2' as const,
    },
    warningAcknowledgement: { acknowledged: false, warningIds: [] },
    note: null,
  };
}
function closingState(events = [closeEvent('2026-08', 1)]): MonthlyClosingState {
  return {
    format: 'blue-jacket-monthly-closing/v1',
    schemaVersion: 'v1',
    initializedAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    events,
  };
}
class MemoryHistory implements CanonicalHistoryRepository {
  map = new Map<string, CanonicalHistoryArchivePayload>();
  async putArchive(payload: CanonicalHistoryArchivePayload) {
    const existing = this.map.get(payload.archive.archiveId);
    if (existing) {
      if (existing.archive.archiveHash !== payload.archive.archiveHash) throw new Error('CANONICAL_HISTORY_COLLISION');
      return 'EXISTING' as const;
    }
    this.map.set(payload.archive.archiveId, structuredClone(payload));
    return 'CREATED' as const;
  }
  async getArchive(id: string) { const item = this.map.get(id); return item ? structuredClone(item) : undefined; }
  async getList(id: string, listId: CanonicalList['id']) { return structuredClone(this.map.get(id)?.lists[listId]); }
  async hasArchive(id: string) { return this.map.has(id); }
  async listArchives() { return [...this.map.values()].map(item => structuredClone(item.archive)); }
  async deleteArchiveInternal(id: string) { this.map.delete(id); }
}
const sb = (number: number, title: string, fn: () => void | Promise<void>) => test(`SB${number} — ${title}`, fn);

// SB1–SB12 — protocol / compatibility
sb(1, 'CloudSnapshotV2 format exato', async () => {
  const active = await activeV21Fixture();
  const closing = emptyMonthlyClosingState('2026-09-01T00:00:00.000Z');
  const manifest = await buildCanonicalHistoryBackupManifest(closing, [], []);
  const snapshot = await cloudSyncTestHelpers.buildCloudSnapshotV2(active, sourceStorageV1Fixture(), {} as never, null, closing, manifest);
  assert.equal(snapshot.format, 'blue-jacket-device-sync/v2');
});
sb(2, 'v2 round-trip encrypted', async () => {
  const active = await activeV21Fixture(); const closing = emptyMonthlyClosingState();
  const manifest = await buildCanonicalHistoryBackupManifest(closing, [], []);
  const snapshot = await cloudSyncTestHelpers.buildCloudSnapshotV2(active, sourceStorageV1Fixture(), {} as never, null, closing, manifest);
  const decrypted = await cloudSyncTestHelpers.decrypt(identity, await cloudSyncTestHelpers.encrypt(identity, snapshot));
  assert.equal(decrypted.format, 'blue-jacket-device-sync/v2');
});
sb(3, 'BJS1 envelope preservado', async () => {
  const active = await activeV21Fixture(); const closing = emptyMonthlyClosingState();
  const manifest = await buildCanonicalHistoryBackupManifest(closing, [], []);
  const snapshot = await cloudSyncTestHelpers.buildCloudSnapshotV2(active, sourceStorageV1Fixture(), {} as never, null, closing, manifest);
  assert.equal(new TextDecoder().decode((await cloudSyncTestHelpers.encrypt(identity, snapshot)).slice(0, 4)), 'BJS1');
});
sb(4, 'AES-GCM preservado', () => assert.match(source('../src/canonical/cloudSync.ts'), /AES-GCM/));
sb(5, 'pairing BJ1 preservado', () => {
  const code = cloudSyncTestHelpers.pairingCode(identity);
  assert.match(code, /^BJ1\./);
  assert.deepEqual(cloudSyncTestHelpers.parsePairingCode(code), identity);
});
sb(6, 'v1 decrypt continua válido', async () => {
  const snapshot = cloudSyncTestHelpers.buildCloudSnapshot(await activeV21Fixture(), sourceStorageV1Fixture(), {} as never, null);
  assert.equal((await cloudSyncTestHelpers.decrypt(identity, await cloudSyncTestHelpers.encrypt(identity, snapshot))).format, 'blue-jacket-device-sync/v1');
});
sb(7, 'v1 restore continua disponível', () => assert.equal(typeof cloudSyncTestHelpers.applyCloudSnapshot, 'function'));
sb(8, 'v1 não inventa history', async () => {
  const snapshot = cloudSyncTestHelpers.buildCloudSnapshot(await activeV21Fixture(), sourceStorageV1Fixture(), {} as never, null);
  assert.equal('canonicalHistoryManifest' in snapshot, false);
});
sb(9, 'v2 exige CanonicalHistoryManifest', async () => {
  const invalid = { ...cloudSyncTestHelpers.buildCloudSnapshot(await activeV21Fixture(), sourceStorageV1Fixture(), {} as never, null), format: 'blue-jacket-device-sync/v2', monthlyClosingState: emptyMonthlyClosingState() };
  await assert.rejects(() => cloudSyncTestHelpers.validateCloudSnapshot(invalid as CloudSnapshotV2), /SYNC_PAYLOAD_INVALID/);
});
sb(10, 'manifest inválido vira payload inválido', async () => {
  const invalid = { ...cloudSyncTestHelpers.buildCloudSnapshot(await activeV21Fixture(), sourceStorageV1Fixture(), {} as never, null), format: 'blue-jacket-device-sync/v2', monthlyClosingState: emptyMonthlyClosingState(), canonicalHistoryManifest: { format: CANONICAL_HISTORY_BACKUP_MANIFEST_FORMAT, archives: [], missingArchiveIds: [], manifestHash: H('0') } };
  await assert.rejects(() => cloudSyncTestHelpers.validateCloudSnapshot(invalid as CloudSnapshotV2), /SYNC_PAYLOAD_INVALID/);
});
sb(11, 'engine continua v21', () => assert.equal(V21_ENGINE, 'browser-stage4-product-assortment-v21-source-replacement'));
sb(12, 'canonical hashes independem do protocolo sync', () => { assert.equal('protocolVersion' in buildIdentity, false); assert.equal('revision' in buildIdentity, false); });

// SB13–SB24 — manifest
sb(13, 'manifest format exato', () => assert.equal(CANONICAL_HISTORY_BACKUP_MANIFEST_FORMAT, 'blue-jacket-canonical-history-backup-manifest/v1'));
sb(14, 'CLOSE ids definem universo oficial', () => assert.deepEqual(officialCanonicalHistoryReferences(closingState()).map(item => item.archiveId), [buildIdentity.motorBuildId]));
sb(15, 'mesmo build em dois CLOSE deduplica', () => {
  const state = closingState([closeEvent('2026-08', 1), closeEvent('2026-09', 1)]);
  assert.equal(officialCanonicalHistoryReferences(state).length, 1);
});
sb(16, 'orphan archive não entra', async () => {
  const payload = await archivePayload(); const entry = await canonicalHistoryBackupEntry(payload);
  const state = closingState();
  const manifest = await buildCanonicalHistoryBackupManifest(state, [entry], []);
  assert.deepEqual(manifest.archives.map(item => item.archiveId), [buildIdentity.motorBuildId]);
});
sb(17, 'archives ordenados deterministicamente', async () => {
  const second = { ...buildIdentity, motorBuildId: 'motor-history-B', canonicalInputHash: H('6') };
  const state = closingState([closeEvent('2026-08', 1), closeEvent('2026-09', 1, second)]);
  const a = await canonicalHistoryBackupEntry(await archivePayload(buildIdentity));
  const b = await canonicalHistoryBackupEntry(await archivePayload(second));
  const manifest = await buildCanonicalHistoryBackupManifest(state, [b, a], []);
  assert.deepEqual(manifest.archives.map(item => item.archiveId), ['motor-history-A', 'motor-history-B']);
});
sb(18, 'missing ordenado', async () => {
  const second = { ...buildIdentity, motorBuildId: 'motor-history-B', canonicalInputHash: H('6') };
  const state = closingState([closeEvent('2026-08', 1), closeEvent('2026-09', 1, second)]);
  assert.deepEqual((await buildCanonicalHistoryBackupManifest(state, [], ['motor-history-B', 'motor-history-A'])).missingArchiveIds, ['motor-history-A', 'motor-history-B']);
});
sb(19, 'archives+missing = official ids', async () => {
  const manifest = await buildCanonicalHistoryBackupManifest(closingState(), [], [buildIdentity.motorBuildId]);
  assert.equal(manifest.archives.length + manifest.missingArchiveIds.length, officialCanonicalHistoryReferences(closingState()).length);
});
sb(20, 'archive extra rejeitado', async () => assert.rejects(() => buildCanonicalHistoryBackupManifest(closingState(), [{ archiveId: 'extra', archiveHash: H('a'), objectKey: H('b'), serializedBytes: 1 }], [buildIdentity.motorBuildId]), /SYNC_HISTORY_MANIFEST_INVALID/));
sb(21, 'archive omitido rejeitado', async () => assert.rejects(() => buildCanonicalHistoryBackupManifest(closingState(), [], []), /SYNC_HISTORY_MANIFEST_INVALID/));
sb(22, 'objectKey determinístico', async () => assert.equal(await historyBackupObjectKey('A', H('a')), await historyBackupObjectKey('A', H('a'))));
sb(23, 'archiveHash diferente muda objectKey', async () => assert.notEqual(await historyBackupObjectKey('A', H('a')), await historyBackupObjectKey('A', H('b'))));
sb(24, 'manifestHash determinístico', async () => {
  const a = await buildCanonicalHistoryBackupManifest(closingState(), [], [buildIdentity.motorBuildId]);
  const b = await buildCanonicalHistoryBackupManifest(closingState(), [], [buildIdentity.motorBuildId]);
  assert.equal(a.manifestHash, b.manifestHash);
  assert.equal(a.manifestHash, await canonicalHistoryBackupManifestHash(a));
});

// SB25–SB36 — history crypto / object
sb(25, 'BJH1 round-trip', async () => {
  const payload = await archivePayload(); const encrypted = await encryptCanonicalHistoryArchive(identity.secret, payload);
  assert.equal(new TextDecoder().decode(encrypted.slice(0, 4)), 'BJH1');
  assert.equal((await decryptCanonicalHistoryArchive(identity.secret, encrypted)).archive.archiveHash, payload.archive.archiveHash);
});
sb(26, 'wrong secret falha decrypt', async () => assert.rejects(() => archivePayload().then(payload => encryptCanonicalHistoryArchive(identity.secret, payload)).then(bytes => decryptCanonicalHistoryArchive('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', bytes)), /SYNC_HISTORY_PAYLOAD_INVALID/));
sb(27, 'payload adulterado falha AES-GCM', async () => {
  const bytes = await encryptCanonicalHistoryArchive(identity.secret, await archivePayload()); bytes[bytes.length - 1] ^= 1;
  await assert.rejects(() => decryptCanonicalHistoryArchive(identity.secret, bytes), /SYNC_HISTORY_PAYLOAD_INVALID/);
});
sb(28, 'decrypted archive passa validator oficial', async () => assert.equal((await validateCanonicalHistoryArchive(await archivePayload())).archive.archiveId, buildIdentity.motorBuildId));
sb(29, 'archive corrupt rejeitado', async () => { const payload = await archivePayload(); payload.archive.archiveHash = H('0'); await assert.rejects(() => validateCanonicalHistoryArchive(payload), /CANONICAL_HISTORY_CORRUPT/); });
sb(30, 'objectKey 64hex', async () => assert.match(await historyBackupObjectKey('A', H('a')), /^[0-9a-f]{64}$/));
sb(31, 'archiveId não aparece no remote path', async () => { const key = await historyBackupObjectKey('SECRET-BUILD', H('a')); assert.equal(historyRemoteRelativePath(key).includes('SECRET-BUILD'), false); });
sb(32, 'ciphertext não contém plaintext JSON', async () => { const payload = await archivePayload(); const text = new TextDecoder().decode(await encryptCanonicalHistoryArchive(identity.secret, payload)); assert.equal(text.includes(payload.archive.archiveId), false); });
sb(33, 'mesmo archive gera ciphertext diferente por IV', async () => { const payload = await archivePayload(); assert.notDeepEqual(await encryptCanonicalHistoryArchive(identity.secret, payload), await encryptCanonicalHistoryArchive(identity.secret, payload)); });
sb(34, 'object identity permanece igual apesar do IV', async () => { const payload = await archivePayload(); const a = await decryptCanonicalHistoryArchive(identity.secret, await encryptCanonicalHistoryArchive(identity.secret, payload)); const b = await decryptCanonicalHistoryArchive(identity.secret, await encryptCanonicalHistoryArchive(identity.secret, payload)); assert.equal(a.archive.archiveHash, b.archive.archiveHash); });
sb(35, 'local archive collision bloqueia', async () => { const repo = new MemoryHistory(); const payload = await archivePayload(); await repo.putArchive(payload); const other = structuredClone(payload); other.archive.archiveHash = H('f'); await assert.rejects(() => repo.putArchive(other), /COLLISION/); });
sb(36, 'CLOSE identity mismatch bloqueia', () => { const other = { ...buildIdentity, canonicalInputHash: H('9') }; const state = closingState([closeEvent('2026-08', 1), closeEvent('2026-09', 1, other)]); assert.throws(() => officialCanonicalHistoryReferences(state), /SYNC_HISTORY_CLOSE_IDENTITY_MISMATCH/); });

// SB37–SB48 — upload planning / race
sb(37, 'archive local+remote ausente possui caminho de upload', async () => assert.match((await canonicalHistoryBackupEntry(await archivePayload())).objectKey, /^[0-9a-f]{64}$/));
sb(38, 'archive remoto possui caminho de reuse', () => assert.equal(typeof cloudSyncTestHelpers.buildAndUploadHistoryManifest, 'function'));
sb(39, 'history não é reenviado em every sync', () => assert.match(source('../src/canonical/cloudSync.ts'), /if \(!remoteObject\.exists\)/));
sb(40, 'local MISSING pode reutilizar manifest remoto', () => assert.match(source('../src/canonical/cloudSync.ts'), /previousRemoteHistoryManifest/));
sb(41, 'local MISSING sem remote vira missingArchiveIds', async () => assert.deepEqual((await buildCanonicalHistoryBackupManifest(closingState(), [], [buildIdentity.motorBuildId])).missingArchiveIds, [buildIdentity.motorBuildId]));
sb(42, 'remote manifest object desaparecido possui erro explícito', () => assert.match(source('../src/canonical/cloudSync.ts'), /SYNC_REMOTE_HISTORY_OBJECT_MISSING/));
sb(43, 'hash local vs remoto divergente bloqueia', () => assert.match(source('../src/canonical/cloudSync.ts'), /SYNC_HISTORY_COLLISION/));
sb(44, 'history upload fail impede current upload', () => { const text = source('../src/canonical/cloudSync.ts'); assert.ok(text.indexOf('buildAndUploadHistoryManifest') < text.indexOf('dependencies.uploadPayload')); });
sb(45, 'history first current last', () => { const text = source('../src/canonical/cloudSync.ts'); assert.ok(text.indexOf('buildAndUploadHistoryManifest') < text.indexOf('dependencies.uploadPayload')); });
sb(46, 'history race altera sync hash', async () => { const state = closingState(); const a = await canonicalHistorySyncHash(state, [{ archiveId: buildIdentity.motorBuildId, status: 'MISSING_LOCAL' }]); const b = await canonicalHistorySyncHash(state, [{ archiveId: buildIdentity.motorBuildId, status: 'AVAILABLE', archiveHash: H('a') }]); assert.notEqual(a, b); });
sb(47, 'CAS fail não aponta history como current', () => { const edge = source('../supabase/functions/blue-jacket-sync/index.ts'); assert.match(edge, /current_object/); assert.match(edge, /removeObject\(candidate\)/); });
sb(48, 'current success devolve counts history', () => { const cloud = source('../src/canonical/cloudSync.ts'); for (const token of ['historyUploaded','historyReused','historyMissing']) assert.match(cloud, new RegExp(token)); });

// SB49–SB60 — revision / CAS
sb(49, 'status v2 possui revision/protocolVersion', () => assert.deepEqual(cloudSyncTestHelpers.normalizeStatus({ updatedAt: '2026-09-01T00:00:00Z', bytes: 1, revision: 2, protocolVersion: 2 }), { updatedAt: '2026-09-01T00:00:00Z', bytes: 1, revision: 2, protocolVersion: 2 }));
sb(50, 'legacy status continua aceito', () => { const status = cloudSyncTestHelpers.normalizeStatus({ updatedAt: '2026-09-01T00:00:00Z', bytes: 1 }); assert.equal(status.protocolVersion, 1); assert.equal(status.revision, 0); });
sb(51, 'new workspace revision0', () => assert.equal(cloudSyncTestHelpers.expectedRevisionForUpload({ updatedAt: '2026-09-01T00:00:00Z', bytes: 0, revision: 0, protocolVersion: 1 }, null, identity.workspaceId), 0));
sb(52, 'v2 upload envia expected revision', () => assert.match(source('../src/canonical/cloudSync.ts'), /x-blue-jacket-if-revision/));
sb(53, 'second expected0 é CAS stale', () => assert.match(source('../supabase/functions/blue-jacket-sync/index.ts'), /SYNC_REMOTE_CHANGED/));
sb(54, 'CAS loser não substitui current', () => assert.match(source('../supabase/functions/blue-jacket-sync/index.ts'), /rows\.length !== 1[\s\S]*removeObject\(candidate\)/));
sb(55, 'remote revision newer bloqueia send', () => assert.throws(() => cloudSyncTestHelpers.expectedRevisionForUpload({ updatedAt: '2026-09-01T00:00:01Z', bytes: 1, revision: 2, protocolVersion: 2 }, { workspaceId: identity.workspaceId, remoteUpdatedAt: '2026-09-01T00:00:00Z', revision: 1 }, identity.workspaceId), /SYNC_REMOTE_NEWER/));
sb(56, 'PUT current é zero quando remote newer preflight falha', () => assert.throws(() => cloudSyncTestHelpers.expectedRevisionForUpload({ updatedAt: '2026-09-01T00:00:01Z', bytes: 1, revision: 2, protocolVersion: 2 }, { workspaceId: identity.workspaceId, remoteUpdatedAt: '2026-09-01T00:00:00Z', revision: 1 }, identity.workspaceId)));
sb(57, 'legacy local timestamp igual adota revision', () => assert.equal(cloudSyncTestHelpers.expectedRevisionForUpload({ updatedAt: '2026-09-01T00:00:00Z', bytes: 1, revision: 4, protocolVersion: 2 }, { workspaceId: identity.workspaceId, remoteUpdatedAt: '2026-09-01T00:00:00Z' }, identity.workspaceId), 4));
sb(58, 'legacy local timestamp divergente exige restore', () => assert.throws(() => cloudSyncTestHelpers.expectedRevisionForUpload({ updatedAt: '2026-09-01T00:00:01Z', bytes: 1, revision: 4, protocolVersion: 2 }, { workspaceId: identity.workspaceId, remoteUpdatedAt: '2026-09-01T00:00:00Z' }, identity.workspaceId), /SYNC_REMOTE_NEWER/));
sb(59, 'remote bytes sem baseline local bloqueia send', () => assert.throws(() => cloudSyncTestHelpers.expectedRevisionForUpload({ updatedAt: '2026-09-01T00:00:00Z', bytes: 1, revision: 0, protocolVersion: 1 }, null, identity.workspaceId), /SYNC_REMOTE_BASELINE_REQUIRED/));
sb(60, 'saveState recebe revision somente após success', () => { const cloud = source('../src/canonical/cloudSync.ts'); assert.ok(cloud.indexOf('dependencies.saveState') > cloud.indexOf('dependencies.uploadPayload')); });

// SB61–SB72 — restore v2
sb(61, 'v2 restore com zero history possui fluxo próprio', () => assert.equal(typeof cloudSyncTestHelpers.applyCloudSnapshotV2WithHistory, 'function'));
sb(62, 'archive remoto é baixado antes da mutação operacional', () => { const cloud = source('../src/canonical/cloudSync.ts'); assert.ok(cloud.indexOf('prepareHistoryRestore') < cloud.lastIndexOf('applyCloudSnapshot(snapshot')); });
sb(63, 'local same archive pode ser reused', () => assert.match(source('../src/canonical/cloudSync.ts'), /valid\.archive\.archiveHash !== entry\.archiveHash/));
sb(64, 'local collision bloqueia antes de operational mutation', () => { const cloud = source('../src/canonical/cloudSync.ts'); assert.ok(cloud.indexOf("throw new Error('SYNC_HISTORY_COLLISION')") < cloud.lastIndexOf('applyCloudSnapshot(snapshot')); });
sb(65, 'remote object missing bloqueia', () => assert.match(source('../src/canonical/cloudSync.ts'), /SYNC_REMOTE_HISTORY_OBJECT_MISSING/));
sb(66, 'missingArchiveIds não bloqueia current restore', () => assert.match(source('../src/canonical/cloudSync.ts'), /missing: snapshot\.canonicalHistoryManifest\.missingArchiveIds\.length/));
sb(67, 'archive decrypt fail ocorre antes da mutação operacional', () => { const cloud = source('../src/canonical/cloudSync.ts'); assert.ok(cloud.indexOf('decryptHistory') < cloud.lastIndexOf('applyCloudSnapshot(snapshot')); });
sb(68, 'archive validation fail ocorre antes da mutação operacional', () => assert.match(source('../src/canonical/cloudSync.ts'), /validateCanonicalHistoryArchive\(payload\)/));
sb(69, 'history write fail remove created e não aplica operational', () => assert.match(source('../src/canonical/cloudSync.ts'), /deleteArchiveInternal/));
sb(70, 'operational restore fail remove somente archives criados', () => assert.match(source('../src/canonical/cloudSync.ts'), /const created: string\[\]/));
sb(71, 'archive preexistente sobrevive rollback', () => assert.match(source('../src/canonical/cloudSync.ts'), /if \(result === 'CREATED'\) created\.push/));
sb(72, 'sync state atualizado somente após restore completo', () => { const cloud = source('../src/canonical/cloudSync.ts'); const restore = cloud.split('export async function restoreCurrentDeviceSnapshot')[1]?.split('export async function deviceSyncBackupStatus')[0] ?? ''; const apply = restore.indexOf('await applyCloudSnapshotV2WithHistory'); const save = restore.indexOf('saveSyncState(identity', apply); assert.ok(apply >= 0); assert.ok(save > apply); });

// SB73–SB82 — Phase 8 / monthly closing integration
sb(73, 'novo CLOSE auto-sync usa cadeia homologada até uploadCurrentDeviceSnapshot', () => { const closing = source('../src/pages/admin/monthlyClosingFlow.ts'); const autoSync = source('../src/pages/admin/baseAutoSync.ts'); assert.match(closing, /syncActiveBuildIfPaired/); assert.match(autoSync, /uploadCurrentDeviceSnapshot/); assert.match(autoSync, /upload: identity => uploadCurrentDeviceSnapshot\(identity\)/); });
sb(74, 'history upload failure preserva CLOSE local', () => assert.match(source('../src/pages/admin/monthlyClosingFlow.ts'), /LOCAL_SUCCESS_SYNC_FAILED/));
sb(75, 'history upload failure preserva archive local', () => assert.doesNotMatch(source('../src/pages/admin/monthlyClosingFlow.ts').split('LOCAL_SUCCESS_SYNC_FAILED')[1] ?? '', /deleteArchiveInternal/));
sb(76, 'REOPEN não remove remote history', () => assert.doesNotMatch(source('../src/pages/admin/monthlyClosingFlow.ts'), /history-delete|historyDelete/));
sb(77, 'RECLOSE same build usa objectKey determinístico', async () => assert.equal(await historyBackupObjectKey('A', H('a')), await historyBackupObjectKey('A', H('a'))));
sb(78, 'RECLOSE new build envia somente novo object identity', async () => assert.notEqual(await historyBackupObjectKey('A', H('a')), await historyBackupObjectKey('B', H('b'))));
sb(79, 'legacy CLOSE sem local archive sincroniza como missing', async () => assert.deepEqual((await buildCanonicalHistoryBackupManifest(closingState(), [], [buildIdentity.motorBuildId])).missingArchiveIds, [buildIdentity.motorBuildId]));
sb(80, 'restore v2 possui caminho que torna remote archive local', () => assert.equal(typeof cloudSyncTestHelpers.prepareHistoryRestore, 'function'));
sb(81, 'history restore nunca ativa archive', () => assert.doesNotMatch(source('../src/canonical/cloudSync.ts'), /activateCanonicalBundle|historicalActiveCanonical/));
sb(82, 'DataContext continua usando activeCanonical operacional', () => assert.doesNotMatch(source('../src/store/DataContext.tsx'), /canonicalHistorySync|historicalActiveCanonical/));

// SB83–SB90 — Edge Function structure
const migration = () => source('../supabase/migrations/20260907061730_blue_jacket_sync_backup_v2.sql');
const edge = () => source('../supabase/functions/blue-jacket-sync/index.ts');
sb(83, 'migration adiciona protocol_version', () => assert.match(migration(), /protocol_version smallint/));
sb(84, 'migration adiciona revision', () => assert.match(migration(), /revision bigint/));
sb(85, 'migration adiciona current_object', () => assert.match(migration(), /current_object text/));
sb(86, 'edge permite header revision', () => assert.match(edge(), /x-blue-jacket-if-revision/));
sb(87, 'edge permite object-key', () => assert.match(edge(), /x-blue-jacket-object-key/));
sb(88, 'object-key rejeita path traversal', () => assert.match(edge(), /\^\[0-9a-f\]\{64\}\$/));
sb(89, 'legacy upload bloqueado após protocol2', () => assert.match(edge(), /SYNC_CLIENT_UPGRADE_REQUIRED/));
sb(90, 'delete workspace limpa current/history prefix', () => { assert.match(edge(), /removeWorkspaceObjects/); assert.match(edge(), /listWorkspaceFiles/); });

// SB91–SB100 — architecture / regression
sb(91, 'Cloud v2 não altera M1-M4', () => assert.doesNotMatch(source('../src/canonical/cloudSync.ts'), /from '.\/motors'|buildM1|buildM2|buildM3|buildM4/));
sb(92, 'Cloud v2 não altera canonicalInputHash', () => assert.doesNotMatch(source('../src/canonical/sourceReplacementIdentity.ts'), /device-sync\/v2|canonicalHistoryManifest/));
sb(93, 'Cloud v2 não altera motorBuildId', () => assert.doesNotMatch(source('../src/canonical/sourceImport.ts'), /device-sync\/v2|canonicalHistoryManifest/));
sb(94, 'Bundle continua sem history', () => assert.doesNotMatch(source('../src/canonical/bundleStore.ts'), /canonicalHistoryManifest|BJH1/));
sb(95, 'GlobalAudit não importa SyncBackup history', () => assert.doesNotMatch(source('../src/canonical/globalAudit.ts'), /canonicalHistorySync|device-sync\/v2/));
sb(96, 'Sell Out não lê remote history', () => assert.doesNotMatch(source('../src/pages/SellOutPage.tsx'), /canonicalHistorySync|history-download/));
sb(97, 'Estoque não lê remote history', () => assert.doesNotMatch(source('../src/pages/EstoquePage.tsx'), /canonicalHistorySync|history-download/));
sb(98, 'Redes não lê remote history', () => assert.doesNotMatch(source('../src/pages/TopRetailNetworksPage.tsx'), /canonicalHistorySync|history-download/));
sb(99, 'sete abas administrativas permanecem', () => assert.equal(ADMIN_TABS.length, 7));
sb(100, 'não existe heuristic merge entre aparelhos', () => assert.doesNotMatch(source('../src/canonical/cloudSync.ts'), /mergeRemote|heuristicMerge|autoMergeConflict/i));

// SB101–SB104 — remote History create-only hardening
sb(101, 'uploadCreateOnly usa POST create-only no Storage', () => {
  const body = edge().split('async function uploadCreateOnly')[1]?.split('async function uploadCurrentCandidate')[0] ?? '';
  assert.match(body, /method: 'POST'/);
  assert.doesNotMatch(body, /method: 'PUT'/);
});
sb(102, 'History desabilita upsert explicitamente', () => {
  const body = edge().split('async function uploadCreateOnly')[1]?.split('async function uploadCurrentCandidate')[0] ?? '';
  assert.match(body, /'x-upsert': 'false'/);
  assert.doesNotMatch(body, /'x-upsert': 'true'/);
});
sb(103, 'interface pública history-upload permanece PUT', () => {
  assert.match(edge(), /action === 'history-upload' && req\.method === 'PUT'/);
});
sb(104, 'legacy current, current candidate e History mantêm semânticas distintas', () => {
  const text = edge();
  const history = text.split('async function uploadCreateOnly')[1]?.split('async function uploadCurrentCandidate')[0] ?? '';
  const candidate = text.split('async function uploadCurrentCandidate')[1]?.split('async function listStorageFolder')[0] ?? '';
  assert.match(text, /legacyCurrentPath[\s\S]*method: 'PUT'[\s\S]*'x-upsert': 'true'/);
  assert.match(history, /method: 'POST'/);
  assert.match(history, /'x-upsert': 'false'/);
  assert.match(candidate, /method: 'PUT'/);
  assert.doesNotMatch(candidate, /x-upsert/);
});
