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
export type RegistrySeedMetadata = { source: string; fileName: string; appliedAt: string; sourceRows: number; competence: string | null };
export type AdminRegistryState = {
  format: typeof ADMIN_REGISTRY_FORMAT;
  schemaVersion: 'v1';
  createdAt: string;
  updatedAt: string;
  rcas: RcaRegistryRecord[];
  launches: LaunchRegistryRecord[];
  topRetailers: TopRetailRegistryRecord[];
  lastSeed: { rcas: RegistrySeedMetadata | null; launches: RegistrySeedMetadata | null; topRetailers: RegistrySeedMetadata | null };
};
export type RegistryDiagnostic = {
  code: 'RCA_CURRENT_DIVERGENT' | 'RCA_LEGACY_AMBIGUOUS' | 'RCA_CODE_EMPTY' | 'RCA_VALIDITY_INVALID' | 'LAUNCH_EAN_AMBIGUOUS' | 'LAUNCH_WINTHOR_AMBIGUOUS' | 'LAUNCH_IDENTITY_MISSING' | 'LAUNCH_VALIDITY_INVALID' | 'TOP_CNPJ_INVALID' | 'TOP_COMPETENCE_INVALID' | 'TOP_DUPLICATE_DIVERGENT' | 'TOP_MANAGER_CNPJ_INVALID' | 'TOP_TARGET_INVALID';
  severity: 'CONFLICT' | 'ERROR';
  recordIds: string[];
  message: string;
};
export type SeedPreviewStatus = 'NEW' | 'UPDATABLE' | 'EQUAL' | 'CONFLICT' | 'MANUAL_PROTECTED' | 'MISSING_SOURCE';
export type RegistrySeedPreviewItem = { status: SeedPreviewStatus; businessKey: string; recordId: string | null; reason: string | null; record?: AdminRegistryRecord };
export type RegistrySeedPreview = {
  kind: AdminRegistryKind;
  source: string;
  fileName: string;
  competence: string | null;
  counts: { new: number; updatable: number; equal: number; conflicts: number; manualProtected: number; missingFromSource: number };
  items: RegistrySeedPreviewItem[];
};
export type AdminRegistryStorage = { read: () => Promise<unknown | null>; write: (value: AdminRegistryState) => Promise<void>; clear: () => Promise<void> };

const nowIso = () => new Date().toISOString();
const clone = <T>(value: T): T => structuredClone(value);
const validTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const validCompetenceOrNull = (value: unknown): value is string | null => value === null || isValidCompetenceId(value);
const validSourceRow = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const validCnpj = (value: unknown): value is string => typeof value === 'string' && /^\d{14}$/.test(value);

function assertCommon(value: unknown): asserts value is RegistryCommon {
  if (!value || typeof value !== 'object') throw new Error('ADMIN_REGISTRY_RECORD_INVALID');
  const record = value as Partial<RegistryCommon>;
  if (typeof record.id !== 'string' || !record.id.trim() || typeof record.active !== 'boolean') throw new Error('ADMIN_REGISTRY_RECORD_INVALID');
  if (record.origin !== 'SOURCE_SEED' && record.origin !== 'MANUAL') throw new Error('ADMIN_REGISTRY_RECORD_INVALID');
  if (!validTimestamp(record.createdAt) || !validTimestamp(record.updatedAt) || !nullableString(record.note)) throw new Error('ADMIN_REGISTRY_RECORD_INVALID');
}
function assertValidity(from: unknown, to: unknown) {
  if (!validCompetenceOrNull(from) || !validCompetenceOrNull(to) || (from && to && from > to)) throw new Error('ADMIN_REGISTRY_VALIDITY_INVALID');
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
function validateLaunch(value: unknown): LaunchRegistryRecord {
  assertCommon(value);
  const record = value as LaunchRegistryRecord;
  if (!nullableString(record.winthorCode) || !nullableString(record.description) || !nullableString(record.type) || !nullableString(record.status)) throw new Error('ADMIN_REGISTRY_LAUNCH_INVALID');
  if (record.ean !== null && (typeof record.ean !== 'string' || !/^(\d{8}|\d{12,14})$/.test(record.ean))) throw new Error('ADMIN_REGISTRY_LAUNCH_INVALID');
  if (!record.winthorCode && !record.ean) throw new Error('ADMIN_REGISTRY_LAUNCH_IDENTITY_REQUIRED');
  if (!validSourceRow(record.sourceRow)) throw new Error('ADMIN_REGISTRY_LAUNCH_INVALID');
  assertValidity(record.validFromCompetence, record.validToCompetence);
  return clone(record);
}
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
export function validateAdminRegistryState(value: unknown): AdminRegistryState {
  if (!value || typeof value !== 'object') throw new Error('ADMIN_REGISTRY_STATE_INVALID');
  const candidate = value as Partial<AdminRegistryState>;
  if (candidate.format !== ADMIN_REGISTRY_FORMAT || candidate.schemaVersion !== 'v1' || !validTimestamp(candidate.createdAt) || !validTimestamp(candidate.updatedAt)) throw new Error('ADMIN_REGISTRY_STATE_INVALID');
  if (!Array.isArray(candidate.rcas) || !Array.isArray(candidate.launches) || !Array.isArray(candidate.topRetailers) || !candidate.lastSeed || typeof candidate.lastSeed !== 'object') throw new Error('ADMIN_REGISTRY_STATE_INVALID');
  const rcas = candidate.rcas.map(validateRca);
  const launches = candidate.launches.map(validateLaunch);
  const topRetailers = candidate.topRetailers.map(validateTop);
  const ids = [...rcas, ...launches, ...topRetailers].map(record => record.id);
  if (new Set(ids).size !== ids.length) throw new Error('ADMIN_REGISTRY_DUPLICATE_ID');
  return { format: ADMIN_REGISTRY_FORMAT, schemaVersion: 'v1', createdAt: candidate.createdAt, updatedAt: candidate.updatedAt, rcas, launches, topRetailers, lastSeed: { rcas: validateSeedMetadata(candidate.lastSeed.rcas), launches: validateSeedMetadata(candidate.lastSeed.launches), topRetailers: validateSeedMetadata(candidate.lastSeed.topRetailers) } };
}
export function emptyAdminRegistryState(now = nowIso()): AdminRegistryState {
  if (!validTimestamp(now)) throw new Error('ADMIN_REGISTRY_TIMESTAMP_INVALID');
  return { format: ADMIN_REGISTRY_FORMAT, schemaVersion: 'v1', createdAt: now, updatedAt: now, rcas: [], launches: [], topRetailers: [], lastSeed: { rcas: null, launches: null, topRetailers: null } };
}

export class AdminRegistryRepository {
  private readonly storage: AdminRegistryStorage;
  constructor(storage: AdminRegistryStorage) { this.storage = storage; }
  async load() { const raw = await this.storage.read(); return raw === null ? null : validateAdminRegistryState(raw); }
  async replace(value: AdminRegistryState | null) {
    const previous = await this.load();
    const expected = value === null ? null : validateAdminRegistryState(value);
    try {
      if (expected === null) await this.storage.clear(); else await this.storage.write(expected);
      const verified = await this.load();
      if (!sameJson(verified, expected)) throw new Error('ADMIN_REGISTRY_STORAGE_VERIFY_FAILED');
      return verified;
    } catch (reason) {
      try { if (previous === null) await this.storage.clear(); else await this.storage.write(previous); } catch { /* keep original failure */ }
      throw reason;
    }
  }
  async mutate(mutator: (draft: AdminRegistryState) => void | AdminRegistryState, now = nowIso()) {
    if (!validTimestamp(now)) throw new Error('ADMIN_REGISTRY_TIMESTAMP_INVALID');
    const current = await this.load();
    const draft = clone(current ?? emptyAdminRegistryState(now));
    const next = mutator(draft) ?? draft;
    next.updatedAt = now;
    return this.replace(validateAdminRegistryState(next));
  }
}
export class InMemoryAdminRegistryStorage implements AdminRegistryStorage {
  private value: unknown | null;
  private failWrite = false;
  constructor(initial: unknown | null = null) { this.value = initial === null ? null : clone(initial); }
  async read() { return this.value === null ? null : clone(this.value); }
  async write(value: AdminRegistryState) { if (this.failWrite) { this.failWrite = false; throw new Error('ADMIN_REGISTRY_TEST_WRITE_FAILED'); } this.value = clone(value); }
  async clear() { if (this.failWrite) { this.failWrite = false; throw new Error('ADMIN_REGISTRY_TEST_WRITE_FAILED'); } this.value = null; }
  failNextWrite() { this.failWrite = true; }
}

const semanticRca = (r: RcaRegistryRecord) => JSON.stringify({ currentCode: r.currentCode, legacyCode: r.legacyCode, name: r.name, coordinatorCode: r.coordinatorCode, coordinatorName: r.coordinatorName, role: r.role, active: r.active, validFromCompetence: r.validFromCompetence, validToCompetence: r.validToCompetence });
const semanticLaunch = (r: LaunchRegistryRecord) => JSON.stringify({ winthorCode: r.winthorCode, ean: r.ean, description: r.description, type: r.type, status: r.status, active: r.active, validFromCompetence: r.validFromCompetence, validToCompetence: r.validToCompetence });
const semanticTop = (r: TopRetailRegistryRecord) => JSON.stringify({ competence: r.competence, customerCnpj: r.customerCnpj, network: r.network, banner: r.banner, managerCnpj: r.managerCnpj, groupCode: r.groupCode, category: r.category, topTarget: r.topTarget, active: r.active });
const invalidValidity = (from: string | null, to: string | null) => (from !== null && !isValidCompetenceId(from)) || (to !== null && !isValidCompetenceId(to)) || Boolean(from && to && from > to);

export function diagnoseRcaRecords(records: RcaRegistryRecord[]): RegistryDiagnostic[] {
  const out: RegistryDiagnostic[] = [];
  for (const r of records) {
    if (!r.currentCode) out.push({ code: 'RCA_CODE_EMPTY', severity: 'ERROR', recordIds: [r.id], message: 'RCA sem código atual.' });
    if (invalidValidity(r.validFromCompetence, r.validToCompetence)) out.push({ code: 'RCA_VALIDITY_INVALID', severity: 'ERROR', recordIds: [r.id], message: 'Vigência de RCA inválida.' });
  }
  const active = records.filter(r => r.active);
  const current = new Map<string, RcaRegistryRecord[]>();
  for (const r of active) { const key = `${r.role}|${r.currentCode}`; current.set(key, [...(current.get(key) ?? []), r]); }
  for (const group of current.values()) if (group.length > 1 && new Set(group.map(semanticRca)).size > 1) out.push({ code: 'RCA_CURRENT_DIVERGENT', severity: 'CONFLICT', recordIds: group.map(r => r.id), message: `Código atual ${group[0].currentCode} possui definições divergentes no papel ${group[0].role}.` });
  const legacy = new Map<string, RcaRegistryRecord[]>();
  for (const r of active.filter(r => r.legacyCode)) legacy.set(r.legacyCode!, [...(legacy.get(r.legacyCode!) ?? []), r]);
  for (const [legacyCode, group] of legacy) if (new Set(group.map(r => r.currentCode)).size > 1) out.push({ code: 'RCA_LEGACY_AMBIGUOUS', severity: 'CONFLICT', recordIds: group.map(r => r.id), message: `Código legado ${legacyCode} aponta para mais de um código atual.` });
  return out;
}
export function diagnoseLaunchRecords(records: LaunchRegistryRecord[]): RegistryDiagnostic[] {
  const out: RegistryDiagnostic[] = [];
  for (const r of records) {
    if (!r.winthorCode && !r.ean) out.push({ code: 'LAUNCH_IDENTITY_MISSING', severity: 'ERROR', recordIds: [r.id], message: 'Lançamento sem EAN e sem código Winthor.' });
    if (invalidValidity(r.validFromCompetence, r.validToCompetence)) out.push({ code: 'LAUNCH_VALIDITY_INVALID', severity: 'ERROR', recordIds: [r.id], message: 'Vigência de lançamento inválida.' });
  }
  const active = records.filter(r => r.active);
  const byEan = new Map<string, LaunchRegistryRecord[]>();
  const byWinthor = new Map<string, LaunchRegistryRecord[]>();
  for (const r of active) { if (r.ean) byEan.set(r.ean, [...(byEan.get(r.ean) ?? []), r]); if (r.winthorCode) byWinthor.set(r.winthorCode, [...(byWinthor.get(r.winthorCode) ?? []), r]); }
  for (const [ean, group] of byEan) if (new Set(group.map(r => r.winthorCode).filter(Boolean)).size > 1) out.push({ code: 'LAUNCH_EAN_AMBIGUOUS', severity: 'CONFLICT', recordIds: group.map(r => r.id), message: `EAN ${ean} aponta para códigos Winthor diferentes.` });
  for (const [winthor, group] of byWinthor) if (new Set(group.map(r => r.ean).filter(Boolean)).size > 1) out.push({ code: 'LAUNCH_WINTHOR_AMBIGUOUS', severity: 'CONFLICT', recordIds: group.map(r => r.id), message: `Código Winthor ${winthor} aponta para EANs diferentes.` });
  return out;
}
export function diagnoseTopRetailRecords(records: TopRetailRegistryRecord[]): RegistryDiagnostic[] {
  const out: RegistryDiagnostic[] = [];
  for (const r of records) {
    if (!validCnpj(r.customerCnpj)) out.push({ code: 'TOP_CNPJ_INVALID', severity: 'ERROR', recordIds: [r.id], message: 'CNPJ do cliente deve possuir 14 dígitos.' });
    if (!isValidCompetenceId(r.competence)) out.push({ code: 'TOP_COMPETENCE_INVALID', severity: 'ERROR', recordIds: [r.id], message: 'Competência de Top Varejista inválida.' });
    if (r.managerCnpj !== null && !validCnpj(r.managerCnpj)) out.push({ code: 'TOP_MANAGER_CNPJ_INVALID', severity: 'ERROR', recordIds: [r.id], message: 'CNPJ gestor deve possuir 14 dígitos.' });
    if (r.topTarget !== null && (!Number.isFinite(r.topTarget) || r.topTarget < 0)) out.push({ code: 'TOP_TARGET_INVALID', severity: 'ERROR', recordIds: [r.id], message: 'Top Target deve ser nulo ou maior/igual a zero.' });
  }
  const byKey = new Map<string, TopRetailRegistryRecord[]>();
  for (const r of records.filter(r => r.active)) { const key = `${r.competence}|${r.customerCnpj}`; byKey.set(key, [...(byKey.get(key) ?? []), r]); }
  for (const group of byKey.values()) if (group.length > 1 && new Set(group.map(semanticTop)).size > 1) out.push({ code: 'TOP_DUPLICATE_DIVERGENT', severity: 'CONFLICT', recordIds: group.map(r => r.id), message: `${group[0].competence} + ${group[0].customerCnpj} possui dados divergentes.` });
  return out;
}
export function diagnoseAdminRegistry(state: AdminRegistryState | null) { return state ? { rcas: diagnoseRcaRecords(state.rcas), launches: diagnoseLaunchRecords(state.launches), topRetailers: diagnoseTopRetailRecords(state.topRetailers) } : { rcas: [], launches: [], topRetailers: [] }; }

const normalizeCode = (value: unknown) => code(value) || null;
const normalizeText = (value: unknown) => text(value) || null;
const normalizeCnpj14 = (value: unknown) => { const d = digits(value); return !d || d.length > 14 ? null : d.padStart(14, '0'); };
export function normalizeAdminGtin(value: unknown) { const raw = text(value); if (!raw || /[eE][+-]?\d+/.test(raw)) return null; return gtin(raw); }
const typedCell = (row: ParsedSource['rows'][number], field: string) => row[field]?.typed ?? null;
const rawCell = (row: ParsedSource['rows'][number], field: string) => row[field]?.raw ?? null;
const sourceRow = (row: ParsedSource['rows'][number]) => { const n = Number(typedCell(row, '__source_row')); return Number.isInteger(n) && n > 0 ? n : null; };
const seedId = (prefix: string, key: string) => `seed:${prefix}:${encodeURIComponent(key)}`;
const manualId = (prefix: string) => `manual:${prefix}:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const sourceBase = (id: string, row: number | null, at: string) => ({ id, active: true, origin: 'SOURCE_SEED' as const, createdAt: at, updatedAt: at, note: null, sourceRow: row });
const rcaKey = (r: RcaRegistryRecord) => `${r.role}|${r.currentCode}|${r.legacyCode ?? ''}`;
const launchKey = (r: LaunchRegistryRecord) => `${r.winthorCode ?? ''}|${r.ean ?? ''}`;
const topKey = (r: TopRetailRegistryRecord) => `${r.competence}|${r.customerCnpj}`;
export function adminRegistryBusinessKey(kind: AdminRegistryKind, record: AdminRegistryRecord) { return kind === 'rcas' ? rcaKey(record as RcaRegistryRecord) : kind === 'launches' ? launchKey(record as LaunchRegistryRecord) : topKey(record as TopRetailRegistryRecord); }
const semantic = (kind: AdminRegistryKind, record: AdminRegistryRecord) => kind === 'rcas' ? semanticRca(record as RcaRegistryRecord) : kind === 'launches' ? semanticLaunch(record as LaunchRegistryRecord) : semanticTop(record as TopRetailRegistryRecord);

function buildRcaCandidates(parsed: ParsedSource, at: string) {
  const records: RcaRegistryRecord[] = []; const conflicts: RegistrySeedPreviewItem[] = [];
  const specs = [
    { role: 'PRINCIPAL' as const, current: 'current_rca_code_principal', legacy: 'legacy_rca_code_principal', name: 'rca_name_raw_principal', coordinatorCode: 'coordinator_code_principal', coordinatorName: 'coordinator_name_principal' },
    { role: 'AUXILIAR' as const, current: 'current_rca_code_auxiliar', legacy: 'legacy_rca_code_auxiliar', name: 'rca_name_raw_auxiliar', coordinatorCode: 'coordinator_code_auxiliar', coordinatorName: 'coordinator_name_auxiliar' },
  ];
  for (const row of parsed.rows) for (const spec of specs) {
    const values = [typedCell(row, spec.current), typedCell(row, spec.legacy), typedCell(row, spec.name), typedCell(row, spec.coordinatorCode), typedCell(row, spec.coordinatorName)];
    if (values.every(v => v === null || text(v) === '')) continue;
    const currentCode = normalizeCode(typedCell(row, spec.current)); const rowNumber = sourceRow(row);
    if (!currentCode) { conflicts.push({ status: 'CONFLICT', businessKey: `row:${rowNumber ?? '?'}:${spec.role}`, recordId: null, reason: 'RCA_CODE_EMPTY' }); continue; }
    const legacyCode = normalizeCode(typedCell(row, spec.legacy)); const key = `${spec.role}|${currentCode}|${legacyCode ?? ''}`;
    records.push({ ...sourceBase(seedId('rca', key), rowNumber, at), currentCode, legacyCode, name: normalizeText(typedCell(row, spec.name)), coordinatorCode: normalizeCode(typedCell(row, spec.coordinatorCode)), coordinatorName: normalizeText(typedCell(row, spec.coordinatorName)), role: spec.role, validFromCompetence: null, validToCompetence: null });
  }
  return { records, conflicts, competence: null as string | null };
}
function buildLaunchCandidates(parsed: ParsedSource, at: string) {
  const records: LaunchRegistryRecord[] = []; const conflicts: RegistrySeedPreviewItem[] = [];
  for (const row of parsed.rows) {
    const winthorCode = normalizeCode(typedCell(row, 'launch_winthor_code')); const rawEan = rawCell(row, 'launch_ean'); const ean = normalizeAdminGtin(typedCell(row, 'launch_ean')); const rowNumber = sourceRow(row);
    if (text(rawEan) && !ean) { conflicts.push({ status: 'CONFLICT', businessKey: `row:${rowNumber ?? '?'}`, recordId: null, reason: 'EAN_INVALID' }); continue; }
    if (!winthorCode && !ean) { conflicts.push({ status: 'CONFLICT', businessKey: `row:${rowNumber ?? '?'}`, recordId: null, reason: 'LAUNCH_IDENTITY_MISSING' }); continue; }
    const key = `${winthorCode ?? ''}|${ean ?? ''}`;
    records.push({ ...sourceBase(seedId('launch', key), rowNumber, at), winthorCode, ean, description: normalizeText(typedCell(row, 'launch_description')), type: normalizeText(typedCell(row, 'launch_type')), status: normalizeText(typedCell(row, 'launch_status')), validFromCompetence: null, validToCompetence: null });
  }
  return { records, conflicts, competence: null as string | null };
}
function buildTopCandidates(parsed: ParsedSource, at: string) {
  const competence = competenceFromParsedSource(parsed); if (!isValidCompetenceId(competence)) throw new Error('ADMIN_REGISTRY_TOP_COMPETENCE_UNRESOLVED');
  const records: TopRetailRegistryRecord[] = []; const conflicts: RegistrySeedPreviewItem[] = [];
  for (const row of parsed.rows) {
    const rowNumber = sourceRow(row); const customerCnpj = normalizeCnpj14(typedCell(row, 'cnpj')); const managerRaw = rawCell(row, 'manager_cnpj'); const managerCnpj = normalizeCnpj14(typedCell(row, 'manager_cnpj')); const targetRaw = rawCell(row, 'top_target'); const typedTarget = typedCell(row, 'top_target'); const topTarget = typedTarget === null || typedTarget === '' ? null : Number(typedTarget); const network = normalizeText(typedCell(row, 'top_network'));
    const businessKey = `${competence}|${customerCnpj ?? `row:${rowNumber ?? '?'}`}`;
    if (!customerCnpj || !validCnpj(customerCnpj)) { conflicts.push({ status: 'CONFLICT', businessKey, recordId: null, reason: 'TOP_CNPJ_INVALID' }); continue; }
    if (text(managerRaw) && (!managerCnpj || !validCnpj(managerCnpj))) { conflicts.push({ status: 'CONFLICT', businessKey, recordId: null, reason: 'TOP_MANAGER_CNPJ_INVALID' }); continue; }
    if ((text(targetRaw) && (topTarget === null || !Number.isFinite(topTarget) || topTarget < 0)) || (topTarget !== null && topTarget < 0)) { conflicts.push({ status: 'CONFLICT', businessKey, recordId: null, reason: 'TOP_TARGET_INVALID' }); continue; }
    if (!network) { conflicts.push({ status: 'CONFLICT', businessKey, recordId: null, reason: 'TOP_NETWORK_EMPTY' }); continue; }
    const key = `${competence}|${customerCnpj}`;
    records.push({ ...sourceBase(seedId('top', key), rowNumber, at), competence, customerCnpj, network, banner: normalizeText(typedCell(row, 'banner')), managerCnpj, groupCode: normalizeCode(typedCell(row, 'group_code')), category: normalizeText(typedCell(row, 'top_category')), topTarget });
  }
  return { records, conflicts, competence };
}
function dedupe(kind: AdminRegistryKind, records: AdminRegistryRecord[], conflicts: RegistrySeedPreviewItem[]) {
  const map = new Map<string, AdminRegistryRecord[]>(); for (const r of records) { const key = adminRegistryBusinessKey(kind, r); map.set(key, [...(map.get(key) ?? []), r]); }
  const out: AdminRegistryRecord[] = [];
  for (const [key, group] of map) { if (new Set(group.map(r => semantic(kind, r))).size > 1) conflicts.push({ status: 'CONFLICT', businessKey: key, recordId: group[0].id, reason: 'DUPLICATE_DIVERGENT' }); else out.push(group[0]); }
  return out;
}
function recordsOf(state: AdminRegistryState | null, kind: AdminRegistryKind): AdminRegistryRecord[] { return !state ? [] : kind === 'rcas' ? state.rcas : kind === 'launches' ? state.launches : state.topRetailers; }
function diagnosticsOf(kind: AdminRegistryKind, records: AdminRegistryRecord[]) { return kind === 'rcas' ? diagnoseRcaRecords(records as RcaRegistryRecord[]) : kind === 'launches' ? diagnoseLaunchRecords(records as LaunchRegistryRecord[]) : diagnoseTopRetailRecords(records as TopRetailRegistryRecord[]); }

export function previewRegistrySeed(kind: AdminRegistryKind, parsed: ParsedSource, state: AdminRegistryState | null, at = nowIso()): RegistrySeedPreview {
  if (!validTimestamp(at)) throw new Error('ADMIN_REGISTRY_TIMESTAMP_INVALID');
  const built = kind === 'rcas' ? buildRcaCandidates(parsed, at) : kind === 'launches' ? buildLaunchCandidates(parsed, at) : buildTopCandidates(parsed, at);
  const conflicts = [...built.conflicts]; const candidates = dedupe(kind, built.records as AdminRegistryRecord[], conflicts);
  const conflicted = new Set<string>();
  for (const d of diagnosticsOf(kind, candidates)) for (const id of d.recordIds) { conflicted.add(id); const record = candidates.find(r => r.id === id); if (record && !conflicts.some(i => i.businessKey === adminRegistryBusinessKey(kind, record))) conflicts.push({ status: 'CONFLICT', businessKey: adminRegistryBusinessKey(kind, record), recordId: id, reason: d.code }); }
  const items: RegistrySeedPreviewItem[] = [...conflicts]; const existing = recordsOf(state, kind); const incomingKeys = new Set(candidates.map(r => adminRegistryBusinessKey(kind, r)));
  for (const candidate of candidates) {
    if (conflicted.has(candidate.id)) continue;
    const key = adminRegistryBusinessKey(kind, candidate);
    const matches = existing.filter(r => r.id === candidate.id || adminRegistryBusinessKey(kind, r) === key);
    const uniqueMatches = [...new Map(matches.map(r => [r.id, r])).values()];
    if (uniqueMatches.length > 1) { items.push({ status: 'CONFLICT', businessKey: key, recordId: uniqueMatches[0].id, reason: 'EXISTING_DUPLICATE' }); continue; }
    const current = uniqueMatches[0];
    if (!current) items.push({ status: 'NEW', businessKey: key, recordId: candidate.id, reason: null, record: candidate });
    else if (current.origin === 'MANUAL') items.push({ status: 'MANUAL_PROTECTED', businessKey: key, recordId: current.id, reason: 'MANUAL_WINS', record: candidate });
    else if (semantic(kind, current) === semantic(kind, candidate) && current.sourceRow === candidate.sourceRow) items.push({ status: 'EQUAL', businessKey: key, recordId: current.id, reason: null, record: candidate });
    else items.push({ status: 'UPDATABLE', businessKey: key, recordId: current.id, reason: null, record: candidate });
  }
  for (const r of existing.filter(r => r.origin === 'SOURCE_SEED')) { const key = adminRegistryBusinessKey(kind, r); if (!incomingKeys.has(key)) items.push({ status: 'MISSING_SOURCE', businessKey: key, recordId: r.id, reason: 'AUSENTE_NA_FONTE_ATUAL' }); }
  const count = (s: SeedPreviewStatus) => items.filter(i => i.status === s).length;
  return { kind, source: parsed.source, fileName: parsed.fileName, competence: built.competence, counts: { new: count('NEW'), updatable: count('UPDATABLE'), equal: count('EQUAL'), conflicts: count('CONFLICT'), manualProtected: count('MANUAL_PROTECTED'), missingFromSource: count('MISSING_SOURCE') }, items };
}

export async function applyRegistrySeed(repository: AdminRegistryRepository, kind: AdminRegistryKind, parsed: ParsedSource, at = nowIso()) {
  let preview: RegistrySeedPreview | null = null;
  const state = await repository.mutate(draft => {
    preview = previewRegistrySeed(kind, parsed, draft, at);
    const current = recordsOf(draft, kind);
    for (const item of preview.items) {
      if ((item.status !== 'NEW' && item.status !== 'UPDATABLE') || !item.record) continue;
      const incoming = clone(item.record); const index = current.findIndex(r => r.id === item.recordId || adminRegistryBusinessKey(kind, r) === item.businessKey);
      if (index >= 0) { const prior = current[index]; incoming.id = prior.id; incoming.createdAt = prior.createdAt; incoming.updatedAt = at; incoming.origin = 'SOURCE_SEED'; current[index] = incoming; } else current.push(incoming);
    }
    if (kind === 'rcas') draft.rcas = current as RcaRegistryRecord[]; else if (kind === 'launches') draft.launches = current as LaunchRegistryRecord[]; else draft.topRetailers = current as TopRetailRegistryRecord[];
    draft.lastSeed[kind] = { source: parsed.source, fileName: parsed.fileName, appliedAt: at, sourceRows: parsed.rows.length, competence: preview.competence };
  }, at);
  return { state: state!, preview: preview! };
}

export type RcaManualInput = Omit<RcaRegistryRecord, keyof RegistryCommon | 'sourceRow'> & { note?: string | null };
export type LaunchManualInput = Omit<LaunchRegistryRecord, keyof RegistryCommon | 'sourceRow'> & { note?: string | null };
export type TopManualInput = Omit<TopRetailRegistryRecord, keyof RegistryCommon | 'sourceRow'> & { note?: string | null };

export async function upsertManualRca(repository: AdminRegistryRepository, input: RcaManualInput, id?: string, at = nowIso()) {
  const currentCode = normalizeCode(input.currentCode); if (!currentCode) throw new Error('ADMIN_REGISTRY_RCA_CODE_REQUIRED');
  return repository.mutate(state => { const index = id ? state.rcas.findIndex(r => r.id === id) : -1; const prior = index >= 0 ? state.rcas[index] : null; const record: RcaRegistryRecord = { id: prior?.id ?? id ?? manualId('rca'), currentCode, legacyCode: normalizeCode(input.legacyCode), name: normalizeText(input.name), coordinatorCode: normalizeCode(input.coordinatorCode), coordinatorName: normalizeText(input.coordinatorName), role: input.role, active: prior?.active ?? true, validFromCompetence: input.validFromCompetence, validToCompetence: input.validToCompetence, origin: 'MANUAL', sourceRow: prior?.sourceRow ?? null, note: input.note ?? prior?.note ?? null, createdAt: prior?.createdAt ?? at, updatedAt: at }; validateRca(record); if (index >= 0) state.rcas[index] = record; else state.rcas.push(record); }, at);
}
export async function upsertManualLaunch(repository: AdminRegistryRepository, input: LaunchManualInput, id?: string, at = nowIso()) {
  const winthorCode = normalizeCode(input.winthorCode); const rawEan = input.ean === null ? '' : text(input.ean); const ean = normalizeAdminGtin(input.ean); if (rawEan && !ean) throw new Error('ADMIN_REGISTRY_LAUNCH_EAN_INVALID'); if (!winthorCode && !ean) throw new Error('ADMIN_REGISTRY_LAUNCH_IDENTITY_REQUIRED');
  return repository.mutate(state => { const index = id ? state.launches.findIndex(r => r.id === id) : -1; const prior = index >= 0 ? state.launches[index] : null; const record: LaunchRegistryRecord = { id: prior?.id ?? id ?? manualId('launch'), winthorCode, ean, description: normalizeText(input.description), type: normalizeText(input.type), status: normalizeText(input.status), active: prior?.active ?? true, validFromCompetence: input.validFromCompetence, validToCompetence: input.validToCompetence, origin: 'MANUAL', sourceRow: prior?.sourceRow ?? null, note: input.note ?? prior?.note ?? null, createdAt: prior?.createdAt ?? at, updatedAt: at }; validateLaunch(record); if (index >= 0) state.launches[index] = record; else state.launches.push(record); }, at);
}
export async function upsertManualTopRetail(repository: AdminRegistryRepository, input: TopManualInput, id?: string, at = nowIso()) {
  const customerCnpj = normalizeCnpj14(input.customerCnpj); const managerCnpj = input.managerCnpj ? normalizeCnpj14(input.managerCnpj) : null; const network = text(input.network);
  if (!isValidCompetenceId(input.competence) || !customerCnpj || !validCnpj(customerCnpj)) throw new Error('ADMIN_REGISTRY_TOP_IDENTITY_INVALID'); if (!network) throw new Error('ADMIN_REGISTRY_TOP_NETWORK_REQUIRED'); if (input.managerCnpj && (!managerCnpj || !validCnpj(managerCnpj))) throw new Error('ADMIN_REGISTRY_TOP_MANAGER_INVALID'); if (input.topTarget !== null && (!Number.isFinite(input.topTarget) || input.topTarget < 0)) throw new Error('ADMIN_REGISTRY_TOP_TARGET_INVALID');
  return repository.mutate(state => { const index = id ? state.topRetailers.findIndex(r => r.id === id) : -1; const prior = index >= 0 ? state.topRetailers[index] : null; const record: TopRetailRegistryRecord = { id: prior?.id ?? id ?? manualId('top'), competence: input.competence, customerCnpj, network, banner: normalizeText(input.banner), managerCnpj, groupCode: normalizeCode(input.groupCode), category: normalizeText(input.category), topTarget: input.topTarget, active: prior?.active ?? true, origin: 'MANUAL', sourceRow: prior?.sourceRow ?? null, note: input.note ?? prior?.note ?? null, createdAt: prior?.createdAt ?? at, updatedAt: at }; validateTop(record); if (index >= 0) state.topRetailers[index] = record; else state.topRetailers.push(record); }, at);
}
export async function setRegistryRecordActive(repository: AdminRegistryRepository, kind: AdminRegistryKind, id: string, active: boolean, at = nowIso()) {
  return repository.mutate(state => { const records = recordsOf(state, kind); const index = records.findIndex(r => r.id === id); if (index < 0) throw new Error('ADMIN_REGISTRY_RECORD_NOT_FOUND'); records[index] = { ...records[index], active, origin: 'MANUAL', updatedAt: at } as AdminRegistryRecord; if (kind === 'rcas') state.rcas = records as RcaRegistryRecord[]; else if (kind === 'launches') state.launches = records as LaunchRegistryRecord[]; else state.topRetailers = records as TopRetailRegistryRecord[]; }, at);
}
