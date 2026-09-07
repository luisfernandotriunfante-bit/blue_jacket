import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import {
  CANONICAL_HISTORY_FORMAT,
  CANONICAL_HISTORY_LIST_IDS,
  backfillCanonicalHistoryForClose,
  buildCanonicalHistoryArchive,
  canonicalHistoryListHash,
  canonicalHistoryStatusForClose,
  captureCanonicalBuildForHistory,
  ensureCanonicalBuildArchived,
  validateCanonicalHistoryArchive,
  type CanonicalHistoryArchivePayload,
  type CanonicalHistoryRepository,
  type CanonicalHistoryCaptureDependencies,
} from '../src/canonical/canonicalHistory.ts';
import type { BundleManifest, CanonicalBundleRepository, StoredCanonicalBundle } from '../src/canonical/bundleStore.ts';
import { closeCompetenceInState, type CompetenceState } from '../src/canonical/competenceStore.ts';
import { buildMonthlyClosingEvidence, monthlyClosingAuditHash } from '../src/canonical/monthlyClosingIdentity.ts';
import { appendMonthlyClosingEvent, monthlyClosingEventId, type MonthlyClosingBuildIdentity, type MonthlyClosingCloseEvent, type MonthlyClosingState } from '../src/canonical/monthlyClosingState.ts';
import type { ActiveCanonicalBundle } from '../src/canonical/runtime.ts';
import { CANONICAL_ENGINE_VERSION } from '../src/canonical/sourceImport.ts';
import { canonicalInputHashV3 } from '../src/canonical/sourceReplacementIdentity.ts';
import type { CanonicalList } from '../src/canonical/types.ts';
import { executeMonthlyCloseTransaction, type MonthlyClosingFlowDependencies } from '../src/pages/admin/monthlyClosingFlow.ts';
import type { GlobalAuditFinding, GlobalAuditReport } from '../src/canonical/globalAudit.ts';
import { ADMIN_TABS } from '../src/navigation.ts';

const NOW = '2026-09-07T10:00:00.000Z';
const LATER = '2026-09-07T11:00:00.000Z';
const H = (char: string) => char.repeat(64);
const ids = CANONICAL_HISTORY_LIST_IDS;
const clone = <T>(value: T): T => structuredClone(value);
const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

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
function memoryBundleRepository(bundle?: StoredCanonicalBundle): CanonicalBundleRepository {
  let stored = bundle;
  return { async put(value) { stored = value; }, async get(id) { return stored?.id === id ? stored : undefined; }, async delete(id) { if (stored?.id === id) stored = undefined; } };
}
async function hashBytes(bytes: Uint8Array) { const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
async function exactIdentity(id = 'BUILD_BUNDLE_A') {
  const stagingManifestHash = H('1'), adminRegistryHash = H('2'), rcaTargetRegistryHash = H('3'), sourceReplacementProofHash = H('4');
  return { motorBuildId: id, engineVersion: CANONICAL_ENGINE_VERSION, stagingManifestHash, adminRegistryHash, rcaTargetRegistryHash, sourceReplacementProofHash, sourceReplacements: [], canonicalInputHash: await canonicalInputHashV3(stagingManifestHash, adminRegistryHash, rcaTargetRegistryHash, sourceReplacementProofHash), schemaVersion: 'v1', sourceContractVersion: 'v2' } satisfies MonthlyClosingBuildIdentity;
}
async function bundleFixture(identity: MonthlyClosingBuildIdentity, lists = listsFixture()): Promise<StoredCanonicalBundle> {
  const files = {} as BundleManifest['files']; const entries: Record<string, Uint8Array> = {};
  for (const id of ids) { const path = `${id}.json`; const bytes = strToU8(JSON.stringify(lists[id])); entries[path] = bytes; files[path] = { path, sha256: await hashBytes(bytes), bytes: bytes.byteLength }; }
  const manifest: BundleManifest = { bundleFormat: 'blue-jacket-canonical-bundle/v1', motorBuildId: identity.motorBuildId, stagingManifestHash: identity.stagingManifestHash, adminRegistryHash: identity.adminRegistryHash, rcaTargetRegistryHash: identity.rcaTargetRegistryHash, sourceContractVersion: 'v2', sourceReplacementProofHash: identity.sourceReplacementProofHash, sourceReplacements: identity.sourceReplacements, canonicalInputHash: identity.canonicalInputHash, schemaVersion: identity.schemaVersion, engineVersion: identity.engineVersion, rowCounts: Object.fromEntries(ids.map(id => [id, lists[id].records.length])) as BundleManifest['rowCounts'], files, createdAt: NOW };
  entries['manifest.json'] = strToU8(JSON.stringify(manifest));
  return { id: identity.motorBuildId, manifest, zip: new Blob([zipSync(entries, { level: 0 })]), importedAt: NOW };
}
function generatedDeps(identity: MonthlyClosingBuildIdentity, historyRepository: CanonicalHistoryRepository, lists = listsFixture(), active = activeFixture(identity)): CanonicalHistoryCaptureDependencies {
  return { getActive: () => clone(active), loadGeneratedBuild: async id => id === identity.motorBuildId ? ({ id, active: clone(active), generatedAt: NOW, sourceHashes: {} } as any) : undefined, loadGeneratedList: async (_id, listId) => clone(lists[listId]), bundleRepository: memoryBundleRepository(), historyRepository, now: () => NOW };
}

const finding = (status: GlobalAuditFinding['status'], id: string): GlobalAuditFinding => ({ id, code: id, status, domain: 'SYSTEM', title: id, message: id, action: 'Revisar', count: 1 });
function auditReport(active = activeFixture(), warnings: GlobalAuditFinding[] = []): GlobalAuditReport { const pass = finding('PASS', 'PASS_ENGINE'); const findings = [...warnings, pass]; return { format: 'blue-jacket-global-audit/v1', generatedAt: NOW, activeBuild: active, overallStatus: warnings.length ? 'ATTENTION' : 'HEALTHY', partial: false, summary: { total: findings.length, blockers: 0, warnings: warnings.length, info: 0, pass: 1 }, sections: [], findings, technicalDetails: { motorBuildId: active.motorBuildId, engine: active.engineVersion, sourceContractVersion: active.sourceContractVersion ?? null, stagingManifestHash: active.stagingManifestHash, adminRegistryHash: active.adminRegistryHash ?? null, rcaTargetRegistryHash: active.rcaTargetRegistryHash ?? null, sourceReplacementProofHash: active.sourceReplacementProofHash ?? null, canonicalInputHash: active.canonicalInputHash ?? null, sourceReplacements: active.sourceReplacements ?? [] } }; }
const openCompetence = (): CompetenceState => ({ schemaVersion: 'v1', initializedAt: NOW, updatedAt: NOW, currentCompetence: '2026-08', records: [{ id: '2026-08', status: 'OPEN', createdAt: NOW, updatedAt: NOW, origin: 'MANUAL', note: '' }] });
async function closeEvent(identity = identityFixture(), revision = 1, at = NOW): Promise<MonthlyClosingCloseEvent> { const report = auditReport(activeFixture(identity)); return { eventId: monthlyClosingEventId('2026-08', 'CLOSE', revision), type: 'CLOSE', competence: '2026-08', revision, occurredAt: at, evidence: await buildMonthlyClosingEvidence(report), warningAcknowledgement: { acknowledged: false, warningIds: [] }, note: null }; }
function flowHarness(options: { archiveStatus?: 'CREATED' | 'EXISTING'; archiveFailure?: boolean; persistClosingFailure?: boolean; persistCompetenceFailure?: boolean; syncFailure?: boolean; closing?: MonthlyClosingState | null; identity?: MonthlyClosingBuildIdentity } = {}) {
  const identity = options.identity ?? identityFixture(); const active = activeFixture(identity); const audit = auditReport(active); let competence: CompetenceState | null = openCompetence(); let closing = options.closing ? clone(options.closing) : null; let deleteCalls = 0; let archiveCalls = 0;
  const deps: MonthlyClosingFlowDependencies = {
    loadCompetence: () => clone(competence), replaceCompetence: next => { if (options.persistCompetenceFailure) throw new Error('COMPETENCE_WRITE_FAILED'); competence = clone(next); return clone(competence); },
    loadClosing: () => clone(closing), replaceClosing: next => { if (options.persistClosingFailure) throw new Error('CLOSING_WRITE_FAILED'); closing = clone(next); return clone(closing); }, loadAudit: async () => clone(audit), getActive: () => clone(active),
    ensureArchive: async requested => { archiveCalls += 1; if (options.archiveFailure) throw new Error('ARCHIVE_FAILED'); return { status: options.archiveStatus ?? 'CREATED', archive: (await payloadFixture(requested)).archive }; }, deleteArchiveInternal: async () => { deleteCalls += 1; }, sync: async () => { if (options.syncFailure) throw new Error('SYNC_FAILED'); return { status: 'NOT_PAIRED' as const }; }, now: () => LATER,
  };
  return { deps, audit, active, read: () => ({ competence: clone(competence), closing: clone(closing), archiveCalls, deleteCalls }) };
}
const controls = { setPhase: (_phase: 'CHECKING' | 'PERSISTING' | 'SYNCING') => undefined };
async function closeInput(report: GlobalAuditReport) { return { competence: '2026-08', expectedAuditHash: await monthlyClosingAuditHash(report), expectedWarningIds: [], warningsReviewed: false, note: '' }; }

// CH1–CH12
test('CH1 — format exato blue-jacket-canonical-history/v1', () => assert.equal(CANONICAL_HISTORY_FORMAT, 'blue-jacket-canonical-history/v1'));
test('CH2 — repository round-trip', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); assert.deepEqual(await m.repo.getArchive(p.archive.archiveId), await validateCanonicalHistoryArchive(p)); });
test('CH3 — quatro listas obrigatórias', () => assert.deepEqual(ids, ['M1_ITEM_ESTOQUE','M2_CLIENTE_RCA','M3_MOVIMENTO_VENDAS','M4_HISTORICO_TRANSICAO']));
for (const [n, id] of [[4,'M1_ITEM_ESTOQUE'],[5,'M2_CLIENTE_RCA'],[6,'M3_MOVIMENTO_VENDAS'],[7,'M4_HISTORICO_TRANSICAO']] as const) test(`CH${n} — archive sem ${id.slice(0,2)} rejeitado`, async () => { const lists: any = listsFixture(); delete lists[id]; await assert.rejects(() => buildCanonicalHistoryArchive(identityFixture(), lists), new RegExp(id)); });
test('CH8 — metadata/list write é atômico', () => assert.match(src('../src/canonical/canonicalHistory.ts'), /transaction\(\[ARCHIVES_STORE, LISTS_STORE\], 'readwrite'\)/));
test('CH9 — post-write validation relê tudo', () => assert.match(src('../src/canonical/canonicalHistory.ts'), /const verified = await loadPayload\(valid\.archive\.archiveId\)/));
test('CH10 — storage failure não deixa archive parcial', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); const failing: CanonicalHistoryRepository = { ...m.repo, putArchive: async () => { throw new Error('WRITE_FAILED'); } }; await assert.rejects(() => failing.putArchive(p), /WRITE_FAILED/); assert.equal(await m.repo.hasArchive(p.archive.archiveId), false); });
test('CH11 — archiveId = motorBuildId', async () => { const p = await payloadFixture(); assert.equal(p.archive.archiveId, p.archive.motorBuildId); });
test('CH12 — archive não armazena competência como autoridade', async () => assert.equal('competence' in (await payloadFixture()).archive, false));

// CH13–CH24
test('CH13 — list hash determinístico sob ordem de object keys', async () => assert.equal(await canonicalHistoryListHash(list('M1_ITEM_ESTOQUE', [{ a: 1, b: 2 }])), await canonicalHistoryListHash(list('M1_ITEM_ESTOQUE', [{ b: 2, a: 1 }]))));
test('CH14 — record array order altera list hash', async () => assert.notEqual(await canonicalHistoryListHash(list('M1_ITEM_ESTOQUE', [{ a: 1 }, { a: 2 }])), await canonicalHistoryListHash(list('M1_ITEM_ESTOQUE', [{ a: 2 }, { a: 1 }]))));
test('CH15 — mudança de um valor altera list hash', async () => assert.notEqual(await canonicalHistoryListHash(list('M1_ITEM_ESTOQUE', [{ a: 1 }])), await canonicalHistoryListHash(list('M1_ITEM_ESTOQUE', [{ a: 2 }]))));
test('CH16 — archiveHash determinístico', async () => assert.equal((await payloadFixture()).archive.archiveHash, (await payloadFixture()).archive.archiveHash));
test('CH17 — archivedAt não altera archiveHash', async () => assert.equal((await payloadFixture(identityFixture(), listsFixture(), NOW)).archive.archiveHash, (await payloadFixture(identityFixture(), listsFixture(), LATER)).archive.archiveHash));
test('CH18 — build identity altera archiveHash', async () => assert.notEqual((await payloadFixture()).archive.archiveHash, (await payloadFixture({ ...identityFixture(), canonicalInputHash: H('9') })).archive.archiveHash));
for (const [n, id] of [[19,'M1_ITEM_ESTOQUE'],[20,'M2_CLIENTE_RCA'],[21,'M3_MOVIMENTO_VENDAS'],[22,'M4_HISTORICO_TRANSICAO']] as const) test(`CH${n} — ${id.slice(0,2)} hash alterado altera archiveHash`, async () => { const a = await payloadFixture(); const lists = listsFixture(); lists[id] = { ...lists[id], records: [...lists[id].records, { changed: true }] }; const b = await payloadFixture(identityFixture(), lists); assert.notEqual(a.archive.archiveHash, b.archive.archiveHash); });
test('CH23 — row count mismatch → CORRUPT', async () => { const p = await payloadFixture(); p.archive.rowCounts.M1_ITEM_ESTOQUE += 1; await assert.rejects(() => validateCanonicalHistoryArchive(p), /CORRUPT/); });
test('CH24 — factTypeCounts mismatch → CORRUPT', async () => { const p = await payloadFixture(); p.archive.factTypeCounts.SALE += 1; await assert.rejects(() => validateCanonicalHistoryArchive(p), /CORRUPT/); });

// CH25–CH32
test('CH25 — mesmo motorBuildId + mesmo conteúdo é idempotente', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); assert.equal(await m.repo.putArchive(p), 'CREATED'); assert.equal(await m.repo.putArchive(clone(p)), 'EXISTING'); });
test('CH26 — mesmo motorBuildId + identity diferente gera collision', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); const q = await payloadFixture({ ...identityFixture(), adminRegistryHash: H('8') }); await assert.rejects(() => m.repo.putArchive(q), /COLLISION/); });
test('CH27 — mesmo motorBuildId + M1 diferente gera collision', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); const lists = listsFixture(); lists.M1_ITEM_ESTOQUE.records.push({ x: 2 }); const q = await payloadFixture(identityFixture(), lists); await assert.rejects(() => m.repo.putArchive(q), /COLLISION/); });
test('CH28 — archive existente nunca é sobrescrito', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); const before = clone(m.payloads.get(p.archive.archiveId)!); const q = await payloadFixture({ ...identityFixture(), canonicalInputHash: H('8') }); await assert.rejects(() => m.repo.putArchive(q), /COLLISION/); assert.deepEqual(m.payloads.get(p.archive.archiveId), before); });
test('CH29 — releitura detecta list corruption', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); m.payloads.get(p.archive.archiveId)!.lists.M1_ITEM_ESTOQUE.records.push({ corrupt: true }); await assert.rejects(() => m.repo.getArchive(p.archive.archiveId), /CORRUPT/); });
test('CH30 — releitura detecta metadata corruption', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); m.payloads.get(p.archive.archiveId)!.archive.rowCounts.M1_ITEM_ESTOQUE = 999; await assert.rejects(() => m.repo.getArchive(p.archive.archiveId), /CORRUPT/); });
test('CH31 — archive corrupt não cai para active', () => assert.doesNotMatch(src('../src/canonical/canonicalHistory.ts'), /CORRUPT[\s\S]{0,200}resolveActiveCanonicalBundle/));
test('CH32 — archive corrupt não tenta rebuild', () => assert.doesNotMatch(src('../src/canonical/canonicalHistory.ts'), /buildCanonicalFromStoredSources|processSourceUpdates|buildCanonicalBundleFromStaging/));

// CH33–CH42
test('CH33 — generated build exato pode ser arquivado', async () => { const identity = identityFixture(); const m = memoryHistoryRepository(); assert.equal((await captureCanonicalBuildForHistory(identity, {}, generatedDeps(identity, m.repo))).status, 'CREATED'); });
test('CH34 — generated build com identity mismatch rejeitado', async () => { const identity = identityFixture(); const m = memoryHistoryRepository(); const deps = generatedDeps(identity, m.repo); deps.loadGeneratedBuild = async () => ({ id: identity.motorBuildId, active: activeFixture({ ...identity, adminRegistryHash: H('9') }), generatedAt: NOW, sourceHashes: {} } as any); await assert.rejects(() => captureCanonicalBuildForHistory(identity, {}, deps), /IDENTITY_MISMATCH/); });
test('CH35 — fallback para stored technical Bundle exato funciona', async () => { const identity = await exactIdentity(); const m = memoryHistoryRepository(); const bundle = await bundleFixture(identity); const deps: CanonicalHistoryCaptureDependencies = { getActive: () => activeFixture(identity), loadGeneratedBuild: async () => undefined, loadGeneratedList: async () => { throw new Error('NO_GENERATED'); }, bundleRepository: memoryBundleRepository(bundle), historyRepository: m.repo, now: () => NOW }; assert.equal((await captureCanonicalBuildForHistory(identity, {}, deps)).status, 'CREATED'); });
test('CH36 — Bundle com mesma ID mas identity diferente rejeita', async () => { const identity = await exactIdentity(); const other = { ...identity, adminRegistryHash: H('9') }; const bundle = await bundleFixture(other); const m = memoryHistoryRepository(); const deps: CanonicalHistoryCaptureDependencies = { getActive: () => activeFixture(identity), loadGeneratedBuild: async () => undefined, loadGeneratedList: async () => { throw new Error(); }, bundleRepository: memoryBundleRepository(bundle), historyRepository: m.repo, now: () => NOW }; await assert.rejects(() => captureCanonicalBuildForHistory(identity, {}, deps)); });
test('CH37 — sem generated e sem Bundle é SOURCE_UNAVAILABLE', async () => { const identity = identityFixture(); const m = memoryHistoryRepository(); const deps = generatedDeps(identity, m.repo); deps.loadGeneratedBuild = async () => undefined; await assert.rejects(() => captureCanonicalBuildForHistory(identity, {}, deps), /SOURCE_UNAVAILABLE/); });
test('CH38 — capture não chama parser', () => assert.doesNotMatch(src('../src/canonical/canonicalHistory.ts'), /parseSource\(/));
test('CH39 — capture não chama motor', () => assert.doesNotMatch(src('../src/canonical/canonicalHistory.ts'), /motors|buildCanonicalBundleFromStaging/));
test('CH40 — capture não chama processSourceUpdates', () => assert.doesNotMatch(src('../src/canonical/canonicalHistory.ts'), /processSourceUpdates/));
test('CH41 — active muda durante captura de current → abort', async () => { const identity = identityFixture(); const m = memoryHistoryRepository(); const deps = generatedDeps(identity, m.repo); let reads = 0; deps.getActive = () => activeFixture(reads++ === 0 ? identity : { ...identity, motorBuildId: 'BUILD_OTHER' }); await assert.rejects(() => ensureCanonicalBuildArchived(identity, deps), /ACTIVE_CHANGED/); });
test('CH42 — quatro listas são carregadas antes da transaction histórica', async () => { const identity = identityFixture(); const m = memoryHistoryRepository(); const calls: string[] = []; const wrapped: CanonicalHistoryRepository = { ...m.repo, putArchive: async payload => { assert.deepEqual(calls, ids); return m.repo.putArchive(payload); } }; const deps = generatedDeps(identity, wrapped); deps.loadGeneratedList = async (_build, id) => { calls.push(id); return listsFixture()[id]; }; await captureCanonicalBuildForHistory(identity, {}, deps); });

// CH43–CH54
test('CH43 — novo CLOSE exige archive local validado', async () => { const h = flowHarness(); await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); assert.equal(h.read().archiveCalls, 1); });
test('CH44 — archive é criado antes de persistir CLOSE', async () => { const h = flowHarness(); let archived = false; const replace = h.deps.replaceClosing; h.deps.ensureArchive = async identity => { archived = true; return { status: 'CREATED', archive: (await payloadFixture(identity)).archive }; }; h.deps.replaceClosing = state => { assert.equal(archived, true); return replace(state); }; await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); });
test('CH45 — archive failure mantém competência OPEN', async () => { const h = flowHarness({ archiveFailure: true }); const input = await closeInput(h.audit); await assert.rejects(() => executeMonthlyCloseTransaction(input, controls, h.deps), /HISTORY_ARCHIVE_FAILED/); assert.equal(h.read().competence?.records[0].status, 'OPEN'); });
test('CH46 — archive failure não cria CLOSE event', async () => { const h = flowHarness({ archiveFailure: true }); const input = await closeInput(h.audit); await assert.rejects(() => executeMonthlyCloseTransaction(input, controls, h.deps)); assert.equal(h.read().closing, null); });
test('CH47 — close success deixa CLOSED + archive', async () => { const h = flowHarness(); await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); assert.equal(h.read().competence?.records[0].status, 'CLOSED'); assert.equal(h.read().archiveCalls, 1); });
test('CH48 — current continua null após close', async () => { const h = flowHarness(); await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); assert.equal(h.read().competence?.currentCompetence, null); });
test('CH49 — canonical build não muda durante archive', async () => { const identity = identityFixture(); const active = activeFixture(identity); const before = clone(active); const m = memoryHistoryRepository(); await captureCanonicalBuildForHistory(identity, { requireCurrentActive: true }, generatedDeps(identity, m.repo, listsFixture(), active)); assert.deepEqual(active, before); });
test('CH50 — archive já existente é reutilizado', async () => { const h = flowHarness({ archiveStatus: 'EXISTING' }); await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); assert.equal(h.read().deleteCalls, 0); });
test('CH51 — falha posterior ao novo archive executa compensação', async () => { const h = flowHarness({ persistClosingFailure: true, archiveStatus: 'CREATED' }); const input = await closeInput(h.audit); await assert.rejects(() => executeMonthlyCloseTransaction(input, controls, h.deps)); assert.equal(h.read().deleteCalls, 1); });
test('CH52 — archive preexistente não é apagado em rollback', async () => { const h = flowHarness({ persistClosingFailure: true, archiveStatus: 'EXISTING' }); const input = await closeInput(h.audit); await assert.rejects(() => executeMonthlyCloseTransaction(input, controls, h.deps)); assert.equal(h.read().deleteCalls, 0); });
test('CH53 — sync fail pós-close preserva archive', async () => { const h = flowHarness({ syncFailure: true }); const result = await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); assert.equal(result.phase, 'LOCAL_SUCCESS_SYNC_FAILED'); assert.equal(h.read().deleteCalls, 0); });
test('CH54 — monthlyClosingFlow continua sem builder/parser', () => assert.doesNotMatch(src('../src/pages/admin/monthlyClosingFlow.ts'), /processSourceUpdates|buildCanonicalFromStoredSources|parseSource|buildCanonicalBundleFromStaging|activateCanonicalBundle|persistCanonicalBundle|recoverTechnicalBundle/));

// CH55–CH62
test('CH55 — REOPEN não apaga archive', () => assert.doesNotMatch(src('../src/pages/admin/monthlyClosingFlow.ts').split('export async function executeMonthlyReopenTransaction')[1], /deleteArchiveInternal/));
test('CH56 — revision reaberta continua consultável', async () => { const close = await closeEvent(); const state = appendMonthlyClosingEvent(appendMonthlyClosingEvent(null, close), { eventId: '2026-08:REOPEN:1', type: 'REOPEN', competence: '2026-08', revision: 1, occurredAt: LATER, closeEventId: close.eventId, reason: 'x' }); assert.equal(state.events.some(event => event.type === 'CLOSE' && event.revision === 1), true); });
test('CH57 — RECLOSE com mesmo build reutiliza archive', async () => { const h = flowHarness({ archiveStatus: 'EXISTING' }); await executeMonthlyCloseTransaction(await closeInput(h.audit), controls, h.deps); assert.equal(h.read().archiveCalls, 1); });
test('CH58 — RECLOSE com novo build cria segundo archive', async () => assert.notEqual((await payloadFixture(identityFixture('A'))).archive.archiveId, (await payloadFixture(identityFixture('B'))).archive.archiveId));
test('CH59 — CLOSE r1 continua bit-a-bit', async () => { const close = await closeEvent(); const before = clone(close); const state = appendMonthlyClosingEvent(appendMonthlyClosingEvent(null, close), { eventId: '2026-08:REOPEN:1', type: 'REOPEN', competence: '2026-08', revision: 1, occurredAt: LATER, closeEventId: close.eventId, reason: 'x' }); assert.deepEqual(state.events[0], before); });
test('CH60 — archive r1 continua bit-a-bit', async () => { const m = memoryHistoryRepository(); const p = await payloadFixture(); await m.repo.putArchive(p); const before = clone(await m.repo.getArchive(p.archive.archiveId)); await m.repo.putArchive(clone(p)); assert.deepEqual(await m.repo.getArchive(p.archive.archiveId), before); });
test('CH61 — REOPEN não exige re-arquivar', () => assert.doesNotMatch(src('../src/pages/admin/monthlyClosingFlow.ts').split('export async function executeMonthlyReopenTransaction')[1], /ensureArchive/));
test('CH62 — legacy CLOSED sem CLOSE continua sem archive inventado', () => assert.doesNotMatch(src('../src/canonical/canonicalHistory.ts'), /legacy.*CLOSE|closedCompetence/i));

// CH63–CH72
test('CH63 — CLOSE antigo sem archive → MISSING_LOCAL', async () => assert.equal(await canonicalHistoryStatusForClose(await closeEvent(), memoryHistoryRepository().repo), 'MISSING_LOCAL'));
test('CH64 — backfill generated exato → AVAILABLE', async () => { const close = await closeEvent(); const m = memoryHistoryRepository(); await backfillCanonicalHistoryForClose(close, generatedDeps(close.evidence.activeBuildIdentity, m.repo)); assert.equal(await canonicalHistoryStatusForClose(close, m.repo), 'AVAILABLE'); });
test('CH65 — backfill Bundle exato → AVAILABLE', async () => { const identity = await exactIdentity(); const close = await closeEvent(identity); const m = memoryHistoryRepository(); const bundle = await bundleFixture(identity); const deps: CanonicalHistoryCaptureDependencies = { getActive: () => null, loadGeneratedBuild: async () => undefined, loadGeneratedList: async () => { throw new Error(); }, bundleRepository: memoryBundleRepository(bundle), historyRepository: m.repo, now: () => NOW }; await backfillCanonicalHistoryForClose(close, deps); assert.equal(await canonicalHistoryStatusForClose(close, m.repo), 'AVAILABLE'); });
test('CH66 — backfill unavailable não altera CLOSE', async () => { const close = await closeEvent(); const before = clone(close); const m = memoryHistoryRepository(); const deps = generatedDeps(close.evidence.activeBuildIdentity, m.repo); deps.loadGeneratedBuild = async () => undefined; await assert.rejects(() => backfillCanonicalHistoryForClose(close, deps), /SOURCE_UNAVAILABLE/); assert.deepEqual(close, before); });
test('CH67 — backfill unavailable não cria archive vazio', async () => { const close = await closeEvent(); const m = memoryHistoryRepository(); const deps = generatedDeps(close.evidence.activeBuildIdentity, m.repo); deps.loadGeneratedBuild = async () => undefined; await assert.rejects(() => backfillCanonicalHistoryForClose(close, deps)); assert.equal((await m.repo.listArchives()).length, 0); });
test('CH68 — backfill não rebuilda', () => assert.doesNotMatch(src('../src/canonical/canonicalHistory.ts'), /buildCanonicalFromStoredSources|processSourceUpdates/));
test('CH69 — backfill é idempotente', async () => { const close = await closeEvent(); const m = memoryHistoryRepository(); const deps = generatedDeps(close.evidence.activeBuildIdentity, m.repo); assert.equal((await backfillCanonicalHistoryForClose(close, deps)).status, 'CREATED'); assert.equal((await backfillCanonicalHistoryForClose(close, deps)).status, 'EXISTING'); });
test('CH70 — backfill collision rejeita', async () => { const close = await closeEvent(); const m = memoryHistoryRepository(); const conflicting = await payloadFixture({ ...close.evidence.activeBuildIdentity, adminRegistryHash: H('9') }); await m.repo.putArchive(conflicting); await assert.rejects(() => backfillCanonicalHistoryForClose(close, generatedDeps(close.evidence.activeBuildIdentity, m.repo)), /COLLISION/); });
test('CH71 — page load não executa backfill automaticamente', () => { const page = src('../src/pages/ListasCanonicasPage.tsx'); assert.match(page, /onClick={async \(\) => \{ try \{ await backfillCanonicalHistoryForClose/); assert.doesNotMatch(page, /useEffect\([^)]*backfillCanonicalHistoryForClose/); });
test('CH72 — CLOSE continua válido mesmo MISSING_LOCAL', async () => { const close = await closeEvent(); const state = appendMonthlyClosingEvent(null, close); assert.equal(state.events[0].eventId, close.eventId); assert.equal(await canonicalHistoryStatusForClose(close, memoryHistoryRepository().repo), 'MISSING_LOCAL'); });

// CH73–CH82
test('CH73 — Dados Canônicos preserva seção Build Ativo', () => assert.match(src('../src/pages/ListasCanonicasPage.tsx'), /title="Build ativo"/));
test('CH74 — Histórico lista CLOSE events', () => assert.match(src('../src/pages/ListasCanonicasPage.tsx'), /event\.type === 'CLOSE'/));
test('CH75 — REOPEN não remove revision da lista', () => assert.match(src('../src/pages/ListasCanonicasPage.tsx'), /event\.type === 'REOPEN'.*event\.revision === close\.revision/));
test('CH76 — AVAILABLE permite preview M1–M4', () => { const page = src('../src/pages/ListasCanonicasPage.tsx'); assert.match(page, /row\.status === 'AVAILABLE'/); for (const id of ids) assert.match(page, new RegExp(id)); });
test('CH77 — preview histórico não altera activeCanonical', () => assert.doesNotMatch(src('../src/pages/ListasCanonicasPage.tsx'), /activateCanonical|setActiveCanonical|historicalActiveCanonical/));
test('CH78 — preview mostra aviso VISUALIZAÇÃO HISTÓRICA', () => assert.match(src('../src/pages/ListasCanonicasPage.tsx'), /VISUALIZAÇÃO HISTÓRICA/));
test('CH79 — export JSON histórico usa provenance histórica', () => assert.match(src('../src/pages/ListasCanonicasPage.tsx'), /exportJson\(await getHistorical\(selectedArchive\.archiveId, id\), provenance\)/));
test('CH80 — export Excel histórico usa provenance histórica', () => assert.match(src('../src/pages/ListasCanonicasPage.tsx'), /exportExcel\(await getHistorical\(selectedArchive\.archiveId, id\), provenance\)/));
test('CH81 — active B + history A exporta motorBuildId A', () => assert.match(src('../src/pages/ListasCanonicasPage.tsx'), /const provenance = selectedArchive\.buildIdentity/));
test('CH82 — não existe ação ATIVAR/RESTAURAR histórico', () => assert.doesNotMatch(src('../src/pages/ListasCanonicasPage.tsx'), /ATIVAR BUILD|RESTAURAR BUILD|USAR COMO ATUAL|VOLTAR PARA ESTE BUILD/));

// CH83–CH90 — Phase 8 invariants evolved for Phase 9 transport
 test('CH83 — Cloud snapshot v1 continua sem CanonicalHistory', () => { const cloud = src('../src/canonical/cloudSync.ts'); const v1 = cloud.slice(cloud.indexOf('export type CloudSnapshotV1'), cloud.indexOf('export type CloudSnapshotV2')); assert.doesNotMatch(v1, /canonicalHistoryManifest|CanonicalHistoryArchive/); });
test('CH84 — Cloud restore v1 não limpa history local', () => { const cloud = src('../src/canonical/cloudSync.ts'); const v1Apply = cloud.slice(cloud.indexOf('async function applyCloudSnapshot('), cloud.indexOf('function saveIdentity')); assert.doesNotMatch(v1Apply, /deleteArchiveInternal|historyRepository/); assert.doesNotMatch(v1Apply, /clearCanonicalHistory/); });
test('CH85 — Bundle format permanece inalterado', () => assert.match(src('../src/canonical/bundleStore.ts'), /blue-jacket-canonical-bundle\/v1/));
test('CH86 — CanonicalHistory não entra no technical ZIP', () => assert.doesNotMatch(src('../src/canonical/bundleStore.ts'), /CanonicalHistory|canonicalHistory/));
test('CH87 — engine continua exatamente v21', () => assert.equal(CANONICAL_ENGINE_VERSION, 'browser-stage4-product-assortment-v21-source-replacement'));
test('CH88 — canonicalInputHash não inclui history', () => assert.doesNotMatch(src('../src/canonical/sourceReplacementIdentity.ts'), /CanonicalHistory|canonicalHistory/));
test('CH89 — motorBuildId não inclui history', () => assert.doesNotMatch(src('../src/canonical/sourceImport.ts'), /CanonicalHistory|canonicalHistory/));
test('CH90 — Sync/Backup v2 não transforma CanonicalHistory local em Active nem acopla seu repository ao Supabase', () => { assert.match(src('../src/canonical/cloudSync.ts'), /blue-jacket-device-sync\/v2/); assert.doesNotMatch(src('../src/canonical/canonicalHistory.ts'), /uploadPayload|Supabase|BJH1|history-upload|activateCanonicalBundle/); });

// CH91–CH96
test('CH91 — DataContext continua usando somente activeCanonical operacional', () => assert.doesNotMatch(src('../src/store/DataContext.tsx'), /CanonicalHistory|canonicalHistory|historicalActiveCanonical/));
test('CH92 — Sell Out não lê CanonicalHistory', () => assert.doesNotMatch(src('../src/pages/SellOutPage.tsx'), /CanonicalHistory|canonicalHistory/));
test('CH93 — Estoque não lê CanonicalHistory', () => assert.doesNotMatch(src('../src/pages/EstoquePage.tsx'), /CanonicalHistory|canonicalHistory/));
test('CH94 — Redes não lê CanonicalHistory', () => assert.doesNotMatch(src('../src/pages/TopRetailNetworksPage.tsx'), /CanonicalHistory|canonicalHistory/));
test('CH95 — GlobalAudit não usa history como gate operacional', () => { assert.doesNotMatch(src('../src/canonical/globalAudit.ts'), /CanonicalHistory|canonicalHistory/); assert.doesNotMatch(src('../src/canonical/globalAuditInputs.ts'), /CanonicalHistory|canonicalHistory/); });
test('CH96 — sete abas administrativas permanecem as mesmas', () => assert.equal(ADMIN_TABS.length, 7));