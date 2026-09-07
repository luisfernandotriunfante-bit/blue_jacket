import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { validateAdminRegistryState, type AdminRegistryState } from './adminRegistry';
import { canonicalAdminRegistryHash } from './adminRegistryIdentity';
import { loadAdminRegistryState, replaceAdminRegistryState } from './adminRegistryIndexedDb';
import {
  indexedDbCanonicalHistoryRepository,
  validateCanonicalHistoryArchive,
  type CanonicalHistoryArchivePayload,
  type CanonicalHistoryRepository,
} from './canonicalHistory';
import {
  assertCanonicalHistoryArchiveMatchesReference,
  buildCanonicalHistoryBackupManifest,
  canonicalHistoryBackupEntry,
  canonicalHistorySyncHash,
  decryptCanonicalHistoryArchive,
  encryptCanonicalHistoryArchive,
  officialCanonicalHistoryReferences,
  validateCanonicalHistoryBackupManifest,
  type CanonicalHistoryBackupEntry,
  type CanonicalHistoryBackupManifest,
  type CanonicalHistoryLocalDescriptor,
} from './canonicalHistorySync';
import {
  loadCompetenceState,
  replaceCompetenceState,
  validateCompetenceState,
  type CompetenceState,
} from './competenceStore';
import { monthlyClosingSyncHash } from './monthlyClosingIdentity';
import {
  assertMonthlyClosingCompetenceConsistency,
  emptyMonthlyClosingState,
  loadMonthlyClosingState,
  replaceMonthlyClosingState,
  validateMonthlyClosingState,
  type MonthlyClosingState,
} from './monthlyClosingState';
import {
  buildCanonicalFromStoredSources,
  exportSourceStorageSnapshot,
  restoreSourceStorageSnapshot,
  validateSourceStorageSnapshot,
  type SourceStorageSnapshot,
} from './sourceImport';
import { canonicalInputHashV3, stagingManifestHashV2 } from './sourceReplacementIdentity';
import { assertEffectiveSourceSetReady, resolveEffectiveSourceSet } from './sourceReplacementRuntime';
import {
  loadSourceReplacementState,
  replaceSourceReplacementState,
  sourceReplacementProofHash,
  sourceReplacementsFromCertificates,
  validateSourceReplacementState,
  type SourceReplacementState,
} from './sourceReplacementState';
import { loadReportSettings, restoreReportSettings, type ReportSettings } from './reportSettings';
import { resolveActiveCanonicalBundle, type ActiveCanonicalBundle } from './runtime';
import { rcaTargetRegistryHash } from './targetIdentity';
import {
  bootstrapTargetStateFromReportSettings,
  loadTargetState,
  replaceTargetState,
  validateTargetState,
  type TargetState,
} from './targetStore';

const SYNC_URL = 'https://wsdmcnvnpjpberzeizjc.supabase.co/functions/v1/blue-jacket-sync';
const PUBLISHABLE_KEY = 'sb_publishable_W6YcgHB39DwRXCFR0wZUBA_pAafJ8wp';
const IDENTITY_KEY = 'blue-jacket-v4:device-sync-identity';
const STATE_KEY = 'blue-jacket-v4:device-sync-state';
const MAGIC = new TextEncoder().encode('BJS1');

export type DeviceSyncIdentity = { workspaceId: string; secret: string };
export type DeviceSyncState = { workspaceId: string; remoteUpdatedAt: string; revision?: number };
export type DeviceSyncStatus = { updatedAt: string; bytes: number; revision?: number; protocolVersion?: 1 | 2 };
type NormalizedDeviceSyncStatus = DeviceSyncStatus & { revision: number; protocolVersion: 1 | 2 };

export type CloudSnapshotV1 = {
  format: 'blue-jacket-device-sync/v1';
  createdAt: string;
  active: ActiveCanonicalBundle | null;
  sources: SourceStorageSnapshot;
  settings: ReportSettings;
  competenceState?: CompetenceState;
  monthlyClosingState?: MonthlyClosingState;
  adminRegistryState?: AdminRegistryState;
  targetState?: TargetState;
  sourceReplacementState?: SourceReplacementState;
};

export type CloudSnapshotV2 = {
  format: 'blue-jacket-device-sync/v2';
  createdAt: string;
  active: ActiveCanonicalBundle | null;
  sources: SourceStorageSnapshot;
  settings: ReportSettings;
  competenceState?: CompetenceState;
  monthlyClosingState: MonthlyClosingState;
  adminRegistryState?: AdminRegistryState;
  targetState?: TargetState;
  sourceReplacementState?: SourceReplacementState;
  canonicalHistoryManifest: CanonicalHistoryBackupManifest;
};

export type CloudSnapshot = CloudSnapshotV1 | CloudSnapshotV2;

export type CloudRestoreDependencies = {
  exportSources: () => Promise<SourceStorageSnapshot>;
  loadSettings: () => ReportSettings;
  loadCompetence: () => CompetenceState | null;
  loadMonthlyClosingState?: () => MonthlyClosingState | null;
  loadAdminRegistry?: () => Promise<AdminRegistryState | null>;
  loadTargetState?: () => TargetState | null;
  loadSourceReplacementState?: () => SourceReplacementState | null;
  restoreSources: (snapshot: SourceStorageSnapshot) => Promise<void>;
  restoreSettings: (value: unknown) => ReportSettings;
  replaceCompetence: (value: unknown | null) => CompetenceState | null;
  replaceMonthlyClosingState?: (value: MonthlyClosingState | null) => MonthlyClosingState | null;
  replaceAdminRegistry?: (value: AdminRegistryState | null) => Promise<AdminRegistryState | null>;
  replaceTargetState?: (value: TargetState | null) => TargetState | null;
  replaceSourceReplacementState?: (value: SourceReplacementState | null) => SourceReplacementState | null;
  bootstrapTargetState?: (settings: ReportSettings) => TargetState;
  build: () => Promise<ActiveCanonicalBundle>;
};

export type CloudUploadDependencies = {
  getActive: () => ActiveCanonicalBundle | null;
  exportSources: () => Promise<SourceStorageSnapshot>;
  sourceManifestHash: (snapshot: SourceStorageSnapshot, replacedSourceIds?: string[]) => Promise<string>;
  registryHash: (state: AdminRegistryState | null) => Promise<string>;
  targetHash: (state: TargetState | null) => Promise<string>;
  replacementProofHash: (state: SourceReplacementState | null, sources: SourceStorageSnapshot, registry: AdminRegistryState | null, target: TargetState | null) => Promise<{ proofHash: string; replacements: Array<{ source: string; scope: string }>; replacedSourceIds: string[] }>;
  inputHash: (sourceHash: string, registryHash: string, targetHash: string, proofHash: string) => Promise<string>;
  closingSyncHash?: (competence: CompetenceState | null, closing: MonthlyClosingState | null) => Promise<string>;
  loadSettings: () => ReportSettings;
  loadCompetence: () => CompetenceState | null;
  loadMonthlyClosingState?: () => MonthlyClosingState | null;
  loadAdminRegistry: () => Promise<AdminRegistryState | null>;
  loadTargetState: () => TargetState | null;
  loadSourceReplacementState: () => SourceReplacementState | null;
  encryptSnapshot: (identity: DeviceSyncIdentity, snapshot: CloudSnapshot) => Promise<Uint8Array>;
  uploadPayload: (identity: DeviceSyncIdentity, payload: Uint8Array, expectedRevision?: number) => Promise<DeviceSyncStatus>;
  saveState: (identity: DeviceSyncIdentity, remoteUpdatedAt: string, revision?: number) => void;
  now: () => string;
  remoteStatus?: (identity: DeviceSyncIdentity) => Promise<DeviceSyncStatus>;
  loadDeviceState?: () => DeviceSyncState | null;
  historyRepository?: CanonicalHistoryRepository;
  historyStatus?: (identity: DeviceSyncIdentity, objectKey: string) => Promise<{ exists: boolean; bytes: number }>;
  historyUpload?: (identity: DeviceSyncIdentity, objectKey: string, payload: Uint8Array) => Promise<'CREATED' | 'EXISTING'>;
  encryptHistory?: (secret: string, payload: CanonicalHistoryArchivePayload) => Promise<Uint8Array>;
  downloadRemoteSnapshot?: (identity: DeviceSyncIdentity) => Promise<CloudSnapshot>;
};

export type CloudHistoryRestoreDependencies = {
  operational: CloudRestoreDependencies;
  historyRepository: CanonicalHistoryRepository;
  downloadHistory: (identity: DeviceSyncIdentity, objectKey: string) => Promise<Uint8Array>;
  decryptHistory: (secret: string, payload: Uint8Array) => Promise<CanonicalHistoryArchivePayload>;
};

function isIdentity(value: unknown): value is DeviceSyncIdentity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DeviceSyncIdentity>;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.workspaceId ?? '') && /^[A-Za-z0-9_-]{40,100}$/.test(candidate.secret ?? '');
}

function isSyncState(value: unknown): value is DeviceSyncState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DeviceSyncState>;
  return typeof candidate.workspaceId === 'string'
    && typeof candidate.remoteUpdatedAt === 'string'
    && Number.isFinite(Date.parse(candidate.remoteUpdatedAt))
    && (candidate.revision === undefined || (Number.isInteger(candidate.revision) && Number(candidate.revision) >= 0));
}

function normalizeStatus(value: unknown): NormalizedDeviceSyncStatus {
  if (!value || typeof value !== 'object') throw new Error('SYNC_STATUS_INVALID');
  const candidate = value as Partial<DeviceSyncStatus>;
  if (typeof candidate.updatedAt !== 'string' || !Number.isFinite(Date.parse(candidate.updatedAt)) || typeof candidate.bytes !== 'number' || !Number.isFinite(candidate.bytes) || candidate.bytes < 0) throw new Error('SYNC_STATUS_INVALID');
  if (candidate.revision !== undefined && (!Number.isInteger(candidate.revision) || Number(candidate.revision) < 0)) throw new Error('SYNC_STATUS_INVALID');
  if (candidate.protocolVersion !== undefined && candidate.protocolVersion !== 1 && candidate.protocolVersion !== 2) throw new Error('SYNC_STATUS_INVALID');
  return { updatedAt: candidate.updatedAt, bytes: candidate.bytes, revision: candidate.revision ?? 0, protocolVersion: candidate.protocolVersion ?? 1 };
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

function randomSecret() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return bytesToBase64Url(bytes); }
function pairingCode(identity: DeviceSyncIdentity) { return `BJ1.${identity.workspaceId}.${identity.secret}`; }

function parsePairingCode(value: string): DeviceSyncIdentity {
  let candidate = value.trim();
  try { const url = new URL(candidate); candidate = new URLSearchParams(url.hash.replace(/^#/, '')).get('sync') ?? candidate; } catch { /* compact code */ }
  const match = candidate.match(/^BJ1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{40,100})$/i);
  if (!match || !isIdentity({ workspaceId: match[1], secret: match[2] })) throw new Error('SYNC_PAIRING_CODE_INVALID');
  return { workspaceId: match[1], secret: match[2] };
}

function readError(response: Response) { return response.json().then((body: { error?: string }) => body.error || `SYNC_HTTP_${response.status}`).catch(() => `SYNC_HTTP_${response.status}`); }
async function request(action: string, identity?: DeviceSyncIdentity, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('apikey', PUBLISHABLE_KEY);
  headers.set('x-blue-jacket-action', action);
  if (identity) {
    headers.set('x-blue-jacket-workspace', identity.workspaceId);
    headers.set('x-blue-jacket-secret', identity.secret);
  }
  const response = await fetch(SYNC_URL, { ...init, headers, cache: 'no-store' });
  if (!response.ok) throw new Error(await readError(response));
  return response;
}

async function cryptoKey(secret: string) { return crypto.subtle.importKey('raw', base64UrlToBytes(secret), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
async function encrypt(identity: DeviceSyncIdentity, snapshot: CloudSnapshot) {
  const packed = zipSync({ 'snapshot.json': strToU8(JSON.stringify(snapshot)) }, { level: 9 });
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(identity.secret), packed));
  const result = new Uint8Array(MAGIC.length + iv.length + encrypted.length);
  result.set(MAGIC);
  result.set(iv, MAGIC.length);
  result.set(encrypted, MAGIC.length + iv.length);
  return result;
}

function validateClosingSnapshotConsistency(snapshot: CloudSnapshot) {
  if (snapshot.monthlyClosingState === undefined) return;
  const closing = validateMonthlyClosingState(snapshot.monthlyClosingState);
  snapshot.monthlyClosingState = closing;
  if (closing.events.length > 0 && snapshot.competenceState === undefined) throw new Error('MONTHLY_CLOSING_COMPETENCE_INCONSISTENT');
  assertMonthlyClosingCompetenceConsistency(snapshot.competenceState ?? null, closing);
}

async function validateCloudSnapshot(snapshot: CloudSnapshot) {
  if (!snapshot || (snapshot.format !== 'blue-jacket-device-sync/v1' && snapshot.format !== 'blue-jacket-device-sync/v2') || !snapshot.sources || !snapshot.settings || typeof snapshot.settings !== 'object') throw new Error('SYNC_PAYLOAD_INVALID');
  try { validateSourceStorageSnapshot(snapshot.sources); } catch { throw new Error('SYNC_PAYLOAD_INVALID'); }
  if (snapshot.competenceState !== undefined) { try { snapshot.competenceState = validateCompetenceState(snapshot.competenceState); } catch { throw new Error('SYNC_PAYLOAD_INVALID'); } }
  if (snapshot.monthlyClosingState !== undefined) { try { validateClosingSnapshotConsistency(snapshot); } catch { throw new Error('SYNC_PAYLOAD_INVALID'); } }
  if (snapshot.adminRegistryState !== undefined) { try { snapshot.adminRegistryState = validateAdminRegistryState(snapshot.adminRegistryState); } catch { throw new Error('SYNC_PAYLOAD_INVALID'); } }
  if (snapshot.targetState !== undefined) { try { snapshot.targetState = validateTargetState(snapshot.targetState); } catch { throw new Error('SYNC_PAYLOAD_INVALID'); } }
  if (snapshot.sourceReplacementState !== undefined) { try { snapshot.sourceReplacementState = validateSourceReplacementState(snapshot.sourceReplacementState); } catch { throw new Error('SYNC_PAYLOAD_INVALID'); } }
  if (snapshot.format === 'blue-jacket-device-sync/v2') {
    if (snapshot.monthlyClosingState === undefined || snapshot.canonicalHistoryManifest === undefined) throw new Error('SYNC_PAYLOAD_INVALID');
    try { snapshot.canonicalHistoryManifest = await validateCanonicalHistoryBackupManifest(snapshot.canonicalHistoryManifest, snapshot.monthlyClosingState); }
    catch { throw new Error('SYNC_PAYLOAD_INVALID'); }
  }
  return snapshot;
}

async function decrypt(identity: DeviceSyncIdentity, payload: Uint8Array) {
  try {
    if (payload.length <= MAGIC.length + 12 || !MAGIC.every((value, index) => payload[index] === value)) throw new Error('invalid magic');
    const iv = payload.slice(MAGIC.length, MAGIC.length + 12);
    const encrypted = payload.slice(MAGIC.length + 12);
    const packed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await cryptoKey(identity.secret), encrypted));
    const text = strFromU8(unzipSync(packed)['snapshot.json'] ?? new Uint8Array());
    return await validateCloudSnapshot(JSON.parse(text) as CloudSnapshot);
  } catch (reason) {
    if (reason instanceof Error && reason.message === 'SYNC_PAYLOAD_INVALID') throw reason;
    throw new Error('SYNC_PAYLOAD_INVALID');
  }
}

function buildCloudSnapshot(
  active: ActiveCanonicalBundle,
  sources: SourceStorageSnapshot,
  settings: ReportSettings,
  competenceState: CompetenceState | null,
  createdAt = new Date().toISOString(),
  adminRegistryState: AdminRegistryState | null = null,
  targetState: TargetState | null = null,
  sourceReplacementState: SourceReplacementState | null = null,
  monthlyClosingState: MonthlyClosingState | null = null,
): CloudSnapshotV1 {
  const snapshot: CloudSnapshotV1 = {
    format: 'blue-jacket-device-sync/v1', createdAt, active, sources, settings,
    ...(competenceState ? { competenceState: validateCompetenceState(competenceState) } : {}),
    ...(monthlyClosingState ? { monthlyClosingState: validateMonthlyClosingState(monthlyClosingState) } : {}),
    ...(adminRegistryState ? { adminRegistryState: validateAdminRegistryState(adminRegistryState) } : {}),
    ...(targetState ? { targetState: validateTargetState(targetState) } : {}),
    ...(sourceReplacementState ? { sourceReplacementState: validateSourceReplacementState(sourceReplacementState) } : {}),
  };
  validateClosingSnapshotConsistency(snapshot);
  return snapshot;
}

async function buildCloudSnapshotV2(
  active: ActiveCanonicalBundle,
  sources: SourceStorageSnapshot,
  settings: ReportSettings,
  competenceState: CompetenceState | null,
  monthlyClosingState: MonthlyClosingState,
  canonicalHistoryManifest: CanonicalHistoryBackupManifest,
  createdAt = new Date().toISOString(),
  adminRegistryState: AdminRegistryState | null = null,
  targetState: TargetState | null = null,
  sourceReplacementState: SourceReplacementState | null = null,
): Promise<CloudSnapshotV2> {
  const closing = validateMonthlyClosingState(monthlyClosingState);
  const snapshot: CloudSnapshotV2 = {
    format: 'blue-jacket-device-sync/v2', createdAt, active, sources, settings,
    ...(competenceState ? { competenceState: validateCompetenceState(competenceState) } : {}),
    monthlyClosingState: closing,
    ...(adminRegistryState ? { adminRegistryState: validateAdminRegistryState(adminRegistryState) } : {}),
    ...(targetState ? { targetState: validateTargetState(targetState) } : {}),
    ...(sourceReplacementState ? { sourceReplacementState: validateSourceReplacementState(sourceReplacementState) } : {}),
    canonicalHistoryManifest: await validateCanonicalHistoryBackupManifest(canonicalHistoryManifest, closing),
  };
  validateClosingSnapshotConsistency(snapshot);
  return snapshot;
}

const defaultRestoreDependencies: CloudRestoreDependencies = {
  exportSources: exportSourceStorageSnapshot,
  loadSettings: loadReportSettings,
  loadCompetence: loadCompetenceState,
  loadMonthlyClosingState,
  loadAdminRegistry: loadAdminRegistryState,
  loadTargetState,
  loadSourceReplacementState,
  restoreSources: restoreSourceStorageSnapshot,
  restoreSettings: restoreReportSettings,
  replaceCompetence: replaceCompetenceState,
  replaceMonthlyClosingState,
  replaceAdminRegistry: replaceAdminRegistryState,
  replaceTargetState,
  replaceSourceReplacementState,
  bootstrapTargetState: settings => bootstrapTargetStateFromReportSettings(settings).state,
  build: buildCanonicalFromStoredSources,
};

async function prospectiveCloudIdentity(snapshot: CloudSnapshot, dependencies: CloudRestoreDependencies, previousRegistry: AdminRegistryState | null, previousTarget: TargetState | null) {
  validateSourceStorageSnapshot(snapshot.sources);
  const registry = snapshot.adminRegistryState !== undefined ? validateAdminRegistryState(snapshot.adminRegistryState) : previousRegistry;
  const target = snapshot.targetState !== undefined
    ? validateTargetState(snapshot.targetState)
    : previousTarget ?? dependencies.bootstrapTargetState?.(snapshot.settings) ?? null;
  const replacementState = snapshot.sourceReplacementState !== undefined ? validateSourceReplacementState(snapshot.sourceReplacementState) : null;
  const effective = assertEffectiveSourceSetReady(resolveEffectiveSourceSet({ physicalStages: snapshot.sources.staging, replacementState, adminRegistryState: registry, targetState: target }));
  const proofHash = await sourceReplacementProofHash(effective.certificates);
  const replacements = sourceReplacementsFromCertificates(effective.certificates);
  const sourceHash = await stagingManifestHashV2(snapshot.sources.staging, effective.omitted);
  const registryHash = await canonicalAdminRegistryHash(registry);
  const targetHash = await rcaTargetRegistryHash(target);
  const inputHash = await canonicalInputHashV3(sourceHash, registryHash, targetHash, proofHash);
  if (snapshot.active?.engineVersion === 'browser-stage4-product-assortment-v21-source-replacement') {
    if (snapshot.active.stagingManifestHash !== sourceHash
      || snapshot.active.adminRegistryHash !== registryHash
      || snapshot.active.rcaTargetRegistryHash !== targetHash
      || snapshot.active.sourceContractVersion !== 'v2'
      || snapshot.active.sourceReplacementProofHash !== proofHash
      || JSON.stringify(snapshot.active.sourceReplacements ?? []) !== JSON.stringify(replacements)
      || snapshot.active.canonicalInputHash !== inputHash) throw new Error('SYNC_REMOTE_REPLACEMENT_IDENTITY_INVALID');
  }
  return { registry, target, replacementState, sourceHash, registryHash, targetHash, proofHash, replacements, inputHash };
}

async function preflightCloudSnapshot(snapshot: CloudSnapshot, dependencies: CloudRestoreDependencies = defaultRestoreDependencies) {
  await validateCloudSnapshot(snapshot);
  const previousRegistry = dependencies.loadAdminRegistry ? await dependencies.loadAdminRegistry() : null;
  const previousTarget = dependencies.loadTargetState ? dependencies.loadTargetState() : null;
  return prospectiveCloudIdentity(snapshot, dependencies, previousRegistry, previousTarget);
}

async function applyCloudSnapshot(snapshot: CloudSnapshot, dependencies: CloudRestoreDependencies = defaultRestoreDependencies) {
  await validateCloudSnapshot(snapshot);
  const previousSources = await dependencies.exportSources().catch(() => null);
  const previousSettings = dependencies.loadSettings();
  const previousCompetence = dependencies.loadCompetence();
  const previousClosing = dependencies.loadMonthlyClosingState ? dependencies.loadMonthlyClosingState() : null;
  const previousAdminRegistry = dependencies.loadAdminRegistry ? await dependencies.loadAdminRegistry() : null;
  const previousTarget = dependencies.loadTargetState ? dependencies.loadTargetState() : null;
  const previousReplacement = dependencies.loadSourceReplacementState ? dependencies.loadSourceReplacementState() : null;
  const prospective = await prospectiveCloudIdentity(snapshot, dependencies, previousAdminRegistry, previousTarget);
  let closingTouched = false;
  let registryTouched = false;
  let targetTouched = false;
  let replacementTouched = false;
  try {
    await dependencies.restoreSources(snapshot.sources);
    const restoredSettings = dependencies.restoreSettings(snapshot.settings);
    if (snapshot.competenceState !== undefined) dependencies.replaceCompetence(snapshot.competenceState);
    if (snapshot.monthlyClosingState !== undefined) {
      if (!dependencies.replaceMonthlyClosingState) throw new Error('SYNC_MONTHLY_CLOSING_STATE_UNAVAILABLE');
      dependencies.replaceMonthlyClosingState(snapshot.monthlyClosingState);
      closingTouched = true;
    }
    if (snapshot.adminRegistryState !== undefined) {
      if (!dependencies.replaceAdminRegistry) throw new Error('SYNC_ADMIN_REGISTRY_UNAVAILABLE');
      await dependencies.replaceAdminRegistry(snapshot.adminRegistryState);
      registryTouched = true;
    }
    if (snapshot.targetState !== undefined) {
      if (!dependencies.replaceTargetState) throw new Error('SYNC_TARGET_STATE_UNAVAILABLE');
      dependencies.replaceTargetState(snapshot.targetState);
      targetTouched = true;
    } else if (!previousTarget && dependencies.bootstrapTargetState) {
      dependencies.bootstrapTargetState(restoredSettings);
      targetTouched = true;
    }
    if (snapshot.sourceReplacementState !== undefined) {
      if (!dependencies.replaceSourceReplacementState) throw new Error('SYNC_SOURCE_REPLACEMENT_STATE_UNAVAILABLE');
      dependencies.replaceSourceReplacementState(snapshot.sourceReplacementState);
      replacementTouched = true;
    } else if (previousReplacement) {
      if (!dependencies.replaceSourceReplacementState) throw new Error('SYNC_SOURCE_REPLACEMENT_STATE_UNAVAILABLE');
      dependencies.replaceSourceReplacementState(null);
      replacementTouched = true;
    }
    const rebuilt = await dependencies.build();
    if (rebuilt.stagingManifestHash !== prospective.sourceHash
      || rebuilt.adminRegistryHash !== prospective.registryHash
      || rebuilt.rcaTargetRegistryHash !== prospective.targetHash
      || rebuilt.sourceContractVersion !== 'v2'
      || rebuilt.sourceReplacementProofHash !== prospective.proofHash
      || JSON.stringify(rebuilt.sourceReplacements ?? []) !== JSON.stringify(prospective.replacements)
      || rebuilt.canonicalInputHash !== prospective.inputHash) throw new Error('SYNC_RESTORED_INPUT_IDENTITY_MISMATCH');
    return rebuilt;
  } catch (reason) {
    try {
      if (previousSources) await dependencies.restoreSources(previousSources);
      dependencies.restoreSettings(previousSettings);
      dependencies.replaceCompetence(previousCompetence);
      if (closingTouched && dependencies.replaceMonthlyClosingState) dependencies.replaceMonthlyClosingState(previousClosing);
      if (registryTouched && dependencies.replaceAdminRegistry) await dependencies.replaceAdminRegistry(previousAdminRegistry);
      if (targetTouched && dependencies.replaceTargetState) dependencies.replaceTargetState(previousTarget);
      if (replacementTouched && dependencies.replaceSourceReplacementState) dependencies.replaceSourceReplacementState(previousReplacement);
      if (previousSources) await dependencies.build();
    } catch { /* original restore error stays actionable */ }
    throw reason;
  }
}

function saveIdentity(identity: DeviceSyncIdentity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  const state = deviceSyncState();
  if (!state || state.workspaceId !== identity.workspaceId) localStorage.removeItem(STATE_KEY);
}

function saveSyncState(identity: DeviceSyncIdentity, remoteUpdatedAt: string, revision?: number) {
  if (!Number.isFinite(Date.parse(remoteUpdatedAt))) return;
  localStorage.setItem(STATE_KEY, JSON.stringify({
    workspaceId: identity.workspaceId,
    remoteUpdatedAt,
    ...(revision !== undefined ? { revision } : {}),
  } satisfies DeviceSyncState));
}

export function deviceSyncState() {
  try { const state = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null'); return isSyncState(state) ? state : null; }
  catch { return null; }
}
export function deviceSyncIdentity() {
  try { const identity = JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? 'null'); return isIdentity(identity) ? identity : null; }
  catch { return null; }
}
export function clearDeviceSyncIdentity() { localStorage.removeItem(IDENTITY_KEY); localStorage.removeItem(STATE_KEY); }

export async function deviceSyncRemoteStatus(identity = deviceSyncIdentity()) {
  if (!identity) throw new Error('SYNC_NOT_CONNECTED');
  const response = await request('status', identity);
  return normalizeStatus(await response.json() as unknown);
}

function expectedRevisionForUpload(remoteInput: DeviceSyncStatus, local: DeviceSyncState | null, workspaceId: string) {
  const remote = normalizeStatus(remoteInput);
  if (remote.bytes === 0 && remote.revision === 0) return 0;
  if (!local || local.workspaceId !== workspaceId) throw new Error('SYNC_REMOTE_BASELINE_REQUIRED');
  if (remote.protocolVersion === 1) {
    if (local.remoteUpdatedAt !== remote.updatedAt) throw new Error('SYNC_REMOTE_NEWER');
    return remote.revision;
  }
  if (local.revision === undefined) {
    if (local.remoteUpdatedAt !== remote.updatedAt) throw new Error('SYNC_REMOTE_NEWER');
    return remote.revision;
  }
  if (remote.revision > local.revision) throw new Error('SYNC_REMOTE_NEWER');
  if (remote.revision !== local.revision) throw new Error('SYNC_REMOTE_CHANGED');
  return remote.revision;
}

export async function deviceSyncHasNewerRemoteSnapshot(identity = deviceSyncIdentity()) {
  if (!identity) return false;
  const remote = await deviceSyncRemoteStatus(identity);
  if (remote.bytes === 0) return false;
  const local = deviceSyncState();
  if (!local || local.workspaceId !== identity.workspaceId) return true;
  if (remote.protocolVersion === 2 && local.revision !== undefined) return remote.revision > local.revision;
  return remote.updatedAt !== local.remoteUpdatedAt;
}

export async function createDeviceSyncWorkspace() {
  const identity: DeviceSyncIdentity = { workspaceId: crypto.randomUUID(), secret: randomSecret() };
  await request('register', undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identity) });
  saveIdentity(identity);
  return identity;
}
export async function connectDeviceSyncWorkspace(code: string) {
  const identity = parsePairingCode(code);
  await deviceSyncRemoteStatus(identity);
  saveIdentity(identity);
  return identity;
}
export function deviceSyncCode(identity: DeviceSyncIdentity) { return pairingCode(identity); }
export function deviceSyncLink(identity: DeviceSyncIdentity) { const url = new URL(window.location.href); url.hash = `sync=${encodeURIComponent(pairingCode(identity))}`; return url.toString(); }
export function incomingDeviceSyncCode() { const hash = window.location.hash.replace(/^#/, ''); return new URLSearchParams(hash).get('sync') ?? null; }
export function clearIncomingDeviceSyncCode() { if (window.location.hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`); }

async function uploadPayloadV2(identity: DeviceSyncIdentity, payload: Uint8Array, expectedRevision = 0) {
  const body = new Uint8Array(payload.byteLength);
  body.set(payload);
  const response = await request('upload-v2', identity, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream', 'x-blue-jacket-if-revision': String(expectedRevision) },
    body: body.buffer,
  });
  return normalizeStatus(await response.json() as unknown);
}

async function historyStatusRemote(identity: DeviceSyncIdentity, objectKey: string) {
  const response = await request('history-status', identity, { headers: { 'x-blue-jacket-object-key': objectKey } });
  const value = await response.json() as { exists?: unknown; bytes?: unknown };
  if (typeof value.exists !== 'boolean' || typeof value.bytes !== 'number' || !Number.isFinite(value.bytes) || value.bytes < 0) throw new Error('SYNC_HISTORY_STATUS_INVALID');
  return { exists: value.exists, bytes: value.bytes };
}

async function historyUploadRemote(identity: DeviceSyncIdentity, objectKey: string, payload: Uint8Array) {
  const body = new Uint8Array(payload.byteLength);
  body.set(payload);
  const response = await request('history-upload', identity, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream', 'x-blue-jacket-object-key': objectKey },
    body: body.buffer,
  });
  const value = await response.json() as { status?: unknown };
  if (value.status !== 'CREATED' && value.status !== 'EXISTING') throw new Error('SYNC_HISTORY_UPLOAD_INVALID');
  return value.status;
}

async function historyDownloadRemote(identity: DeviceSyncIdentity, objectKey: string) {
  const response = await request('history-download', identity, { headers: { 'x-blue-jacket-object-key': objectKey } });
  return new Uint8Array(await response.arrayBuffer());
}

async function downloadRemoteSnapshot(identity: DeviceSyncIdentity) {
  const response = await request('download', identity);
  return decrypt(identity, new Uint8Array(await response.arrayBuffer()));
}

async function defaultReplacementProof(state: SourceReplacementState | null, sources: SourceStorageSnapshot, registry: AdminRegistryState | null, target: TargetState | null) {
  const effective = assertEffectiveSourceSetReady(resolveEffectiveSourceSet({ physicalStages: sources.staging, replacementState: state, adminRegistryState: registry, targetState: target }));
  return { proofHash: await sourceReplacementProofHash(effective.certificates), replacements: sourceReplacementsFromCertificates(effective.certificates), replacedSourceIds: effective.omitted };
}

const defaultUploadDependencies: CloudUploadDependencies = {
  getActive: resolveActiveCanonicalBundle,
  exportSources: exportSourceStorageSnapshot,
  sourceManifestHash: (snapshot, replacedSourceIds = []) => stagingManifestHashV2(snapshot.staging, replacedSourceIds),
  registryHash: canonicalAdminRegistryHash,
  targetHash: rcaTargetRegistryHash,
  replacementProofHash: defaultReplacementProof,
  inputHash: canonicalInputHashV3,
  closingSyncHash: monthlyClosingSyncHash,
  loadSettings: loadReportSettings,
  loadCompetence: loadCompetenceState,
  loadMonthlyClosingState,
  loadAdminRegistry: loadAdminRegistryState,
  loadTargetState,
  loadSourceReplacementState,
  encryptSnapshot: encrypt,
  uploadPayload: uploadPayloadV2,
  saveState: saveSyncState,
  now: () => new Date().toISOString(),
  remoteStatus: deviceSyncRemoteStatus,
  loadDeviceState: deviceSyncState,
  historyRepository: indexedDbCanonicalHistoryRepository,
  historyStatus: historyStatusRemote,
  historyUpload: historyUploadRemote,
  encryptHistory: encryptCanonicalHistoryArchive,
  downloadRemoteSnapshot,
};

async function collectLocalHistoryDescriptors(closingState: MonthlyClosingState, repository?: CanonicalHistoryRepository) {
  const references = officialCanonicalHistoryReferences(closingState);
  const descriptors: CanonicalHistoryLocalDescriptor[] = [];
  const payloads = new Map<string, CanonicalHistoryArchivePayload>();
  for (const reference of references) {
    if (!repository) {
      descriptors.push({ archiveId: reference.archiveId, status: 'MISSING_LOCAL' });
      continue;
    }
    let payload: CanonicalHistoryArchivePayload | undefined;
    try { payload = await repository.getArchive(reference.archiveId); }
    catch { throw new Error('SYNC_HISTORY_LOCAL_CORRUPT'); }
    if (!payload) {
      descriptors.push({ archiveId: reference.archiveId, status: 'MISSING_LOCAL' });
      continue;
    }
    const validated = await validateCanonicalHistoryArchive(payload);
    assertCanonicalHistoryArchiveMatchesReference(validated, reference);
    descriptors.push({ archiveId: reference.archiveId, status: 'AVAILABLE', archiveHash: validated.archive.archiveHash });
    payloads.set(reference.archiveId, validated);
  }
  return { descriptors, payloads, references };
}

async function previousRemoteHistoryManifest(identity: DeviceSyncIdentity, remote: NormalizedDeviceSyncStatus, local: ReturnType<typeof collectLocalHistoryDescriptors> extends Promise<infer T> ? T : never, dependencies: CloudUploadDependencies) {
  if (remote.protocolVersion !== 2 || remote.bytes === 0 || !local.descriptors.some(item => item.status === 'MISSING_LOCAL') || !dependencies.downloadRemoteSnapshot) return null;
  const snapshot = await dependencies.downloadRemoteSnapshot(identity);
  return snapshot.format === 'blue-jacket-device-sync/v2' ? snapshot.canonicalHistoryManifest : null;
}

async function buildAndUploadHistoryManifest(
  identity: DeviceSyncIdentity,
  closingState: MonthlyClosingState,
  remote: NormalizedDeviceSyncStatus,
  local: Awaited<ReturnType<typeof collectLocalHistoryDescriptors>>,
  dependencies: CloudUploadDependencies,
) {
  const previous = await previousRemoteHistoryManifest(identity, remote, local, dependencies);
  const previousEntries = new Map((previous?.archives ?? []).map(entry => [entry.archiveId, entry]));
  const entries: CanonicalHistoryBackupEntry[] = [];
  const missing: string[] = [];
  let uploaded = 0;
  let reused = 0;

  for (const reference of local.references) {
    const payload = local.payloads.get(reference.archiveId);
    const previousEntry = previousEntries.get(reference.archiveId);
    if (payload) {
      const entry = await canonicalHistoryBackupEntry(payload);
      if (previousEntry && previousEntry.archiveHash !== entry.archiveHash) throw new Error('SYNC_HISTORY_COLLISION');
      const remoteObject = dependencies.historyStatus ? await dependencies.historyStatus(identity, entry.objectKey) : { exists: false, bytes: 0 };
      if (!remoteObject.exists) {
        if (!dependencies.historyUpload || !dependencies.encryptHistory) throw new Error('SYNC_HISTORY_REMOTE_UNAVAILABLE');
        const encrypted = await dependencies.encryptHistory(identity.secret, payload);
        const outcome = await dependencies.historyUpload(identity, entry.objectKey, encrypted);
        if (outcome === 'CREATED') uploaded += 1; else reused += 1;
        const confirmed = dependencies.historyStatus ? await dependencies.historyStatus(identity, entry.objectKey) : { exists: true, bytes: encrypted.byteLength };
        if (!confirmed.exists) throw new Error('SYNC_REMOTE_HISTORY_OBJECT_MISSING');
      } else reused += 1;
      entries.push(entry);
      continue;
    }

    if (previousEntry) {
      const status = dependencies.historyStatus ? await dependencies.historyStatus(identity, previousEntry.objectKey) : { exists: false, bytes: 0 };
      if (!status.exists) throw new Error('SYNC_REMOTE_HISTORY_OBJECT_MISSING');
      entries.push(previousEntry);
      reused += 1;
    } else missing.push(reference.archiveId);
  }

  return {
    manifest: await buildCanonicalHistoryBackupManifest(closingState, entries, missing),
    uploaded,
    reused,
    missing: missing.length,
  };
}

async function uploadCurrentDeviceSnapshotWithDependencies(identity: DeviceSyncIdentity, dependencies: CloudUploadDependencies) {
  const activeBefore = dependencies.getActive();
  if (!activeBefore) throw new Error('SYNC_NO_ACTIVE_BUILD');
  const createdAt = dependencies.now();
  const competenceBefore = dependencies.loadCompetence();
  const closingBeforeRaw = dependencies.loadMonthlyClosingState?.() ?? null;
  const closingBefore = closingBeforeRaw ?? emptyMonthlyClosingState(createdAt);
  const closingHash = dependencies.closingSyncHash ?? monthlyClosingSyncHash;
  const closingSyncHashBefore = await closingHash(competenceBefore, closingBeforeRaw);
  const localHistoryBefore = await collectLocalHistoryDescriptors(closingBefore, dependencies.historyRepository);
  const historySyncHashBefore = await canonicalHistorySyncHash(closingBefore, localHistoryBefore.descriptors);

  const remote = normalizeStatus(dependencies.remoteStatus
    ? await dependencies.remoteStatus(identity)
    : { updatedAt: '1970-01-01T00:00:00.000Z', bytes: 0, revision: 0, protocolVersion: 1 });
  const expectedRevision = expectedRevisionForUpload(remote, dependencies.loadDeviceState?.() ?? null, identity.workspaceId);

  const [sources, adminRegistryState] = await Promise.all([dependencies.exportSources(), dependencies.loadAdminRegistry()]);
  const targetState = dependencies.loadTargetState();
  const replacementState = dependencies.loadSourceReplacementState();
  const replacementIdentity = await dependencies.replacementProofHash(replacementState, sources, adminRegistryState, targetState);
  const exportedSourcesManifestHash = await dependencies.sourceManifestHash(sources, replacementIdentity.replacedSourceIds);
  const exportedAdminRegistryHash = await dependencies.registryHash(adminRegistryState);
  const exportedRcaTargetRegistryHash = await dependencies.targetHash(targetState);
  const exportedCanonicalInputHash = await dependencies.inputHash(exportedSourcesManifestHash, exportedAdminRegistryHash, exportedRcaTargetRegistryHash, replacementIdentity.proofHash);

  const history = await buildAndUploadHistoryManifest(identity, closingBefore, remote, localHistoryBefore, dependencies);

  const activeAfter = dependencies.getActive();
  const competenceAfter = dependencies.loadCompetence();
  const closingAfterRaw = dependencies.loadMonthlyClosingState?.() ?? null;
  const closingAfter = closingAfterRaw ?? emptyMonthlyClosingState(createdAt);
  const closingSyncHashAfter = await closingHash(competenceAfter, closingAfterRaw);
  const localHistoryAfter = await collectLocalHistoryDescriptors(closingAfter, dependencies.historyRepository);
  const historySyncHashAfter = await canonicalHistorySyncHash(closingAfter, localHistoryAfter.descriptors);

  if (!activeAfter
    || activeBefore.engineVersion !== 'browser-stage4-product-assortment-v21-source-replacement'
    || activeBefore.sourceContractVersion !== 'v2'
    || !activeBefore.adminRegistryHash || !activeBefore.rcaTargetRegistryHash || !activeBefore.sourceReplacementProofHash || !activeBefore.canonicalInputHash
    || activeBefore.motorBuildId !== activeAfter.motorBuildId
    || activeBefore.stagingManifestHash !== activeAfter.stagingManifestHash
    || activeBefore.adminRegistryHash !== activeAfter.adminRegistryHash
    || activeBefore.rcaTargetRegistryHash !== activeAfter.rcaTargetRegistryHash
    || activeBefore.sourceReplacementProofHash !== activeAfter.sourceReplacementProofHash
    || JSON.stringify(activeBefore.sourceReplacements ?? []) !== JSON.stringify(activeAfter.sourceReplacements ?? [])
    || activeBefore.canonicalInputHash !== activeAfter.canonicalInputHash
    || exportedSourcesManifestHash !== activeBefore.stagingManifestHash
    || exportedAdminRegistryHash !== activeBefore.adminRegistryHash
    || exportedRcaTargetRegistryHash !== activeBefore.rcaTargetRegistryHash
    || replacementIdentity.proofHash !== activeBefore.sourceReplacementProofHash
    || JSON.stringify(replacementIdentity.replacements) !== JSON.stringify(activeBefore.sourceReplacements ?? [])
    || exportedCanonicalInputHash !== activeBefore.canonicalInputHash
    || closingSyncHashBefore !== closingSyncHashAfter
    || historySyncHashBefore !== historySyncHashAfter) throw new Error('SYNC_SNAPSHOT_CHANGED_DURING_CAPTURE');

  assertMonthlyClosingCompetenceConsistency(competenceBefore, closingBefore);
  const snapshot = await buildCloudSnapshotV2(activeBefore, sources, dependencies.loadSettings(), competenceBefore, closingBefore, history.manifest, createdAt, adminRegistryState, targetState, replacementState);
  const payload = await dependencies.encryptSnapshot(identity, snapshot);
  const status = normalizeStatus(await dependencies.uploadPayload(identity, payload, expectedRevision));
  dependencies.saveState(identity, status.updatedAt, status.revision);
  return {
    bytes: payload.byteLength,
    active: activeBefore,
    updatedAt: status.updatedAt,
    revision: status.revision,
    protocolVersion: status.protocolVersion,
    historyUploaded: history.uploaded,
    historyReused: history.reused,
    historyMissing: history.missing,
    historyOfficial: history.manifest.archives.length + history.manifest.missingArchiveIds.length,
  };
}

async function prepareHistoryRestore(snapshot: CloudSnapshotV2, identity: DeviceSyncIdentity, dependencies: CloudHistoryRestoreDependencies) {
  await preflightCloudSnapshot(snapshot, dependencies.operational);
  const references = new Map(officialCanonicalHistoryReferences(snapshot.monthlyClosingState).map(reference => [reference.archiveId, reference]));
  const staged: CanonicalHistoryArchivePayload[] = [];
  let reused = 0;
  for (const entry of snapshot.canonicalHistoryManifest.archives) {
    const reference = references.get(entry.archiveId);
    if (!reference) throw new Error('SYNC_HISTORY_MANIFEST_INVALID');
    let local: CanonicalHistoryArchivePayload | undefined;
    try { local = await dependencies.historyRepository.getArchive(entry.archiveId); }
    catch { throw new Error('SYNC_HISTORY_COLLISION'); }
    if (local) {
      const valid = await validateCanonicalHistoryArchive(local);
      if (valid.archive.archiveHash !== entry.archiveHash) throw new Error('SYNC_HISTORY_COLLISION');
      assertCanonicalHistoryArchiveMatchesReference(valid, reference);
      reused += 1;
      continue;
    }
    let encrypted: Uint8Array;
    try { encrypted = await dependencies.downloadHistory(identity, entry.objectKey); }
    catch (reason) {
      if (String(reason).includes('SYNC_REMOTE_HISTORY_OBJECT_MISSING')) throw reason;
      throw new Error('SYNC_REMOTE_HISTORY_OBJECT_MISSING');
    }
    const payload = await dependencies.decryptHistory(identity.secret, encrypted);
    const valid = await validateCanonicalHistoryArchive(payload);
    if (valid.archive.archiveId !== entry.archiveId || valid.archive.archiveHash !== entry.archiveHash) throw new Error('SYNC_HISTORY_COLLISION');
    assertCanonicalHistoryArchiveMatchesReference(valid, reference);
    staged.push(valid);
  }
  return { staged, reused, missing: snapshot.canonicalHistoryManifest.missingArchiveIds.length };
}

async function applyCloudSnapshotV2WithHistory(snapshot: CloudSnapshotV2, identity: DeviceSyncIdentity, dependencies: CloudHistoryRestoreDependencies) {
  const prepared = await prepareHistoryRestore(snapshot, identity, dependencies);
  const created: string[] = [];
  try {
    for (const payload of prepared.staged) {
      const result = await dependencies.historyRepository.putArchive(payload);
      if (result === 'CREATED') created.push(payload.archive.archiveId);
    }
  } catch (reason) {
    for (const archiveId of created) await dependencies.historyRepository.deleteArchiveInternal(archiveId).catch(() => undefined);
    throw reason;
  }
  try {
    const active = await applyCloudSnapshot(snapshot, dependencies.operational);
    return { active, restored: created.length, reused: prepared.reused + (prepared.staged.length - created.length), missing: prepared.missing, createdArchiveIds: created };
  } catch (reason) {
    for (const archiveId of created) await dependencies.historyRepository.deleteArchiveInternal(archiveId).catch(() => undefined);
    throw reason;
  }
}

const defaultHistoryRestoreDependencies: CloudHistoryRestoreDependencies = {
  operational: defaultRestoreDependencies,
  historyRepository: indexedDbCanonicalHistoryRepository,
  downloadHistory: historyDownloadRemote,
  decryptHistory: decryptCanonicalHistoryArchive,
};

export async function uploadCurrentDeviceSnapshot(identity = deviceSyncIdentity()) {
  if (!identity) throw new Error('SYNC_NOT_CONNECTED');
  return uploadCurrentDeviceSnapshotWithDependencies(identity, defaultUploadDependencies);
}

export async function restoreCurrentDeviceSnapshot(identity = deviceSyncIdentity()) {
  if (!identity) throw new Error('SYNC_NOT_CONNECTED');
  const remoteStatus = await deviceSyncRemoteStatus(identity);
  const response = await request('download', identity);
  const remoteUpdatedAt = response.headers.get('x-blue-jacket-updated-at');
  const snapshot = await decrypt(identity, new Uint8Array(await response.arrayBuffer()));
  if (snapshot.format === 'blue-jacket-device-sync/v1') {
    const active = await applyCloudSnapshot(snapshot);
    const updatedAt = remoteUpdatedAt && Number.isFinite(Date.parse(remoteUpdatedAt)) ? remoteUpdatedAt : snapshot.createdAt;
    saveSyncState(identity, updatedAt, remoteStatus.revision);
    return active;
  }
  const restored = await applyCloudSnapshotV2WithHistory(snapshot, identity, defaultHistoryRestoreDependencies);
  const updatedAt = remoteUpdatedAt && Number.isFinite(Date.parse(remoteUpdatedAt)) ? remoteUpdatedAt : snapshot.createdAt;
  saveSyncState(identity, updatedAt, remoteStatus.revision);
  return restored.active;
}

export async function deviceSyncBackupStatus(identity = deviceSyncIdentity()) {
  if (!identity) throw new Error('SYNC_NOT_CONNECTED');
  const status = await deviceSyncRemoteStatus(identity);
  if (status.bytes === 0) return { ...status, officialArchives: 0, availableArchives: 0, missingArchives: 0 };
  if (status.protocolVersion === 1) return { ...status, officialArchives: 0, availableArchives: 0, missingArchives: 0 };
  const snapshot = await downloadRemoteSnapshot(identity);
  if (snapshot.format !== 'blue-jacket-device-sync/v2') throw new Error('SYNC_PAYLOAD_INVALID');
  return {
    ...status,
    officialArchives: snapshot.canonicalHistoryManifest.archives.length + snapshot.canonicalHistoryManifest.missingArchiveIds.length,
    availableArchives: snapshot.canonicalHistoryManifest.archives.length,
    missingArchives: snapshot.canonicalHistoryManifest.missingArchiveIds.length,
  };
}

export async function deleteDeviceSyncWorkspace(identity = deviceSyncIdentity()) {
  if (!identity) return;
  await request('delete', identity, { method: 'DELETE' });
  clearDeviceSyncIdentity();
}

export const cloudSyncTestHelpers = {
  pairingCode,
  parsePairingCode,
  encrypt,
  decrypt,
  buildCloudSnapshot,
  buildCloudSnapshotV2,
  validateCloudSnapshot,
  prospectiveCloudIdentity,
  preflightCloudSnapshot,
  applyCloudSnapshot,
  uploadCurrentDeviceSnapshotWithDependencies,
  defaultReplacementProof,
  validateClosingSnapshotConsistency,
  normalizeStatus,
  expectedRevisionForUpload,
  collectLocalHistoryDescriptors,
  buildAndUploadHistoryManifest,
  prepareHistoryRestore,
  applyCloudSnapshotV2WithHistory,
};
