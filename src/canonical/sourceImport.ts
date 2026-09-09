import { parseSource } from './parsers';
import { buildCanonicalBundleFromStaging } from './motors';
import { materializeTopRetailRouteInM2 } from './topRetailM2';
import { applyAdminRegistryCanonicalAuthority } from './adminRegistryCanonicalAuthority';
import { canonicalAdminRegistryHash } from './adminRegistryIdentity';
import { loadAdminRegistryState } from './adminRegistryIndexedDb';
import type { AdminRegistryState } from './adminRegistry';
import { applyTargetAuthorityToM3 } from './targetAuthority';
import { rcaTargetRegistryHash } from './targetIdentity';
import { bootstrapTargetStateFromReportSettings, loadTargetState, type TargetState } from './targetStore';
import { loadReportSettings } from './reportSettings';
import type { ActiveCanonicalBundle } from './runtime';
import type { CanonicalList, ParsedSource } from './types';
import {
  HARD_REQUIRED_SOURCE_IDS,
  LEGACY_V20_REQUIRED_SOURCE_IDS,
  REPLACEABLE_SOURCE_IDS,
  SOURCE_CONTRACT_VERSION,
  SOURCE_LABELS,
  SUPPORTED_SOURCE_IDS,
} from './sourceContract';
import { canonicalInputHashV3, stagingManifestHashV2 } from './sourceReplacementIdentity';
import { assertEffectiveSourceSetReady, resolveEffectiveSourceSet, type SourceBuildDiagnostic } from './sourceReplacementRuntime';
import {
  EMPTY_SOURCE_REPLACEMENT_PROOF,
  loadSourceReplacementState,
  sourceReplacementProofHash,
  sourceReplacementsFromCertificates,
  type SourceReplacementState,
} from './sourceReplacementState';

const DB_NAME = 'blue-jacket-v4-source-import';
const DB_VERSION = 1;
const STAGING_STORE = 'staging';
const BUILDS_STORE = 'builds';
const LISTS_STORE = 'lists';
const DEFAULT_PARSER_VERSION = 'browser-v1';
const SOURCE_PARSER_VERSIONS: Record<string, string> = {
  'cadastro-itens-286.xls': 'browser-v2-286-physical-column-layout',
  '310 total 2026.txt': 'browser-v2-rca310',
  "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx": 'browser-v3-route-monthly-meta',
  'entrada-notas-218.xls': 'browser-v3-invoice-items-physical-layout',
  'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx': 'browser-v3-bussola-current-code-context',
  "Sortimento Recomendado - Q3'26.xlsx": 'browser-v4-jul-optional-blank-before-ean',
  'CARTEIRA 24.08.xlsx': 'browser-v5-portfolio-current-snapshot',
};
const SCHEMA_VERSION = 'v1';
/** v21 changes the effective physical-source contract and canonical input identity. */
export const CANONICAL_ENGINE_VERSION = 'browser-stage4-product-assortment-v21-source-replacement';
const parserVersionFor = (source: string) => SOURCE_PARSER_VERSIONS[source] ?? DEFAULT_PARSER_VERSION;
export const isSourceStageCurrent = (manifest: SourceStageManifest | undefined) => Boolean(manifest && manifest.parserVersion === parserVersionFor(manifest.source) && manifest.schemaVersion === SCHEMA_VERSION);

/** Legacy v20 compatibility only. New v21 logic uses SUPPORTED/HARD/REPLACEABLE + runtime context. */
export const REQUIRED_SOURCE_IDS = [...LEGACY_V20_REQUIRED_SOURCE_IDS];
export { HARD_REQUIRED_SOURCE_IDS, REPLACEABLE_SOURCE_IDS, SOURCE_LABELS, SUPPORTED_SOURCE_IDS };

export type SourceStageStatus = 'VALID' | 'UNCHANGED' | 'REJECTED';
export type SourceStageManifest = {
  source: string;
  fileName: string;
  fileHash: string;
  parserVersion: string;
  schemaVersion: string;
  parsedRows: number;
  warnings: number;
  errors: number;
  updatedAt: string;
  status: 'VALID';
};

export type StoredStage = { source: string; manifest: SourceStageManifest; parsed: ParsedSource };
type StoredBuild = {
  id: string;
  active: ActiveCanonicalBundle;
  generatedAt: string;
  sourceHashes: Record<string, string>;
  stagingManifestHash?: string;
  adminRegistryHash?: string;
  rcaTargetRegistryHash?: string;
  sourceReplacementProofHash?: string;
  canonicalInputHash?: string;
};
type StoredList = { id: string; buildId: string; listId: CanonicalList['id']; list: CanonicalList };

type PortfolioContinuitySnapshot = {
  id: 'portfolio-continuity';
  source: 'CARTEIRA 24.08.xlsx';
  fileName: string;
  fileHash: string;
  snapshotDate: string;
  orderNumbers: string[];
  rawRows: number;
  acceptedRows: number;
  rawValue: number;
  acceptedValue: number;
  mode: 'BASELINE_CURRENT' | 'BOOTSTRAP_2026_08_17' | 'ROLL_FORWARD';
  updatedAt: string;
};

export type SourceStorageSnapshotV1 = {
  format: 'blue-jacket-source-storage/v1';
  exportedAt: string;
  staging: StoredStage[];
};
export type SourceStorageSnapshotV2 = {
  format: 'blue-jacket-source-storage/v2';
  exportedAt: string;
  staging: StoredStage[];
};
export type SourceStorageSnapshot = SourceStorageSnapshotV1 | SourceStorageSnapshotV2;

function rowTyped(row: ParsedSource['rows'][number], field: string) {
  const cell = row[field];
  return cell?.typed ?? cell?.raw ?? null;
}

function normalizeOrderNumber(value: unknown) {
  return String(value ?? '').trim().replace(/\.0+$/, '').replace(/\D/g, '');
}

function normalizeIsoDate(value: unknown) {
  if (!value) return '';
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  return '';
}

function snapshotDateFromFile(fileName: string, parsed: ParsedSource) {
  const base = fileName.replace(/\.[^.]+$/, '');
  const match = base.match(/(?:^|[^0-9])(\d{1,2})[._\-\s](\d{1,2})(?:[._\-\s](\d{2,4}))?(?:$|[^0-9])/);
  if (match) {
    const years = parsed.rows.map(row => normalizeIsoDate(rowTyped(row, 'order_date')).slice(0, 4)).filter(year => /^\d{4}$/.test(year));
    const inferredYear = years.sort().at(-1) || String(new Date().getFullYear());
    const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : inferredYear;
    return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  return parsed.rows.map(row => normalizeIsoDate(rowTyped(row, 'order_date'))).filter(Boolean).sort().at(-1) || '';
}

function rowMoney(row: ParsedSource['rows'][number]) {
  const value = Number(rowTyped(row, 'net_value') ?? 0);
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function acceptCurrentPortfolioAsBaseline(parsed: ParsedSource, fileName: string, fileHash: string) {
  const acceptedRows = parsed.rows.filter(row => Boolean(normalizeOrderNumber(rowTyped(row, 'industry_order_number'))));
  const snapshotDate = snapshotDateFromFile(fileName, parsed);
  const snapshot: PortfolioContinuitySnapshot = {
    id: 'portfolio-continuity',
    source: 'CARTEIRA 24.08.xlsx',
    fileName,
    fileHash,
    snapshotDate,
    orderNumbers: [...new Set(acceptedRows.map(row => normalizeOrderNumber(rowTyped(row, 'industry_order_number'))).filter(Boolean))].sort(),
    rawRows: parsed.rows.length,
    acceptedRows: acceptedRows.length,
    rawValue: parsed.rows.reduce((sum, row) => sum + rowMoney(row), 0),
    acceptedValue: acceptedRows.reduce((sum, row) => sum + rowMoney(row), 0),
    mode: 'BASELINE_CURRENT',
    updatedAt: new Date().toISOString(),
  };
  return { parsed: { ...parsed, rows: acceptedRows }, snapshot };
}

export type SourceUpdateProgress = {
  source: string;
  label: string;
  index: number;
  total: number;
  phase: 'HASHING' | 'PARSING' | 'STORING' | 'BUILDING' | 'DONE';
  message: string;
};

export type SourceUpdateResult = {
  active: ActiveCanonicalBundle | null;
  updated: string[];
  unchanged: string[];
  rejected: Array<{ source: string; fileName: string; errors: string[] }>;
  missing: string[];
  manifests: SourceStageManifest[];
  sourceDiagnostics?: SourceBuildDiagnostic[];
  blocking?: {
    hardMissing: string[];
    replacementRequired: string[];
    reviewRequired: string[];
    coverageBroken: string[];
  };
};

export type IncrementalBase = {
  active: ActiveCanonicalBundle;
  lists: Record<CanonicalList['id'], CanonicalList>;
};

const INCREMENTAL_PORTFOLIO_SOURCES = new Set(['CARTEIRA 24.08.xlsx', 'entrada-notas-218.xls', '12.322.txt']);

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STAGING_STORE)) database.createObjectStore(STAGING_STORE, { keyPath: 'source' });
      if (!database.objectStoreNames.contains(BUILDS_STORE)) database.createObjectStore(BUILDS_STORE, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(LISTS_STORE)) database.createObjectStore(LISTS_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('SOURCE_STORAGE_UNAVAILABLE'));
  });
}

async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const database = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = database.transaction(store, 'readonly').objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error ?? new Error('SOURCE_STORAGE_READ_FAILED'));
    });
  } finally { database.close(); }
}

async function idbPut<T>(store: string, value: T): Promise<void> {
  const database = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(store, 'readwrite');
      transaction.objectStore(store).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('SOURCE_STORAGE_WRITE_FAILED'));
    });
  } finally { database.close(); }
}

async function idbGetAll<T>(store: string): Promise<T[]> {
  const database = await openDb();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const request = database.transaction(store, 'readonly').objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error ?? new Error('SOURCE_STORAGE_READ_FAILED'));
    });
  } finally { database.close(); }
}

export function validateSourceStorageSnapshot(snapshot: SourceStorageSnapshot) {
  if (!snapshot || (snapshot.format !== 'blue-jacket-source-storage/v1' && snapshot.format !== 'blue-jacket-source-storage/v2') || !Array.isArray(snapshot.staging)) throw new Error('SYNC_SOURCE_SNAPSHOT_INVALID');
  if (snapshot.staging.some(entry => !entry?.source || !entry.manifest?.fileHash || !entry.parsed?.source)) throw new Error('SYNC_SOURCE_SNAPSHOT_INVALID');
  if (snapshot.staging.some(entry => !SUPPORTED_SOURCE_IDS.includes(entry.source))) throw new Error('SYNC_SOURCE_SNAPSHOT_INVALID');
  if (new Set(snapshot.staging.map(entry => entry.source)).size !== snapshot.staging.length) throw new Error('SYNC_SOURCE_SNAPSHOT_INVALID');
  const required = snapshot.format === 'blue-jacket-source-storage/v1' ? REQUIRED_SOURCE_IDS : HARD_REQUIRED_SOURCE_IDS;
  if (required.some(source => !snapshot.staging.some(stage => stage.source === source))) throw new Error('SYNC_SOURCES_INCOMPLETE');
  if (snapshot.staging.some(stage => stage.manifest.status !== 'VALID' || stage.manifest.parserVersion !== parserVersionFor(stage.source) || stage.manifest.schemaVersion !== SCHEMA_VERSION)) throw new Error('SYNC_SOURCE_SNAPSHOT_OUTDATED');
  return snapshot;
}

async function replaceSourceStorage(snapshot: SourceStorageSnapshot) {
  const database = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STAGING_STORE, BUILDS_STORE, LISTS_STORE], 'readwrite');
      const staging = transaction.objectStore(STAGING_STORE);
      const builds = transaction.objectStore(BUILDS_STORE);
      const lists = transaction.objectStore(LISTS_STORE);
      staging.clear(); builds.clear(); lists.clear();
      for (const entry of snapshot.staging) staging.put(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('SOURCE_STORAGE_RESTORE_FAILED'));
      transaction.onabort = () => reject(transaction.error ?? new Error('SOURCE_STORAGE_RESTORE_ABORTED'));
    });
  } finally { database.close(); }
}

export async function exportSourceStorageSnapshot(): Promise<SourceStorageSnapshotV2> {
  const staging = await idbGetAll<StoredStage>(STAGING_STORE);
  const snapshot: SourceStorageSnapshotV2 = { format: 'blue-jacket-source-storage/v2', exportedAt: new Date().toISOString(), staging };
  validateSourceStorageSnapshot(snapshot);
  return snapshot;
}

export async function restoreSourceStorageSnapshot(snapshot: SourceStorageSnapshot) {
  validateSourceStorageSnapshot(snapshot);
  await replaceSourceStorage(snapshot);
}

async function sha256Bytes(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const copy = new Uint8Array(view.byteLength); copy.set(view);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function fileHash(file: File) { return sha256Bytes(await file.arrayBuffer()); }

function normalizedFileName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const FILE_MATCHERS: Array<[string, RegExp]> = [
  ['379 25.txt', /\b379\b.*\b(25|2025)\b/],
  ['379 26.txt', /\b379\b.*\b(26|2026)\b/],
  ['310 total 2026.txt', /\b310\b/],
  ['12.322.txt', /\b12\s*322\b|\b12322\b/],
  ['vendas-8022.xls', /\b8022\b/],
  ['posicao-estoque-105.xls', /\b105\b/],
  ['cadastro-itens-286.xls', /\b286\b/],
  ['estoque-8013.xls', /\b8013\b/],
  ['entrada-notas-218.xls', /\b218\b/],
  ['pctabpr 13.xlsx', /\bpctabpr\b/],
  ['Lista_de_Preco (8).xlsx', /\blista\b.*\bpreco\b|\btabela\b.*\bpreco\b/],
  ['lançamentos.xlsx', /\blancamentos?\b/],
  ['NOVOS RCAS.xlsx', /\bnovos?\b.*\brcas?\b/],
  ['Nova Base de Premissas - Q3.xlsx', /\bpremissas?\b/],
  ['relatorio_carteira_clientes.xls', /\bcarteira\b.*\bclientes?\b/],
  ["08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx", /\broteiro\b.*\btop\b|\btop\b.*\bvarej/],
  ['Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx', /\bbussola\b/],
  ["Sortimento Recomendado - Q3'26.xlsx", /\bsortimento\b/],
  ['CARTEIRA 24.08.xlsx', /\bcarteira\b/],
];

export function detectSourceForFileName(fileName: string) {
  const normalized = normalizedFileName(fileName);
  return FILE_MATCHERS.find(([, matcher]) => matcher.test(normalized))?.[0] ?? null;
}

export async function loadSourceStagingManifests() {
  const stages = await idbGetAll<StoredStage>(STAGING_STORE);
  return stages.map(stage => stage.manifest).sort((a, b) => SUPPORTED_SOURCE_IDS.indexOf(a.source) - SUPPORTED_SOURCE_IDS.indexOf(b.source));
}

export async function loadSourceStaging(source: string) { return idbGet<StoredStage>(STAGING_STORE, source); }

/**
 * Reads the full physical source inventory through one IndexedDB snapshot.
 * Administration pages must use this instead of opening one connection per
 * source: a remount can then render loading/error explicitly and can never
 * mistake an unfinished hydration for an empty 0/19 inventory.
 */
export async function loadSourceStagingSnapshot() {
  const stages = await idbGetAll<StoredStage>(STAGING_STORE);
  stages.sort((a, b) => SUPPORTED_SOURCE_IDS.indexOf(a.source) - SUPPORTED_SOURCE_IDS.indexOf(b.source));
  return {
    stages,
    manifests: stages.map(stage => stage.manifest),
  };
}

export async function requestPersistentSourceStorage() {
  const estimate = await navigator.storage?.estimate?.();
  const persisted = navigator.storage?.persist ? await navigator.storage.persist() : false;
  return { persisted, quota: estimate?.quota ?? null, usage: estimate?.usage ?? null };
}

async function stageOne(source: string, file: File, onProgress?: (progress: SourceUpdateProgress) => void, index = 1, total = 1) {
  const label = SOURCE_LABELS[source] ?? source;
  const parserVersion = parserVersionFor(source);
  onProgress?.({ source, label, index, total, phase: 'HASHING', message: `Calculando hash de ${file.name}` });
  const hash = await fileHash(file);
  const previous = await loadSourceStaging(source);
  if (previous?.manifest.fileHash === hash && previous.manifest.status === 'VALID' && previous.manifest.parserVersion === parserVersion && previous.manifest.schemaVersion === SCHEMA_VERSION) return { status: 'UNCHANGED' as const, manifest: previous.manifest };

  onProgress?.({ source, label, index, total, phase: 'PARSING', message: `Validando ${file.name}` });
  let parsed = await parseSource(source, file);
  const blocking = parsed.audits.filter(audit => audit.severity === 'BLOCKED' || audit.severity === 'BLOCKED_DEPENDENT_CALC');
  if (blocking.length) return { status: 'REJECTED' as const, errors: blocking.map(audit => `${audit.code}: ${audit.message}`), parsed };

  let portfolioSnapshot: PortfolioContinuitySnapshot | undefined;
  if (source === 'CARTEIRA 24.08.xlsx') {
    const continuity = acceptCurrentPortfolioAsBaseline(parsed, file.name, hash);
    parsed = continuity.parsed;
    portfolioSnapshot = continuity.snapshot;
  }

  const manifest: SourceStageManifest = {
    source,
    fileName: file.name,
    fileHash: hash,
    parserVersion,
    schemaVersion: SCHEMA_VERSION,
    parsedRows: parsed.rows.length,
    warnings: parsed.audits.filter(audit => audit.severity === 'WARNING' || audit.severity === 'INFO').length,
    errors: 0,
    updatedAt: new Date().toISOString(),
    status: 'VALID',
  };
  onProgress?.({ source, label, index, total, phase: 'STORING', message: `Persistindo staging de ${label}` });
  await idbPut<StoredStage>(STAGING_STORE, { source, manifest, parsed });
  if (portfolioSnapshot) await idbPut<PortfolioContinuitySnapshot>(BUILDS_STORE, portfolioSnapshot);
  return { status: 'VALID' as const, manifest };
}

/** Legacy v20 physical identity retained only for migration/tests. */
async function stagingManifestHash(stages: StoredStage[]) {
  const compact = REQUIRED_SOURCE_IDS.map(source => {
    const stage = stages.find(candidate => candidate.source === source);
    return [source, stage?.manifest.fileHash ?? '', stage?.manifest.parserVersion ?? '', stage?.manifest.schemaVersion ?? ''];
  });
  return sha256Bytes(new TextEncoder().encode(JSON.stringify(compact)));
}

function factTypeCounts(m3: CanonicalList) {
  const counts: ActiveCanonicalBundle['factTypeCounts'] = { SALE: 0, INBOUND_ORDER: 0, RECEIPT: 0, TARGET: 0 };
  for (const record of m3.records) {
    const fact = String(record.fact_type ?? '') as keyof typeof counts;
    if (fact in counts) counts[fact] += 1;
  }
  return counts;
}

function sameSourceReplacements(a: ActiveCanonicalBundle['sourceReplacements'], b: ActiveCanonicalBundle['sourceReplacements']) {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

function completeIdentityMatches(a: ActiveCanonicalBundle, b: ActiveCanonicalBundle) {
  return a.motorBuildId === b.motorBuildId
    && a.stagingManifestHash === b.stagingManifestHash
    && a.adminRegistryHash === b.adminRegistryHash
    && a.rcaTargetRegistryHash === b.rcaTargetRegistryHash
    && a.sourceContractVersion === b.sourceContractVersion
    && a.sourceReplacementProofHash === b.sourceReplacementProofHash
    && sameSourceReplacements(a.sourceReplacements, b.sourceReplacements)
    && a.canonicalInputHash === b.canonicalInputHash
    && a.engineVersion === b.engineVersion
    && a.schemaVersion === b.schemaVersion;
}

async function saveGeneratedBuild(active: ActiveCanonicalBundle, lists: Record<CanonicalList['id'], CanonicalList>, sourceHashes: Record<string, string>) {
  if (!active.adminRegistryHash || !active.rcaTargetRegistryHash || !active.canonicalInputHash || active.sourceContractVersion !== SOURCE_CONTRACT_VERSION || !active.sourceReplacementProofHash || !Array.isArray(active.sourceReplacements) || active.engineVersion !== CANONICAL_ENGINE_VERSION) throw new Error('CANONICAL_BUILD_IDENTITY_INCOMPLETE');
  const build: StoredBuild = {
    id: active.motorBuildId,
    active,
    generatedAt: new Date().toISOString(),
    sourceHashes,
    stagingManifestHash: active.stagingManifestHash,
    adminRegistryHash: active.adminRegistryHash,
    rcaTargetRegistryHash: active.rcaTargetRegistryHash,
    sourceReplacementProofHash: active.sourceReplacementProofHash,
    canonicalInputHash: active.canonicalInputHash,
  };
  await idbPut(BUILDS_STORE, build);
  for (const [listId, list] of Object.entries(lists) as Array<[CanonicalList['id'], CanonicalList]>) {
    await idbPut<StoredList>(LISTS_STORE, { id: `${active.motorBuildId}:${listId}`, buildId: active.motorBuildId, listId, list });
  }
  const verified = await idbGet<StoredBuild>(BUILDS_STORE, active.motorBuildId);
  if (!verified || !completeIdentityMatches(verified.active, active)
    || verified.stagingManifestHash !== active.stagingManifestHash
    || verified.adminRegistryHash !== active.adminRegistryHash
    || verified.rcaTargetRegistryHash !== active.rcaTargetRegistryHash
    || verified.sourceReplacementProofHash !== active.sourceReplacementProofHash
    || verified.canonicalInputHash !== active.canonicalInputHash) throw new Error('CANONICAL_BUILD_STORAGE_VERIFY_FAILED');
}

function activeFromLists(
  lists: Record<CanonicalList['id'], CanonicalList>,
  sourceHash: string,
  registryHash: string,
  targetHash: string,
  inputHash: string,
  replacementProofHash = EMPTY_SOURCE_REPLACEMENT_PROOF,
  sourceReplacements: Array<{ source: string; scope: string }> = [],
) {
  const motorBuildId = `motor-browser-${Date.now()}-${inputHash.slice(0, 10)}`;
  const rowCounts = Object.fromEntries(Object.entries(lists).map(([id, list]) => [id, list.records.length])) as ActiveCanonicalBundle['rowCounts'];
  return {
    status: 'ACTIVE', motorBuildId, stagingManifestHash: sourceHash, adminRegistryHash: registryHash, rcaTargetRegistryHash: targetHash, canonicalInputHash: inputHash,
    sourceContractVersion: SOURCE_CONTRACT_VERSION,
    sourceReplacementProofHash: replacementProofHash,
    sourceReplacements,
    schemaVersion: SCHEMA_VERSION, engineVersion: CANONICAL_ENGINE_VERSION,
    approvedAt: new Date().toISOString(), rowCounts, factTypeCounts: factTypeCounts(lists.M3_MOVIMENTO_VENDAS),
  } satisfies ActiveCanonicalBundle;
}

async function currentStages() {
  const stages: StoredStage[] = [];
  const outdated: string[] = [];
  for (const source of SUPPORTED_SOURCE_IDS) {
    const stage = await loadSourceStaging(source);
    if (stage?.manifest.status === 'VALID') {
      if (stage.manifest.parserVersion !== parserVersionFor(source) || stage.manifest.schemaVersion !== SCHEMA_VERSION) outdated.push(source);
      else stages.push(stage);
    }
  }
  const hardMissing = HARD_REQUIRED_SOURCE_IDS.filter(source => !stages.some(stage => stage.source === source) && !outdated.includes(source));
  return { stages, outdated, hardMissing };
}

async function registryForBuild(override?: AdminRegistryState | null) {
  return override === undefined ? loadAdminRegistryState() : override;
}

function targetForBuild(override?: TargetState | null) {
  if (override !== undefined) return override;
  const current = loadTargetState();
  if (current) return current;
  return bootstrapTargetStateFromReportSettings(loadReportSettings()).state;
}

function replacementForBuild(override?: SourceReplacementState | null) {
  return override === undefined ? loadSourceReplacementState() : override;
}

async function buildIncrementalPortfolioUpdate(
  base: IncrementalBase,
  changedStages: StoredStage[],
  allStages: StoredStage[],
  registry: AdminRegistryState | null,
  registryHash: string,
  targetState: TargetState | null,
  targetHash: string,
  replacementState: SourceReplacementState | null,
) {
  if (base.active.engineVersion !== CANONICAL_ENGINE_VERSION || base.active.adminRegistryHash !== registryHash || base.active.rcaTargetRegistryHash !== targetHash || !base.active.canonicalInputHash || base.active.sourceContractVersion !== SOURCE_CONTRACT_VERSION || !base.active.sourceReplacementProofHash) throw new Error('INCREMENTAL_BASE_IDENTITY_MISMATCH');
  const effective = assertEffectiveSourceSetReady(resolveEffectiveSourceSet({ physicalStages: allStages, replacementState, adminRegistryState: registry, targetState }));
  const proofHash = await sourceReplacementProofHash(effective.certificates);
  const replacements = sourceReplacementsFromCertificates(effective.certificates);
  if (base.active.sourceReplacementProofHash !== proofHash || !sameSourceReplacements(base.active.sourceReplacements, replacements)) throw new Error('INCREMENTAL_BASE_IDENTITY_MISMATCH');
  const changed = new Set(changedStages.map(stage => stage.source));
  const patch = buildCanonicalBundleFromStaging(changedStages.map(stage => stage.parsed)).lists;
  const m3 = base.lists.M3_MOVIMENTO_VENDAS;
  const m4 = base.lists.M4_HISTORICO_TRANSICAO;
  let m3Records = [...m3.records];
  let m4Records = [...m4.records];
  if (changed.has('CARTEIRA 24.08.xlsx')) {
    m3Records = m3Records.filter(record => record.source !== 'CARTEIRA_COLGATE');
    m3Records.push(...patch.M3_MOVIMENTO_VENDAS.records.filter(record => record.source === 'CARTEIRA_COLGATE'));
  }
  if (changed.has('entrada-notas-218.xls')) {
    m3Records = m3Records.filter(record => record.source !== '218');
    m3Records.push(...patch.M3_MOVIMENTO_VENDAS.records.filter(record => record.source === '218'));
  }
  if (changed.has('12.322.txt')) {
    m4Records = m4Records.filter(record => record.row_type !== 'RECEIPT_12322');
    m4Records.push(...patch.M4_HISTORICO_TRANSICAO.records.filter(record => record.row_type === 'RECEIPT_12322'));
  }
  const generatedAt = new Date().toISOString();
  const lists = {
    ...base.lists,
    M3_MOVIMENTO_VENDAS: { ...m3, records: m3Records, generatedAt },
    M4_HISTORICO_TRANSICAO: { ...m4, records: m4Records, generatedAt },
  };
  const sourceHash = await stagingManifestHashV2(allStages, effective.omitted);
  const inputHash = await canonicalInputHashV3(sourceHash, registryHash, targetHash, proofHash);
  const active = activeFromLists(lists, sourceHash, registryHash, targetHash, inputHash, proofHash, replacements);
  await saveGeneratedBuild(active, lists, Object.fromEntries(allStages.map(stage => [stage.source, stage.manifest.fileHash])));
  return active;
}

export async function buildCanonicalFromStoredSources(
  onProgress?: (progress: SourceUpdateProgress) => void,
  registryOverride?: AdminRegistryState | null,
  targetOverride?: TargetState | null,
  replacementOverride?: SourceReplacementState | null,
) {
  const current = await currentStages();
  if (current.outdated.length) throw new Error(`SOURCES_OUTDATED:${current.outdated.join('|')}`);
  if (current.hardMissing.length) throw new Error(`HARD_MISSING:${current.hardMissing.join('|')}`);

  const registry = await registryForBuild(registryOverride);
  const targetState = targetForBuild(targetOverride);
  const replacementState = replacementForBuild(replacementOverride);
  const effective = assertEffectiveSourceSetReady(resolveEffectiveSourceSet({ physicalStages: current.stages, replacementState, adminRegistryState: registry, targetState }));
  const proofHash = await sourceReplacementProofHash(effective.certificates);
  const replacements = sourceReplacementsFromCertificates(effective.certificates);
  const sourceHash = await stagingManifestHashV2(current.stages, effective.omitted);
  const registryHash = await canonicalAdminRegistryHash(registry);
  const targetHash = await rcaTargetRegistryHash(targetState);
  const inputHash = await canonicalInputHashV3(sourceHash, registryHash, targetHash, proofHash);

  onProgress?.({ source: 'ALL', label: 'Motores canônicos', index: SUPPORTED_SOURCE_IDS.length, total: SUPPORTED_SOURCE_IDS.length, phase: 'BUILDING', message: `Gerando M1–M4 v21 com ${HARD_REQUIRED_SOURCE_IDS.length} hard-required e ${replacements.length} substituição(ões) certificada(s)` });
  const parsedSources = effective.canonicalStages.map(stage => stage.parsed);
  const bundle = buildCanonicalBundleFromStaging(parsedSources);
  applyAdminRegistryCanonicalAuthority(bundle, parsedSources, registry);
  bundle.lists.M3_MOVIMENTO_VENDAS = applyTargetAuthorityToM3(bundle.lists.M3_MOVIMENTO_VENDAS, parsedSources, targetState, registry);
  bundle.lists.M2_CLIENTE_RCA = materializeTopRetailRouteInM2(bundle.lists.M2_CLIENTE_RCA, parsedSources, registry);
  const lists = bundle.lists;
  const active = activeFromLists(lists, sourceHash, registryHash, targetHash, inputHash, proofHash, replacements);
  await saveGeneratedBuild(active, lists, Object.fromEntries(current.stages.map(stage => [stage.source, stage.manifest.fileHash])));
  return active;
}

export async function requiredSourcesForBuild(
  registryOverride?: AdminRegistryState | null,
  targetOverride?: TargetState | null,
  replacementOverride?: SourceReplacementState | null,
) {
  const current = await currentStages();
  const registry = await registryForBuild(registryOverride);
  const targetState = targetForBuild(targetOverride);
  const replacementState = replacementForBuild(replacementOverride);
  const effective = resolveEffectiveSourceSet({ physicalStages: current.stages, replacementState, adminRegistryState: registry, targetState });
  return {
    hardRequired: [...HARD_REQUIRED_SOURCE_IDS],
    conditionalRequired: effective.diagnostics.filter(item => item.status === 'PHYSICAL' || item.status === 'REPLACEMENT_REQUIRED').map(item => item.sourceId),
    diagnostics: effective.diagnostics,
  };
}

export async function processSourceUpdates(filesBySource: Partial<Record<string, File>>, onProgress?: (progress: SourceUpdateProgress) => void, incrementalBase?: IncrementalBase): Promise<SourceUpdateResult> {
  const selected = Object.entries(filesBySource).filter((entry): entry is [string, File] => entry[1] instanceof File);
  const updated: string[] = []; const unchanged: string[] = []; const rejected: SourceUpdateResult['rejected'] = [];
  for (let i = 0; i < selected.length; i += 1) {
    const [source, file] = selected[i];
    const staged = await stageOne(source, file, onProgress, i + 1, selected.length);
    if (staged.status === 'VALID') updated.push(source);
    else if (staged.status === 'UNCHANGED') unchanged.push(source);
    else rejected.push({ source, fileName: file.name, errors: staged.errors });
  }

  const current = await currentStages();
  const manifests = await loadSourceStagingManifests();
  if (rejected.length || current.outdated.length || current.hardMissing.length) {
    const missing = [...current.hardMissing, ...current.outdated];
    return { active: null, updated, unchanged, rejected, missing, manifests, blocking: { hardMissing: missing, replacementRequired: [], reviewRequired: [], coverageBroken: [] } };
  }

  const registry = await loadAdminRegistryState();
  const targetState = targetForBuild();
  const replacementState = replacementForBuild();
  const effective = resolveEffectiveSourceSet({ physicalStages: current.stages, replacementState, adminRegistryState: registry, targetState });
  const blocking = {
    hardMissing: effective.hardMissing,
    replacementRequired: effective.replacementRequired,
    reviewRequired: effective.reviewRequired,
    coverageBroken: effective.coverageBroken,
  };
  const missing = [...blocking.hardMissing, ...blocking.replacementRequired, ...blocking.reviewRequired, ...blocking.coverageBroken];
  if (missing.length) return { active: null, updated, unchanged, rejected, missing, manifests, sourceDiagnostics: effective.diagnostics, blocking };

  const registryHash = await canonicalAdminRegistryHash(registry);
  const targetHash = await rcaTargetRegistryHash(targetState);
  const proofHash = await sourceReplacementProofHash(effective.certificates);
  const replacements = sourceReplacementsFromCertificates(effective.certificates);
  const canPatchActivePortfolio = Boolean(incrementalBase)
    && selected.length > 0
    && selected.every(([source]) => INCREMENTAL_PORTFOLIO_SOURCES.has(source))
    && incrementalBase!.active.engineVersion === CANONICAL_ENGINE_VERSION
    && incrementalBase!.active.adminRegistryHash === registryHash
    && incrementalBase!.active.rcaTargetRegistryHash === targetHash
    && incrementalBase!.active.sourceReplacementProofHash === proofHash
    && sameSourceReplacements(incrementalBase!.active.sourceReplacements, replacements);

  let active: ActiveCanonicalBundle;
  if (canPatchActivePortfolio) {
    onProgress?.({ source: 'ALL', label: 'Carteira', index: selected.length, total: selected.length, phase: 'BUILDING', message: 'Atualizando Carteira, 218 e 12.322 sobre build v21 com identidade de substituição inalterada' });
    const changedStages = (await Promise.all(selected.map(([source]) => loadSourceStaging(source)))).filter((stage): stage is StoredStage => Boolean(stage));
    active = await buildIncrementalPortfolioUpdate(incrementalBase!, changedStages, current.stages, registry, registryHash, targetState, targetHash, replacementState);
  } else {
    active = await buildCanonicalFromStoredSources(onProgress, registry, targetState, replacementState);
  }
  onProgress?.({ source: 'ALL', label: 'Atualização', index: selected.length, total: selected.length, phase: 'DONE', message: `Novo build ${active.motorBuildId} pronto para ativação` });
  return { active, updated, unchanged, rejected, missing: [], manifests: await loadSourceStagingManifests(), sourceDiagnostics: effective.diagnostics, blocking };
}

export async function loadGeneratedCanonicalBuild(buildId: string) { return idbGet<StoredBuild>(BUILDS_STORE, buildId); }
export async function generatedBuildMatchesActive(active: ActiveCanonicalBundle) {
  const build = await loadGeneratedCanonicalBuild(active.motorBuildId);
  return Boolean(build && completeIdentityMatches(build.active, active));
}
export async function hasGeneratedCanonicalBuild(buildId: string) { return Boolean(await loadGeneratedCanonicalBuild(buildId)); }
export async function loadGeneratedCanonicalList(buildId: string, listId: CanonicalList['id']) {
  const stored = await idbGet<StoredList>(LISTS_STORE, `${buildId}:${listId}`);
  if (!stored) throw new Error(`GENERATED_LIST_NOT_FOUND:${listId}`);
  return stored.list;
}
export async function loadGeneratedCanonicalListForActive(active: ActiveCanonicalBundle, listId: CanonicalList['id']) {
  if (!(await generatedBuildMatchesActive(active))) throw new Error('GENERATED_BUILD_IDENTITY_MISMATCH');
  return loadGeneratedCanonicalList(active.motorBuildId, listId);
}
export async function loadGeneratedCanonicalManifest(buildId: string) {
  const build = await loadGeneratedCanonicalBuild(buildId);
  if (!build) throw new Error('GENERATED_BUILD_NOT_FOUND');
  const ids: CanonicalList['id'][] = ['M1_ITEM_ESTOQUE', 'M2_CLIENTE_RCA', 'M3_MOVIMENTO_VENDAS', 'M4_HISTORICO_TRANSICAO'];
  const lists = {} as Record<string, { rowCount: number; warnings: number; errors: number }>;
  for (const id of ids) {
    const list = await loadGeneratedCanonicalList(buildId, id);
    lists[id] = { rowCount: list.records.length, warnings: list.warnings.length, errors: list.errors.length };
  }
  return {
    status: 'VALID', generatedAt: build.generatedAt, lists,
    motorBuildId: build.active.motorBuildId,
    stagingManifestHash: build.active.stagingManifestHash,
    adminRegistryHash: build.active.adminRegistryHash ?? null,
    rcaTargetRegistryHash: build.active.rcaTargetRegistryHash ?? null,
    sourceContractVersion: build.active.sourceContractVersion ?? null,
    sourceReplacementProofHash: build.active.sourceReplacementProofHash ?? null,
    sourceReplacements: build.active.sourceReplacements ?? [],
    canonicalInputHash: build.active.canonicalInputHash ?? null,
    schemaVersion: build.active.schemaVersion,
    engineVersion: build.active.engineVersion,
  };
}

export const sourceImportTestHelpers = {
  normalizedFileName,
  sha256Bytes,
  parserVersionFor,
  acceptCurrentPortfolioAsBaseline,
  snapshotDateFromFile,
  normalizeOrderNumber,
  stagingManifestHash,
  stagingManifestHashV2,
  activeFromLists,
  completeIdentityMatches,
  currentStages,
};
