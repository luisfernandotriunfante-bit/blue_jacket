import { isValidCompetenceId } from './competence';
import type { ReportSettings } from './reportSettings';

export const TARGET_STATE_FORMAT = 'blue-jacket-target-state/v1' as const;
export const TARGET_STATE_STORAGE_KEY = 'blue-jacket-v1-target-state';
export const TARGET_STATE_CHANGED_EVENT = 'blue-jacket-target-state-changed';

export type TargetOrigin = 'MANUAL' | 'SOURCE_SEED';
export type RcaTargetRecord = {
  id: string;
  competence: string;
  rcaCanonicalId: string;
  sourceRcaCode: string | null;
  salesTarget: number;
  positivityTarget: number;
  active: boolean;
  origin: TargetOrigin;
  createdAt: string;
  updatedAt: string;
  note: string | null;
};
export type CompetenceTargetRecord = {
  competence: string;
  sellOutTarget: number | null;
  positivityTarget: number | null;
  networkTarget: number | null;
  rcaTargets: RcaTargetRecord[];
  createdAt: string;
  updatedAt: string;
};
export type TargetState = {
  format: typeof TARGET_STATE_FORMAT;
  schemaVersion: 'v1';
  records: CompetenceTargetRecord[];
  createdAt: string;
  updatedAt: string;
};

export type TargetStateStorage = {
  read: () => unknown | null;
  write: (value: TargetState) => void;
  clear: () => void;
};

type Listener = (state: TargetState | null) => void;
const listeners = new Set<Listener>();
const clone = <T>(value: T): T => structuredClone(value);
const nowIso = () => new Date().toISOString();
const validTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const validOptionalTarget = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const validTarget = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function notify(state: TargetState | null) {
  for (const listener of listeners) listener(state);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TARGET_STATE_CHANGED_EVENT));
}

function validateRcaTarget(value: unknown, competence: string): RcaTargetRecord {
  if (!value || typeof value !== 'object') throw new Error('TARGET_RCA_RECORD_INVALID');
  const record = value as Partial<RcaTargetRecord>;
  if (typeof record.id !== 'string' || !record.id.trim()) throw new Error('TARGET_RCA_RECORD_INVALID');
  if (record.competence !== competence || !isValidCompetenceId(record.competence)) throw new Error('TARGET_RCA_COMPETENCE_INVALID');
  if (typeof record.rcaCanonicalId !== 'string' || !/^RCA:.+/.test(record.rcaCanonicalId)) throw new Error('TARGET_RCA_IDENTITY_INVALID');
  if (!nullableString(record.sourceRcaCode) || !validTarget(record.salesTarget) || !validTarget(record.positivityTarget)) throw new Error('TARGET_RCA_VALUE_INVALID');
  if (typeof record.active !== 'boolean' || (record.origin !== 'MANUAL' && record.origin !== 'SOURCE_SEED')) throw new Error('TARGET_RCA_RECORD_INVALID');
  if (!validTimestamp(record.createdAt) || !validTimestamp(record.updatedAt) || !nullableString(record.note)) throw new Error('TARGET_RCA_RECORD_INVALID');
  return clone(record as RcaTargetRecord);
}

function validateCompetenceTarget(value: unknown): CompetenceTargetRecord {
  if (!value || typeof value !== 'object') throw new Error('TARGET_COMPETENCE_RECORD_INVALID');
  const record = value as Partial<CompetenceTargetRecord>;
  if (!isValidCompetenceId(record.competence)) throw new Error('TARGET_COMPETENCE_INVALID');
  if (!validOptionalTarget(record.sellOutTarget) || !validOptionalTarget(record.positivityTarget) || !validOptionalTarget(record.networkTarget)) throw new Error('TARGET_GENERAL_VALUE_INVALID');
  if (!Array.isArray(record.rcaTargets) || !validTimestamp(record.createdAt) || !validTimestamp(record.updatedAt)) throw new Error('TARGET_COMPETENCE_RECORD_INVALID');
  const rcaTargets = record.rcaTargets.map(item => validateRcaTarget(item, record.competence!));
  const ids = rcaTargets.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('TARGET_RCA_DUPLICATE_ID');
  return {
    competence: record.competence!, sellOutTarget: record.sellOutTarget!, positivityTarget: record.positivityTarget!, networkTarget: record.networkTarget!,
    rcaTargets, createdAt: record.createdAt!, updatedAt: record.updatedAt!,
  };
}

export function validateTargetState(value: unknown): TargetState {
  if (!value || typeof value !== 'object') throw new Error('TARGET_STATE_INVALID');
  const candidate = value as Partial<TargetState>;
  if (candidate.format !== TARGET_STATE_FORMAT || candidate.schemaVersion !== 'v1' || !Array.isArray(candidate.records) || !validTimestamp(candidate.createdAt) || !validTimestamp(candidate.updatedAt)) throw new Error('TARGET_STATE_INVALID');
  const records = candidate.records.map(validateCompetenceTarget);
  const competences = records.map(record => record.competence);
  if (new Set(competences).size !== competences.length) throw new Error('TARGET_COMPETENCE_DUPLICATE');
  const allIds = records.flatMap(record => record.rcaTargets.map(target => target.id));
  if (new Set(allIds).size !== allIds.length) throw new Error('TARGET_RCA_DUPLICATE_ID');
  return { format: TARGET_STATE_FORMAT, schemaVersion: 'v1', records, createdAt: candidate.createdAt!, updatedAt: candidate.updatedAt! };
}

export function emptyTargetState(now = nowIso()): TargetState {
  if (!validTimestamp(now)) throw new Error('TARGET_TIMESTAMP_INVALID');
  return { format: TARGET_STATE_FORMAT, schemaVersion: 'v1', records: [], createdAt: now, updatedAt: now };
}

class LocalStorageTargetStateStorage implements TargetStateStorage {
  read() {
    const raw = localStorage.getItem(TARGET_STATE_STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
  }
  write(value: TargetState) {
    localStorage.setItem(TARGET_STATE_STORAGE_KEY, JSON.stringify(value));
    notify(value);
  }
  clear() {
    localStorage.removeItem(TARGET_STATE_STORAGE_KEY);
    notify(null);
  }
}

export class TargetStateRepository {
  constructor(private readonly storage: TargetStateStorage) {}
  load() {
    const value = this.storage.read();
    return value === null ? null : validateTargetState(value);
  }
  replace(value: TargetState | null) {
    const previous = this.load();
    const expected = value === null ? null : validateTargetState(value);
    try {
      if (expected === null) this.storage.clear(); else this.storage.write(expected);
      const verified = this.load();
      if (!sameJson(verified, expected)) throw new Error('TARGET_STATE_STORAGE_VERIFY_FAILED');
      return verified;
    } catch (reason) {
      try { if (previous === null) this.storage.clear(); else this.storage.write(previous); } catch { /* original error remains actionable */ }
      throw reason;
    }
  }
}

export class InMemoryTargetStateStorage implements TargetStateStorage {
  private value: unknown | null;
  private failWrite = false;
  constructor(initial: unknown | null = null) { this.value = initial === null ? null : clone(initial); }
  read() { return this.value === null ? null : clone(this.value); }
  write(value: TargetState) { if (this.failWrite) { this.failWrite = false; throw new Error('TARGET_STATE_TEST_WRITE_FAILED'); } this.value = clone(value); }
  clear() { if (this.failWrite) { this.failWrite = false; throw new Error('TARGET_STATE_TEST_WRITE_FAILED'); } this.value = null; }
  failNextWrite() { this.failWrite = true; }
}

export const targetStateRepository = new TargetStateRepository(new LocalStorageTargetStateStorage());
export const loadTargetState = () => targetStateRepository.load();
export const replaceTargetState = (value: TargetState | null) => targetStateRepository.replace(value);
export const restoreTargetState = (value: unknown) => targetStateRepository.replace(validateTargetState(value));
export const clearTargetState = () => targetStateRepository.replace(null);
export function subscribeTargetState(listener: Listener) {
  listeners.add(listener);
  listener(loadTargetState());
  return () => { listeners.delete(listener); };
}

export function competenceTargetRecord(state: TargetState | null, competence: string) {
  return state?.records.find(record => record.competence === competence) ?? null;
}

function generalFromSettings(settings: ReportSettings, competence: string) {
  return {
    sellOutTarget: settings.sellOutTargetByCompetence[competence] ?? null,
    positivityTarget: settings.positivityTargetByCompetence[competence] ?? null,
    networkTarget: settings.networkTargetByCompetence[competence] ?? null,
  };
}

/** Safe one-time bootstrap: only already competence-specific ReportSettings are copied. Legacy global targets are deliberately ignored. */
export function bootstrapTargetStateFromReportSettings(settings: ReportSettings, repository: TargetStateRepository = targetStateRepository, now = nowIso()) {
  const existing = repository.load();
  if (existing) return { status: 'PRESERVED', state: existing } as const;
  if (!validTimestamp(now)) throw new Error('TARGET_TIMESTAMP_INVALID');
  const competences = [...new Set([
    ...Object.keys(settings.sellOutTargetByCompetence ?? {}),
    ...Object.keys(settings.positivityTargetByCompetence ?? {}),
    ...Object.keys(settings.networkTargetByCompetence ?? {}),
  ])].filter(isValidCompetenceId).sort();
  const state: TargetState = {
    format: TARGET_STATE_FORMAT,
    schemaVersion: 'v1',
    createdAt: now,
    updatedAt: now,
    records: competences.map(competence => ({ competence, ...generalFromSettings(settings, competence), rcaTargets: [], createdAt: now, updatedAt: now })),
  };
  repository.replace(state);
  return { status: 'INITIALIZED', state: repository.load()! } as const;
}

function ensureCompetenceRecord(state: TargetState, competence: string, now: string) {
  const existing = state.records.find(record => record.competence === competence);
  if (existing) return existing;
  const created: CompetenceTargetRecord = { competence, sellOutTarget: null, positivityTarget: null, networkTarget: null, rcaTargets: [], createdAt: now, updatedAt: now };
  state.records.push(created);
  return created;
}

function assertTargetInput(value: number | null, code: string) {
  if (value !== null && !validTarget(value)) throw new Error(code);
}

export function withGeneralTargets(current: TargetState | null, competence: string, input: { sellOutTarget: number | null; positivityTarget: number | null; networkTarget: number | null }, now = nowIso()) {
  if (!isValidCompetenceId(competence)) throw new Error('TARGET_COMPETENCE_INVALID');
  assertTargetInput(input.sellOutTarget, 'TARGET_GENERAL_VALUE_INVALID');
  assertTargetInput(input.positivityTarget, 'TARGET_GENERAL_VALUE_INVALID');
  assertTargetInput(input.networkTarget, 'TARGET_GENERAL_VALUE_INVALID');
  const state = clone(current ?? emptyTargetState(now));
  const record = ensureCompetenceRecord(state, competence, now);
  record.sellOutTarget = input.sellOutTarget;
  record.positivityTarget = input.positivityTarget;
  record.networkTarget = input.networkTarget;
  record.updatedAt = now;
  state.updatedAt = now;
  return validateTargetState(state);
}

export type ManualRcaTargetInput = {
  competence: string;
  rcaCanonicalId: string;
  sourceRcaCode?: string | null;
  salesTarget: number;
  positivityTarget: number;
  note?: string | null;
};

export function withManualRcaTarget(current: TargetState | null, input: ManualRcaTargetInput, id?: string, now = nowIso()) {
  if (!isValidCompetenceId(input.competence) || !/^RCA:.+/.test(input.rcaCanonicalId)) throw new Error('TARGET_RCA_IDENTITY_INVALID');
  if (!validTarget(input.salesTarget) || !validTarget(input.positivityTarget)) throw new Error('TARGET_RCA_VALUE_INVALID');
  const state = clone(current ?? emptyTargetState(now));
  const competence = ensureCompetenceRecord(state, input.competence, now);
  const existing = id
    ? competence.rcaTargets.find(record => record.id === id)
    : competence.rcaTargets.find(record => record.rcaCanonicalId === input.rcaCanonicalId && record.competence === input.competence);
  if (id && !existing) throw new Error('TARGET_RCA_RECORD_NOT_FOUND');
  const next: RcaTargetRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    competence: input.competence,
    rcaCanonicalId: input.rcaCanonicalId,
    sourceRcaCode: input.sourceRcaCode ?? existing?.sourceRcaCode ?? null,
    salesTarget: input.salesTarget,
    positivityTarget: input.positivityTarget,
    active: existing?.active ?? true,
    origin: 'MANUAL',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    note: input.note ?? null,
  };
  if (existing) Object.assign(existing, next); else competence.rcaTargets.push(next);
  competence.updatedAt = now;
  state.updatedAt = now;
  return validateTargetState(state);
}

export function withRcaTargetActive(current: TargetState | null, competenceId: string, id: string, active: boolean, now = nowIso()) {
  if (!current) throw new Error('TARGET_STATE_MISSING');
  const state = clone(current);
  const competence = state.records.find(record => record.competence === competenceId);
  const target = competence?.rcaTargets.find(record => record.id === id);
  if (!competence || !target) throw new Error('TARGET_RCA_RECORD_NOT_FOUND');
  target.active = active;
  target.origin = 'MANUAL';
  target.updatedAt = now;
  competence.updatedAt = now;
  state.updatedAt = now;
  return validateTargetState(state);
}

export function targetStateCompetences(state: TargetState | null = loadTargetState()) {
  return (state?.records ?? []).map(record => record.competence).sort().reverse();
}
