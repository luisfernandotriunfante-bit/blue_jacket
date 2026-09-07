import type { MonthlyClosingBuildIdentity, MonthlyClosingCloseEvent, MonthlyClosingState } from './monthlyClosingState';
import { loadMonthlyClosingState } from './monthlyClosingState';
import { loadGeneratedCanonicalBuild, loadGeneratedCanonicalList } from './sourceImport';
import {
  indexedDbCanonicalBundleRepository,
  loadStoredCanonicalList,
  validateCanonicalBundleBytes,
  type CanonicalBundleRepository,
  type BundleManifest,
} from './bundleStore';
import { resolveActiveCanonicalBundle, type ActiveCanonicalBundle } from './runtime';
import type { CanonicalList } from './types';

export const CANONICAL_HISTORY_FORMAT = 'blue-jacket-canonical-history/v1' as const;
export const CANONICAL_HISTORY_DB = 'blue-jacket-v1-canonical-history';
const DB_VERSION = 1;
const ARCHIVES_STORE = 'archives';
const LISTS_STORE = 'lists';
export const CANONICAL_HISTORY_LIST_IDS: CanonicalList['id'][] = [
  'M1_ITEM_ESTOQUE',
  'M2_CLIENTE_RCA',
  'M3_MOVIMENTO_VENDAS',
  'M4_HISTORICO_TRANSICAO',
];
const encoder = new TextEncoder();

export type CanonicalHistoryListHashes = Record<CanonicalList['id'], string>;
export type CanonicalHistorySerializedBytes = Record<CanonicalList['id'], number>;
export type CanonicalHistoryArchive = {
  format: typeof CANONICAL_HISTORY_FORMAT;
  archiveId: string;
  motorBuildId: string;
  archivedAt: string;
  buildIdentity: MonthlyClosingBuildIdentity;
  rowCounts: Record<CanonicalList['id'], number>;
  factTypeCounts: { SALE: number; INBOUND_ORDER: number; RECEIPT: number; TARGET: number };
  listHashes: CanonicalHistoryListHashes;
  serializedBytes: CanonicalHistorySerializedBytes;
  archiveHash: string;
};
export type CanonicalHistoryArchivePayload = {
  archive: CanonicalHistoryArchive;
  lists: Record<CanonicalList['id'], CanonicalList>;
};
type StoredHistoryList = { id: string; archiveId: string; listId: CanonicalList['id']; list: CanonicalList };

export type CanonicalHistoryRepository = {
  putArchive(payload: CanonicalHistoryArchivePayload): Promise<'CREATED' | 'EXISTING'>;
  getArchive(archiveId: string): Promise<CanonicalHistoryArchivePayload | undefined>;
  getList(archiveId: string, listId: CanonicalList['id']): Promise<CanonicalList | undefined>;
  hasArchive(archiveId: string): Promise<boolean>;
  listArchives(): Promise<CanonicalHistoryArchive[]>;
  deleteArchiveInternal(archiveId: string): Promise<void>;
};

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, normalize(child)]));
  }
  return value;
}

function stableJson(value: unknown) { return JSON.stringify(normalize(value)); }
async function sha256Text(value: string) {
  const bytes = encoder.encode(value);
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export const canonicalHistoryListHash = (list: CanonicalList) => sha256Text(stableJson(list));

const sortedReplacements = (items: Array<{ source: string; scope: string }>) => [...items]
  .map(item => ({ source: item.source, scope: item.scope }))
  .sort((a, b) => a.source.localeCompare(b.source) || a.scope.localeCompare(b.scope));

export function canonicalHistoryBuildIdentity(value: MonthlyClosingBuildIdentity): MonthlyClosingBuildIdentity {
  if (!value || typeof value !== 'object') throw new Error('CANONICAL_HISTORY_CORRUPT');
  const required = [value.motorBuildId, value.engineVersion, value.stagingManifestHash, value.adminRegistryHash, value.rcaTargetRegistryHash, value.sourceReplacementProofHash, value.canonicalInputHash, value.schemaVersion, value.sourceContractVersion];
  if (required.some(item => typeof item !== 'string' || !item.trim()) || !Array.isArray(value.sourceReplacements)) throw new Error('CANONICAL_HISTORY_CORRUPT');
  return { ...value, sourceReplacements: sortedReplacements(value.sourceReplacements) };
}

function sameIdentity(a: MonthlyClosingBuildIdentity, b: MonthlyClosingBuildIdentity) {
  return stableJson(canonicalHistoryBuildIdentity(a)) === stableJson(canonicalHistoryBuildIdentity(b));
}

function factTypeCounts(list: CanonicalList) {
  const counts = { SALE: 0, INBOUND_ORDER: 0, RECEIPT: 0, TARGET: 0 };
  for (const record of list.records) {
    const type = String(record.fact_type ?? '') as keyof typeof counts;
    if (type in counts) counts[type] += 1;
  }
  return counts;
}

export async function canonicalHistoryArchiveHash(input: Omit<CanonicalHistoryArchive, 'archiveHash' | 'archivedAt'>) {
  return sha256Text(stableJson([
    CANONICAL_HISTORY_FORMAT,
    canonicalHistoryBuildIdentity(input.buildIdentity),
    input.motorBuildId,
    input.rowCounts,
    input.factTypeCounts,
    input.listHashes,
  ]));
}

export async function buildCanonicalHistoryArchive(buildIdentity: MonthlyClosingBuildIdentity, lists: Record<CanonicalList['id'], CanonicalList>, archivedAt = new Date().toISOString()): Promise<CanonicalHistoryArchivePayload> {
  const identity = canonicalHistoryBuildIdentity(buildIdentity);
  if (identity.motorBuildId !== buildIdentity.motorBuildId || !Number.isFinite(Date.parse(archivedAt))) throw new Error('CANONICAL_HISTORY_CORRUPT');
  for (const id of CANONICAL_HISTORY_LIST_IDS) {
    const list = lists[id];
    if (!list || list.id !== id || !Array.isArray(list.records) || !Array.isArray(list.warnings) || !Array.isArray(list.errors)) throw new Error(`CANONICAL_HISTORY_LIST_MISSING:${id}`);
  }
  const listHashes = {} as CanonicalHistoryListHashes;
  const rowCounts = {} as Record<CanonicalList['id'], number>;
  const serializedBytes = {} as CanonicalHistorySerializedBytes;
  for (const id of CANONICAL_HISTORY_LIST_IDS) {
    listHashes[id] = await canonicalHistoryListHash(lists[id]);
    rowCounts[id] = lists[id].records.length;
    serializedBytes[id] = encoder.encode(stableJson(lists[id])).byteLength;
  }
  const base = {
    format: CANONICAL_HISTORY_FORMAT,
    archiveId: identity.motorBuildId,
    motorBuildId: identity.motorBuildId,
    buildIdentity: identity,
    rowCounts,
    factTypeCounts: factTypeCounts(lists.M3_MOVIMENTO_VENDAS),
    listHashes,
    serializedBytes,
  } as const;
  const archiveHash = await canonicalHistoryArchiveHash(base);
  return { archive: { ...base, archivedAt, archiveHash }, lists };
}

export async function validateCanonicalHistoryArchive(payload: CanonicalHistoryArchivePayload) {
  const { archive, lists } = payload;
  if (!archive || archive.format !== CANONICAL_HISTORY_FORMAT || archive.archiveId !== archive.motorBuildId || archive.archiveId !== archive.buildIdentity?.motorBuildId || !Number.isFinite(Date.parse(archive.archivedAt))) throw new Error('CANONICAL_HISTORY_CORRUPT');
  const rebuilt = await buildCanonicalHistoryArchive(archive.buildIdentity, lists, archive.archivedAt);
  if (stableJson(rebuilt.archive.rowCounts) !== stableJson(archive.rowCounts)) throw new Error('CANONICAL_HISTORY_CORRUPT');
  if (stableJson(rebuilt.archive.factTypeCounts) !== stableJson(archive.factTypeCounts)) throw new Error('CANONICAL_HISTORY_CORRUPT');
  if (stableJson(rebuilt.archive.listHashes) !== stableJson(archive.listHashes)) throw new Error('CANONICAL_HISTORY_CORRUPT');
  if (rebuilt.archive.archiveHash !== archive.archiveHash) throw new Error('CANONICAL_HISTORY_CORRUPT');
  return { archive: { ...archive, buildIdentity: canonicalHistoryBuildIdentity(archive.buildIdentity) }, lists };
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CANONICAL_HISTORY_DB, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ARCHIVES_STORE)) database.createObjectStore(ARCHIVES_STORE, { keyPath: 'archiveId' });
      if (!database.objectStoreNames.contains(LISTS_STORE)) database.createObjectStore(LISTS_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('CANONICAL_HISTORY_STORAGE_UNAVAILABLE'));
  });
}
async function rawArchive(archiveId: string) {
  const database = await openDb();
  try {
    return await new Promise<CanonicalHistoryArchive | undefined>((resolve, reject) => {
      const request = database.transaction(ARCHIVES_STORE, 'readonly').objectStore(ARCHIVES_STORE).get(archiveId);
      request.onsuccess = () => resolve(request.result as CanonicalHistoryArchive | undefined);
      request.onerror = () => reject(request.error ?? new Error('CANONICAL_HISTORY_STORAGE_READ_FAILED'));
    });
  } finally { database.close(); }
}
async function rawList(archiveId: string, listId: CanonicalList['id']) {
  const database = await openDb();
  try {
    return await new Promise<CanonicalList | undefined>((resolve, reject) => {
      const request = database.transaction(LISTS_STORE, 'readonly').objectStore(LISTS_STORE).get(`${archiveId}:${listId}`);
      request.onsuccess = () => resolve((request.result as StoredHistoryList | undefined)?.list);
      request.onerror = () => reject(request.error ?? new Error('CANONICAL_HISTORY_STORAGE_READ_FAILED'));
    });
  } finally { database.close(); }
}
async function loadPayload(archiveId: string): Promise<CanonicalHistoryArchivePayload | undefined> {
  const archive = await rawArchive(archiveId);
  if (!archive) return undefined;
  const lists = {} as Record<CanonicalList['id'], CanonicalList>;
  for (const id of CANONICAL_HISTORY_LIST_IDS) {
    const list = await rawList(archiveId, id);
    if (!list) throw new Error('CANONICAL_HISTORY_CORRUPT');
    lists[id] = list;
  }
  return validateCanonicalHistoryArchive({ archive, lists });
}
async function putArchive(payload: CanonicalHistoryArchivePayload): Promise<'CREATED' | 'EXISTING'> {
  const valid = await validateCanonicalHistoryArchive(payload);
  const existing = await loadPayload(valid.archive.archiveId);
  if (existing) {
    if (existing.archive.archiveHash === valid.archive.archiveHash) return 'EXISTING';
    throw new Error('CANONICAL_HISTORY_COLLISION');
  }
  const database = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction([ARCHIVES_STORE, LISTS_STORE], 'readwrite');
      tx.objectStore(ARCHIVES_STORE).add(valid.archive);
      const listsStore = tx.objectStore(LISTS_STORE);
      for (const id of CANONICAL_HISTORY_LIST_IDS) listsStore.add({ id: `${valid.archive.archiveId}:${id}`, archiveId: valid.archive.archiveId, listId: id, list: valid.lists[id] } satisfies StoredHistoryList);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('CANONICAL_HISTORY_STORAGE_WRITE_FAILED'));
      tx.onabort = () => reject(tx.error ?? new Error('CANONICAL_HISTORY_STORAGE_WRITE_FAILED'));
    });
  } finally { database.close(); }
  const verified = await loadPayload(valid.archive.archiveId);
  if (!verified || verified.archive.archiveHash !== valid.archive.archiveHash) throw new Error('CANONICAL_HISTORY_POST_WRITE_VERIFY_FAILED');
  return 'CREATED';
}
async function listArchives() {
  const database = await openDb();
  try {
    return await new Promise<CanonicalHistoryArchive[]>((resolve, reject) => {
      const request = database.transaction(ARCHIVES_STORE, 'readonly').objectStore(ARCHIVES_STORE).getAll();
      request.onsuccess = () => resolve((request.result as CanonicalHistoryArchive[]).sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)));
      request.onerror = () => reject(request.error ?? new Error('CANONICAL_HISTORY_STORAGE_READ_FAILED'));
    });
  } finally { database.close(); }
}
async function deleteArchiveInternal(archiveId: string) {
  const database = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction([ARCHIVES_STORE, LISTS_STORE], 'readwrite');
      tx.objectStore(ARCHIVES_STORE).delete(archiveId);
      const store = tx.objectStore(LISTS_STORE);
      for (const id of CANONICAL_HISTORY_LIST_IDS) store.delete(`${archiveId}:${id}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('CANONICAL_HISTORY_STORAGE_DELETE_FAILED'));
    });
  } finally { database.close(); }
}
export const indexedDbCanonicalHistoryRepository: CanonicalHistoryRepository = {
  putArchive,
  getArchive: loadPayload,
  getList: rawList,
  hasArchive: async archiveId => Boolean(await rawArchive(archiveId)),
  listArchives,
  deleteArchiveInternal,
};

function activeFromBundleManifest(manifest: BundleManifest): ActiveCanonicalBundle {
  return {
    status: 'ACTIVE',
    motorBuildId: manifest.motorBuildId,
    stagingManifestHash: manifest.stagingManifestHash,
    adminRegistryHash: manifest.adminRegistryHash ?? '',
    rcaTargetRegistryHash: manifest.rcaTargetRegistryHash ?? '',
    sourceContractVersion: manifest.sourceContractVersion,
    sourceReplacementProofHash: manifest.sourceReplacementProofHash,
    sourceReplacements: manifest.sourceReplacements ?? [],
    canonicalInputHash: manifest.canonicalInputHash,
    schemaVersion: manifest.schemaVersion,
    engineVersion: manifest.engineVersion,
    approvedAt: manifest.createdAt,
    rowCounts: manifest.rowCounts,
    factTypeCounts: { SALE: 0, INBOUND_ORDER: 0, RECEIPT: 0, TARGET: 0 },
  };
}
function identityFromActive(active: ActiveCanonicalBundle): MonthlyClosingBuildIdentity {
  return canonicalHistoryBuildIdentity({
    motorBuildId: active.motorBuildId,
    engineVersion: active.engineVersion,
    stagingManifestHash: active.stagingManifestHash,
    adminRegistryHash: active.adminRegistryHash ?? '',
    rcaTargetRegistryHash: active.rcaTargetRegistryHash ?? '',
    sourceReplacementProofHash: active.sourceReplacementProofHash ?? '',
    sourceReplacements: active.sourceReplacements ?? [],
    canonicalInputHash: active.canonicalInputHash ?? '',
    schemaVersion: active.schemaVersion,
    sourceContractVersion: active.sourceContractVersion ?? '',
  });
}

export type CanonicalHistoryCaptureDependencies = {
  getActive: () => ActiveCanonicalBundle | null;
  loadGeneratedBuild: typeof loadGeneratedCanonicalBuild;
  loadGeneratedList: typeof loadGeneratedCanonicalList;
  bundleRepository: CanonicalBundleRepository;
  historyRepository: CanonicalHistoryRepository;
  now: () => string;
};
const captureDefaults: CanonicalHistoryCaptureDependencies = {
  getActive: resolveActiveCanonicalBundle,
  loadGeneratedBuild: loadGeneratedCanonicalBuild,
  loadGeneratedList: loadGeneratedCanonicalList,
  bundleRepository: indexedDbCanonicalBundleRepository,
  historyRepository: indexedDbCanonicalHistoryRepository,
  now: () => new Date().toISOString(),
};

async function loadExactLists(identity: MonthlyClosingBuildIdentity, dependencies: CanonicalHistoryCaptureDependencies) {
  const generated = await dependencies.loadGeneratedBuild(identity.motorBuildId);
  if (generated) {
    if (!sameIdentity(identityFromActive(generated.active), identity)) throw new Error('CANONICAL_HISTORY_BUILD_IDENTITY_MISMATCH');
    const lists = {} as Record<CanonicalList['id'], CanonicalList>;
    for (const id of CANONICAL_HISTORY_LIST_IDS) lists[id] = await dependencies.loadGeneratedList(identity.motorBuildId, id);
    return lists;
  }
  const bundle = await dependencies.bundleRepository.get(identity.motorBuildId);
  if (!bundle) throw new Error('CANONICAL_HISTORY_SOURCE_UNAVAILABLE');
  const bytes = new Uint8Array(await bundle.zip.arrayBuffer());
  await validateCanonicalBundleBytes(bytes);
  const active = activeFromBundleManifest(bundle.manifest);
  if (!sameIdentity(identityFromActive(active), identity)) throw new Error('CANONICAL_HISTORY_BUILD_IDENTITY_MISMATCH');
  const lists = {} as Record<CanonicalList['id'], CanonicalList>;
  for (const id of CANONICAL_HISTORY_LIST_IDS) lists[id] = await loadStoredCanonicalList(active, id, dependencies.bundleRepository);
  return lists;
}

export async function captureCanonicalBuildForHistory(buildIdentity: MonthlyClosingBuildIdentity, options: { requireCurrentActive?: boolean } = {}, dependencies: CanonicalHistoryCaptureDependencies = captureDefaults) {
  const identity = canonicalHistoryBuildIdentity(buildIdentity);
  const existing = await dependencies.historyRepository.getArchive(identity.motorBuildId);
  if (existing) {
    if (!sameIdentity(existing.archive.buildIdentity, identity)) throw new Error('CANONICAL_HISTORY_COLLISION');
    return { status: 'EXISTING' as const, archive: existing.archive };
  }
  const before = options.requireCurrentActive ? dependencies.getActive() : null;
  if (options.requireCurrentActive && (!before || !sameIdentity(identityFromActive(before), identity))) throw new Error('CANONICAL_HISTORY_ACTIVE_CHANGED');
  const lists = await loadExactLists(identity, dependencies);
  const after = options.requireCurrentActive ? dependencies.getActive() : null;
  if (options.requireCurrentActive && (!after || !sameIdentity(identityFromActive(after), identity) || before?.motorBuildId !== after.motorBuildId)) throw new Error('CANONICAL_HISTORY_ACTIVE_CHANGED');
  const payload = await buildCanonicalHistoryArchive(identity, lists, dependencies.now());
  const status = await dependencies.historyRepository.putArchive(payload);
  const verified = await dependencies.historyRepository.getArchive(identity.motorBuildId);
  if (!verified || verified.archive.archiveHash !== payload.archive.archiveHash) throw new Error('CANONICAL_HISTORY_POST_WRITE_VERIFY_FAILED');
  return { status, archive: verified.archive };
}

export async function ensureCanonicalBuildArchived(buildIdentity: MonthlyClosingBuildIdentity, dependencies: CanonicalHistoryCaptureDependencies = captureDefaults) {
  return captureCanonicalBuildForHistory(buildIdentity, { requireCurrentActive: true }, dependencies);
}

export async function backfillCanonicalHistoryForClose(closeEvent: MonthlyClosingCloseEvent, dependencies: CanonicalHistoryCaptureDependencies = captureDefaults) {
  return captureCanonicalBuildForHistory(closeEvent.evidence.activeBuildIdentity, { requireCurrentActive: false }, dependencies);
}

export type CanonicalHistoryCloseStatus = 'AVAILABLE' | 'MISSING_LOCAL' | 'CORRUPT';
export async function canonicalHistoryStatusForClose(closeEvent: MonthlyClosingCloseEvent, repository: CanonicalHistoryRepository = indexedDbCanonicalHistoryRepository): Promise<CanonicalHistoryCloseStatus> {
  try {
    const payload = await repository.getArchive(closeEvent.evidence.activeBuildIdentity.motorBuildId);
    if (!payload) return 'MISSING_LOCAL';
    if (!sameIdentity(payload.archive.buildIdentity, closeEvent.evidence.activeBuildIdentity)) return 'CORRUPT';
    return 'AVAILABLE';
  } catch { return 'CORRUPT'; }
}

export const listCanonicalHistoryArchives = (repository: CanonicalHistoryRepository = indexedDbCanonicalHistoryRepository) => repository.listArchives();
export async function loadCanonicalHistoryArchive(archiveId: string, repository: CanonicalHistoryRepository = indexedDbCanonicalHistoryRepository) {
  const payload = await repository.getArchive(archiveId);
  if (!payload) throw new Error('CANONICAL_HISTORY_SOURCE_UNAVAILABLE');
  return payload.archive;
}
export async function loadHistoricalCanonicalList(archiveId: string, listId: CanonicalList['id'], repository: CanonicalHistoryRepository = indexedDbCanonicalHistoryRepository) {
  const payload = await repository.getArchive(archiveId);
  if (!payload) throw new Error('CANONICAL_HISTORY_SOURCE_UNAVAILABLE');
  return payload.lists[listId];
}
export function closeReferencesArchive(state: MonthlyClosingState | null, archiveId: string) {
  return (state?.events ?? []).some(event => event.type === 'CLOSE' && event.evidence.activeBuildIdentity.motorBuildId === archiveId);
}
export function localClosingEvents() { return loadMonthlyClosingState()?.events ?? []; }

export const canonicalHistoryTestHelpers = { normalize, stableJson, sha256Text, sameIdentity, identityFromActive, factTypeCounts, loadExactLists, activeFromBundleManifest };
