import { isValidCompetenceId } from './competence';

export type CompetenceStatus = 'OPEN' | 'CLOSED';
export type CompetenceOrigin = 'MANUAL' | 'MIGRATION_M3' | 'MIGRATION_REPORT_SETTINGS' | 'SYNC';

export type CompetenceRecord = {
  id: string;
  status: CompetenceStatus;
  createdAt: string;
  updatedAt: string;
  origin: CompetenceOrigin;
  note?: string;
};

export type CompetenceState = {
  schemaVersion: 'v1';
  initializedAt: string;
  updatedAt: string;
  currentCompetence: string | null;
  records: CompetenceRecord[];
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Listener = (state: CompetenceState | null) => void;

export const COMPETENCE_STORAGE_KEY = 'blue-jacket-v1-competence-state';
export const COMPETENCE_CHANGED_EVENT = 'blue-jacket-competence-changed';
const listeners = new Set<Listener>();

const storage = (): StorageLike => localStorage;
const isBrowserStorage = (target: StorageLike) => typeof localStorage !== 'undefined' && target === localStorage;
const validTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nowIso = () => new Date().toISOString();

function validOrigin(value: unknown): value is CompetenceOrigin {
  return value === 'MANUAL' || value === 'MIGRATION_M3' || value === 'MIGRATION_REPORT_SETTINGS' || value === 'SYNC';
}

export function validateCompetenceState(value: unknown): CompetenceState {
  if (!value || typeof value !== 'object') throw new Error('COMPETENCE_STATE_INVALID');
  const candidate = value as Partial<CompetenceState>;
  if (candidate.schemaVersion !== 'v1' || !validTimestamp(candidate.initializedAt) || !validTimestamp(candidate.updatedAt) || !Array.isArray(candidate.records)) {
    throw new Error('COMPETENCE_STATE_INVALID');
  }

  const ids = new Set<string>();
  const records = candidate.records.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('COMPETENCE_STATE_INVALID');
    const record = raw as Partial<CompetenceRecord>;
    if (!isValidCompetenceId(record.id) || (record.status !== 'OPEN' && record.status !== 'CLOSED') || !validTimestamp(record.createdAt) || !validTimestamp(record.updatedAt) || !validOrigin(record.origin)) {
      throw new Error('COMPETENCE_STATE_INVALID');
    }
    if (ids.has(record.id)) throw new Error('COMPETENCE_STATE_DUPLICATE');
    ids.add(record.id);
    if (record.note !== undefined && typeof record.note !== 'string') throw new Error('COMPETENCE_STATE_INVALID');
    return { ...record } as CompetenceRecord;
  }).sort((a, b) => b.id.localeCompare(a.id));

  const currentCompetence = candidate.currentCompetence ?? null;
  if (currentCompetence !== null) {
    if (!isValidCompetenceId(currentCompetence)) throw new Error('COMPETENCE_CURRENT_INVALID');
    const current = records.find(record => record.id === currentCompetence);
    if (!current || current.status !== 'OPEN') throw new Error('COMPETENCE_CURRENT_NOT_OPEN');
  }

  return {
    schemaVersion: 'v1',
    initializedAt: candidate.initializedAt,
    updatedAt: candidate.updatedAt,
    currentCompetence,
    records,
  };
}

function notify(state: CompetenceState | null) {
  for (const listener of listeners) listener(state);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(COMPETENCE_CHANGED_EVENT));
}

function persist(state: CompetenceState, target: StorageLike = storage()) {
  const validated = validateCompetenceState(state);
  target.setItem(COMPETENCE_STORAGE_KEY, JSON.stringify(validated));
  if (isBrowserStorage(target)) notify(validated);
  return validated;
}

export function loadCompetenceState(target: StorageLike = storage()): CompetenceState | null {
  const raw = target.getItem(COMPETENCE_STORAGE_KEY);
  if (raw === null) return null;
  try { return validateCompetenceState(JSON.parse(raw)); }
  catch (reason) { throw reason instanceof Error ? reason : new Error('COMPETENCE_STATE_INVALID'); }
}

export function restoreCompetenceState(value: unknown, target: StorageLike = storage()) {
  return persist(validateCompetenceState(value), target);
}

export function clearCompetenceState(target: StorageLike = storage()) {
  target.removeItem(COMPETENCE_STORAGE_KEY);
  if (isBrowserStorage(target)) notify(null);
}

export function replaceCompetenceState(value: unknown | null, target: StorageLike = storage()) {
  if (value === null) { clearCompetenceState(target); return null; }
  return restoreCompetenceState(value, target);
}

function record(id: string, origin: CompetenceOrigin, timestamp: string): CompetenceRecord {
  return { id, status: 'OPEN', createdAt: timestamp, updatedAt: timestamp, origin };
}

export function bootstrapCompetenceState(
  observedM3: string | null | undefined,
  settingsCompetences: string[],
  options: { target?: StorageLike; now?: string } = {},
) {
  const target = options.target ?? storage();
  const existing = loadCompetenceState(target);
  if (existing) return existing;

  const timestamp = options.now ?? nowIso();
  if (!validTimestamp(timestamp)) throw new Error('COMPETENCE_TIMESTAMP_INVALID');
  const byId = new Map<string, CompetenceRecord>();
  for (const id of settingsCompetences) {
    if (isValidCompetenceId(id) && !byId.has(id)) byId.set(id, record(id, 'MIGRATION_REPORT_SETTINGS', timestamp));
  }

  let currentCompetence: string | null = null;
  if (isValidCompetenceId(observedM3)) {
    const current = byId.get(observedM3);
    byId.set(observedM3, current ? { ...current, origin: 'MIGRATION_M3', updatedAt: timestamp } : record(observedM3, 'MIGRATION_M3', timestamp));
    currentCompetence = observedM3;
  }

  return persist({
    schemaVersion: 'v1',
    initializedAt: timestamp,
    updatedAt: timestamp,
    currentCompetence,
    records: [...byId.values()],
  }, target);
}

export function createManualCompetence(id: string, options: { target?: StorageLike; now?: string } = {}) {
  if (!isValidCompetenceId(id)) throw new Error('COMPETENCE_ID_INVALID');
  const target = options.target ?? storage();
  const timestamp = options.now ?? nowIso();
  const current = loadCompetenceState(target) ?? bootstrapCompetenceState(null, [], { target, now: timestamp });
  if (current.records.some(item => item.id === id)) return { state: current, created: false } as const;
  const next = persist({ ...current, updatedAt: timestamp, records: [...current.records, record(id, 'MANUAL', timestamp)] }, target);
  return { state: next, created: true } as const;
}

export function setCurrentCompetence(id: string, options: { target?: StorageLike; now?: string } = {}) {
  if (!isValidCompetenceId(id)) throw new Error('COMPETENCE_ID_INVALID');
  const target = options.target ?? storage();
  const timestamp = options.now ?? nowIso();
  const current = loadCompetenceState(target);
  if (!current) throw new Error('COMPETENCE_STATE_MISSING');
  const selected = current.records.find(item => item.id === id);
  if (!selected) throw new Error('COMPETENCE_RECORD_NOT_FOUND');
  if (selected.status !== 'OPEN') throw new Error('COMPETENCE_CURRENT_NOT_OPEN');
  return persist({
    ...current,
    currentCompetence: id,
    updatedAt: timestamp,
    records: current.records.map(item => item.id === id ? { ...item, updatedAt: timestamp } : item),
  }, target);
}

export function subscribeCompetenceState(listener: Listener) {
  listeners.add(listener);
  listener(loadCompetenceState());
  return () => { listeners.delete(listener); };
}

export function competenceRecord(state: CompetenceState | null, id: string | null | undefined) {
  return id ? state?.records.find(record => record.id === id) ?? null : null;
}
