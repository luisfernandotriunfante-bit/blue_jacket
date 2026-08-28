import { SOURCE_IDS, parseSource } from './parsers';
import { buildCanonicalBundleFromStaging } from './motors';
import { materializeTopRetailRouteInM2 } from './topRetailM2';
import type { ActiveCanonicalBundle } from './runtime';
import type { CanonicalList, ParsedSource } from './types';

const DB_NAME = 'blue-jacket-v4-source-import';
const DB_VERSION = 1;
const STAGING_STORE = 'staging';
const BUILDS_STORE = 'builds';
const LISTS_STORE = 'lists';
const DEFAULT_PARSER_VERSION = 'browser-v1';
const SOURCE_PARSER_VERSIONS: Record<string, string> = {
  '310 total 2026.txt': 'browser-v2-rca310',
  "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx": 'browser-v2-route-sheet-scope',
  'entrada-notas-218.xls': 'browser-v2-invoice-registry',
  'CARTEIRA 24.08.xlsx': 'browser-v4-portfolio-baseline-current',
};
const SCHEMA_VERSION = 'v1';
const ENGINE_VERSION = 'browser-stage3-top-retail-v3';
const parserVersionFor = (source: string) => SOURCE_PARSER_VERSIONS[source] ?? DEFAULT_PARSER_VERSION;

export const REQUIRED_SOURCE_IDS = [...new Set(SOURCE_IDS)];

export const SOURCE_LABELS: Record<string, string> = {
  'cadastro-itens-286.xls': 'Cadastro de itens 286',
  'posicao-estoque-105.xls': 'Posição de estoque 105',
  'estoque-8013.xls': 'Estoque / logística 8013',
  'pctabpr 13.xlsx': 'PCTABPR',
  'Lista_de_Preco (8).xlsx': 'Lista de Preço',
  'lançamentos.xlsx': 'Lançamentos',
  "Sortimento Recomendado - Q3'26.xlsx": 'Sortimento Q3',
  'Nova Base de Premissas - Q3.xlsx': 'Premissas',
  'NOVOS RCAS.xlsx': 'Novos RCAs',
  'relatorio_carteira_clientes.xls': 'Carteira / Base de Clientes',
  "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx": 'Roteiro Top',
  'vendas-8022.xls': 'Vendas 8022',
  'CARTEIRA 24.08.xlsx': 'Carteira Colgate',
  'entrada-notas-218.xls': 'Recebimentos 218',
  'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx': 'Bússola',
  '379 25.txt': '379 — 2025',
  '379 26.txt': '379 — 2026',
  '310 total 2026.txt': '310 total 2026',
  '12.322.txt': '12.322',
};

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

type StoredStage = { source: string; manifest: SourceStageManifest; parsed: ParsedSource };
type StoredBuild = { id: string; active: ActiveCanonicalBundle; generatedAt: string; sourceHashes: Record<string, string> };
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

const PORTFOLIO_CONTINUITY_KEY = 'portfolio-continuity';
const PORTFOLIO_BOOTSTRAP_DATE = '2026-08-17';
const PORTFOLIO_BOOTSTRAP_ORDERS = [
  '1160096370','1160102681','1160103178','1160103179','1160103180','1160103181','1160103182','1160103183',
  '1160104097','1160104266','1160104267','1160104268','1160104269','1160104270','1160106125','1160106422',
  '1160106597','1160106601','1160106609','1160106670','1160106674','1160106733','1160108199','1160108200',
  '1160108201','1160108203','1160108206','1160109581',
];

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

function applyPortfolioContinuity(parsed: ParsedSource, fileName: string, fileHash: string, previous?: PortfolioContinuitySnapshot) {
  const anchorDate = previous?.snapshotDate || PORTFOLIO_BOOTSTRAP_DATE;
  const anchorOrders = new Set((previous?.orderNumbers?.length ? previous.orderNumbers : PORTFOLIO_BOOTSTRAP_ORDERS).map(normalizeOrderNumber));
  const acceptedRows = parsed.rows.filter(row => {
    const orderNumber = normalizeOrderNumber(rowTyped(row, 'industry_order_number'));
    const orderDate = normalizeIsoDate(rowTyped(row, 'order_date'));
    if (!orderNumber) return false;
    return anchorOrders.has(orderNumber) || Boolean(orderDate && orderDate > anchorDate);
  });
  const snapshotDate = snapshotDateFromFile(fileName, parsed) || anchorDate;
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
    mode: previous ? 'ROLL_FORWARD' : 'BOOTSTRAP_2026_08_17',
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
};

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
  return stages.map(stage => stage.manifest).sort((a, b) => REQUIRED_SOURCE_IDS.indexOf(a.source) - REQUIRED_SOURCE_IDS.indexOf(b.source));
}

export async function loadSourceStaging(source: string) { return idbGet<StoredStage>(STAGING_STORE, source); }

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
    const previousContinuity = await idbGet<PortfolioContinuitySnapshot>(BUILDS_STORE, PORTFOLIO_CONTINUITY_KEY);

    // Migração correta: se esta mesma fotografia já estava carregada antes da regra de continuidade
    // (ou foi filtrada uma única vez pelo bootstrap de 17/08), ela própria vira a baseline atual.
    // Assim a Carteira 24.08 é a verdade da fotografia corrente e o checkpoint antigo não força
    // o valor homologado de uma fotografia anterior. Somente cargas futuras usam roll-forward.
    const sameCurrentSnapshot = previous?.manifest.fileHash === hash;
    const bootstrapAppliedToThisSameFile = previousContinuity?.mode === 'BOOTSTRAP_2026_08_17'
      && previousContinuity.fileHash === hash;
    const continuity = (sameCurrentSnapshot || bootstrapAppliedToThisSameFile)
      ? acceptCurrentPortfolioAsBaseline(parsed, file.name, hash)
      : applyPortfolioContinuity(parsed, file.name, hash, previousContinuity);

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

async function saveGeneratedBuild(active: ActiveCanonicalBundle, lists: Record<CanonicalList['id'], CanonicalList>, sourceHashes: Record<string, string>) {
  const build: StoredBuild = { id: active.motorBuildId, active, generatedAt: new Date().toISOString(), sourceHashes };
  await idbPut(BUILDS_STORE, build);
  for (const [listId, list] of Object.entries(lists) as Array<[CanonicalList['id'], CanonicalList]>) {
    await idbPut<StoredList>(LISTS_STORE, { id: `${active.motorBuildId}:${listId}`, buildId: active.motorBuildId, listId, list });
  }
  const verified = await idbGet<StoredBuild>(BUILDS_STORE, active.motorBuildId);
  if (!verified || verified.active.stagingManifestHash !== active.stagingManifestHash) throw new Error('CANONICAL_BUILD_STORAGE_VERIFY_FAILED');
}

export async function buildCanonicalFromStoredSources(onProgress?: (progress: SourceUpdateProgress) => void) {
  const stages: StoredStage[] = [];
  const outdated: string[] = [];
  for (const source of REQUIRED_SOURCE_IDS) {
    const stage = await loadSourceStaging(source);
    if (stage?.manifest.status === 'VALID') {
      if (stage.manifest.parserVersion !== parserVersionFor(source) || stage.manifest.schemaVersion !== SCHEMA_VERSION) outdated.push(source);
      else stages.push(stage);
    }
  }
  const missing = REQUIRED_SOURCE_IDS.filter(source => !stages.some(stage => stage.source === source) && !outdated.includes(source));
  if (outdated.length) throw new Error(`SOURCES_OUTDATED:${outdated.join('|')}`);
  if (missing.length) throw new Error(`SOURCES_MISSING:${missing.join('|')}`);
  onProgress?.({ source: 'ALL', label: 'Motores canônicos', index: REQUIRED_SOURCE_IDS.length, total: REQUIRED_SOURCE_IDS.length, phase: 'BUILDING', message: 'Gerando M1, M2, M3 e M4 exclusivamente dos stagings persistidos' });
  const manifestHash = await stagingManifestHash(stages);
  const parsedSources = stages.map(stage => stage.parsed);
  const bundle = buildCanonicalBundleFromStaging(parsedSources);
  bundle.lists.M2_CLIENTE_RCA = materializeTopRetailRouteInM2(bundle.lists.M2_CLIENTE_RCA, parsedSources);
  const lists = bundle.lists;
  const motorBuildId = `motor-browser-${Date.now()}-${manifestHash.slice(0, 10)}`;
  const rowCounts = Object.fromEntries(Object.entries(lists).map(([id, list]) => [id, list.records.length])) as ActiveCanonicalBundle['rowCounts'];
  const active: ActiveCanonicalBundle = {
    status: 'ACTIVE',
    motorBuildId,
    stagingManifestHash: manifestHash,
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    approvedAt: new Date().toISOString(),
    rowCounts,
    factTypeCounts: factTypeCounts(lists.M3_MOVIMENTO_VENDAS),
  };
  await saveGeneratedBuild(active, lists, Object.fromEntries(stages.map(stage => [stage.source, stage.manifest.fileHash])));
  return active;
}

export async function processSourceUpdates(filesBySource: Partial<Record<string, File>>, onProgress?: (progress: SourceUpdateProgress) => void): Promise<SourceUpdateResult> {
  const selected = Object.entries(filesBySource).filter((entry): entry is [string, File] => entry[1] instanceof File);
  const updated: string[] = []; const unchanged: string[] = []; const rejected: SourceUpdateResult['rejected'] = [];
  for (let i = 0; i < selected.length; i += 1) {
    const [source, file] = selected[i];
    const staged = await stageOne(source, file, onProgress, i + 1, selected.length);
    if (staged.status === 'VALID') updated.push(source);
    else if (staged.status === 'UNCHANGED') unchanged.push(source);
    else rejected.push({ source, fileName: file.name, errors: staged.errors });
  }
  const manifests = await loadSourceStagingManifests();
  const missing = REQUIRED_SOURCE_IDS.filter(source => !manifests.some(manifest => manifest.source === source && manifest.status === 'VALID'));
  if (rejected.length || missing.length) return { active: null, updated, unchanged, rejected, missing, manifests };
  const active = await buildCanonicalFromStoredSources(onProgress);
  onProgress?.({ source: 'ALL', label: 'Atualização', index: selected.length, total: selected.length, phase: 'DONE', message: `Novo build ${active.motorBuildId} pronto para ativação` });
  return { active, updated, unchanged, rejected, missing, manifests: await loadSourceStagingManifests() };
}

export async function hasGeneratedCanonicalBuild(buildId: string) { return Boolean(await idbGet<StoredBuild>(BUILDS_STORE, buildId)); }
export async function loadGeneratedCanonicalList(buildId: string, listId: CanonicalList['id']) {
  const stored = await idbGet<StoredList>(LISTS_STORE, `${buildId}:${listId}`);
  if (!stored) throw new Error(`GENERATED_LIST_NOT_FOUND:${listId}`);
  return stored.list;
}
export async function loadGeneratedCanonicalManifest(buildId: string) {
  const build = await idbGet<StoredBuild>(BUILDS_STORE, buildId);
  if (!build) throw new Error('GENERATED_BUILD_NOT_FOUND');
  const ids: CanonicalList['id'][] = ['M1_ITEM_ESTOQUE', 'M2_CLIENTE_RCA', 'M3_MOVIMENTO_VENDAS', 'M4_HISTORICO_TRANSICAO'];
  const lists = {} as Record<string, { rowCount: number; warnings: number; errors: number }>;
  for (const id of ids) {
    const list = await loadGeneratedCanonicalList(buildId, id);
    lists[id] = { rowCount: list.records.length, warnings: list.warnings.length, errors: list.errors.length };
  }
  return { status: 'VALID', generatedAt: build.generatedAt, lists };
}

export const sourceImportTestHelpers = { normalizedFileName, sha256Bytes, parserVersionFor, applyPortfolioContinuity, acceptCurrentPortfolioAsBaseline, snapshotDateFromFile, normalizeOrderNumber };
