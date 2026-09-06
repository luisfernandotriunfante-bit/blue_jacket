import { competenceFromParsedSource, isValidCompetenceId } from './competence';
import { code, digits, gtin, text } from './normalization';
import type { ParsedSource } from './types';

export const ADMIN_REGISTRY_FORMAT = 'blue-jacket-admin-registry/v1' as const;
export type AdminRegistryOrigin = 'SOURCE_SEED' | 'MANUAL';
export type RcaRole = 'PRINCIPAL' | 'AUXILIAR';
export type AdminRegistryKind = 'rcas' | 'launches' | 'topRetailers';

export type RegistryCommon = {
  id: string;
  active: boolean;
  origin: AdminRegistryOrigin;
  createdAt: string;
  updatedAt: string;
  note: string | null;
};

export type RcaRegistryRecord = RegistryCommon & {
  currentCode: string;
  legacyCode: string | null;
  name: string | null;
  coordinatorCode: string | null;
  coordinatorName: string | null;
  role: RcaRole;
  validFromCompetence: string | null;
  validToCompetence: string | null;
  sourceRow: number | null;
};

export type LaunchRegistryRecord = RegistryCommon & {
  winthorCode: string | null;
  ean: string | null;
  description: string | null;
  type: string | null;
  status: string | null;
  validFromCompetence: string | null;
  validToCompetence: string | null;
  sourceRow: number | null;
};

export type TopRetailRegistryRecord = RegistryCommon & {
  competence: string;
  customerCnpj: string;
  network: string;
  banner: string | null;
  managerCnpj: string | null;
  groupCode: string | null;
  category: string | null;
  topTarget: number | null;
  sourceRow: number | null;
};

export type AdminRegistryRecord = RcaRegistryRecord | LaunchRegistryRecord | TopRetailRegistryRecord;

export type RegistrySeedMetadata = {
  source: string;
  fileName: string;
  appliedAt: string;
  sourceRows: number;
  competence: string | null;
};

export type AdminRegistryState = {
  format: typeof ADMIN_REGISTRY_FORMAT;
  schemaVersion: 'v1';
  createdAt: string;
  updatedAt: string;
  rcas: RcaRegistryRecord[];
  launches: LaunchRegistryRecord[];
  topRetailers: TopRetailRegistryRecord[];
  lastSeed: {
    rcas: RegistrySeedMetadata | null;
    launches: RegistrySeedMetadata | null;
    topRetailers: RegistrySeedMetadata | null;
  };
};

export type RegistryDiagnostic = {
  code:
    | 'RCA_CURRENT_DIVERGENT'
    | 'RCA_LEGACY_AMBIGUOUS'
    | 'RCA_CODE_EMPTY'
    | 'RCA_VALIDITY_INVALID'
    | 'LAUNCH_EAN_AMBIGUOUS'
    | 'LAUNCH_WINTHOR_AMBIGUOUS'
    | 'LAUNCH_IDENTITY_MISSING'
    | 'LAUNCH_VALIDITY_INVALID'
    | 'TOP_CNPJ_INVALID'
    | 'TOP_COMPETENCE_INVALID'
    | 'TOP_DUPLICATE_DIVERGENT'
    | 'TOP_MANAGER_CNPJ_INVALID'
    | 'TOP_TARGET_INVALID';
  severity: 'CONFLICT' | 'ERROR';
  recordIds: string[];
  message: string;
};

export type SeedPreviewStatus = 'NEW' | 'UPDATABLE' | 'EQUAL' | 'CONFLICT' | 'MANUAL_PROTECTED' | 'MISSING_SOURCE';
export type RegistrySeedPreviewItem = {
  status: SeedPreviewStatus;
  businessKey: string;
  recordId: string | null;
  reason: string | null;
  record?: AdminRegistryRecord;
};
export type RegistrySeedPreview = {
  kind: AdminRegistryKind;
  source: string;
  fileName: string;
  competence: string | null;
  counts: {
    new: number;
    updatable: number;
    equal: number;
    conflicts: number;
    manualProtected: number;
    missingFromSource: number;
  };
  items: RegistrySeedPreviewItem[];
};

export type AdminRegistryStorage = {
  read: () => Promise<unknown | null>;
  write: (value: AdminRegistryState) => Promise<void>;
  clear: () => Promise<void>;
};

const nowIso = () => new Date().toISOString();
const validTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const validCompetenceOrNull = (value: unknown): value is string | null => value === null || isValidCompetenceId(value);
const validSourceRow = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(value: T): T => structuredClone(value);

function assertCommon(value: unknown): asserts value is RegistryCommon {
  if (!value || typeof value !== 'object') throw new Error('ADMIN_REGISTRY_RECORD_INVALID');
  const record = value as Partial<RegistryCommon>;
  if (typeof record.id !== 'string' || !record.id.trim()) throw new Error('ADMIN_REGISTRY_RECORD_INVALID');
  if (typeof record.active !== 'boolean' || (record.origin !== 'SOURCE_SEED' && record.origin !== 'MANUAL')) throw new Error('ADMIN_REGISTRY_RECORD_INVALID');
  if (!validTimestamp(record.createdAt) || !validTimestamp(record.updatedAt) || !nullableString(record.note)) throw new Error('ADMIN_REGISTRY_RECORD_INVALID');
}

function assertValidity(from: unknown, to: unknown) {
  if (!validCompetenceOrNull(from) || !validCompetenceOrNull(to)) throw new Error('ADMIN_REGISTRY_VALIDITY_INVALID');
  if (from && to && from > to) throw new Error('ADMIN_REGISTRY_VALIDITY_INVALID');
}

function validateRca(value: unknown): RcaRegistryRecord {
  assertCommon(value);
  const record = value as RcaRegistryRecord;
  if (typeof record.currentCode !== 'string' || !record.currentCode || !nullableString(record.legacyCode) || !nullableString(record.name) || !nullableString(record.coordinatorCode) || !nullableString(record.coordinatorName)) throw new Error('ADMIN_REGISTRY_RCA_INVALID');
  if (record.role !== 'PRINCIPAL' && record.role !== 'AUXILIAR') throw new Error('ADMIN_REGISTRY_RCA_INVALID');
  if (!validSourceRow(record.sourceRow)) throw new Error('ADMIN_REGISTRY_RCA_INVALID');
  assertValidity(record.validFromCompetence, record.validToCompetence);
  return clone(record);
}

function validStoredGtin(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^(\d{8}|\d{12,14})$/.test(value));
}

function validateLaunch(value: unknown): LaunchRegistryRecord {
  assertCommon(value);
  const record = value as LaunchRegistryRecord;
  if (!nullableString(record.winthorCode) || !validStoredGtin(record.ean) || !nullableString(record.description) || !nullableString(record.type) || !nullableString(record.status)) throw new Error('ADMIN_REGISTRY_LAUNCH_INVALID');
  if (!record.winthorCode && !record.ean) throw new Error('ADMIN_REGISTRY_LAUNCH_IDENTITY_REQUIRED');
  if (!validSourceRow(record.sourceRow)) throw new Error('ADMIN_REGISTRY_LAUNCH_INVALID');
  assertValidity(record.validFromCompetence, record.validToCompetence);
  return clone(record);
}

function validCnpj(value: unknown): value is string { return typeof value === 'string' && /^\d{14}$/.test(value); }
function validateTop(value: unknown): TopRetailRegistryRecord {
  assertCommon(value);
  const record = value as TopRetailRegistryRecord;
  if (!isValidCompetenceId(record.competence) || !validCnpj(record.customerCnpj) || typeof record.network !== 'string' || !record.network.trim()) throw new Error('ADMIN_REGISTRY_TOP_INVALID');
  if (!nullableString(record.banner) || !nullableString(record.groupCode) || !nullableString(record.category) || !validSourceRow(record.sourceRow)) throw new Error('ADMIN_REGISTRY_TOP_INVALID');
  if (record.managerCnpj !== null && !validCnpj(record.managerCnpj)) throw new Error('ADMIN_REGISTRY_TOP_MANAGER_INVALID');
  if (record.topTarget !== null && (typeof record.topTarget !== 'number' || !Number.isFinite(record.topTarget) || record.topTarget < 0)) throw new Error('ADMIN_REGISTRY_TOP_TARGET_INVALID');
  return clone(record);
}

function validateSeedMetadata(value: unknown): RegistrySeedMetadata | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('ADMIN_REGISTRY_SEED_METADATA_INVALID');
  const candidate = value as Partial<RegistrySeedMetadata>;
  if (typeof candidate.source !== 'string' || !candidate.source || typeof candidate.fileName !== 'string' || !candidate.fileName || !validTimestamp(candidate.appliedAt) || typeof candidate.sourceRows !== 'number' || !Number.isInteger(candidate.sourceRows) || candidate.sourceRows < 0 || !validCompetenceOrNull(candidate.competence)) throw new Error('ADMIN_REGISTRY_SEED_METADATA_INVALID');
  return clone(candidate as RegistrySeedMetadata);
}

function uniqueIds(records: Array<{ id: string }>) {
  if (new Set(records.map(record => record.id)).size !== records.length) throw new Error('ADMIN_REGISTRY_DUPLICATE_ID');
}

export function validateAdminRegistryState(value: unknown): AdminRegistryState {
  if (!value || typeof value !== 'object') throw new Error('ADMIN_REGISTRY_STATE_INVALID');
  const candidate = value as Partial<AdminRegistryState>;
  if (candidate.format !== ADMIN_REGISTRY_FORMAT || candidate.schemaVersion !== 'v1' || !validTimestamp(candidate.createdAt) || !validTimestamp(candidate.updatedAt)) throw new Error('ADMIN_REGISTRY_STATE_INVALID');
  if (!Array.isArray(candidate.rcas) || !Array.isArray(candidate.launches) || !Array.isArray(candidate.topRetailers) || !candidate.lastSeed || typeof candidate.lastSeed !== 'object') throw new Error('ADMIN_REGISTRY_STATE_INVALID');
  const rcas = candidate.rcas.map(validateRca);
  const launches = candidate.launches.map(validateLaunch);
  const topRetailers = candidate.topRetailers.map(validateTop);
  uniqueIds([...rcas, ...launches, ...topRetailers]);
  return {
    format: ADMIN_REGISTRY_FORMAT,
    schemaVersion: 'v1',
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    rcas,
    launches,
    topRetailers,
    lastSeed: {
      rcas: validateSeedMetadata(candidate.lastSeed.rcas),
      launches: validateSeedMetadata(candidate.lastSeed.launches),
      topRetailers: validateSeedMetadata(candidate.lastSeed.topRetailers),
    },
  };
}

export function emptyAdminRegistryState(now = nowIso()): AdminRegistryState {
  if (!validTimestamp(now)) throw new Error('ADMIN_REGISTRY_TIMESTAMP_INVALID');
  return {
    format: ADMIN_REGISTRY_FORMAT,
    schemaVersion: 'v1',
    createdAt: now,
    updatedAt: now,
    rcas: [],
    launches: [],
    topRetailers: [],
    lastSeed: { rcas: null, launches: null, topRetailers: null },
  };
}

export class AdminRegistryRepository {
  constructor(private readonly storage: AdminRegistryStorage) {}

  async load() {
    const raw = await this.storage.read();
    return raw === null ? null : validateAdminRegistryState(raw);
  }

  async replace(value: AdminRegistryState | null) {
    const previous = await this.load();
    try {
      if (value === null) await this.storage.clear();
      else await this.storage.write(validateAdminRegistryState(value));
      const verified = await this.load();
      if (!sameJson(verified, value === null ? null : validateAdminRegistryState(value))) throw new Error('ADMIN_REGISTRY_STORAGE_VERIFY_FAILED');
      return verified;
    } catch (reason) {
      try {
        if (previous === null) await this.storage.clear();
        else await this.storage.write(previous);
      } catch { /* Preserve the original persistence failure as the actionable error. */ }
      throw reason;
    }
  }

  async mutate(mutator: (draft: AdminRegistryState) => void | AdminRegistryState, now = nowIso()) {
    if (!validTimestamp(now)) throw new Error('ADMIN_REGISTRY_TIMESTAMP_INVALID');
    const current = await this.load();
    const draft = clone(current ?? emptyAdminRegistryState(now));
    const returned = mutator(draft);
    const next = returned ?? draft;
    next.updatedAt = now;
    return this.replace(validateAdminRegistryState(next));
  }
}

export class InMemoryAdminRegistryStorage implements AdminRegistryStorage {
  private value: unknown | null;
  private failWrite = false;
  constructor(initial: unknown | null = null) { this.value = initial === null ? null : clone(initial); }
  async read() { return this.value === null ? null : clone(this.value); }
  async write(value: AdminRegistryState) {
    if (this.failWrite) { this.failWrite = false; throw new Error('ADMIN_REGISTRY_TEST_WRITE_FAILED'); }
    this.value = clone(value);
  }
  async clear() {
    if (this.failWrite) { this.failWrite = false; throw new Error('ADMIN_REGISTRY_TEST_WRITE_FAILED'); }
    this.value = null;
  }
  failNextWrite() { this.failWrite = true; }
}

function semanticRca(record: RcaRegistryRecord) {
  return JSON.stringify({ currentCode: record.currentCode, legacyCode: record.legacyCode, name: record.name, coordinatorCode: record.coordinatorCode, coordinatorName: record.coordinatorName, role: record.role, active: record.active, validFromCompetence: record.validFromCompetence, validToCompetence: record.validToCompetence });
}
function semanticLaunch(record: LaunchRegistryRecord) {
  return JSON.stringify({ winthorCode: record.winthorCode, ean: record.ean, description: record.description, type: record.type, status: record.status, active: record.active, validFromCompetence: record.validFromCompetence, validToCompetence: record.validToCompetence });
}
function semanticTop(record: TopRetailRegistryRecord) {
  return JSON.stringify({ competence: record.competence, customerCnpj: record.customerCnpj, network: record.network, banner: record.banner, managerCnpj: record.managerCnpj, groupCode: record.groupCode, category: record.category, topTarget: record.topTarget, active: record.active });
}
function invalidValidity(from: string | null, to: string | null) {
  return (from !== null && !isValidCompetenceId(from)) || (to !== null && !isValidCompetenceId(to)) || Boolean(from && to && from > to);
}

export function diagnoseRcaRecords(records: RcaRegistryRecord[]): RegistryDiagnostic[] {
  const diagnostics: RegistryDiagnostic[] = [];
  for (const record of records) {
    if (!record.currentCode) diagnostics.push({ code: 'RCA_CODE_EMPTY', severity: 'ERROR', recordIds: [record.id], message: 'RCA sem código atual.' });
    if (invalidValidity(record.validFromCompetence, record.validToCompetence)) diagnostics.push({ code: 'RCA_VALIDITY_INVALID', severity: 'ERROR', recordIds: [record.id], message: 'Vigência de RCA inválida.' });
  }
  const active = records.filter(record => record.active);
  const byCurrent = new Map<string, RcaRegistryRecord[]>();
  for (const record of active) {
    const key = `${record.role}|${record.currentCode}`;
    byCurrent.set(key, [...(byCurrent.get(key) ?? []), record]);
  }
  for (const group of byCurrent.values()) {
    if (group.length > 1 && new Set(group.map(semanticRca)).size > 1) diagnostics.push({ code: 'RCA_CURRENT_DIVERGENT', severity: 'CONFLICT', recordIds: group.map(record => record.id), message: `Código atual ${group[0].currentCode} possui definições divergentes no papel ${group[0].role}.` });
  }
  const byLegacy = new Map<string, RcaRegistryRecord[]>();
  for (const record of active.filter(record => record.legacyCode)) byLegacy.set(record.legacyCode!, [...(byLegacy.get(record.legacyCode!) ?? []), record]);
  for (const [legacy, group] of byLegacy) {
    if (new Set(group.map(record => record.currentCode)).size > 1) diagnostics.push({ code: 'RCA_LEGACY_AMBIGUOUS', severity: 'CONFLICT', recordIds: group.map(record => record.id), message: `Código legado ${legacy} aponta para mais de um código atual.` });
  }
  return diagnostics;
}

export function diagnoseLaunchRecords(records: LaunchRegistryRecord[]): RegistryDiagnostic[] {
  const diagnostics: RegistryDiagnostic[] = [];
  for (const record of records) {
    if (!record.winthorCode && !record.ean) diagnostics.push({ code: 'LAUNCH_IDENTITY_MISSING', severity: 'ERROR', recordIds: [record.id], message: 'Lançamento sem EAN e sem código Winthor.' });
    if (invalidValidity(record.validFromCompetence, record.validToCompetence)) diagnostics.push({ code: 'LAUNCH_VALIDITY_INVALID', severity: 'ERROR', recordIds: [record.id], message: 'Vigência de lançamento inválida.' });
  }
  const active = records.filter(record => record.active);
  const byEan = new Map<string, LaunchRegistryRecord[]>();
  for (const record of active.filter(record => record.ean)) byEan.set(record.ean!, [...(byEan.get(record.ean!) ?? []), record]);
  for (const [ean, group] of byEan) {
    const codes = new Set(group.map(record => record.winthorCode).filter((value): value is string => Boolean(value)));
    if (codes.size > 1) diagnostics.push({ code: 'LAUNCH_EAN_AMBIGUOUS', severity: 'CONFLICT', recordIds: group.map(record => record.id), message: `EAN ${ean} aponta para códigos Winthor diferentes.` });
  }
  const byWinthor = new Map<string, LaunchRegistryRecord[]>();
  for (const record of active.filter(record => record.winthorCode)) byWinthor.set(record.winthorCode!, [...(byWinthor.get(record.winthorCode!) ?? []), record]);
  for (const [winthor, group] of byWinthor) {
    const eans = new Set(group.map(record => record.ean).filter((value): value is string => Boolean(value)));
    if (eans.size > 1) diagnostics.push({ code: 'LAUNCH_WINTHOR_AMBIGUOUS', severity: 'CONFLICT', recordIds: group.map(record => record.id), message: `Código Winthor ${winthor} aponta para EANs diferentes.` });
  }
  return diagnostics;
}

export function diagnoseTopRetailRecords(records: TopRetailRegistryRecord[]): RegistryDiagnostic[] {
  const diagnostics: RegistryDiagnostic[] = [];
  for (const record of records) {
    if (!validCnpj(record.customerCnpj)) diagnostics.push({ code: 'TOP_CNPJ_INVALID', severity: 'ERROR', recordIds: [record.id], message: 'CNPJ do cliente deve possuir 14 dígitos.' });
    if (!isValidCompetenceId(record.competence)) diagnostics.push({ code: 'TOP_COMPETENCE_INVALID', severity: 'ERROR', recordIds: [record.id], message: 'Competência de Top Varejista inválida.' });
    if (record.managerCnpj !== null && !validCnpj(record.managerCnpj)) diagnostics.push({ code: 'TOP_MANAGER_CNPJ_INVALID', severity: 'ERROR', recordIds: [record.id], message: 'CNPJ gestor deve possuir 14 dígitos.' });
    if (record.topTarget !== null && (!Number.isFinite(record.topTarget) || record.topTarget < 0)) diagnostics.push({ code: 'TOP_TARGET_INVALID', severity: 'ERROR', recordIds: [record.id], message: 'Top Target deve ser nulo ou maior/igual a zero.' });
  }
  const active = records.filter(record => record.active);
  const byKey = new Map<string, TopRetailRegistryRecord[]>();
  for (const record of active) {
    const key = `${record.competence}|${record.customerCnpj}`;
    byKey.set(key, [...(byKey.get(key) ?? []), record]);
  }
  for (const group of byKey.values()) {
    if (group.length > 1 && new Set(group.map(semanticTop)).size > 1) diagnostics.push({ code: 'TOP_DUPLICATE_DIVERGENT', severity: 'CONFLICT', recordIds: group.map(record => record.id), message: `${group[0].competence} + ${group[0].customerCnpj} possui dados divergentes.` });
  }
  return diagnostics;
}

export function diagnoseAdminRegistry(state: AdminRegistryState | null) {
  if (!state) return { rcas: [], launches: [], topRetailers: [] };
  return {
    rcas: diagnoseRcaRecords(state.rcas),
    launches: diagnoseLaunchRecords(state.launches),
    topRetailers: diagnoseTopRetailRecords(state.topRetailers),
  };
}

function normalizeCode(value: unknown) { const normalized = code(value); return normalized || null; }
function normalizeText(value: unknown) { const normalized = text(value); return normalized || null; }
function normalizeCnpj14(value: unknown) {
  const normalized = digits(value);
  if (!normalized || normalized.length > 14) return null;
  return normalized.padStart(14, '0');
}
export function normalizeAdminGtin(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  if (/[eE][+-]?\d+/.test(raw)) return null;
  return gtin(raw);
}
function typedCell(row: ParsedSource['rows'][number], field: string) { return row[field]?.typed ?? null; }
function rawCell(row: ParsedSource['rows'][number], field: string) { return row[field]?.raw ?? null; }
function parsedSourceRow(row: ParsedSource['rows'][number]) {
  const value = Number(typedCell(row, '__source_row'));
  return Number.isInteger(value) && value > 0 ? value : null;
}
function seedId(prefix: string, key: string) { return `seed:${prefix}:${encodeURIComponent(key)}`; }
function manualId(prefix: string) {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `manual:${prefix}:${uuid}`;
}

function rcaBusinessKey(record: RcaRegistryRecord) { return `${record.role}|${record.currentCode}|${record.legacyCode ?? ''}`; }
function launchBusinessKey(record: LaunchRegistryRecord) { return `${record.winthorCode ?? ''}|${record.ean ?? ''}`; }
function topBusinessKey(record: TopRetailRegistryRecord) { return `${record.competence}|${record.customerCnpj}`; }
export function adminRegistryBusinessKey(kind: AdminRegistryKind, record: AdminRegistryRecord) {
  return kind === 'rcas' ? rcaBusinessKey(record as RcaRegistryRecord) : kind === 'launches' ? launchBusinessKey(record as LaunchRegistryRecord) : topBusinessKey(record as TopRetailRegistryRecord);
}
function semanticFor(kind: AdminRegistryKind, record: AdminRegistryRecord) {
  return kind === 'rcas' ? semanticRca(record as RcaRegistryRecord) : kind === 'launches' ? semanticLaunch(record as LaunchRegistryRecord) : semanticTop(record as TopRetailRegistryRecord);
}
function sourceEquivalent(kind: AdminRegistryKind, a: AdminRegistryRecord, b: AdminRegistryRecord) {
  return semanticFor(kind, a) === semanticFor(kind, b) && (a as { sourceRow: number | null }).sourceRow === (b as { sourceRow: number | null }).sourceRow;
}

function sourceRecordBase(id: string, sourceRow: number | null, timestamp: string): RegistryCommon & { sourceRow: number | null } {
  return { id, active: true, origin: 'SOURCE_SEED', createdAt: timestamp, updatedAt: timestamp, note: null, sourceRow };
}

function buildRcaCandidates(parsed: ParsedSource, timestamp: string) {
  const records: RcaRegistryRecord[] = [];
  const conflicts: RegistrySeedPreviewItem[] = [];
  const specs = [
    { role: 'PRINCIPAL' as const, current: 'current_rca_code_principal', legacy: 'legacy_rca_code_principal', name: 'rca_name_raw_principal', coordinatorCode: 'coordinator_code_principal', coordinatorName: 'coordinator_name_principal' },
    { role: 'AUXILIAR' as const, current: 'current_rca_code_auxiliar', legacy: 'legacy_rca_code_auxiliar', name: 'rca_name_raw_auxiliar', coordinatorCode: 'coordinator_code_auxiliar', coordinatorName: 'coordinator_name_auxiliar' },
  ];
  for (const row of parsed.rows) {
    for (const spec of specs) {
      const values = [typedCell(row, spec.current), typedCell(row, spec.legacy), typedCell(row, spec.name), typedCell(row, spec.coordinatorCode), typedCell(row, spec.coordinatorName)];
      if (values.every(value => value === null || text(value) === '')) continue;
      const currentCode = normalizeCode(typedCell(row, spec.current));
      const sourceRow = parsedSourceRow(row);
      if (!currentCode) {
        conflicts.push({ status: 'CONFLICT', businessKey: `row:${sourceRow ?? '?'}:${spec.role}`, recordId: null, reason: 'RCA_CODE_EMPTY' });
        continue;
      }
      const legacyCode = normalizeCode(typedCell(row, spec.legacy));
      const key = `${spec.role}|${currentCode}|${legacyCode ?? ''}`;
      records.push({
        ...sourceRecordBase(seedId('rca', key), sourceRow, timestamp),
        currentCode,
        legacyCode,
        name: normalizeText(typedCell(row, spec.name)),
        coordinatorCode: normalizeCode(typedCell(row, spec.coordinatorCode)),
        coordinatorName: normalizeText(typedCell(row, spec.coordinatorName)),
        role: spec.role,
        validFromCompetence: null,
        validToCompetence: null,
      });
    }
  }
  return { records, conflicts, competence: null as string | null };
}

function buildLaunchCandidates(parsed: ParsedSource, timestamp: string) {
  const records: LaunchRegistryRecord[] = [];
  const conflicts: RegistrySeedPreviewItem[] = [];
  for (const row of parsed.rows) {
    const winthorCode = normalizeCode(typedCell(row, 'launch_winthor_code'));
    const rawEan = rawCell(row, 'launch_ean');
    const ean = normalizeAdminGtin(typedCell(row, 'launch_ean'));
    const sourceRow = parsedSourceRow(row);
    if (text(rawEan) && !ean) {
      conflicts.push({ status: 'CONFLICT', businessKey: `row:${sourceRow ?? '?'}`, recordId: null, reason: 'EAN_INVALID' });
      continue;
    }
    if (!winthorCode && !ean) {
      conflicts.push({ status: 'CONFLICT', businessKey: `row:${sourceRow ?? '?'}`, recordId: null, reason: 'LAUNCH_IDENTITY_MISSING' });
      continue;
    }
    const key = `${winthorCode ?? ''}|${ean ?? ''}`;
    records.push({
      ...sourceRecordBase(seedId('launch', key), sourceRow, timestamp),
      winthorCode,
      ean,
      description: normalizeText(typedCell(row, 'launch_description')),
      type: normalizeText(typedCell(row, 'launch_type')),
      status: normalizeText(typedCell(row, 'launch_status')),
      validFromCompetence: null,
      validToCompetence: null,
    });
  }
  return { records, conflicts, competence: null as string | null };
}

function buildTopCandidates(parsed: ParsedSource, timestamp: string) {
  const competence = competenceFromParsedSource(parsed);
  if (!isValidCompetenceId(competence)) throw new Error('ADMIN_REGISTRY_TOP_COMPETENCE_UNRESOLVED');
  const records: TopRetailRegistryRecord[] = [];
  const conflicts: RegistrySeedPreviewItem[] = [];
  for (const row of parsed.rows) {
    const sourceRow = parsedSourceRow(row);
    const customerCnpj = normalizeCnpj14(typedCell(row, 'cnpj'));
    const managerRaw = rawCell(row, 'manager_cnpj');
    const managerCnpj = normalizeCnpj14(typedCell(row, 'manager_cnpj'));
    const targetRaw = rawCell(row, 'top_target');
    const targetTyped = typedCell(row, 'top_target');
    const topTarget = targetTyped === null || targetTyped === '' ? null : Number(targetTyped);
    const network = normalizeText(typedCell(row, 'top_network'));
    if (!customerCnpj || !validCnpj(customerCnpj)) {
      conflicts.push({ status: 'CONFLICT', businessKey: `row:${sourceRow ?? '?'}`, recordId: null, reason: 'TOP_CNPJ_INVALID' });
      continue;
    }
    if (text(managerRaw) && (!managerCnpj || !validCnpj(managerCnpj))) {
      conflicts.push({ status: 'CONFLICT', businessKey: `${competence}|${customerCnpj}`, recordId: null, reason: 'TOP_MANAGER_CNPJ_INVALID' });
      continue;
    }
    if ((text(targetRaw) && (topTarget === null || !Number.isFinite(topTarget) || topTarget < 0)) || (topTarget !== null && topTarget < 0)) {
      conflicts.push({ status: 'CONFLICT', businessKey: `${competence}|${customerCnpj}`, recordId: null, reason: 'TOP_TARGET_INVALID' });
      continue;
    }
    if (!network) {
      conflicts.push({ status: 'CONFLICT', businessKey: `${competence}|${customerCnpj}`, recordId: null, reason: 'TOP_NETWORK_EMPTY' });
      continue;
    }
    const key = `${competence}|${customerCnpj}`;
    records.push({
      ...sourceRecordBase(seedId('top', key), sourceRow, timestamp),
      competence,
      customerCnpj,
      network,
      banner: normalizeText(typedCell(row, 'banner')),
      managerCnpj,
      groupCode: normalizeCode(typedCell(row, 'group_code')),
      category: normalizeText(typedCell(row, 'top_category')),
      topTarget,
    });
  }
  return { records, conflicts, competence };
}

function dedupeCandidates(kind: AdminRegistryKind, input: AdminRegistryRecord[], conflicts: RegistrySeedPreviewItem[]) {
  const byKey = new Map<string, AdminRegistryRecord[]>();
  for (const record of input) {
    const key = adminRegistryBusinessKey(kind, record);
    byKey.set(key, [...(byKey.get(key) ?? []), record]);
  }
  const records: AdminRegistryRecord[] = [];
  for (const [key, group] of byKey) {
    if (new Set(group.map(record => semanticFor(kind, record))).size > 1) {
      conflicts.push({ status: 'CONFLICT', businessKey: key, recordId: group[0].id, reason: 'DUPLICATE_DIVERGENT' });
      continue;
    }
    records.push(group[0]);
  }
  return records;
}

function candidateDiagnosticConflicts(kind: AdminRegistryKind, records: AdminRegistryRecord[]) {
  const diagnostics = kind === 'rcas'
    ? diagnoseRcaRecords(records as RcaRegistryRecord[])
    : kind === 'launches'
      ? diagnoseLaunchRecords(records as LaunchRegistryRecord[])
      : diagnoseTopRetailRecords(records as TopRetailRegistryRecord[]);
  const conflicted = new Set<string>();
  for (const diagnostic of diagnostics.filter(item => item.severity === 'CONFLICT' || item.severity === 'ERROR')) for (const id of diagnostic.recordIds) conflicted.add(id);
  return { diagnostics, conflicted };
}

function arrayFor(state: AdminRegistryState | null, kind: AdminRegistryKind): AdminRegistryRecord[] {
  if (!state) return [];
  return kind === 'rcas' ? state.rcas : kind === 'launches' ? state.launches : state.topRetailers;
}

export function previewRegistrySeed(kind: AdminRegistryKind, parsed: ParsedSource, state: AdminRegistryState | null, now = nowIso()): RegistrySeedPreview {
  if (!validTimestamp(now)) throw new Error('ADMIN_REGISTRY_TIMESTAMP_INVALID');
  const built = kind === 'rcas' ? buildRcaCandidates(parsed, now) : kind === 'launches' ? buildLaunchCandidates(parsed, now) : buildTopCandidates(parsed, now);
  const conflicts = [...built.conflicts];
  const candidates = dedupeCandidates(kind, built.records as AdminRegistryRecord[], conflicts);
  const { diagnostics, conflicted } = candidateDiagnosticConflicts(kind, candidates);
  for (const diagnostic of diagnostics) {
    for (const id of diagnostic.recordIds) {
      const record = candidates.find(candidate => candidate.id === id);
      if (record && !conflicts.some(item => item.businessKey === adminRegistryBusinessKey(kind, record))) conflicts.push({ status: 'CONFLICT', businessKey: adminRegistryBusinessKey(kind, record), recordId: id, reason: diagnostic.code });
    }
  }

  const items: RegistrySeedPreviewItem[] = [...conflicts];
  const existing = arrayFor(state, kind);
  const incomingKeys = new Set(candidates.map(record => adminRegistryBusinessKey(kind, record)));
  for (const candidate of candidates) {
    const key = adminRegistryBusinessKey(kind, candidate);
    if (conflicted.has(candidate.id)) continue;
    const matches = existing.filter(record => adminRegistryBusinessKey(kind, record) === key);
    if (matches.length > 1) {
      items.push({ status: 'CONFLICT', businessKey: key, recordId: matches[0].id, reason: 'EXISTING_DUPLICATE' });
      continue;
    }
    const current = matches[0];
    if (!current) items.push({ status: 'NEW', businessKey: key, recordId: candidate.id, reason: null, record: candidate });
    else if (current.origin === 'MANUAL') items.push({ status: 'MANUAL_PROTECTED', businessKey: key, recordId: current.id, reason: 'MANUAL_WINS', record: candidate });
    else if (sourceEquivalent(kind, current, candidate)) items.push({ status: 'EQUAL', businessKey: key, recordId: current.id, reason: null, record: candidate });
    else items.push({ status: 'UPDATABLE', businessKey: key, recordId: current.id, reason: null, record: candidate });
  }
  for (const record of existing.filter(record => record.origin === 'SOURCE_SEED')) {
    const key = adminRegistryBusinessKey(kind, record);
    if (!incomingKeys.has(key)) items.push({ status: 'MISSING_SOURCE', businessKey: key, recordId: record.id, reason: 'AUSENTE_NA_FONTE_ATUAL' });
  }
  const count = (status: SeedPreviewStatus) => items.filter(item => item.status === status).length;
  return {
    kind,
    source: parsed.source,
    fileName: parsed.fileName,
    competence: built.competence,
    counts: {
      new: count('NEW'),
      updatable: count('UPDATABLE'),
      equal: count('EQUAL'),
      conflicts: count('CONFLICT'),
      manualProtected: count('MANUAL_PROTECTED'),
      missingFromSource: count('MISSING_SOURCE'),
    },
    items,
  };
}

function seedMetadata(parsed: ParsedSource, preview: RegistrySeedPreview, now: string): RegistrySeedMetadata {
  return { source: parsed.source, fileName: parsed.fileName, appliedAt: now, sourceRows: parsed.rows.length, competence: preview.competence };
}

export async function applyRegistrySeed(repository: AdminRegistryRepository, kind: AdminRegistryKind, parsed: ParsedSource, now = nowIso()) {
  let appliedPreview: RegistrySeedPreview | null = null;
  const state = await repository.mutate(draft => {
    appliedPreview = previewRegistrySeed(kind, parsed, draft, now);
    const preview = appliedPreview;
    const current = arrayFor(draft, kind);
    for (const item of preview.items) {
      if ((item.status !== 'NEW' && item.status !== 'UPDATABLE') || !item.record) continue;
      const incoming = clone(item.record);
      const index = current.findIndex(record => adminRegistryBusinessKey(kind, record) === item.businessKey);
      if (index >= 0) {
        const existing = current[index];
        incoming.id = existing.id;
        incoming.createdAt = existing.createdAt;
        incoming.updatedAt = now;
        incoming.origin = 'SOURCE_SEED';
        current[index] = incoming;
      } else current.push(incoming);
    }
    if (kind === 'rcas') draft.rcas = current as RcaRegistryRecord[];
    else if (kind === 'launches') draft.launches = current as LaunchRegistryRecord[];
    else draft.topRetailers = current as TopRetailRegistryRecord[];
    draft.lastSeed[kind] = seedMetadata(parsed, preview, now);
  }, now);
  return { state: state!, preview: appliedPreview! };
}

export type RcaManualInput = Omit<RcaRegistryRecord, keyof RegistryCommon | 'sourceRow'> & { note?: string | null };
export type LaunchManualInput = Omit<LaunchRegistryRecord, keyof RegistryCommon | 'sourceRow'> & { note?: string | null };
export type TopManualInput = Omit<TopRetailRegistryRecord, keyof RegistryCommon | 'sourceRow'> & { note?: string | null };

export async function upsertManualRca(repository: AdminRegistryRepository, input: RcaManualInput, id?: string, now = nowIso()) {
  const currentCode = normalizeCode(input.currentCode);
  if (!currentCode) throw new Error('ADMIN_REGISTRY_RCA_CODE_REQUIRED');
  return repository.mutate(draft => {
    const index = id ? draft.rcas.findIndex(record => record.id === id) : -1;
    const previous = index >= 0 ? draft.rcas[index] : null;
    const record: RcaRegistryRecord = {
      id: previous?.id ?? id ?? manualId('rca'),
      currentCode,
      legacyCode: normalizeCode(input.legacyCode),
      name: normalizeText(input.name),
      coordinatorCode: normalizeCode(input.coordinatorCode),
      coordinatorName: normalizeText(input.coordinatorName),
      role: input.role,
      active: previous?.active ?? true,
      validFromCompetence: input.validFromCompetence,
      validToCompetence: input.validToCompetence,
      origin: 'MANUAL',
      sourceRow: previous?.sourceRow ?? null,
      note: input.note ?? previous?.note ?? null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    validateRca(record);
    if (index >= 0) draft.rcas[index] = record; else draft.rcas.push(record);
  }, now);
}

export async function upsertManualLaunch(repository: AdminRegistryRepository, input: LaunchManualInput, id?: string, now = nowIso()) {
  const winthorCode = normalizeCode(input.winthorCode);
  const rawEan = input.ean === null ? '' : text(input.ean);
  const ean = normalizeAdminGtin(input.ean);
  if (rawEan && !ean) throw new Error('ADMIN_REGISTRY_LAUNCH_EAN_INVALID');
  if (!winthorCode && !ean) throw new Error('ADMIN_REGISTRY_LAUNCH_IDENTITY_REQUIRED');
  return repository.mutate(draft => {
    const index = id ? draft.launches.findIndex(record => record.id === id) : -1;
    const previous = index >= 0 ? draft.launches[index] : null;
    const record: LaunchRegistryRecord = {
      id: previous?.id ?? id ?? manualId('launch'),
      winthorCode,
      ean,
      description: normalizeText(input.description),
      type: normalizeText(input.type),
      status: normalizeText(input.status),
      active: previous?.active ?? true,
      validFromCompetence: input.validFromCompetence,
      validToCompetence: input.validToCompetence,
      origin: 'MANUAL',
      sourceRow: previous?.sourceRow ?? null,
      note: input.note ?? previous?.note ?? null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    validateLaunch(record);
    if (index >= 0) draft.launches[index] = record; else draft.launches.push(record);
  }, now);
}

export async function upsertManualTopRetail(repository: AdminRegistryRepository, input: TopManualInput, id?: string, now = nowIso()) {
  const customerCnpj = normalizeCnpj14(input.customerCnpj);
  const managerCnpj = input.managerCnpj ? normalizeCnpj14(input.managerCnpj) : null;
  if (!isValidCompetenceId(input.competence) || !customerCnpj || !validCnpj(customerCnpj)) throw new Error('ADMIN_REGISTRY_TOP_IDENTITY_INVALID');
  if (input.managerCnpj && (!managerCnpj || !validCnpj(managerCnpj))) throw new Error('ADMIN_REGISTRY_TOP_MANAGER_INVALID');
  if (input.topTarget !== null && (!Number.isFinite(input.topTarget) || input.topTarget < 0)) throw new Error('ADMIN_REGISTRY_TOP_TARGET_INVALID');
  const network = text(input.network);
  if (!network) throw new Error('ADMIN_REGISTRY_TOP_NETWORK_REQUIRED');
  return repository.mutate(draft => {
    const index = id ? draft.topRetailers.findIndex(record => record.id === id) : -1;
    const previous = index >= 0 ? draft.topRetailers[index] : null;
    const record: TopRetailRegistryRecord = {
      id: previous?.id ?? id ?? manualId('top'),
      competence: input.competence,
      customerCnpj,
      network,
      banner: normalizeText(input.banner),
      managerCnpj,
      groupCode: normalizeCode(input.groupCode),
      category: normalizeText(input.category),
      topTarget: input.topTarget,
      active: previous?.active ?? true,
      origin: 'MANUAL',
      sourceRow: previous?.sourceRow ?? null,
      note: input.note ?? previous?.note ?? null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    validateTop(record);
    if (index >= 0) draft.topRetailers[index] = record; else draft.topRetailers.push(record);
  }, now);
}

export async function setRegistryRecordActive(repository: AdminRegistryRepository, kind: AdminRegistryKind, id: string, active: boolean, now = nowIso()) {
  return repository.mutate(draft => {
    const records = arrayFor(draft, kind);
    const index = records.findIndex(record => record.id === id);
    if (index < 0) throw new Error('ADMIN_REGISTRY_RECORD_NOT_FOUND');
    records[index] = { ...records[index], active, origin: 'MANUAL', updatedAt: now } as AdminRegistryRecord;
    if (kind === 'rcas') draft.rcas = records as RcaRegistryRecord[];
    else if (kind === 'launches') draft.launches = records as LaunchRegistryRecord[];
    else draft.topRetailers = records as TopRetailRegistryRecord[];
  }, now);
}
