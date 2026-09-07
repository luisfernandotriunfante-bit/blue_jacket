import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  canonicalHistoryBuildIdentity,
  validateCanonicalHistoryArchive,
  type CanonicalHistoryArchivePayload,
} from './canonicalHistory';
import {
  validateMonthlyClosingState,
  type MonthlyClosingBuildIdentity,
  type MonthlyClosingState,
} from './monthlyClosingState';

export const CANONICAL_HISTORY_BACKUP_MANIFEST_FORMAT = 'blue-jacket-canonical-history-backup-manifest/v1' as const;
export const HISTORY_OBJECT_FORMAT = 'blue-jacket-history-object/v1' as const;
const HISTORY_MAGIC = new TextEncoder().encode('BJH1');
const encoder = new TextEncoder();

export type CanonicalHistoryBackupEntry = {
  archiveId: string;
  archiveHash: string;
  objectKey: string;
  serializedBytes: number;
};

export type CanonicalHistoryBackupManifest = {
  format: typeof CANONICAL_HISTORY_BACKUP_MANIFEST_FORMAT;
  archives: CanonicalHistoryBackupEntry[];
  missingArchiveIds: string[];
  manifestHash: string;
};

export type OfficialCanonicalHistoryReference = {
  archiveId: string;
  buildIdentity: MonthlyClosingBuildIdentity;
};

export type CanonicalHistoryLocalDescriptor = {
  archiveId: string;
  status: 'AVAILABLE' | 'MISSING_LOCAL';
  archiveHash?: string;
};

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalize(child)]));
  }
  return value;
}

function stableJson(value: unknown) { return JSON.stringify(normalize(value)); }

async function sha256Bytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Text(value: string) { return sha256Bytes(encoder.encode(value)); }

function validHash(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value); }
function validObjectKey(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value); }
function validArchiveId(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }

function sortedEntries(entries: CanonicalHistoryBackupEntry[]) {
  return [...entries]
    .map(entry => ({ ...entry }))
    .sort((left, right) => left.archiveId.localeCompare(right.archiveId));
}

function sortedUnique(values: string[]) { return [...new Set(values)].sort(); }

export function sameCanonicalHistoryBuildIdentity(left: MonthlyClosingBuildIdentity, right: MonthlyClosingBuildIdentity) {
  return stableJson(canonicalHistoryBuildIdentity(left)) === stableJson(canonicalHistoryBuildIdentity(right));
}

export function officialCanonicalHistoryReferences(state: MonthlyClosingState): OfficialCanonicalHistoryReference[] {
  const validated = validateMonthlyClosingState(state);
  const references = new Map<string, MonthlyClosingBuildIdentity>();
  for (const event of validated.events) {
    if (event.type !== 'CLOSE') continue;
    const buildIdentity = canonicalHistoryBuildIdentity(event.evidence.activeBuildIdentity);
    const archiveId = buildIdentity.motorBuildId;
    const previous = references.get(archiveId);
    if (previous && !sameCanonicalHistoryBuildIdentity(previous, buildIdentity)) throw new Error('SYNC_HISTORY_CLOSE_IDENTITY_MISMATCH');
    references.set(archiveId, buildIdentity);
  }
  return [...references.entries()]
    .map(([archiveId, buildIdentity]) => ({ archiveId, buildIdentity }))
    .sort((left, right) => left.archiveId.localeCompare(right.archiveId));
}

export async function historyBackupObjectKey(archiveId: string, archiveHash: string) {
  if (!validArchiveId(archiveId) || !validHash(archiveHash)) throw new Error('SYNC_HISTORY_MANIFEST_INVALID');
  return sha256Text(stableJson([HISTORY_OBJECT_FORMAT, archiveId, archiveHash.toLowerCase()]));
}

export function canonicalHistorySerializedBytes(payload: CanonicalHistoryArchivePayload) {
  return Object.values(payload.archive.serializedBytes).reduce((total, value) => total + Number(value || 0), 0);
}

export async function canonicalHistoryBackupEntry(payload: CanonicalHistoryArchivePayload): Promise<CanonicalHistoryBackupEntry> {
  const validated = await validateCanonicalHistoryArchive(payload);
  return {
    archiveId: validated.archive.archiveId,
    archiveHash: validated.archive.archiveHash,
    objectKey: await historyBackupObjectKey(validated.archive.archiveId, validated.archive.archiveHash),
    serializedBytes: canonicalHistorySerializedBytes(validated),
  };
}

export async function canonicalHistoryBackupManifestHash(input: Pick<CanonicalHistoryBackupManifest, 'format' | 'archives' | 'missingArchiveIds'>) {
  const archives = sortedEntries(input.archives).map(entry => ({
    archiveId: entry.archiveId,
    archiveHash: entry.archiveHash.toLowerCase(),
    objectKey: entry.objectKey.toLowerCase(),
    serializedBytes: entry.serializedBytes,
  }));
  const missingArchiveIds = sortedUnique(input.missingArchiveIds);
  return sha256Text(stableJson([CANONICAL_HISTORY_BACKUP_MANIFEST_FORMAT, archives, missingArchiveIds]));
}

export async function buildCanonicalHistoryBackupManifest(
  closingState: MonthlyClosingState,
  archivesInput: CanonicalHistoryBackupEntry[],
  missingInput: string[],
): Promise<CanonicalHistoryBackupManifest> {
  const official = officialCanonicalHistoryReferences(closingState);
  const officialIds = official.map(item => item.archiveId);
  const archives = sortedEntries(archivesInput);
  const missingArchiveIds = sortedUnique(missingInput);
  const seen = new Set<string>();
  for (const entry of archives) {
    if (!validArchiveId(entry.archiveId) || !validHash(entry.archiveHash) || !validObjectKey(entry.objectKey) || !Number.isInteger(entry.serializedBytes) || entry.serializedBytes < 0) throw new Error('SYNC_HISTORY_MANIFEST_INVALID');
    if (seen.has(entry.archiveId)) throw new Error('SYNC_HISTORY_MANIFEST_INVALID');
    seen.add(entry.archiveId);
    if (entry.objectKey.toLowerCase() !== await historyBackupObjectKey(entry.archiveId, entry.archiveHash)) throw new Error('SYNC_HISTORY_MANIFEST_INVALID');
  }
  for (const archiveId of missingArchiveIds) {
    if (!validArchiveId(archiveId) || seen.has(archiveId)) throw new Error('SYNC_HISTORY_MANIFEST_INVALID');
    seen.add(archiveId);
  }
  const actualIds = [...seen].sort();
  if (stableJson(actualIds) !== stableJson([...officialIds].sort())) throw new Error('SYNC_HISTORY_MANIFEST_INVALID');
  const base = { format: CANONICAL_HISTORY_BACKUP_MANIFEST_FORMAT, archives, missingArchiveIds } as const;
  return { ...base, manifestHash: await canonicalHistoryBackupManifestHash(base) };
}

export async function validateCanonicalHistoryBackupManifest(value: unknown, closingState: MonthlyClosingState) {
  if (!value || typeof value !== 'object') throw new Error('SYNC_HISTORY_MANIFEST_INVALID');
  const candidate = value as Partial<CanonicalHistoryBackupManifest>;
  if (candidate.format !== CANONICAL_HISTORY_BACKUP_MANIFEST_FORMAT || !Array.isArray(candidate.archives) || !Array.isArray(candidate.missingArchiveIds) || !validHash(candidate.manifestHash)) throw new Error('SYNC_HISTORY_MANIFEST_INVALID');
  const rebuilt = await buildCanonicalHistoryBackupManifest(closingState, candidate.archives as CanonicalHistoryBackupEntry[], candidate.missingArchiveIds.map(String));
  if (rebuilt.manifestHash !== candidate.manifestHash.toLowerCase()) throw new Error('SYNC_HISTORY_MANIFEST_INVALID');
  return rebuilt;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function historyCryptoKey(secret: string) {
  return crypto.subtle.importKey('raw', base64UrlToBytes(secret), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptCanonicalHistoryArchive(secret: string, payload: CanonicalHistoryArchivePayload) {
  const validated = await validateCanonicalHistoryArchive(payload);
  const packed = zipSync({ 'history.json': strToU8(JSON.stringify(validated)) }, { level: 9 });
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await historyCryptoKey(secret), packed));
  const result = new Uint8Array(HISTORY_MAGIC.length + iv.length + encrypted.length);
  result.set(HISTORY_MAGIC);
  result.set(iv, HISTORY_MAGIC.length);
  result.set(encrypted, HISTORY_MAGIC.length + iv.length);
  return result;
}

export async function decryptCanonicalHistoryArchive(secret: string, bytes: Uint8Array) {
  try {
    if (bytes.length <= HISTORY_MAGIC.length + 12 || !HISTORY_MAGIC.every((value, index) => bytes[index] === value)) throw new Error('invalid magic');
    const iv = bytes.slice(HISTORY_MAGIC.length, HISTORY_MAGIC.length + 12);
    const ciphertext = bytes.slice(HISTORY_MAGIC.length + 12);
    const packed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await historyCryptoKey(secret), ciphertext));
    const unzipped = unzipSync(packed)['history.json'];
    if (!unzipped) throw new Error('missing history payload');
    const parsed = JSON.parse(strFromU8(unzipped)) as CanonicalHistoryArchivePayload;
    return validateCanonicalHistoryArchive(parsed);
  } catch (reason) {
    if (reason instanceof Error && reason.message === 'CANONICAL_HISTORY_CORRUPT') throw reason;
    throw new Error('SYNC_HISTORY_PAYLOAD_INVALID');
  }
}

export function assertCanonicalHistoryArchiveMatchesReference(payload: CanonicalHistoryArchivePayload, reference: OfficialCanonicalHistoryReference) {
  if (payload.archive.archiveId !== reference.archiveId || payload.archive.motorBuildId !== reference.archiveId || !sameCanonicalHistoryBuildIdentity(payload.archive.buildIdentity, reference.buildIdentity)) throw new Error('SYNC_HISTORY_CLOSE_IDENTITY_MISMATCH');
}

export async function canonicalHistorySyncHash(closingState: MonthlyClosingState, descriptors: CanonicalHistoryLocalDescriptor[]) {
  const state = validateMonthlyClosingState(closingState);
  const official = officialCanonicalHistoryReferences(state).map(item => item.archiveId);
  const normalized = [...descriptors]
    .map(item => ({ archiveId: item.archiveId, status: item.status, ...(item.archiveHash ? { archiveHash: item.archiveHash.toLowerCase() } : {}) }))
    .sort((left, right) => left.archiveId.localeCompare(right.archiveId));
  if (stableJson(normalized.map(item => item.archiveId)) !== stableJson(official)) throw new Error('SYNC_HISTORY_LOCAL_STATE_INVALID');
  return sha256Text(stableJson(['blue-jacket-canonical-history-sync/v1', state, normalized]));
}

export function historyRemoteRelativePath(objectKey: string) {
  if (!validObjectKey(objectKey)) throw new Error('SYNC_HISTORY_OBJECT_KEY_INVALID');
  return `history/${objectKey.toLowerCase()}.bjh`;
}

export const canonicalHistorySyncTestHelpers = {
  normalize,
  stableJson,
  sha256Text,
  sha256Bytes,
  bytesToBase64Url,
  base64UrlToBytes,
  sortedEntries,
  sortedUnique,
  HISTORY_MAGIC,
};
