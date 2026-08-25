import { inflateSync } from 'fflate';
import { APPROVED_CANONICAL_BUILD, resolveActiveCanonicalBundle } from './runtime';
import type { CanonicalList } from './types';

type ListId = CanonicalList['id'];
type BundleManifest = {
  bundleFormat: 'blue-jacket-canonical-bundle/v1'; motorBuildId: string; stagingManifestHash: string; schemaVersion: string; engineVersion: string;
  rowCounts: Record<ListId, number>; files: Record<string, { path: string; sha256: string; bytes: number }>; createdAt: string;
};
type StoredBundle = { id: string; manifest: BundleManifest; zip: Blob; importedAt: string };
export type BundleImportResult = { motorBuildId: string; stagingManifestHash: string; rowCounts: Record<ListId, number> };
const DB_NAME = 'blue-jacket-v3-canonical-bundles'; const STORE_NAME = 'bundles';
const ids: ListId[] = ['M1_ITEM_ESTOQUE', 'M2_CLIENTE_RCA', 'M3_MOVIMENTO_VENDAS', 'M4_HISTORICO_TRANSICAO'];
const encoder = new TextEncoder(); const decoder = new TextDecoder();

function db() { return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error('CANONICAL_STORAGE_UNAVAILABLE')); }); }
async function put(bundle: StoredBundle) { const database = await db(); await new Promise<void>((resolve, reject) => { const transaction = database.transaction(STORE_NAME, 'readwrite'); transaction.objectStore(STORE_NAME).put(bundle); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error('CANONICAL_STORAGE_WRITE_FAILED')); }); database.close(); }
async function get(id: string) { const database = await db(); const bundle = await new Promise<StoredBundle | undefined>((resolve, reject) => { const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id); request.onsuccess = () => resolve(request.result as StoredBundle | undefined); request.onerror = () => reject(request.error ?? new Error('CANONICAL_STORAGE_READ_FAILED')); }); database.close(); return bundle; }
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

type ExpectedBuild = Pick<typeof APPROVED_CANONICAL_BUILD, 'motorBuildId' | 'stagingManifestHash' | 'schemaVersion' | 'rowCounts'>;
export async function validateCanonicalBundleBytes(bytes: Uint8Array, expectedBuild: ExpectedBuild = APPROVED_CANONICAL_BUILD): Promise<{ manifest: BundleManifest; zipEntries: Map<string, ZipEntry> }> {
  const zipEntries = entries(bytes); const manifest = JSON.parse(decoder.decode(extract(bytes, zipEntries, 'manifest.json'))) as BundleManifest;
  if (manifest.bundleFormat !== 'blue-jacket-canonical-bundle/v1' || manifest.motorBuildId !== expectedBuild.motorBuildId || manifest.stagingManifestHash !== expectedBuild.stagingManifestHash || manifest.schemaVersion !== expectedBuild.schemaVersion) throw new Error('BUNDLE_MANIFEST_REJECTED');
  for (const id of ids) {
    const path = `${id}.json`; const expected = manifest.files[path]; if (!expected || expected.path !== path || manifest.rowCounts[id] !== expectedBuild.rowCounts[id]) throw new Error(`BUNDLE_MANIFEST_REJECTED:${id}`);
    const content = extract(bytes, zipEntries, path); if (content.byteLength !== expected.bytes || await sha256(content) !== expected.sha256) throw new Error(`BUNDLE_HASH_MISMATCH:${id}`);
    if (id !== 'M4_HISTORICO_TRANSICAO') { const list = JSON.parse(decoder.decode(content)) as CanonicalList; if (list.id !== id || list.records.length !== manifest.rowCounts[id]) throw new Error(`BUNDLE_LIST_INVALID:${id}`); }
  }
  return { manifest, zipEntries };
}

export async function importCanonicalBundle(file: File): Promise<BundleImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer()); const { manifest } = await validateCanonicalBundleBytes(bytes);
  const bundle: StoredBundle = { id: manifest.motorBuildId, manifest, zip: new Blob([bytes], { type: 'application/zip' }), importedAt: new Date().toISOString() };
  await put(bundle); const verified = await get(manifest.motorBuildId); if (!verified || verified.manifest.stagingManifestHash !== manifest.stagingManifestHash) throw new Error('BUNDLE_STORAGE_VERIFY_FAILED');
  return { motorBuildId: manifest.motorBuildId, stagingManifestHash: manifest.stagingManifestHash, rowCounts: manifest.rowCounts };
}
async function activeBundle() { const active = resolveActiveCanonicalBundle(); if (!active) throw new Error('CANONICAL_BUNDLE_INACTIVE'); const bundle = await get(active.motorBuildId); if (!bundle || bundle.manifest.stagingManifestHash !== active.stagingManifestHash) throw new Error('CANONICAL_BUNDLE_UNAVAILABLE'); return bundle; }
export async function loadImportedBundleManifest() { const bundle = await activeBundle(); return { status: 'VALID', generatedAt: bundle.manifest.createdAt, lists: Object.fromEntries(ids.map(id => [id, { rowCount: bundle.manifest.rowCounts[id], warnings: 0, errors: 0 }])) as Record<string, { rowCount: number; warnings: number; errors: number }> }; }
export async function loadImportedCanonicalList(id: ListId): Promise<CanonicalList> { const bundle = await activeBundle(); const bytes = new Uint8Array(await bundle.zip.arrayBuffer()); const content = extract(bytes, entries(bytes), `${id}.json`); const list = JSON.parse(decoder.decode(content)) as CanonicalList; if (list.id !== id || list.records.length !== bundle.manifest.rowCounts[id]) throw new Error(`CANONICAL_LIST_INVALID:${id}`); return list; }
export async function hasImportedCanonicalBundle(motorBuildId: string) { return Boolean(await get(motorBuildId)); }
export const canonicalBundleTestHelpers = { entries, extract, sha256, encoder };
