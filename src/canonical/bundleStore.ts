import { inflateSync } from 'fflate';
import { canonicalInputHash } from './adminRegistryIdentity';
import { canonicalInputHashV3 } from './sourceReplacementIdentity';
import { canonicalInputHashV2 } from './targetIdentity';
import { APPROVED_CANONICAL_BUILD, resolveActiveCanonicalBundle, type ActiveCanonicalBundle } from './runtime';
import {
  generatedBuildMatchesActive,
  hasGeneratedCanonicalBuild,
  loadGeneratedCanonicalList,
  loadGeneratedCanonicalManifest,
} from './sourceImport';
import type { CanonicalList } from './types';

type ListId = CanonicalList['id'];
const V19_ENGINE = 'browser-stage4-product-assortment-v19-admin-registry-authority';
const V20_ENGINE = 'browser-stage4-product-assortment-v20-targets-by-competence';
const V21_ENGINE = 'browser-stage4-product-assortment-v21-source-replacement';

export type BundleManifest = {
  bundleFormat: 'blue-jacket-canonical-bundle/v1';
  motorBuildId: string;
  stagingManifestHash: string;
  adminRegistryHash?: string;
  rcaTargetRegistryHash?: string;
  sourceContractVersion?: 'v2';
  sourceReplacementProofHash?: string;
  sourceReplacements?: Array<{ source: string; scope: string }>;
  canonicalInputHash?: string;
  schemaVersion: string;
  engineVersion: string;
  rowCounts: Record<ListId, number>;
  files: Record<string, { path: string; sha256: string; bytes: number }>;
  createdAt: string;
};

export type StoredCanonicalBundle = { id: string; manifest: BundleManifest; zip: Blob; importedAt: string };
export type BundleImportResult = {
  motorBuildId: string;
  stagingManifestHash: string;
  adminRegistryHash?: string;
  rcaTargetRegistryHash?: string;
  sourceContractVersion?: 'v2';
  sourceReplacementProofHash?: string;
  sourceReplacements?: Array<{ source: string; scope: string }>;
  canonicalInputHash?: string;
  schemaVersion: string;
  engineVersion: string;
  rowCounts: Record<ListId, number>;
  active: ActiveCanonicalBundle;
};
export type PreparedCanonicalBundle = BundleImportResult & { bytes: Uint8Array; manifest: BundleManifest };
export type CanonicalBundleRepository = {
  put: (bundle: StoredCanonicalBundle) => Promise<void>;
  get: (id: string) => Promise<StoredCanonicalBundle | undefined>;
  delete: (id: string) => Promise<void>;
};

const DB_NAME = 'blue-jacket-v3-canonical-bundles';
const STORE_NAME = 'bundles';
const ids: ListId[] = ['M1_ITEM_ESTOQUE', 'M2_CLIENTE_RCA', 'M3_MOVIMENTO_VENDAS', 'M4_HISTORICO_TRANSICAO'];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function db() { return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error('CANONICAL_STORAGE_UNAVAILABLE')); }); }
async function put(bundle: StoredCanonicalBundle) { const database = await db(); await new Promise<void>((resolve, reject) => { const transaction = database.transaction(STORE_NAME, 'readwrite'); transaction.objectStore(STORE_NAME).put(bundle); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error('CANONICAL_STORAGE_WRITE_FAILED')); }); database.close(); }
async function get(id: string) { const database = await db(); const bundle = await new Promise<StoredCanonicalBundle | undefined>((resolve, reject) => { const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id); request.onsuccess = () => resolve(request.result as StoredCanonicalBundle | undefined); request.onerror = () => reject(request.error ?? new Error('CANONICAL_STORAGE_READ_FAILED')); }); database.close(); return bundle; }
async function remove(id: string) { const database = await db(); await new Promise<void>((resolve, reject) => { const transaction = database.transaction(STORE_NAME, 'readwrite'); transaction.objectStore(STORE_NAME).delete(id); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error('CANONICAL_STORAGE_DELETE_FAILED')); }); database.close(); }
export const indexedDbCanonicalBundleRepository: CanonicalBundleRepository = { put, get, delete: remove };

async function sha256(bytes: Uint8Array) { const copy = new Uint8Array(bytes.byteLength); copy.set(bytes); const digest = await crypto.subtle.digest('SHA-256', copy.buffer); return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join(''); }

type ZipEntry = { method: number; compressedSize: number; uncompressedSize: number; localOffset: number };
function entries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) if (view.getUint32(index, true) === 0x06054b50) { end = index; break; }
  if (end < 0) throw new Error('BUNDLE_ZIP_INVALID');
  let offset = view.getUint32(end + 16, true); const count = view.getUint16(end + 10, true); const result = new Map<string, ZipEntry>();
  for (let index = 0; index < count; index += 1) { if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('BUNDLE_ZIP_INVALID'); const method = view.getUint16(offset + 10, true); const compressedSize = view.getUint32(offset + 20, true); const uncompressedSize = view.getUint32(offset + 24, true); const nameLength = view.getUint16(offset + 28, true); const extraLength = view.getUint16(offset + 30, true); const commentLength = view.getUint16(offset + 32, true); const localOffset = view.getUint32(offset + 42, true); const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)); result.set(name, { method, compressedSize, uncompressedSize, localOffset }); offset += 46 + nameLength + extraLength + commentLength; }
  return result;
}
function extract(bytes: Uint8Array, map: Map<string, ZipEntry>, path: string) { const entry = map.get(path); if (!entry) throw new Error(`BUNDLE_FILE_MISSING:${path}`); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error('BUNDLE_ZIP_INVALID'); const nameLength = view.getUint16(entry.localOffset + 26, true); const extraLength = view.getUint16(entry.localOffset + 28, true); const start = entry.localOffset + 30 + nameLength + extraLength; const compressed = bytes.slice(start, start + entry.compressedSize); const output = entry.method === 0 ? compressed : entry.method === 8 ? inflateSync(compressed) : (() => { throw new Error('BUNDLE_COMPRESSION_UNSUPPORTED'); })(); if (output.byteLength !== entry.uncompressedSize) throw new Error(`BUNDLE_FILE_SIZE_INVALID:${path}`); return output; }

function sameReplacements(a: Array<{ source: string; scope: string }> | undefined, b: Array<{ source: string; scope: string }> | undefined) {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

function manifestIdentityMatchesActive(manifest: BundleManifest, active: ActiveCanonicalBundle) {
  return manifest.motorBuildId === active.motorBuildId
    && manifest.stagingManifestHash === active.stagingManifestHash
    && manifest.schemaVersion === active.schemaVersion
    && manifest.engineVersion === active.engineVersion
    && manifest.adminRegistryHash === active.adminRegistryHash
    && manifest.rcaTargetRegistryHash === active.rcaTargetRegistryHash
    && manifest.sourceContractVersion === active.sourceContractVersion
    && manifest.sourceReplacementProofHash === active.sourceReplacementProofHash
    && sameReplacements(manifest.sourceReplacements, active.sourceReplacements)
    && manifest.canonicalInputHash === active.canonicalInputHash;
}

async function validateManifestInputIdentity(manifest: BundleManifest) {
  if (manifest.engineVersion === V21_ENGINE) {
    if (!manifest.adminRegistryHash || !manifest.rcaTargetRegistryHash || manifest.sourceContractVersion !== 'v2' || !manifest.sourceReplacementProofHash || !Array.isArray(manifest.sourceReplacements) || !manifest.canonicalInputHash) throw new Error('BUNDLE_MANIFEST_REJECTED:V21_IDENTITY_REQUIRED');
    const sorted = [...manifest.sourceReplacements].sort((a, b) => `${a.source}|${a.scope}`.localeCompare(`${b.source}|${b.scope}`));
    if (!sameReplacements(sorted, manifest.sourceReplacements)) throw new Error('BUNDLE_MANIFEST_REJECTED:V21_REPLACEMENTS_NOT_DETERMINISTIC');
    if (await canonicalInputHashV3(manifest.stagingManifestHash, manifest.adminRegistryHash, manifest.rcaTargetRegistryHash, manifest.sourceReplacementProofHash) !== manifest.canonicalInputHash) throw new Error('BUNDLE_CANONICAL_INPUT_HASH_MISMATCH');
    return;
  }
  if (manifest.engineVersion === V20_ENGINE) {
    if (!manifest.adminRegistryHash || !manifest.rcaTargetRegistryHash || !manifest.canonicalInputHash) throw new Error('BUNDLE_MANIFEST_REJECTED:V20_IDENTITY_REQUIRED');
    if (await canonicalInputHashV2(manifest.stagingManifestHash, manifest.adminRegistryHash, manifest.rcaTargetRegistryHash) !== manifest.canonicalInputHash) throw new Error('BUNDLE_CANONICAL_INPUT_HASH_MISMATCH');
    return;
  }
  if (manifest.engineVersion === V19_ENGINE) {
    if (!manifest.adminRegistryHash || !manifest.canonicalInputHash) throw new Error('BUNDLE_MANIFEST_REJECTED:V19_IDENTITY_REQUIRED');
    if (await canonicalInputHash(manifest.stagingManifestHash, manifest.adminRegistryHash) !== manifest.canonicalInputHash) throw new Error('BUNDLE_CANONICAL_INPUT_HASH_MISMATCH');
  }
}

type ExpectedBuild = Pick<typeof APPROVED_CANONICAL_BUILD, 'motorBuildId' | 'stagingManifestHash' | 'schemaVersion' | 'rowCounts'> & Partial<Pick<ActiveCanonicalBundle, 'adminRegistryHash' | 'rcaTargetRegistryHash' | 'sourceContractVersion' | 'sourceReplacementProofHash' | 'sourceReplacements' | 'canonicalInputHash' | 'engineVersion'>>;
export async function validateCanonicalBundleBytes(bytes: Uint8Array, expectedBuild?: ExpectedBuild): Promise<{ manifest: BundleManifest; zipEntries: Map<string, ZipEntry> }> {
  const zipEntries = entries(bytes); const manifest = JSON.parse(decoder.decode(extract(bytes, zipEntries, 'manifest.json'))) as BundleManifest;
  if (manifest.bundleFormat !== 'blue-jacket-canonical-bundle/v1' || !manifest.motorBuildId || !manifest.stagingManifestHash || !manifest.engineVersion || manifest.schemaVersion !== 'v1') throw new Error('BUNDLE_MANIFEST_REJECTED');
  await validateManifestInputIdentity(manifest);
  if (expectedBuild && (
    manifest.motorBuildId !== expectedBuild.motorBuildId
    || manifest.stagingManifestHash !== expectedBuild.stagingManifestHash
    || manifest.schemaVersion !== expectedBuild.schemaVersion
    || (expectedBuild.engineVersion !== undefined && manifest.engineVersion !== expectedBuild.engineVersion)
    || (expectedBuild.adminRegistryHash !== undefined && manifest.adminRegistryHash !== expectedBuild.adminRegistryHash)
    || (expectedBuild.rcaTargetRegistryHash !== undefined && manifest.rcaTargetRegistryHash !== expectedBuild.rcaTargetRegistryHash)
    || (expectedBuild.sourceContractVersion !== undefined && manifest.sourceContractVersion !== expectedBuild.sourceContractVersion)
    || (expectedBuild.sourceReplacementProofHash !== undefined && manifest.sourceReplacementProofHash !== expectedBuild.sourceReplacementProofHash)
    || (expectedBuild.sourceReplacements !== undefined && !sameReplacements(manifest.sourceReplacements, expectedBuild.sourceReplacements))
    || (expectedBuild.canonicalInputHash !== undefined && manifest.canonicalInputHash !== expectedBuild.canonicalInputHash)
  )) throw new Error('BUNDLE_MANIFEST_REJECTED');
  for (const id of ids) {
    const path = `${id}.json`; const expected = manifest.files[path]; const rowCount = manifest.rowCounts[id];
    if (!expected || expected.path !== path || !Number.isInteger(rowCount) || rowCount < 0 || (expectedBuild && rowCount !== expectedBuild.rowCounts[id])) throw new Error(`BUNDLE_MANIFEST_REJECTED:${id}`);
    const content = extract(bytes, zipEntries, path); if (content.byteLength !== expected.bytes || await sha256(content) !== expected.sha256) throw new Error(`BUNDLE_HASH_MISMATCH:${id}`);
    const list = JSON.parse(decoder.decode(content)) as CanonicalList; if (list.id !== id || !Array.isArray(list.records) || list.records.length !== rowCount) throw new Error(`BUNDLE_LIST_INVALID:${id}`);
  }
  return { manifest, zipEntries };
}

export async function inspectCanonicalBundle(file: File): Promise<PreparedCanonicalBundle> {
  const bytes = new Uint8Array(await file.arrayBuffer()); const { manifest, zipEntries } = await validateCanonicalBundleBytes(bytes);
  const m3 = JSON.parse(decoder.decode(extract(bytes, zipEntries, 'M3_MOVIMENTO_VENDAS.json'))) as CanonicalList;
  const factTypeCounts = { SALE: 0, INBOUND_ORDER: 0, RECEIPT: 0, TARGET: 0 };
  for (const record of m3.records) { const type = record.fact_type; if (type === 'SALE' || type === 'INBOUND_ORDER' || type === 'RECEIPT' || type === 'TARGET') factTypeCounts[type] += 1; }
  const active: ActiveCanonicalBundle = {
    status: 'ACTIVE', motorBuildId: manifest.motorBuildId, stagingManifestHash: manifest.stagingManifestHash,
    ...(manifest.adminRegistryHash ? { adminRegistryHash: manifest.adminRegistryHash } : {}),
    ...(manifest.rcaTargetRegistryHash ? { rcaTargetRegistryHash: manifest.rcaTargetRegistryHash } : {}),
    ...(manifest.sourceContractVersion ? { sourceContractVersion: manifest.sourceContractVersion } : {}),
    ...(manifest.sourceReplacementProofHash ? { sourceReplacementProofHash: manifest.sourceReplacementProofHash } : {}),
    ...(manifest.sourceReplacements ? { sourceReplacements: manifest.sourceReplacements } : {}),
    ...(manifest.canonicalInputHash ? { canonicalInputHash: manifest.canonicalInputHash } : {}),
    schemaVersion: manifest.schemaVersion, engineVersion: manifest.engineVersion,
    approvedAt: manifest.createdAt || new Date().toISOString(), rowCounts: manifest.rowCounts, factTypeCounts,
  };
  return {
    motorBuildId: manifest.motorBuildId,
    stagingManifestHash: manifest.stagingManifestHash,
    ...(manifest.adminRegistryHash ? { adminRegistryHash: manifest.adminRegistryHash } : {}),
    ...(manifest.rcaTargetRegistryHash ? { rcaTargetRegistryHash: manifest.rcaTargetRegistryHash } : {}),
    ...(manifest.sourceContractVersion ? { sourceContractVersion: manifest.sourceContractVersion } : {}),
    ...(manifest.sourceReplacementProofHash ? { sourceReplacementProofHash: manifest.sourceReplacementProofHash } : {}),
    ...(manifest.sourceReplacements ? { sourceReplacements: manifest.sourceReplacements } : {}),
    ...(manifest.canonicalInputHash ? { canonicalInputHash: manifest.canonicalInputHash } : {}),
    schemaVersion: manifest.schemaVersion, engineVersion: manifest.engineVersion, rowCounts: manifest.rowCounts, active, bytes, manifest,
  };
}

async function storedBundleFor(active: ActiveCanonicalBundle, repository: CanonicalBundleRepository) {
  const bundle = await repository.get(active.motorBuildId);
  if (!bundle || !manifestIdentityMatchesActive(bundle.manifest, active)) throw new Error('CANONICAL_BUNDLE_UNAVAILABLE');
  await validateManifestInputIdentity(bundle.manifest);
  return bundle;
}

export async function loadStoredCanonicalList(active: ActiveCanonicalBundle, id: ListId, repository: CanonicalBundleRepository = indexedDbCanonicalBundleRepository): Promise<CanonicalList> {
  const bundle = await storedBundleFor(active, repository); const bytes = new Uint8Array(await bundle.zip.arrayBuffer());
  const content = extract(bytes, entries(bytes), `${id}.json`); const list = JSON.parse(decoder.decode(content)) as CanonicalList;
  if (list.id !== id || !Array.isArray(list.records) || list.records.length !== bundle.manifest.rowCounts[id]) throw new Error(`CANONICAL_LIST_INVALID:${id}`);
  return list;
}

export async function persistCanonicalBundle(prepared: PreparedCanonicalBundle, repository: CanonicalBundleRepository = indexedDbCanonicalBundleRepository): Promise<BundleImportResult> {
  await validateManifestInputIdentity(prepared.manifest);
  if (!manifestIdentityMatchesActive(prepared.manifest, prepared.active)) throw new Error('BUNDLE_PREPARED_IDENTITY_MISMATCH');
  const zipBytes = new Uint8Array(prepared.bytes.byteLength); zipBytes.set(prepared.bytes);
  const bundle: StoredCanonicalBundle = { id: prepared.motorBuildId, manifest: prepared.manifest, zip: new Blob([zipBytes.buffer], { type: 'application/zip' }), importedAt: new Date().toISOString() };
  const previous = await repository.get(prepared.motorBuildId);
  try {
    await repository.put(bundle);
    const verified = await repository.get(prepared.motorBuildId);
    if (!verified || !manifestIdentityMatchesActive(verified.manifest, prepared.active)) throw new Error('BUNDLE_STORAGE_VERIFY_FAILED');
    for (const id of ids) await loadStoredCanonicalList(prepared.active, id, repository);
  } catch (reason) {
    if (previous) await repository.put(previous); else await repository.delete(prepared.motorBuildId);
    throw reason;
  }
  const { bytes: _bytes, manifest: _manifest, ...result } = prepared;
  return result;
}

export type BundleLoadOptions = {
  repository?: CanonicalBundleRepository;
  activeStorage?: Storage;
  hasGeneratedBuild?: (buildId: string) => Promise<boolean>;
  generatedMatchesActive?: (active: ActiveCanonicalBundle) => Promise<boolean>;
  loadGeneratedList?: typeof loadGeneratedCanonicalList;
  loadGeneratedManifest?: typeof loadGeneratedCanonicalManifest;
};
async function shouldUseGenerated(active: ActiveCanonicalBundle, options: BundleLoadOptions) {
  if (options.generatedMatchesActive) return options.generatedMatchesActive(active);
  if (options.hasGeneratedBuild) return options.hasGeneratedBuild(active.motorBuildId);
  return generatedBuildMatchesActive(active);
}
export async function loadImportedBundleManifest(options: BundleLoadOptions = {}) {
  const active = resolveActiveCanonicalBundle(options.activeStorage);
  if (!active) throw new Error('CANONICAL_BUNDLE_INACTIVE');
  if (await shouldUseGenerated(active, options)) return (options.loadGeneratedManifest ?? loadGeneratedCanonicalManifest)(active.motorBuildId);
  const bundle = await storedBundleFor(active, options.repository ?? indexedDbCanonicalBundleRepository);
  return {
    status: 'VALID', generatedAt: bundle.manifest.createdAt,
    motorBuildId: bundle.manifest.motorBuildId,
    stagingManifestHash: bundle.manifest.stagingManifestHash,
    adminRegistryHash: bundle.manifest.adminRegistryHash ?? null,
    rcaTargetRegistryHash: bundle.manifest.rcaTargetRegistryHash ?? null,
    sourceContractVersion: bundle.manifest.sourceContractVersion ?? null,
    sourceReplacementProofHash: bundle.manifest.sourceReplacementProofHash ?? null,
    sourceReplacements: bundle.manifest.sourceReplacements ?? [],
    canonicalInputHash: bundle.manifest.canonicalInputHash ?? null,
    schemaVersion: bundle.manifest.schemaVersion,
    engineVersion: bundle.manifest.engineVersion,
    lists: Object.fromEntries(ids.map(id => [id, { rowCount: bundle.manifest.rowCounts[id], warnings: 0, errors: 0 }])) as Record<string, { rowCount: number; warnings: number; errors: number }>,
  };
}
export async function loadImportedCanonicalList(id: ListId, options: BundleLoadOptions = {}): Promise<CanonicalList> {
  const active = resolveActiveCanonicalBundle(options.activeStorage);
  if (!active) throw new Error('CANONICAL_BUNDLE_INACTIVE');
  if (await shouldUseGenerated(active, options)) return (options.loadGeneratedList ?? loadGeneratedCanonicalList)(active.motorBuildId, id);
  return loadStoredCanonicalList(active, id, options.repository ?? indexedDbCanonicalBundleRepository);
}
export async function hasImportedCanonicalBundle(motorBuildId: string) { return Boolean(await indexedDbCanonicalBundleRepository.get(motorBuildId)) || hasGeneratedCanonicalBuild(motorBuildId); }
export const canonicalBundleTestHelpers = { entries, extract, sha256, encoder, manifestIdentityMatchesActive, validateManifestInputIdentity, shouldUseGenerated, sameReplacements, V19_ENGINE, V20_ENGINE, V21_ENGINE };