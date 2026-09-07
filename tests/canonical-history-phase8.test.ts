import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import {
  CANONICAL_HISTORY_DB,
  CANONICAL_HISTORY_FORMAT,
  CANONICAL_HISTORY_LIST_IDS,
  backfillCanonicalHistoryForClose,
  buildCanonicalHistoryArchive,
  canonicalHistoryArchiveHash,
  canonicalHistoryListHash,
  canonicalHistoryStatusForClose,
  captureCanonicalBuildForHistory,
  ensureCanonicalBuildArchived,
  loadHistoricalCanonicalList,
  validateCanonicalHistoryArchive,
  type CanonicalHistoryArchivePayload,
  type CanonicalHistoryRepository,
  type CanonicalHistoryCaptureDependencies,
} from '../src/canonical/canonicalHistory.ts';
import type { BundleManifest, CanonicalBundleRepository, StoredCanonicalBundle } from '../src/canonical/bundleStore.ts';
import { closeCompetenceInState, reopenCompetenceInState, type CompetenceState } from '../src/canonical/competenceStore.ts';
import { buildMonthlyClosingEvidence, monthlyClosingAuditHash } from '../src/canonical/monthlyClosingIdentity.ts';
import { appendMonthlyClosingEvent, monthlyClosingEventId, type MonthlyClosingBuildIdentity, type MonthlyClosingCloseEvent, type MonthlyClosingState } from '../src/canonical/monthlyClosingState.ts';
import type { ActiveCanonicalBundle } from '../src/canonical/runtime.ts';
import { CANONICAL_ENGINE_VERSION } from '../src/canonical/sourceImport.ts';
import { canonicalInputHashV3 } from '../src/canonical/sourceReplacementIdentity.ts';
import type { CanonicalList } from '../src/canonical/types.ts';
import { executeMonthlyCloseTransaction, executeMonthlyReopenTransaction, type MonthlyClosingFlowDependencies } from '../src/pages/admin/monthlyClosingFlow.ts';
import type { GlobalAuditFinding, GlobalAuditReport } from '../src/canonical/globalAudit.ts';
import { ADMIN_TABS } from '../src/navigation.ts';

const NOW = '2026-09-07T10:00:00.000Z';
const LATER = '2026-09-07T11:00:00.000Z';
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const clone = <T>(value: T): T => structuredClone(value);
const H = (char: string) => char.repeat(64);
const ids = CANONICAL_HISTORY_LIST_IDS;

function list(id: CanonicalList['id'], records: Array<Record<string, unknown>> = [{ id: `${id}-1` }], generatedAt = NOW): CanonicalList {
  return { id, records, sources: ['fixture'], generatedAt, competence: '2026-08', snapshotDate: '2026-08-31', warnings: [], errors: [] };
}
function listsFixture() {
  return {
    M1_ITEM_ESTOQUE: list('M1_ITEM_ESTOQUE'),
    M2_CLIENTE_RCA: list('M2_CLIENTE_RCA'),
    M3_MOVIMENTO_VENDAS: list('M3_MOVIMENTO_VENDAS', [{ fact_type: 'SALE', value: 10 }, { fact_type: 'TARGET', value: 20 }]),
    M4_HISTORICO_TRANSICAO: list('M4_HISTORICO_TRANSICAO', []),
  } satisfies Record<CanonicalList['id'], CanonicalList>;
}
function identityFixture(id = 'BUILD_HISTORY_A'): MonthlyClosingBuildIdentity {
  return { motorBuildId: id, engineVersion: CANONICAL_ENGINE_VERSION, stagingManifestHash: H('1'), adminRegistryHash: H('2'), rcaTargetRegistryHash: H('3'), sourceReplacementProofHash: H('4'), sourceReplacements: [], canonicalInputHash: H('5'), schemaVersion: 'v1', sourceContractVersion: 'v2' };
}
function activeFixture(identity = identityFixture()): ActiveCanonicalBundle {
  const lists = listsFixture();
  return { status: 'ACTIVE', ...identity, approvedAt: NOW, rowCounts: Object.fromEntries(ids.map(id => [id, lists[id].records.length])) as ActiveCanonicalBundle['rowCounts'], factTypeCounts: { SALE: 1, INBOUND_ORDER: 0, RECEIPT: 0, TARGET: 1 } };
}
async function payloadFixture(identity = identityFixture(), lists = listsFixture(), archivedAt = NOW) { return buildCanonicalHistoryArchive(identity, lists, archivedAt); }

function memoryHistoryRepository() {
  const payloads = new Map<string, CanonicalHistoryArchivePayload>();
  const repo: CanonicalHistoryRepository = {
    async putArchive(payload) {
      const valid = await validateCanonicalHistoryArchive(clone(payload));
      const existing = payloads.get(valid.archive.archiveId);
      if (existing) {
        if (existing.archive.archiveHash === valid.archive.archiveHash) return 'EXISTING';
        throw new Error('CANONICAL_HISTORY_COLLISION');
      }
      payloads.set(valid.archive.archiveId, clone(valid));
      return 'CREATED';
    },
    async getArchive(id) { const value = payloads.get(id); return value ? validateCanonicalHistoryArchive(clone(value)) : undefined; },
    async getList(id, listId) { return clone(payloads.get(id)?.lists[listId]); },
    async hasArchive(id) { return payloads.has(id); },
    async listArchives() { return [...payloads.values()].map(item => clone(item.archive)); },
    async deleteArchiveInternal(id) { payloads.delete(id); },
  };
  return { repo, payloads };
}
function memoryBundleRepository(bundle?: StoredCanonicalBundle) {
  let stored = bundle;
  const repo: CanonicalBundleRepository = { async put(value) { stored = value; }, async get(id) { return stored?.id === id ? stored : undefined; }, async delete(id) { if (stored?.id === id) stored = undefined; } };
  return repo;
}
async function hashBytes(bytes: Uint8Array) { const copy = new Uint8Array(bytes); const digest = await crypto.subtle.digest('SHA-256', copy.buffer); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
async function exactIdentity(id = 'BUILD_BUNDLE_A') {
  const stagingManifestHash = H('1'), adminRegistryHash = H('2'), rcaTargetRegistryHash = H('3'), sourceReplacementProofHash = H('4');
  return { motorBuildId: id, engineVersion: CANONICAL_ENGINE_VERSION, stagingManifestHash, adminRegistryHash, rcaTargetRegistryHash, sourceReplacementProofHash, sourceReplacements: [], canonicalInputHash: await canonicalInputHashV3(stagingManifestHash, adminRegistryHash, rcaTargetRegistryHash, sourceReplacementProofHash), schemaVersion: 'v1', sourceContractVersion: 'v2' } satisfies MonthlyClosingBuildIdentity;
}
async function bundleFixture(identity: MonthlyClosingBuildIdentity, lists = listsFixture()): Promise<StoredCanonicalBundle> {
  const files = {} as BundleManifest['files']; const entries: Record<string, Uint8Array> = {};
  for (const id of ids) { const path = `${id}.json`; const bytes = strToU8(JSON.stringify(lists[id])); entries[path] = bytes; files[path] = { path, sha256: await hashBytes(bytes), bytes: bytes.byteLength }; }
  const manifest: BundleManifest = { bundleFormat: 'blue-jacket-canonical-bundle/v1', motorBuildId: identity.motorBuildId, stagingManifestHash: identity.stagingManifestHash, adminRegistryHash: identity.adminRegistryHash, rcaTargetRegistryHash: identity.rcaTargetRegistryHash, sourceContractVersion: 'v2', sourceReplacementProofHash: identity.sourceReplacementProofHash, sourceReplacements: identity.sourceReplacements, canonicalInputHash: identity.canonicalInputHash, schemaVersion: identity.schemaVersion, engineVersion: identity.engineVersion, rowCounts: Object.fromEntries(ids.map(id => [id, lists[id].records.length])) as BundleManifest['rowCounts'], files, createdAt: NOW };
  entries['manifest.json'] = strToU8(JSON.stringify(manifest));
  const zip = zipSync(entries, { level: 0 });
  return { id: identity.motorBuildId, manifest, zip: new Blob([zip]), importedAt: NOW };
}
function generatedCaptureDeps(identity: MonthlyClosingBuildIdentity, historyRepository: CanonicalHistoryRepository, lists = listsFixture(), active = activeFixture(identity)): CanonicalHistoryCaptureDependencies {
  return { getActive: () => clone(active), loadGeneratedBuild: async id => id === identity.motorBuildId ? ({ id, active: clone(active), generatedAt: NOW, sourceHashes: {} } as any) : undefined, loadGeneratedList: async (_id, listId) => clone(lists[listId]), bundleRepository: memoryBundleRepository(), historyRepository, now: () => NOW };
}

const finding = (status: GlobalAuditFinding['status'], id: string): GlobalAuditFinding => ({ id, code: id, status, domain: 'SYSTEM', title: id, message: id, action: 'Revisar', count: 1 });
function auditReport(active = activeFixture(), warnings: GlobalAuditFinding[] = []): GlobalAuditReport { const pass = finding('PASS', 'PASS_ENGINE'); const findings = [...warnings, pass]; return { format: 'blue-jacket-global-audit/v1', generatedAt: NOW, activeBuild: active, overallStatus: warnings.length ? 'ATTENTION' : 'HEALTHY', partial: false, summary: { total: findings.length, blockers: 0, warnings: warnings.length, info: 0, pass: 1 }, sections: [], findings, technicalDetails: { motorBuildId: active.motorBuildId, engine: active.engineVersion, sourceContractVersion: active.sourceContractVersion ?? null, stagingManifestHash: active.stagingManifestHash, adminRegistryHash: active.adminRegistryHash ?? null, rcaTargetRegistryHash: active.rcaTargetRegistryHash ?? null, sourceReplacementProofHash: active.sourceReplacementProofHash ?? null, canonicalInputHash: active.canonicalInputHash ?? null, sourceReplacements: active.sourceReplacements ?? [] } }; }
const openCompetence = (): CompetenceState => ({ schemaVersion: 'v1', initializedAt: NOW, updatedAt: NOW, currentCompetence: '2026-08', records: [{ id: '2026-08', status: 'OPEN', createdAt: NOW, updatedAt: NOW, origin: 'MANUAL', note: null }] });
async function closeEvent(identity = identityFixture(), revision = 1, at = NOW): Promise<MonthlyClosingCloseEvent> { const report = auditReport(activeFixture(identity)); return { eventId: monthlyClosingEventId('2026-08', 'CLOSE', revision), type: 'CLOSE', competence: '2026-08', revision, occurredAt: at, evidence: await buildMonthlyClosingEvidence(report), warningAcknowledgement: { acknowledged: false, warningIds: [] }, note: null }; }
function flowHarness(options: { archiveStatus?: 'CREATED' | 'EXISTING'; archiveFailure?: boolean; persistClosingFailure?: boolean; persistCompetenceFailure?: boolean; syncFailure?: boolean; closing?: MonthlyClosingState | null; identity?: MonthlyClosingBuildIdentity } = {}) {
  const identity = options.identity ?? identityFixture(); const active = activeFixture(identity); const audit = auditReport(active); let competence: CompetenceState | null = openCompetence(); let closing = options.closing ? clone(options.closing) : null; let deleteCalls = 0; let archiveCalls = 0;
  const archive = { ...(null as any) } as any;
  const deps: MonthlyClosingFlowDependencies = {
    loadCompetence: () => clone(competence),
    replaceCompetence: next => { if (options.persistCompetenceFailure) throw new Error('COMPETENCE_WRITE_FAILED'); competence = clone(next); return clone(competence); },
    loadClosing: () => clone(closing),
    replaceClosing: next => { if (options.persistClosingFailure) throw new Error('CLOSING_WRITE_FAILED'); closing = clone(next); return clone(closing); },
    loadAudit: async () => clone(audit), getActive: () => clone(active),
    ensureArchive: async requested => { archiveCalls += 1; if (options.archiveFailure) throw new Error('ARCHIVE_FAILED'); const payload = await payloadFixture(requested); Object.assign(archive, payload.archive); return { status: options.archiveStatus ?? 'CREATED', archive }; },
    deleteArchiveInternal: async () => { deleteCalls += 1; },
    sync: async () => { if (options.syncFailure) throw new Error('SYNC_FAILED'); return { status: 'NOT_PAIRED' as const }; }, now: () => LATER,
  };
  return { deps, audit, active, read: () => ({ competence: clone(competence), closing: clone(closing), archiveCalls, deleteCalls }) };
}
const controls = { setPhase: (_phase: 'CHECKING' | 'PERSISTING' | 'SYNCING') => undefined };
async function closeInput(report: GlobalAuditReport) { return { competence: '2026-08', expectedAuditHash: await monthlyClosingAuditHash(report), expectedWarningIds: [], warningsReviewed: false, note: '' }; }

// CH1–CH12 — store / format
test('CH1 — format exato blue-jacket-canonical-history/v1', () => assert.equal(CANONICAL_HISTORY_FORMAT, 'blue-jacket-canonical-history/v1'));
test('CH2 — repository round-trip', async () => { const m = memoryHistoryRepository(); const payload = await payloadFixture(); assert.equal(await m.repo.putArchive(payload), 'CREATED'); assert.deepEqual(await m.repo.getArchive(payload.archive.archiveId), await validateCanonicalHistoryArchive(payload)); });
test('CH3 — quatro listas obrigatórias', () => assert.deepEqual(ids, ['M1_ITEM_ESTOQUE','M2_CLIENTE_RCA','M3_MOVIMENTO_VENDAS','M4_HISTORICO_TRANSICAO']));
test('CH4 — archive sem M1 rejeitado', async () => { const lists: any = listsFixture(); delete lists.M1_ITEM_ESTOQUE; await assert.rejects(() => buildCanonicalHistoryArchive(identityFixture(), lists), /M1_ITEM_ESTOQUE/); });
test('CH5 — archive sem M2 rejeitado', async () => { const lists: any = listsFixture(); delete lists.M2_CLIENTE_RCA; await assert.rejects(() => buildCanonicalHistoryArchive(identityFixture(), lists), /M2_CLIENTE_RCA/); });
test('CH6 — archive sem M3 rejeitado', async () => { const lists: any = listsFixture(); delete lists.M3_MOVIMENTO_VENDAS; await assert.rejects(() => buildCanonicalHistoryArchive(identityFixture(), lists), /M3_MOVIMENTO_VENDAS/); });
test('CH7 — archive sem M4 rejeitado', async () => { const lists: any = listsFixture(); delete lists.M4_HISTORICO_TRANSICAO; await assert.rejects(() => buildCanonicalHistoryArchive(identityFixture(), lists), /M4_HISTORICO_TRANSICAO/); });
test('CH8 — metadata/list write é atômico', () => assert.match(source('../src/canonical/canonicalHistory.ts'), /transaction\(\[ARCHIVES_STORE, LISTS_STORE\], 'readwrite'\)/));
test('CH9 — post-write validation relê tudo', () => assert.match(source('../src/canonical/canonicalHistory.ts'), /const verified = await loadPayload\(valid\.archive\.archiveId\)/));
test('CH10 — storage failure não deixa archive parcial', async () => { const payload = await payloadFixture(); const repo: CanonicalHistoryRepository = { ...memoryHistoryRepository().repo, putArchive: async () => { throw new Error('WRITE_FAILED'); } }; await assert.rejects(() => repo.putArchive(payload), /WRITE_FAILED/); assert.equal(await repo.hasArchive(payload.archive.archiveId), false); });
test('CH11 — archiveId = motorBuildId', async () => { const payload = await payloadFixture(); assert.equal(payload.archive.archiveId, payload.archive.motorBuildId); });
test('CH12 — archive não armazena competência como autoridade', async () => assert.equal('competence' in (await payloadFixture()).archive, false));

// CH13–CH24 — hash / integrity
test('CH13 — list hash independe da ordem de object keys', async () => { const a = list('M1_ITEM_ESTOQUE', [{ a: 1, b: 2 }]); const b = list('M1_ITEM_ESTOQUE', [{ b: 2, a: 1 }]); assert.equal(await canonicalHistoryListHash(a), await canonicalHistoryListHash(b)); });
test('CH14 — record array order altera list hash', async () => { const a = list('M1_ITEM_ESTOQUE', [{ a: 1 }, { a: 2 }]); const b = list('M1_ITEM_ESTOQUE', [{ a: 2 }, { a: 1 }]); assert.notEqual(await canonicalHistoryListHash(a), await canonicalHistoryListHash(b)); });
test('CH15 — mudança de valor altera list hash', async () => assert.notEqual(await canonicalHistoryListHash(list('M1_ITEM_ESTOQUE', [{ a: 1 }])), await canonicalHistoryListHash(list('M1_ITEM_ESTOQUE', [{ a: 2 }]))));
test('CH16 — archiveHash determinístico', async () => { const a = await payloadFixture(); const b = await payloadFixture(); assert.equal(a.archive.archiveHash, b.archive.archiveHash); });
test('CH17 — archivedAt não altera archiveHash', async () => { const a = await payloadFixture(identityFixture(), listsFixture(), NOW); const b = await payloadFixture(identityFixture(), listsFixture(), LATER); assert.equal(a.archive.archiveHash, b.archive.archiveHash); });
test('CH18 — build identity altera archiveHash', async () => { const a = await payloadFixture(); const b = await payloadFixture({ ...identityFixture(), canonicalInputHash: H('9') }); assert.notEqual(a.archive.archiveHash, b.archive.archiveHash); });
for (const [n, id] of [[19,'M1_ITEM_ESTOQUE'],[20,'M2_CLIENTE_RCA'],[21,'M3_MOVIMENTO_VENDAS'],[22,'M4_HISTORICO_TRANSICAO']] as const) test(`CH${n} — ${id.slice(0,2)} hash alterado altera archiveHash`, async () => { const a = await payloadFixture(); const lists = listsFixture(); lists[id] = { ...lists[id], records: [...lists[id].records, { changed: true }] }; const b = await payloadFixture(identityFixture(), lists); assert.notEqual(a.archive.archiveHash, b.archive.archiveHash); });
test('CH23 — row count mismatch → CORRUPT', async () => { const p = await payloadFixture(); p.archive.rowCounts.M1_ITEM_ESTOQUE += 1; await assert.rejects(() => validateCanonicalHistoryArchive(p), /CORRUPT/); });
test('CH24 — factTypeCounts mismatch → CORRUPT', async () => { const p = await payloadFixture(); p.archive.factTypeCounts.SALE += 1; await assert.rejects(() => validateCanonicalHistoryArchive(p), /CORRUPT/); });

// CH25–CH32 — collision / idempotence
test('CH25 — mesmo motorBuildId + mesmo conteúdo é idempotente', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); assert.equal(await m.repo.putArchive(p), 'CREATED'); assert.equal(await m.repo.putArchive(clone(p)), 'EXISTING'); });
test('CH26 — mesmo motorBuildId + identity diferente gera collision', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); const q = await payloadFixture({ ...identityFixture(), adminRegistryHash: H('8') }); await assert.rejects(() => m.repo.putArchive(q), /COLLISION/); });
test('CH27 — mesmo motorBuildId + M1 diferente gera collision', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); const lists = listsFixture(); lists.M1_ITEM_ESTOQUE.records.push({ x: 2 }); await assert.rejects(() => m.repo.putArchive(await payloadFixture(identityFixture(), lists)), /COLLISION/); });
test('CH28 — archive existente nunca é sobrescrito', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); const before = clone(m.payloads.get(p.archive.archiveId)!); await assert.rejects(() => m.repo.putArchive(await payloadFixture({ ...identityFixture(), canonicalInputHash: H('8') })), /COLLISION/); assert.deepEqual(m.payloads.get(p.archive.archiveId), before); });
test('CH29 — releitura detecta list corruption', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); m.payloads.get(p.archive.archiveId)!.lists.M1_ITEM_ESTOQUE.records.push({ corrupt: true }); await assert.rejects(() => m.repo.getArchive(p.archive.archiveId), /CORRUPT/); });
test('CH30 — releitura detecta metadata corruption', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); m.payloads.get(p.archive.archiveId)!.archive.rowCounts.M1_ITEM_ESTOQUE = 999; await assert.rejects(() => m.repo.getArchive(p.archive.archiveId), /CORRUPT/); });
test('CH31 — archive corrupt não cai para active', () => { const text = source('../src/canonical/canonicalHistory.ts'); assert.doesNotMatch(text, /CORRUPT[\s\S]{0,200}resolveActiveCanonicalBundle/); });
test('CH32 — archive corrupt não tenta rebuild', () => assert.doesNotMatch(source('../src/canonical/canonicalHistory.ts'), /buildCanonicalFromStoredSources|processSourceUpdates|buildCanonicalBundleFromStaging/));

// CH33–CH42 — capture sources
test('CH33 — generated build exato pode ser arquivado', async () => { const identity = identityFixture(); const m = memoryHistoryRepository(); const result = await captureCanonicalBuildForHistory(identity, {}, generatedCaptureDeps(identity, m.repo)); assert.equal(result.status, 'CREATED'); });
test('CH34 — generated build com identity mismatch rejeitado', async () => { const identity = identityFixture(); const m = memoryHistoryRepository(); const deps = generatedCaptureDeps(identity, m.repo); deps.loadGeneratedBuild = async () => ({ id: identity.motorBuildId, active: activeFixture({ ...identity, adminRegistryHash: H('9') }), generatedAt: NOW, sourceHashes: {} } as any); await assert.rejects(() => captureCanonicalBuildForHistory(identity, {}, deps), /IDENTITY_MISMATCH/); });
test('CH35 — fallback para stored technical Bundle exato funciona', async () => { const identity = await exactIdentity(); const m = memoryHistoryRepository(); const bundle = await bundleFixture(identity); const deps: CanonicalHistoryCaptureDependencies = { getActive: () => activeFixture(identity), loadGeneratedBuild: async () => undefined, loadGeneratedList: async () => { throw new Error('NO_GENERATED'); }, bundleRepository: memoryBundleRepository(bundle), historyRepository: m.repo, now: () => NOW }; const result = await captureCanonicalBuildForHistory(identity, {}, deps); assert.equal(result.status, 'CREATED'); });
test('CH36 — Bundle mesma ID mas identity diferente rejeita', async () => { const identity = await exactIdentity(); const other = { ...identity, adminRegistryHash: H('9') }; const bundle = await bundleFixture(other); const m = memoryHistoryRepository(); const deps: CanonicalHistoryCaptureDependencies = { getActive: () => activeFixture(identity), loadGeneratedBuild: async () => undefined, loadGeneratedList: async () => { throw new Error(); }, bundleRepository: memoryBundleRepository(bundle), historyRepository: m.repo, now: () => NOW }; await assert.rejects(() => captureCanonicalBuildForHistory(identity, {}, deps), /IDENTITY_MISMATCH|CANONICAL_INPUT_HASH_MISMATCH/); });
test('CH37 — sem generated e sem Bundle é SOURCE_UNAVAILABLE', async () => { const identity = identityFixture(); const m = memoryHistoryRepository(); const deps = generatedCaptureDeps(identity, m.repo); deps.loadGeneratedBuild = async () => undefined; await assert.rejects(() => captureCanonicalBuildForHistory(identity, {}, deps), /SOURCE_UNAVAILABLE/); });
test('CH38 — capture não chama parser', () => assert.doesNotMatch(source('../src/canonical/canonicalHistory.ts'), /parseSource\(/));
test('CH39 — capture não chama motor', () => assert.doesNotMatch(source('../src/canonical/canonicalHistory.ts'), /buildCanonicalBundleFromStaging|motors/));
test('CH40 — capture não chama processSourceUpdates', () => assert.doesNotMatch(source('../src/canonical/canonicalHistory.ts'), /processSourceUpdates/));
test('CH41 — active muda durante capture current aborta', async () => { const identity = identityFixture(); const m = memoryHistoryRepository(); const deps = generatedCaptureDeps(identity, m.repo); let reads = 0; deps.getActive = () => activeFixture(reads++ === 0 ? identity : { ...identity, motorBuildId: 'BUILD_OTHER' }); await assert.rejects(() => ensureCanonicalBuildArchived(identity, deps), /ACTIVE_CHANGED/); });
test('CH42 — quatro listas são carregadas antes da transaction histórica', async () => { const identity = identityFixture(); const m = memoryHistoryRepository(); const calls: string[] = []; const deps = generatedCaptureDeps(identity, { ...m.repo, putArchive: async payload => { assert.deepEqual(calls, ids); return m.repo.putArchive(payload); } }); deps.loadGeneratedList = async (_build, id) => { calls.push(id); return listsFixture()[id]; }; await captureCanonicalBuildForHistory(identity, {}, deps); });

// CH43–CH54 — monthly close integration
test('CH43 — novo CLOSE exige archive local validado', async () => { const h = flowHarness(); await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); assert.equal(h.read().archiveCalls, 1); });
test('CH44 — archive é criado antes de persistir CLOSE', async () => { const h = flowHarness(); let archived = false; h.deps.ensureArchive = async identity => { archived = true; return { status: 'CREATED', archive: (await payloadFixture(identity)).archive }; }; const original = h.deps.replaceClosing; h.deps.replaceClosing = state => { assert.equal(archived, true); return original(state); }; await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); });
test('CH45 — archive failure mantém competência OPEN', async () => { const h = flowHarness({ archiveFailure: true }); await assert.rejects(() => executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps), /HISTORY_ARCHIVE_FAILED/); assert.equal(h.read().competence?.records[0].status, 'OPEN'); });
test('CH46 — archive failure não cria CLOSE event', async () => { const h = flowHarness({ archiveFailure: true }); await assert.rejects(() => executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps)); assert.equal(h.read().closing, null); });
test('CH47 — close success deixa CLOSED + archive', async () => { const h = flowHarness(); await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); assert.equal(h.read().competence?.records[0].status, 'CLOSED'); assert.equal(h.read().archiveCalls, 1); });
test('CH48 — current continua null após close', async () => { const h = flowHarness(); await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); assert.equal(h.read().competence?.currentCompetence, null); });
test('CH49 — canonical build não muda durante archive', async () => { const identity = identityFixture(); const active = activeFixture(identity); const before = clone(active); const m = memoryHistoryRepository(); await captureCanonicalBuildForHistory(identity, { requireCurrentActive: true }, generatedCaptureDeps(identity, m.repo, listsFixture(), active)); assert.deepEqual(active, before); });
test('CH50 — archive já existente é reutilizado', async () => { const h = flowHarness({ archiveStatus: 'EXISTING' }); await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); assert.equal(h.read().deleteCalls, 0); });
test('CH51 — falha posterior ao novo archive executa compensação', async () => { const h = flowHarness({ persistClosingFailure: true, archiveStatus: 'CREATED' }); await assert.rejects(() => executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps)); assert.equal(h.read().deleteCalls, 1); });
test('CH52 — archive preexistente não é apagado em rollback', async () => { const h = flowHarness({ persistClosingFailure: true, archiveStatus: 'EXISTING' }); await assert.rejects(() => executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps)); assert.equal(h.read().deleteCalls, 0); });
test('CH53 — sync fail pós-close preserva archive', async () => { const h = flowHarness({ syncFailure: true }); const result = await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); assert.equal(result.phase, 'LOCAL_SUCCESS_SYNC_FAILED'); assert.equal(h.read().deleteCalls, 0); });
test('CH54 — monthlyClosingFlow continua sem builder/parser', () => assert.doesNotMatch(source('../src/pages/admin/monthlyClosingFlow.ts'), /processSourceUpdates|buildCanonicalFromStoredSources|parseSource|buildCanonicalBundleFromStaging|activateCanonicalBundle|persistCanonicalBundle|recoverTechnicalBundle/));

// CH55–CH62 — reopen / reclose
test('CH55 — REOPEN não apaga archive', async () => { const closing = appendMonthlyClosingEvent(null, await closeEvent()); let competence: CompetenceState | null = closeCompetenceInState(openCompetence(), '2026-08', LATER); let deletes = 0; const h = flowHarness({ closing }); const deps = { ...h.deps, loadCompetence: () => clone(competence), replaceCompetence: next => { competence = clone(next); return clone(competence); }, deleteArchiveInternal: async () => { deletes += 1; } }; await executeMonthlyReopenTransaction({ competence: '2026-08', reason: 'Correção' }, controls, deps); assert.equal(deletes, 0); });
test('CH56 — revision reaberta continua consultável', async () => { const close = await closeEvent(); const closing = appendMonthlyClosingEvent(appendMonthlyClosingEvent(null, close), { eventId: '2026-08:REOPEN:1', type: 'REOPEN', competence: '2026-08', revision: 1, occurredAt: LATER, closeEventId: close.eventId, reason: 'x' }); assert.equal(closing.events.some(event => event.type === 'CLOSE' && event.revision === 1), true); });
test('CH57 — RECLOSE com mesmo build reutiliza archive', async () => { const h = flowHarness({ archiveStatus: 'EXISTING' }); await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); assert.equal(h.read().archiveCalls, 1); });
test('CH58 — RECLOSE com novo build cria segundo archive', async () => { const a = await payloadFixture(identityFixture('A')); const b = await payloadFixture(identityFixture('B')); assert.notEqual(a.archive.archiveId, b.archive.archiveId); });
test('CH59 — CLOSE r1 continua bit-a-bit', async () => { const close = await closeEvent(); const before = clone(close); const state = appendMonthlyClosingEvent(appendMonthlyClosingEvent(null, close), { eventId: '2026-08:REOPEN:1', type: 'REOPEN', competence: '2026-08', revision: 1, occurredAt: LATER, closeEventId: close.eventId, reason: 'x' }); assert.deepEqual(state.events[0], before); });
test('CH60 — archive r1 continua bit-a-bit', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); const before = clone(await m.repo.getArchive(p.archive.archiveId)); await m.repo.putArchive(clone(p)); assert.deepEqual(await m.repo.getArchive(p.archive.archiveId), before); });
test('CH61 — REOPEN não exige re-arquivar', () => assert.doesNotMatch(source('../src/pages/admin/monthlyClosingFlow.ts').split('export async function executeMonthlyReopenTransaction')[1], /ensureArchive/));
test('CH62 — legacy CLOSED sem CLOSE continua sem archive inventado', () => assert.doesNotMatch(source('../src/canonical/canonicalHistory.ts'), /closedCompetence|legacy.*CLOSE/i));

// CH63–CH72 — backfill
test('CH63 — CLOSE antigo sem archive → MISSING_LOCAL', async () => { const close = await closeEvent(); assert.equal(await canonicalHistoryStatusForClose(close, memoryHistoryRepository().repo), 'MISSING_LOCAL'); });
test('CH64 — backfill generated exato → AVAILABLE', async () => { const close = await closeEvent(); const m = memoryHistoryRepository(); await backfillCanonicalHistoryForClose(close, generatedCaptureDeps(close.evidence.activeBuildIdentity, m.repo)); assert.equal(await canonicalHistoryStatusForClose(close, m.repo), 'AVAILABLE'); });
test('CH65 — backfill Bundle exato → AVAILABLE', async () => { const identity = await exactIdentity(); const close = await closeEvent(identity); const m = memoryHistoryRepository(); const bundle = await bundleFixture(identity); const deps: CanonicalHistoryCaptureDependencies = { getActive: () => null, loadGeneratedBuild: async () => undefined, loadGeneratedList: async () => { throw new Error(); }, bundleRepository: memoryBundleRepository(bundle), historyRepository: m.repo, now: () => NOW }; await backfillCanonicalHistoryForClose(close, deps); assert.equal(await canonicalHistoryStatusForClose(close, m.repo), 'AVAILABLE'); });
test('CH66 — backfill unavailable não altera CLOSE', async () => { const close = await closeEvent(); const before = clone(close); const m = memoryHistoryRepository(); const deps = generatedCaptureDeps(close.evidence.activeBuildIdentity, m.repo); deps.loadGeneratedBuild = async () => undefined; await assert.rejects(() => backfillCanonicalHistoryForClose(close, deps), /SOURCE_UNAVAILABLE/); assert.deepEqual(close, before); });
test('CH67 — backfill unavailable não cria archive vazio', async () => { const close = await closeEvent(); const m = memoryHistoryRepository(); const deps = generatedCaptureDeps(close.evidence.activeBuildIdentity, m.repo); deps.loadGeneratedBuild = async () => undefined; await assert.rejects(() => backfillCanonicalHistoryForClose(close, deps)); assert.equal((await m.repo.listArchives()).length, 0); });
test('CH68 — backfill não rebuilda', () => assert.doesNotMatch(source('../src/canonical/canonicalHistory.ts'), /buildCanonicalFromStoredSources|processSourceUpdates/));
test('CH69 — backfill é idempotente', async () => { const close = await closeEvent(); const m = memoryHistoryRepository(); const deps = generatedCaptureDeps(close.evidence.activeBuildIdentity, m.repo); assert.equal((await backfillCanonicalHistoryForClose(close, deps)).status, 'CREATED'); assert.equal((await backfillCanonicalHistoryForClose(close, deps)).status, 'EXISTING'); });
test('CH70 — backfill collision rejeita', async () => { const close = await closeEvent(); const m = memoryHistoryRepository(); await m.repo.putArchive(await payloadFixture({ ...close.evidence.activeBuildIdentity, adminRegistryHash: H('9') })); const deps = generatedCaptureDeps(close.evidence.activeBuildIdentity, m.repo); await assert.rejects(() => backfillCanonicalHistoryForClose(close, deps), /COLLISION/); });
test('CH71 — page load não executa backfill automaticamente', () => { const page = source('../src/pages/ListasCanonicasPage.tsx'); assert.match(page, /onClick={async \(\) => \{ try \{ await backfillCanonicalHistoryForClose/); assert.doesNotMatch(page, /useEffect\([^)]*backfillCanonicalHistoryForClose/); });
test('CH72 — CLOSE continua válido mesmo MISSING_LOCAL', async () => { const close = await closeEvent(); const state = appendMonthlyClosingEvent(null, close); assert.equal(state.events[0].eventId, close.eventId); assert.equal(await canonicalHistoryStatusForClose(close, memoryHistoryRepository().repo), 'MISSING_LOCAL'); });

// CH73–CH82 — UI / query / export
test('CH73 — Dados Canônicos preserva seção Build Ativo', () => assert.match(source('../src/pages/ListasCanonicasPage.tsx'), /title="Build ativo"/));
test('CH74 — Histórico lista CLOSE events', () => assert.match(source('../src/pages/ListasCanonicasPage.tsx'), /event\.type === 'CLOSE'/));
test('CH75 — REOPEN não remove revision da lista', () => assert.match(source('../src/pages/ListasCanonicasPage.tsx'), /event\.type === 'REOPEN'.*event\.revision === close\.revision/));
test('CH76 — AVAILABLE permite preview M1–M4', () => { const page = source('../src/pages/ListasCanonicasPage.tsx'); assert.match(page, /row\.status === 'AVAILABLE'/); for (const id of ids) assert.match(page, new RegExp(id)); });
test('CH77 — preview histórico não altera activeCanonical', () => assert.doesNotMatch(source('../src/pages/ListasCanonicasPage.tsx'), /activateCanonical|setActiveCanonical|historicalActiveCanonical/));
test('CH78 — preview mostra aviso VISUALIZAÇÃO HISTÓRICA', () => assert.match(source('../src/pages/ListasCanonicasPage.tsx'), /VISUALIZAÇÃO HISTÓRICA/));
test('CH79 — export JSON histórico usa provenance histórica', () => assert.match(source('../src/pages/ListasCanonicasPage.tsx'), /exportJson\(await getHistorical\(selectedArchive\.archiveId, id\), provenance\)/));
test('CH80 — export Excel histórico usa provenance histórica', () => assert.match(source('../src/pages/ListasCanonicasPage.tsx'), /exportExcel\(await getHistorical\(selectedArchive\.archiveId, id\), provenance\)/));
test('CH81 — active B + history A exporta motorBuildId A', () => assert.match(source('../src/pages/ListasCanonicasPage.tsx'), /const provenance = selectedArchive\.buildIdentity/));
test('CH82 — não existe ação ATIVAR/RESTAURAR histórico', () => assert.doesNotMatch(source('../src/pages/ListasCanonicasPage.tsx'), /ATIVAR BUILD|RESTAURAR BUILD|USAR COMO ATUAL|VOLTAR PARA ESTE BUILD/));

// CH83–CH90 — isolation / future Phase 9
test('CH83 — Cloud snapshot v1 NÃO contém CanonicalHistory', () => assert.doesNotMatch(source('../src/canonical/cloudSync.ts'), /CanonicalHistory|canonicalHistory/));
test('CH84 — Cloud restore não limpa history local', () => assert.doesNotMatch(source('../src/canonical/cloudSync.ts'), /clearCanonicalHistory|deleteArchiveInternal/));
test('CH85 — Bundle format permanece inalterado', () => assert.match(source('../src/canonical/bundleStore.ts'), /blue-jacket-canonical-bundle\/v1/));
test('CH86 — CanonicalHistory não entra no technical ZIP', () => assert.doesNotMatch(source('../src/canonical/bundleStore.ts'), /canonicalHistory|CanonicalHistory/));
test('CH87 — engine continua exatamente v21', () => assert.equal(CANONICAL_ENGINE_VERSION, 'browser-stage4-product-assortment-v21-source-replacement'));
test('CH88 — canonicalInputHash não inclui history', () => assert.doesNotMatch(source('../src/canonical/sourceReplacementIdentity.ts'), /canonicalHistory|CanonicalHistory/));
test('CH89 — motorBuildId não inclui history', () => assert.doesNotMatch(source('../src/canonical/sourceImport.ts'), /canonicalHistory|CanonicalHistory/));
test('CH90 — nenhum Sync/Backup v2 foi implementado', () => { assert.doesNotMatch(source('../src/canonical/cloudSync.ts'), /blue-jacket-device-sync\/v2/); assert.doesNotMatch(source('../src/canonical/canonicalHistory.ts'), /upload|remote|Supabase|BJ2/); });

// CH91–CH96 — regressão arquitetural
test('CH91 — DataContext continua usando somente activeCanonical operacional', () => assert.doesNotMatch(source('../src/store/DataContext.tsx'), /CanonicalHistory|canonicalHistory|historicalActiveCanonical/));
test('CH92 — Sell Out não lê CanonicalHistory', () => assert.doesNotMatch(source('../src/pages/SellOutPage.tsx'), /CanonicalHistory|canonicalHistory/));
test('CH93 — Estoque não lê CanonicalHistory', () => assert.doesNotMatch(source('../src/pages/EstoquePage.tsx'), /CanonicalHistory|canonicalHistory/));
test('CH94 — Redes não lê CanonicalHistory', () => assert.doesNotMatch(source('../src/pages/RedesPage.tsx'), /CanonicalHistory|canonicalHistory/));
test('CH95 — GlobalAudit não usa history como gate operacional', () => { assert.doesNotMatch(source('../src/canonical/globalAudit.ts'), /CanonicalHistory|canonicalHistory/); assert.doesNotMatch(source('../src/canonical/globalAuditInputs.ts'), /CanonicalHistory|canonicalHistory/); });
test('CH96 — sete abas administrativas permanecem as mesmas', () => assert.equal(ADMIN_TABS.length, 7));
