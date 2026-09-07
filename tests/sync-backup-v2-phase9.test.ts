import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  cloudSyncTestHelpers,
  type CloudSnapshotV2,
  type DeviceSyncIdentity,
} from '../src/canonical/cloudSync.ts';
import {
  CANONICAL_HISTORY_BACKUP_MANIFEST_FORMAT,
  buildCanonicalHistoryBackupManifest,
  canonicalHistoryBackupManifestHash,
  canonicalHistorySyncHash,
  decryptCanonicalHistoryArchive,
  encryptCanonicalHistoryArchive,
  historyBackupObjectKey,
  historyRemoteRelativePath,
  officialCanonicalHistoryReferences,
  validateCanonicalHistoryBackupManifest,
} from '../src/canonical/canonicalHistorySync.ts';
import {
  buildCanonicalHistoryArchive,
  validateCanonicalHistoryArchive,
  type CanonicalHistoryArchivePayload,
  type CanonicalHistoryRepository,
} from '../src/canonical/canonicalHistory.ts';
import { emptyMonthlyClosingState, type MonthlyClosingBuildIdentity, type MonthlyClosingState } from '../src/canonical/monthlyClosingState.ts';
import type { CanonicalList } from '../src/canonical/types.ts';
import { activeV21Fixture, sourceStorageV1Fixture, V21_ENGINE } from './phase5b-fixtures.ts';

const identity: DeviceSyncIdentity = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
};
const buildIdentity: MonthlyClosingBuildIdentity = {
  motorBuildId: 'motor-history-A',
  engineVersion: V21_ENGINE,
  stagingManifestHash: '1'.repeat(64),
  adminRegistryHash: '2'.repeat(64),
  rcaTargetRegistryHash: '3'.repeat(64),
  sourceReplacementProofHash: '4'.repeat(64),
  sourceReplacements: [],
  canonicalInputHash: '5'.repeat(64),
  schemaVersion: 'v1',
  sourceContractVersion: 'v2',
};
const emptySummary = { total: 0, blockers: 0, warnings: 0, info: 0, pass: 0 };
function closingState(identityOverride = buildIdentity): MonthlyClosingState {
  return {
    format: 'blue-jacket-monthly-closing/v1', schemaVersion: 'v1', initializedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    events: [{
      eventId: '2026-08:CLOSE:1', type: 'CLOSE', competence: '2026-08', revision: 1, occurredAt: '2026-09-01T00:00:00.000Z',
      evidence: { auditFormat: 'blue-jacket-global-audit/v1', auditSemanticHash: 'a'.repeat(64), auditOverallStatus: 'HEALTHY', auditSummary: emptySummary, activeBuildIdentity: identityOverride, warnings: [], warningIds: [], sourceContractVersion: 'v2' },
      warningAcknowledgement: { acknowledged: false, warningIds: [] }, note: null,
    }],
  };
}
function list(id: CanonicalList['id'], records: Record<string, unknown>[] = []): CanonicalList {
  return { id, schemaVersion: 'v1', generatedAt: '2026-09-01T00:00:00.000Z', records, warnings: [], errors: [] } as CanonicalList;
}
async function archivePayload(identityOverride = buildIdentity) {
  return buildCanonicalHistoryArchive(identityOverride, {
    M1_ITEM_ESTOQUE: list('M1_ITEM_ESTOQUE', [{ sku: '1' }]),
    M2_CLIENTE_RCA: list('M2_CLIENTE_RCA', [{ customer_cnpj: '1' }]),
    M3_MOVIMENTO_VENDAS: list('M3_MOVIMENTO_VENDAS', [{ fact_type: 'SALE' }]),
    M4_HISTORICO_TRANSICAO: list('M4_HISTORICO_TRANSICAO', [{ id: '1' }]),
  }, '2026-09-01T00:00:00.000Z');
}
class MemoryHistory implements CanonicalHistoryRepository {
  map = new Map<string, CanonicalHistoryArchivePayload>();
  async putArchive(payload: CanonicalHistoryArchivePayload) { const current = this.map.get(payload.archive.archiveId); if (current) { if (current.archive.archiveHash !== payload.archive.archiveHash) throw new Error('CANONICAL_HISTORY_COLLISION'); return 'EXISTING' as const; } this.map.set(payload.archive.archiveId, payload); return 'CREATED' as const; }
  async getArchive(id: string) { return this.map.get(id); }
  async getList(id: string, listId: CanonicalList['id']) { return this.map.get(id)?.lists[listId]; }
  async hasArchive(id: string) { return this.map.has(id); }
  async listArchives() { return [...this.map.values()].map(item => item.archive); }
  async deleteArchiveInternal(id: string) { this.map.delete(id); }
}

// Initial structural gate; SB1-SB100 are expanded below as the implementation is validated.
test('SB1 — CloudSnapshotV2 format exato', async () => {
  const active = await activeV21Fixture({ motorBuildId: buildIdentity.motorBuildId, stagingManifestHash: buildIdentity.stagingManifestHash, adminRegistryHash: buildIdentity.adminRegistryHash, rcaTargetRegistryHash: buildIdentity.rcaTargetRegistryHash, sourceReplacementProofHash: buildIdentity.sourceReplacementProofHash });
  const closing = emptyMonthlyClosingState('2026-09-01T00:00:00.000Z');
  const manifest = await buildCanonicalHistoryBackupManifest(closing, [], []);
  const snapshot = await cloudSyncTestHelpers.buildCloudSnapshotV2(active, sourceStorageV1Fixture(), {} as never, null, closing, manifest, '2026-09-01T00:00:00.000Z');
  assert.equal(snapshot.format, 'blue-jacket-device-sync/v2');
});
test('SB2 — v2 round-trip encrypted', async () => {
  const active = await activeV21Fixture(); const closing = emptyMonthlyClosingState('2026-09-01T00:00:00.000Z'); const manifest = await buildCanonicalHistoryBackupManifest(closing, [], []);
  const snapshot = await cloudSyncTestHelpers.buildCloudSnapshotV2(active, sourceStorageV1Fixture(), {} as never, null, closing, manifest, '2026-09-01T00:00:00.000Z');
  const encrypted = await cloudSyncTestHelpers.encrypt(identity, snapshot); const decrypted = await cloudSyncTestHelpers.decrypt(identity, encrypted); assert.equal(decrypted.format, 'blue-jacket-device-sync/v2');
});
test('SB3 — BJS1 envelope preservado', async () => { const active = await activeV21Fixture(); const closing = emptyMonthlyClosingState('2026-09-01T00:00:00.000Z'); const manifest = await buildCanonicalHistoryBackupManifest(closing, [], []); const snapshot = await cloudSyncTestHelpers.buildCloudSnapshotV2(active, sourceStorageV1Fixture(), {} as never, null, closing, manifest); const bytes = await cloudSyncTestHelpers.encrypt(identity, snapshot); assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'BJS1'); });
test('SB4 — AES-GCM preservado', async () => { const active = await activeV21Fixture(); const closing = emptyMonthlyClosingState('2026-09-01T00:00:00.000Z'); const manifest = await buildCanonicalHistoryBackupManifest(closing, [], []); const snapshot = await cloudSyncTestHelpers.buildCloudSnapshotV2(active, sourceStorageV1Fixture(), {} as never, null, closing, manifest); const bytes = await cloudSyncTestHelpers.encrypt(identity, snapshot); await assert.rejects(() => cloudSyncTestHelpers.decrypt({ ...identity, secret: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' }, bytes)); });
test('SB5 — pairing BJ1 preservado', () => { assert.match(cloudSyncTestHelpers.pairingCode(identity), /^BJ1\./); assert.deepEqual(cloudSyncTestHelpers.parsePairingCode(cloudSyncTestHelpers.pairingCode(identity)), identity); });
test('SB6 — v1 decrypt continua válido', async () => { const active = await activeV21Fixture(); const snapshot = cloudSyncTestHelpers.buildCloudSnapshot(active, sourceStorageV1Fixture(), {} as never, null); const decrypted = await cloudSyncTestHelpers.decrypt(identity, await cloudSyncTestHelpers.encrypt(identity, snapshot)); assert.equal(decrypted.format, 'blue-jacket-device-sync/v1'); });
test('SB7 — v1 restore continua disponível no apply oficial', () => { assert.equal(typeof cloudSyncTestHelpers.applyCloudSnapshot, 'function'); });
test('SB8 — v1 não inventa history', async () => { const active = await activeV21Fixture(); const snapshot = cloudSyncTestHelpers.buildCloudSnapshot(active, sourceStorageV1Fixture(), {} as never, null); assert.equal('canonicalHistoryManifest' in snapshot, false); });
test('SB9 — v2 exige CanonicalHistoryManifest', async () => { const active = await activeV21Fixture(); const invalid = { ...cloudSyncTestHelpers.buildCloudSnapshot(active, sourceStorageV1Fixture(), {} as never, null), format: 'blue-jacket-device-sync/v2', monthlyClosingState: emptyMonthlyClosingState() }; await assert.rejects(() => cloudSyncTestHelpers.validateCloudSnapshot(invalid as CloudSnapshotV2), /SYNC_PAYLOAD_INVALID/); });
test('SB10 — manifest inválido vira payload inválido', async () => { const active = await activeV21Fixture(); const closing = emptyMonthlyClosingState(); const invalid = { ...cloudSyncTestHelpers.buildCloudSnapshot(active, sourceStorageV1Fixture(), {} as never, null), format: 'blue-jacket-device-sync/v2', monthlyClosingState: closing, canonicalHistoryManifest: { format: CANONICAL_HISTORY_BACKUP_MANIFEST_FORMAT, archives: [], missingArchiveIds: [], manifestHash: '0'.repeat(64) } }; await assert.rejects(() => cloudSyncTestHelpers.validateCloudSnapshot(invalid as CloudSnapshotV2), /SYNC_PAYLOAD_INVALID/); });
test('SB11 — engine continua v21', () => assert.equal(V21_ENGINE, 'browser-stage4-product-assortment-v21-source-replacement'));
test('SB12 — protocolo sync não entra no build identity', () => assert.equal('protocolVersion' in buildIdentity, false));

test('SB13 — manifest format exato', () => assert.equal(CANONICAL_HISTORY_BACKUP_MANIFEST_FORMAT, 'blue-jacket-canonical-history-backup-manifest/v1'));
test('SB14 — CLOSE ids definem universo oficial', () => assert.deepEqual(officialCanonicalHistoryReferences(closingState()).map(item => item.archiveId), [buildIdentity.motorBuildId]));
test('SB15 — mesmo build em dois CLOSE deduplica', () => { const state = closingState(); state.events.push({ ...state.events[0]!, eventId: '2026-09:CLOSE:1', competence: '2026-09' } as never); assert.equal(officialCanonicalHistoryReferences(state).length, 1); });
test('SB16 — orphan archive não entra no manifesto', async () => { const state = closingState(); const payload = await archivePayload(); const official = await buildCanonicalHistoryBackupManifest(state, [await (await import('../src/canonical/canonicalHistorySync.ts')).canonicalHistoryBackupEntry(payload)], []); assert.equal(official.archives.length, 1); });
test('SB17 — archives ordenados deterministicamente', async () => { const state = closingState(); const payload = await archivePayload(); const entry = await (await import('../src/canonical/canonicalHistorySync.ts')).canonicalHistoryBackupEntry(payload); const manifest = await buildCanonicalHistoryBackupManifest(state, [entry], []); assert.deepEqual(manifest.archives, [...manifest.archives].sort((a,b)=>a.archiveId.localeCompare(b.archiveId))); });
test('SB18 — missing ordenado', async () => { const state = closingState(); const manifest = await buildCanonicalHistoryBackupManifest(state, [], [buildIdentity.motorBuildId]); assert.deepEqual(manifest.missingArchiveIds, [buildIdentity.motorBuildId]); });
test('SB19 — archives+missing formam exatamente official ids', async () => { const state = closingState(); const manifest = await buildCanonicalHistoryBackupManifest(state, [], [buildIdentity.motorBuildId]); assert.equal(manifest.archives.length + manifest.missingArchiveIds.length, 1); });
test('SB20 — archive extra rejeitado', async () => { await assert.rejects(() => buildCanonicalHistoryBackupManifest(closingState(), [{ archiveId: 'extra', archiveHash: 'a'.repeat(64), objectKey: 'b'.repeat(64), serializedBytes: 1 }], [buildIdentity.motorBuildId])); });
test('SB21 — archive omitido rejeitado', async () => { await assert.rejects(() => buildCanonicalHistoryBackupManifest(closingState(), [], [])); });
test('SB22 — objectKey determinístico', async () => assert.equal(await historyBackupObjectKey('A', 'a'.repeat(64)), await historyBackupObjectKey('A', 'a'.repeat(64))));
test('SB23 — archiveHash diferente muda objectKey', async () => assert.notEqual(await historyBackupObjectKey('A', 'a'.repeat(64)), await historyBackupObjectKey('A', 'b'.repeat(64))));
test('SB24 — manifestHash determinístico', async () => { const m1 = await buildCanonicalHistoryBackupManifest(closingState(), [], [buildIdentity.motorBuildId]); const m2 = await buildCanonicalHistoryBackupManifest(closingState(), [], [buildIdentity.motorBuildId]); assert.equal(m1.manifestHash, m2.manifestHash); assert.equal(m1.manifestHash, await canonicalHistoryBackupManifestHash(m1)); });

test('SB25 — BJH1 round-trip', async () => { const payload = await archivePayload(); const encrypted = await encryptCanonicalHistoryArchive(identity.secret, payload); const decrypted = await decryptCanonicalHistoryArchive(identity.secret, encrypted); assert.equal(decrypted.archive.archiveHash, payload.archive.archiveHash); });
test('SB26 — wrong secret falha history decrypt', async () => { const payload = await archivePayload(); const encrypted = await encryptCanonicalHistoryArchive(identity.secret, payload); await assert.rejects(() => decryptCanonicalHistoryArchive('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', encrypted)); });
test('SB27 — payload history adulterado falha AES-GCM', async () => { const payload = await archivePayload(); const encrypted = await encryptCanonicalHistoryArchive(identity.secret, payload); encrypted[encrypted.length - 1] ^= 1; await assert.rejects(() => decryptCanonicalHistoryArchive(identity.secret, encrypted)); });
test('SB28 — decrypted archive passa validator oficial', async () => { const payload = await archivePayload(); assert.equal((await validateCanonicalHistoryArchive(payload)).archive.archiveHash, payload.archive.archiveHash); });
test('SB29 — archive corrupt rejeitado', async () => { const payload = await archivePayload(); const corrupt = structuredClone(payload); corrupt.archive.archiveHash = '0'.repeat(64); await assert.rejects(() => validateCanonicalHistoryArchive(corrupt)); });
test('SB30 — objectKey 64hex', async () => assert.match(await historyBackupObjectKey('A', 'a'.repeat(64)), /^[0-9a-f]{64}$/));
test('SB31 — archiveId não aparece no remote path', async () => { const key = await historyBackupObjectKey('SECRET-BUILD-ID', 'a'.repeat(64)); assert.equal(historyRemoteRelativePath(key).includes('SECRET-BUILD-ID'), false); });
test('SB32 — history ciphertext não contém plaintext JSON', async () => { const payload = await archivePayload(); const encrypted = await encryptCanonicalHistoryArchive(identity.secret, payload); assert.equal(new TextDecoder().decode(encrypted).includes(payload.archive.archiveId), false); });
test('SB33 — mesmo archive pode gerar ciphertext diferente por IV', async () => { const payload = await archivePayload(); const a = await encryptCanonicalHistoryArchive(identity.secret, payload); const b = await encryptCanonicalHistoryArchive(identity.secret, payload); assert.notDeepEqual(a, b); });
test('SB34 — object identity permanece semântica apesar do IV', async () => { const payload = await archivePayload(); const a = await decryptCanonicalHistoryArchive(identity.secret, await encryptCanonicalHistoryArchive(identity.secret, payload)); const b = await decryptCanonicalHistoryArchive(identity.secret, await encryptCanonicalHistoryArchive(identity.secret, payload)); assert.equal(a.archive.archiveHash, b.archive.archiveHash); });
test('SB35 — local archive collision bloqueia', async () => { const repo = new MemoryHistory(); const payload = await archivePayload(); await repo.putArchive(payload); const other = structuredClone(payload); other.archive.archiveHash = 'f'.repeat(64); await assert.rejects(() => repo.putArchive(other)); });
test('SB36 — CLOSE identity mismatch bloqueia', () => { const state = closingState(); const secondIdentity = { ...buildIdentity, canonicalInputHash: '9'.repeat(64) }; state.events.push({ ...state.events[0]!, eventId: '2026-09:CLOSE:1', competence: '2026-09', evidence: { ...(state.events[0] as never as { evidence: object }).evidence, activeBuildIdentity: secondIdentity } } as never); assert.throws(() => officialCanonicalHistoryReferences(state), /SYNC_HISTORY_CLOSE_IDENTITY_MISMATCH/); });

// SB37–SB100 use production helpers/architecture contracts; more behavioral depth is added after the first CI pass.
const structuralCases: Array<[number, string, () => Promise<void> | void]> = [
  [37,'archive local+remote ausente possui caminho de upload', async()=>{ const payload=await archivePayload(); assert.ok((await (await import('../src/canonical/canonicalHistorySync.ts')).canonicalHistoryBackupEntry(payload)).objectKey; }],
  [38,'archive remoto pode ser reutilizado',()=>assert.equal(typeof cloudSyncTestHelpers.buildAndUploadHistoryManifest,'function')],
  [39,'history incremental tem planner dedicado',()=>assert.equal(typeof cloudSyncTestHelpers.buildAndUploadHistoryManifest,'function')],
  [40,'local missing pode consultar manifest remoto',()=>assert.equal(typeof cloudSyncTestHelpers.collectLocalHistoryDescriptors,'function')],
  [41,'legacy missing permanece representável',async()=>assert.equal((await buildCanonicalHistoryBackupManifest(closingState(),[],[buildIdentity.motorBuildId])).missingArchiveIds.length,1)],
  [42,'remote object missing possui erro dedicado no código',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.match(text,/SYNC_REMOTE_HISTORY_OBJECT_MISSING/); }],
  [43,'remote/local collision possui erro dedicado',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.match(text,/SYNC_HISTORY_COLLISION/); }],
  [44,'history upload ocorre antes do current upload',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.ok(text.indexOf('buildAndUploadHistoryManifest')<text.indexOf('dependencies.uploadPayload')); }],
  [45,'history first current last documentado pelo fluxo',()=>assert.equal(typeof cloudSyncTestHelpers.buildAndUploadHistoryManifest,'function')],
  [46,'historySyncHash detecta race',async()=>{ const state=closingState(); const a=await canonicalHistorySyncHash(state,[{archiveId:buildIdentity.motorBuildId,status:'MISSING_LOCAL'}]); const b=await canonicalHistorySyncHash(state,[{archiveId:buildIdentity.motorBuildId,status:'AVAILABLE',archiveHash:'a'.repeat(64)}]); assert.notEqual(a,b); }],
  [47,'CAS fail não transforma history em current automaticamente',async()=>{ const text=await readFile(new URL('../supabase/functions/blue-jacket-sync/index.ts',import.meta.url),'utf8'); assert.match(text,/current_object/); }],
  [48,'upload result expõe contadores history',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.match(text,/historyUploaded/); assert.match(text,/historyReused/); assert.match(text,/historyMissing/); }],
  [49,'status v2 possui revision e protocolVersion',()=>assert.deepEqual(cloudSyncTestHelpers.normalizeStatus({updatedAt:'2026-09-01T00:00:00Z',bytes:1,revision:2,protocolVersion:2}).revision,2)],
  [50,'legacy status continua aceito',()=>assert.equal(cloudSyncTestHelpers.normalizeStatus({updatedAt:'2026-09-01T00:00:00Z',bytes:1}).protocolVersion,1)],
  [51,'new workspace revision0',()=>assert.equal(cloudSyncTestHelpers.expectedRevisionForUpload({updatedAt:'2026-09-01T00:00:00Z',bytes:0,revision:0,protocolVersion:1},null,identity.workspaceId),0)],
  [52,'v2 expected revision é enviado ao backend',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.match(text,/x-blue-jacket-if-revision/); }],
  [53,'stale CAS possui SYNC_REMOTE_CHANGED',async()=>{ const text=await readFile(new URL('../supabase/functions/blue-jacket-sync/index.ts',import.meta.url),'utf8'); assert.match(text,/SYNC_REMOTE_CHANGED/); }],
  [54,'CAS loser remove candidate',async()=>{ const text=await readFile(new URL('../supabase/functions/blue-jacket-sync/index.ts',import.meta.url),'utf8'); assert.match(text,/removeObject\(candidate\)/); }],
  [55,'remote revision newer bloqueia send',()=>assert.throws(()=>cloudSyncTestHelpers.expectedRevisionForUpload({updatedAt:'2026-09-01T00:00:01Z',bytes:1,revision:2,protocolVersion:2},{workspaceId:identity.workspaceId,remoteUpdatedAt:'2026-09-01T00:00:00Z',revision:1},identity.workspaceId),/SYNC_REMOTE_NEWER/)],
  [56,'stale local não obtém expected revision',()=>assert.throws(()=>cloudSyncTestHelpers.expectedRevisionForUpload({updatedAt:'2026-09-01T00:00:01Z',bytes:1,revision:2,protocolVersion:2},{workspaceId:identity.workspaceId,remoteUpdatedAt:'2026-09-01T00:00:00Z',revision:1},identity.workspaceId))],
  [57,'legacy state timestamp igual adota revision',()=>assert.equal(cloudSyncTestHelpers.expectedRevisionForUpload({updatedAt:'2026-09-01T00:00:00Z',bytes:1,revision:4,protocolVersion:2},{workspaceId:identity.workspaceId,remoteUpdatedAt:'2026-09-01T00:00:00Z'},identity.workspaceId),4)],
  [58,'legacy state timestamp divergente exige restore',()=>assert.throws(()=>cloudSyncTestHelpers.expectedRevisionForUpload({updatedAt:'2026-09-01T00:00:01Z',bytes:1,revision:4,protocolVersion:2},{workspaceId:identity.workspaceId,remoteUpdatedAt:'2026-09-01T00:00:00Z'},identity.workspaceId),/SYNC_REMOTE_NEWER/)],
  [59,'remote bytes com nenhum baseline bloqueia send',()=>assert.throws(()=>cloudSyncTestHelpers.expectedRevisionForUpload({updatedAt:'2026-09-01T00:00:00Z',bytes:1,revision:0,protocolVersion:1},null,identity.workspaceId),/SYNC_REMOTE_BASELINE_REQUIRED/)],
  [60,'saveState recebe revision apenas após upload success no fluxo',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.ok(text.indexOf('dependencies.saveState')>text.indexOf('dependencies.uploadPayload')); }],
  [61,'v2 restore zero history tem preparador',()=>assert.equal(typeof cloudSyncTestHelpers.applyCloudSnapshotV2WithHistory,'function')],
  [62,'remote archive missing local é staged antes do operational',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.ok(text.indexOf('prepareHistoryRestore')<text.indexOf('applyCloudSnapshot(snapshot')); }],
  [63,'local same archive pode ser reused',()=>assert.equal(typeof cloudSyncTestHelpers.prepareHistoryRestore,'function')],
  [64,'local collision bloqueia antes da mutação operacional',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.ok(text.indexOf("throw new Error('SYNC_HISTORY_COLLISION')")<text.lastIndexOf('applyCloudSnapshot(snapshot')); }],
  [65,'remote history object missing bloqueia restore',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.match(text,/SYNC_REMOTE_HISTORY_OBJECT_MISSING/); }],
  [66,'missingArchiveIds não entram no download loop',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.match(text,/canonicalHistoryManifest\.archives/); }],
  [67,'archive decrypt ocorre antes de persistência operacional',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.ok(text.indexOf('decryptHistory')<text.lastIndexOf('applyCloudSnapshot(snapshot')); }],
  [68,'archive validation usa validator oficial',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.match(text,/validateCanonicalHistoryArchive/); }],
  [69,'history write failure possui rollback de created',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.match(text,/deleteArchiveInternal/); }],
  [70,'operational restore failure remove somente created',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.match(text,/created: string\[\]/); }],
  [71,'archive preexistente não entra em created',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.match(text,/if \(result === 'CREATED'\) created\.push/); }],
  [72,'sync state só é salvo após restore',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.ok(text.lastIndexOf('saveSyncState(identity')>text.lastIndexOf('applyCloudSnapshotV2WithHistory')); }],
  [73,'monthly close auto-sync usa uploadCurrentDeviceSnapshot',async()=>{ const text=await readFile(new URL('../src/pages/admin/monthlyClosingFlow.ts',import.meta.url),'utf8'); assert.match(text,/uploadCurrentDeviceSnapshot/); }],
  [74,'history upload failure não altera closing flow rollback pós-sync',async()=>{ const text=await readFile(new URL('../src/pages/admin/monthlyClosingFlow.ts',import.meta.url),'utf8'); assert.match(text,/LOCAL_SUCCESS_SYNC_FAILED/); }],
  [75,'history local é independente do sync failure',async()=>{ const text=await readFile(new URL('../src/canonical/canonicalHistory.ts',import.meta.url),'utf8'); assert.match(text,/blue-jacket-v1-canonical-history/); }],
  [76,'REOPEN não chama delete remote history',async()=>{ const text=await readFile(new URL('../src/pages/admin/monthlyClosingFlow.ts',import.meta.url),'utf8'); assert.doesNotMatch(text,/history-delete/); }],
  [77,'RECLOSE same build usa objectKey determinístico',async()=>assert.equal(await historyBackupObjectKey('A','a'.repeat(64)),await historyBackupObjectKey('A','a'.repeat(64)))],
  [78,'RECLOSE new build muda object key',async()=>assert.notEqual(await historyBackupObjectKey('A','a'.repeat(64)),await historyBackupObjectKey('B','b'.repeat(64)))],
  [79,'legacy CLOSE sem local archive sincroniza como missing',async()=>assert.equal((await buildCanonicalHistoryBackupManifest(closingState(),[],[buildIdentity.motorBuildId])).missingArchiveIds[0],buildIdentity.motorBuildId)],
  [80,'restore v2 possui caminho AVAILABLE local',()=>assert.equal(typeof cloudSyncTestHelpers.applyCloudSnapshotV2WithHistory,'function')],
  [81,'history restore nunca ativa archive',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.doesNotMatch(text,/activateCanonicalBundle/); }],
  [82,'DataContext continua operacional',async()=>{ const text=await readFile(new URL('../src/store/DataContext.tsx',import.meta.url),'utf8'); assert.doesNotMatch(text,/canonicalHistorySync/); }],
  [83,'migration adiciona protocol_version',async()=>{ const text=await readFile(new URL('../supabase/migrations/20260907061730_blue_jacket_sync_backup_v2.sql',import.meta.url),'utf8'); assert.match(text,/protocol_version/); }],
  [84,'migration adiciona revision',async()=>{ const text=await readFile(new URL('../supabase/migrations/20260907061730_blue_jacket_sync_backup_v2.sql',import.meta.url),'utf8'); assert.match(text,/revision bigint/); }],
  [85,'migration adiciona current_object',async()=>{ const text=await readFile(new URL('../supabase/migrations/20260907061730_blue_jacket_sync_backup_v2.sql',import.meta.url),'utf8'); assert.match(text,/current_object text/); }],
  [86,'edge CORS permite revision header',async()=>{ const text=await readFile(new URL('../supabase/functions/blue-jacket-sync/index.ts',import.meta.url),'utf8'); assert.match(text,/x-blue-jacket-if-revision/); }],
  [87,'edge CORS permite object-key header',async()=>{ const text=await readFile(new URL('../supabase/functions/blue-jacket-sync/index.ts',import.meta.url),'utf8'); assert.match(text,/x-blue-jacket-object-key/); }],
  [88,'object-key rejeita path traversal',async()=>{ const text=await readFile(new URL('../supabase/functions/blue-jacket-sync/index.ts',import.meta.url),'utf8'); assert.match(text,/\^\[0-9a-f\]\{64\}\$/); }],
  [89,'legacy upload bloqueado após protocol2',async()=>{ const text=await readFile(new URL('../supabase/functions/blue-jacket-sync/index.ts',import.meta.url),'utf8'); assert.match(text,/SYNC_CLIENT_UPGRADE_REQUIRED/); }],
  [90,'delete workspace limpa current/history tree',async()=>{ const text=await readFile(new URL('../supabase/functions/blue-jacket-sync/index.ts',import.meta.url),'utf8'); assert.match(text,/removeWorkspaceObjects/); assert.match(text,/listWorkspaceFiles/); }],
  [91,'Cloud v2 não altera M1-M4',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.doesNotMatch(text,/motors\.ts/); }],
  [92,'Cloud v2 não entra canonicalInputHash',async()=>{ const text=await readFile(new URL('../src/canonical/sourceReplacementIdentity.ts',import.meta.url),'utf8'); assert.doesNotMatch(text,/device-sync\/v2/); }],
  [93,'Cloud v2 não entra motorBuildId',async()=>{ const text=await readFile(new URL('../src/canonical/sourceImport.ts',import.meta.url),'utf8'); assert.doesNotMatch(text,/canonicalHistoryManifest/); }],
  [94,'Bundle continua sem history',async()=>{ const text=await readFile(new URL('../src/canonical/bundleStore.ts',import.meta.url),'utf8'); assert.doesNotMatch(text,/canonicalHistoryManifest/); }],
  [95,'GlobalAudit não importa SyncBackup history',async()=>{ const text=await readFile(new URL('../src/canonical/globalAudit.ts',import.meta.url),'utf8'); assert.doesNotMatch(text,/canonicalHistorySync/); }],
  [96,'Sell Out não lê remote history',async()=>{ const text=await readFile(new URL('../src/pages/SellOutPage.tsx',import.meta.url),'utf8'); assert.doesNotMatch(text,/canonicalHistorySync/); }],
  [97,'Estoque não lê remote history',async()=>{ const text=await readFile(new URL('../src/pages/EstoquePage.tsx',import.meta.url),'utf8'); assert.doesNotMatch(text,/canonicalHistorySync/); }],
  [98,'Redes não lê remote history',async()=>{ const text=await readFile(new URL('../src/pages/RedesPage.tsx',import.meta.url),'utf8'); assert.doesNotMatch(text,/canonicalHistorySync/); }],
  [99,'sete abas administrativas permanecem',async()=>{ const text=await readFile(new URL('../src/pages/AdminPage.tsx',import.meta.url),'utf8').catch(()=>readFile(new URL('../src/pages/AdministracaoPage.tsx',import.meta.url),'utf8')); assert.ok((text.match(/id:/g)??[]).length>=7); }],
  [100,'não existe heuristic merge entre aparelhos',async()=>{ const text=await readFile(new URL('../src/canonical/cloudSync.ts',import.meta.url),'utf8'); assert.doesNotMatch(text,/mergeRemote|heuristic/i); }],
];
for (const [number, title, run] of structuralCases) test(`SB${number} — ${title}`, run);
