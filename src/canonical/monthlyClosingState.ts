import { isValidCompetenceId } from './competence';
import type { GlobalAuditDomain, GlobalAuditOverallStatus, GlobalAuditSummary } from './globalAudit';

export const MONTHLY_CLOSING_FORMAT = 'blue-jacket-monthly-closing/v1' as const;
export const MONTHLY_CLOSING_STORAGE_KEY = 'blue-jacket-v1-monthly-closing-state';
export const MONTHLY_CLOSING_CHANGED_EVENT = 'blue-jacket-monthly-closing-changed';

export type MonthlyClosingBuildIdentity = {
  motorBuildId: string;
  engineVersion: string;
  stagingManifestHash: string;
  adminRegistryHash: string;
  rcaTargetRegistryHash: string;
  sourceReplacementProofHash: string;
  sourceReplacements: Array<{ source: string; scope: string }>;
  canonicalInputHash: string;
  schemaVersion: string;
  sourceContractVersion: string;
};

export type MonthlyClosingWarningEvidence = {
  id: string;
  code: string;
  domain: GlobalAuditDomain;
  count: number;
  message: string;
};

export type MonthlyClosingEvidence = {
  auditFormat: 'blue-jacket-global-audit/v1';
  auditSemanticHash: string;
  auditOverallStatus: GlobalAuditOverallStatus;
  auditSummary: GlobalAuditSummary;
  activeBuildIdentity: MonthlyClosingBuildIdentity;
  warnings: MonthlyClosingWarningEvidence[];
  warningIds: string[];
  sourceContractVersion: string;
};

export type MonthlyClosingWarningAcknowledgement = {
  acknowledged: boolean;
  warningIds: string[];
};

export type MonthlyClosingCloseEvent = {
  eventId: string;
  type: 'CLOSE';
  competence: string;
  revision: number;
  occurredAt: string;
  evidence: MonthlyClosingEvidence;
  warningAcknowledgement: MonthlyClosingWarningAcknowledgement;
  note: string | null;
};

export type MonthlyClosingReopenEvent = {
  eventId: string;
  type: 'REOPEN';
  competence: string;
  revision: number;
  occurredAt: string;
  closeEventId: string;
  reason: string;
};

export type MonthlyClosingEvent = MonthlyClosingCloseEvent | MonthlyClosingReopenEvent;

export type MonthlyClosingState = {
  format: typeof MONTHLY_CLOSING_FORMAT;
  schemaVersion: 'v1';
  initializedAt: string;
  updatedAt: string;
  events: MonthlyClosingEvent[];
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Listener = (state: MonthlyClosingState | null) => void;
const listeners = new Set<Listener>();
const storage = (): StorageLike => localStorage;
const isBrowserStorage = (target: StorageLike) => typeof localStorage !== 'undefined' && target === localStorage;
const validTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const validHash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
const validSummary = (value: unknown): value is GlobalAuditSummary => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GlobalAuditSummary>;
  return ['total', 'blockers', 'warnings', 'info', 'pass'].every(key => Number.isInteger((candidate as Record<string, unknown>)[key]) && Number((candidate as Record<string, unknown>)[key]) >= 0)
    && candidate.total === Number(candidate.blockers) + Number(candidate.warnings) + Number(candidate.info) + Number(candidate.pass);
};
const validDomain = (value: unknown): value is GlobalAuditDomain => ['SYSTEM', 'SOURCES', 'CANONICAL', 'REGISTRIES', 'TARGETS', 'COMPETENCE', 'SELL_OUT', 'NETWORKS', 'STOCK', 'PRODUCTS'].includes(String(value));
const validOverall = (value: unknown): value is GlobalAuditOverallStatus => value === 'HEALTHY' || value === 'ATTENTION' || value === 'BLOCKED';
const sortedUnique = (values: string[]) => [...new Set(values)].sort();
const byReplacement = (a: { source: string; scope: string }, b: { source: string; scope: string }) => a.source.localeCompare(b.source) || a.scope.localeCompare(b.scope);

function validateBuildIdentity(value: unknown): MonthlyClosingBuildIdentity {
  if (!value || typeof value !== 'object') throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  const candidate = value as Partial<MonthlyClosingBuildIdentity>;
  const required = [candidate.motorBuildId, candidate.engineVersion, candidate.stagingManifestHash, candidate.adminRegistryHash, candidate.rcaTargetRegistryHash, candidate.sourceReplacementProofHash, candidate.canonicalInputHash, candidate.schemaVersion, candidate.sourceContractVersion];
  if (required.some(item => !nonBlank(item)) || !Array.isArray(candidate.sourceReplacements)) throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  const sourceReplacements = candidate.sourceReplacements.map(raw => {
    if (!raw || typeof raw !== 'object' || !nonBlank((raw as { source?: unknown }).source) || !nonBlank((raw as { scope?: unknown }).scope)) throw new Error('MONTHLY_CLOSING_STATE_INVALID');
    return { source: (raw as { source: string }).source, scope: (raw as { scope: string }).scope };
  }).sort(byReplacement);
  return {
    motorBuildId: candidate.motorBuildId!,
    engineVersion: candidate.engineVersion!,
    stagingManifestHash: candidate.stagingManifestHash!,
    adminRegistryHash: candidate.adminRegistryHash!,
    rcaTargetRegistryHash: candidate.rcaTargetRegistryHash!,
    sourceReplacementProofHash: candidate.sourceReplacementProofHash!,
    sourceReplacements,
    canonicalInputHash: candidate.canonicalInputHash!,
    schemaVersion: candidate.schemaVersion!,
    sourceContractVersion: candidate.sourceContractVersion!,
  };
}

function validateWarning(value: unknown): MonthlyClosingWarningEvidence {
  if (!value || typeof value !== 'object') throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  const candidate = value as Partial<MonthlyClosingWarningEvidence>;
  if (!nonBlank(candidate.id) || !nonBlank(candidate.code) || !validDomain(candidate.domain) || !Number.isInteger(candidate.count) || Number(candidate.count) < 1 || typeof candidate.message !== 'string') throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  return { id: candidate.id!, code: candidate.code!, domain: candidate.domain!, count: candidate.count!, message: candidate.message };
}

function validateEvidence(value: unknown): MonthlyClosingEvidence {
  if (!value || typeof value !== 'object') throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  const candidate = value as Partial<MonthlyClosingEvidence>;
  if (candidate.auditFormat !== 'blue-jacket-global-audit/v1' || !validHash(candidate.auditSemanticHash) || !validOverall(candidate.auditOverallStatus) || !validSummary(candidate.auditSummary) || !nonBlank(candidate.sourceContractVersion) || !Array.isArray(candidate.warnings) || !Array.isArray(candidate.warningIds)) throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  const warnings = candidate.warnings.map(validateWarning).sort((a, b) => a.id.localeCompare(b.id));
  const warningIds = sortedUnique(candidate.warningIds.map(String));
  if (warningIds.length !== warnings.length || warningIds.some((id, index) => id !== warnings[index].id)) throw new Error('MONTHLY_CLOSING_WARNING_EVIDENCE_INVALID');
  if (candidate.auditOverallStatus === 'BLOCKED' || candidate.auditSummary.blockers > 0) throw new Error('MONTHLY_CLOSING_BLOCKED_EVIDENCE_INVALID');
  return {
    auditFormat: candidate.auditFormat,
    auditSemanticHash: candidate.auditSemanticHash,
    auditOverallStatus: candidate.auditOverallStatus,
    auditSummary: { ...candidate.auditSummary },
    activeBuildIdentity: validateBuildIdentity(candidate.activeBuildIdentity),
    warnings,
    warningIds,
    sourceContractVersion: candidate.sourceContractVersion,
  };
}

function validateCloseEvent(value: unknown): MonthlyClosingCloseEvent {
  if (!value || typeof value !== 'object') throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  const candidate = value as Partial<MonthlyClosingCloseEvent>;
  if (candidate.type !== 'CLOSE' || !isValidCompetenceId(candidate.competence) || !Number.isInteger(candidate.revision) || Number(candidate.revision) < 1 || !validTimestamp(candidate.occurredAt)) throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  const expectedId = `${candidate.competence}:CLOSE:${candidate.revision}`;
  if (candidate.eventId !== expectedId) throw new Error('MONTHLY_CLOSING_EVENT_ID_INVALID');
  const evidence = validateEvidence(candidate.evidence);
  const acknowledgement = candidate.warningAcknowledgement;
  if (!acknowledgement || typeof acknowledgement !== 'object' || typeof acknowledgement.acknowledged !== 'boolean' || !Array.isArray(acknowledgement.warningIds)) throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  const ackIds = sortedUnique(acknowledgement.warningIds.map(String));
  if (evidence.warningIds.length > 0) {
    if (!acknowledgement.acknowledged || ackIds.length !== evidence.warningIds.length || ackIds.some((id, index) => id !== evidence.warningIds[index])) throw new Error('MONTHLY_CLOSING_WARNING_ACK_INVALID');
    if (!nonBlank(candidate.note)) throw new Error('MONTHLY_CLOSING_WARNING_NOTE_REQUIRED');
  }
  if (candidate.note !== null && candidate.note !== undefined && typeof candidate.note !== 'string') throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  return {
    eventId: expectedId,
    type: 'CLOSE',
    competence: candidate.competence!,
    revision: candidate.revision!,
    occurredAt: candidate.occurredAt!,
    evidence,
    warningAcknowledgement: { acknowledged: acknowledgement.acknowledged, warningIds: ackIds },
    note: candidate.note?.trim() || null,
  };
}

function validateReopenEvent(value: unknown): MonthlyClosingReopenEvent {
  if (!value || typeof value !== 'object') throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  const candidate = value as Partial<MonthlyClosingReopenEvent>;
  if (candidate.type !== 'REOPEN' || !isValidCompetenceId(candidate.competence) || !Number.isInteger(candidate.revision) || Number(candidate.revision) < 1 || !validTimestamp(candidate.occurredAt) || !nonBlank(candidate.reason)) throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  const expectedId = `${candidate.competence}:REOPEN:${candidate.revision}`;
  const expectedCloseId = `${candidate.competence}:CLOSE:${candidate.revision}`;
  if (candidate.eventId !== expectedId || candidate.closeEventId !== expectedCloseId) throw new Error('MONTHLY_CLOSING_EVENT_ID_INVALID');
  return { eventId: expectedId, type: 'REOPEN', competence: candidate.competence!, revision: candidate.revision!, occurredAt: candidate.occurredAt!, closeEventId: expectedCloseId, reason: candidate.reason.trim() };
}

export function validateMonthlyClosingState(value: unknown): MonthlyClosingState {
  if (!value || typeof value !== 'object') throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  const candidate = value as Partial<MonthlyClosingState>;
  if (candidate.format !== MONTHLY_CLOSING_FORMAT || candidate.schemaVersion !== 'v1' || !validTimestamp(candidate.initializedAt) || !validTimestamp(candidate.updatedAt) || !Array.isArray(candidate.events)) throw new Error('MONTHLY_CLOSING_STATE_INVALID');
  const events = candidate.events.map(raw => (raw as { type?: unknown })?.type === 'CLOSE' ? validateCloseEvent(raw) : validateReopenEvent(raw));
  const ids = new Set<string>();
  const perCompetence = new Map<string, { revision: number; closed: boolean }>();
  for (const event of events) {
    if (ids.has(event.eventId)) throw new Error('MONTHLY_CLOSING_EVENT_DUPLICATE');
    ids.add(event.eventId);
    const current = perCompetence.get(event.competence) ?? { revision: 0, closed: false };
    if (event.type === 'CLOSE') {
      if (current.closed) throw new Error('MONTHLY_CLOSING_CLOSE_DUPLICATE');
      if (event.revision !== current.revision + 1) throw new Error('MONTHLY_CLOSING_REVISION_INVALID');
      perCompetence.set(event.competence, { revision: event.revision, closed: true });
    } else {
      if (!current.closed || event.revision !== current.revision || event.closeEventId !== `${event.competence}:CLOSE:${current.revision}`) throw new Error('MONTHLY_CLOSING_REOPEN_SEQUENCE_INVALID');
      perCompetence.set(event.competence, { revision: current.revision, closed: false });
    }
  }
  return { format: MONTHLY_CLOSING_FORMAT, schemaVersion: 'v1', initializedAt: candidate.initializedAt!, updatedAt: candidate.updatedAt!, events };
}

function notify(state: MonthlyClosingState | null) {
  for (const listener of listeners) listener(state);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MONTHLY_CLOSING_CHANGED_EVENT));
}

export function emptyMonthlyClosingState(timestamp = new Date().toISOString()): MonthlyClosingState {
  if (!validTimestamp(timestamp)) throw new Error('MONTHLY_CLOSING_TIMESTAMP_INVALID');
  return { format: MONTHLY_CLOSING_FORMAT, schemaVersion: 'v1', initializedAt: timestamp, updatedAt: timestamp, events: [] };
}

function persistMonthlyClosingState(state: MonthlyClosingState, target: StorageLike = storage()) {
  const validated = validateMonthlyClosingState(state);
  target.setItem(MONTHLY_CLOSING_STORAGE_KEY, JSON.stringify(validated));
  if (isBrowserStorage(target)) notify(validated);
  return validated;
}

export function loadMonthlyClosingState(target: StorageLike = storage()): MonthlyClosingState | null {
  const raw = target.getItem(MONTHLY_CLOSING_STORAGE_KEY);
  if (raw === null) return null;
  try { return validateMonthlyClosingState(JSON.parse(raw)); }
  catch (reason) { throw reason instanceof Error ? reason : new Error('MONTHLY_CLOSING_STATE_INVALID'); }
}

export function restoreMonthlyClosingState(value: unknown, target: StorageLike = storage()) {
  return persistMonthlyClosingState(validateMonthlyClosingState(value), target);
}

export function clearMonthlyClosingState(target: StorageLike = storage()) {
  target.removeItem(MONTHLY_CLOSING_STORAGE_KEY);
  if (isBrowserStorage(target)) notify(null);
}

export function replaceMonthlyClosingState(value: unknown | null, target: StorageLike = storage()) {
  if (value === null) { clearMonthlyClosingState(target); return null; }
  return restoreMonthlyClosingState(value, target);
}

export function subscribeMonthlyClosingState(listener: Listener) {
  listeners.add(listener);
  listener(loadMonthlyClosingState());
  return () => { listeners.delete(listener); };
}

export function appendMonthlyClosingEvent(state: MonthlyClosingState | null, event: MonthlyClosingEvent): MonthlyClosingState {
  const base = state ?? emptyMonthlyClosingState(event.occurredAt);
  return validateMonthlyClosingState({ ...base, updatedAt: event.occurredAt, events: [...base.events, event] });
}

export function closingEventsForCompetence(state: MonthlyClosingState | null, competence: string) {
  return (state?.events ?? []).filter(event => event.competence === competence);
}

export function latestCloseEvent(state: MonthlyClosingState | null, competence: string) {
  const closes = closingEventsForCompetence(state, competence).filter((event): event is MonthlyClosingCloseEvent => event.type === 'CLOSE');
  return closes.length ? closes[closes.length - 1] : null;
}

export function activeCloseEvent(state: MonthlyClosingState | null, competence: string) {
  const latest = latestCloseEvent(state, competence);
  if (!latest) return null;
  const reopened = closingEventsForCompetence(state, competence).some(event => event.type === 'REOPEN' && event.revision === latest.revision && event.closeEventId === latest.eventId);
  return reopened ? null : latest;
}

export function nextCloseRevision(state: MonthlyClosingState | null, competence: string) {
  return (latestCloseEvent(state, competence)?.revision ?? 0) + 1;
}

export function monthlyClosingEventId(competence: string, type: 'CLOSE' | 'REOPEN', revision: number) {
  if (!isValidCompetenceId(competence) || !Number.isInteger(revision) || revision < 1) throw new Error('MONTHLY_CLOSING_EVENT_ID_INVALID');
  return `${competence}:${type}:${revision}`;
}

export function assertMonthlyClosingCompetenceConsistency(competenceState: { records: Array<{ id: string; status: 'OPEN' | 'CLOSED' }> } | null, closingState: MonthlyClosingState | null) {
  if (!closingState) return true;
  for (const competence of [...new Set(closingState.events.map(event => event.competence))]) {
    const latest = closingEventsForCompetence(closingState, competence).at(-1);
    if (!latest) continue;
    const record = competenceState?.records.find(item => item.id === competence);
    if (!record) throw new Error('MONTHLY_CLOSING_COMPETENCE_INCONSISTENT');
    if (latest.type === 'CLOSE' && record.status !== 'CLOSED') throw new Error('MONTHLY_CLOSING_COMPETENCE_INCONSISTENT');
    if (latest.type === 'REOPEN' && record.status !== 'OPEN') throw new Error('MONTHLY_CLOSING_COMPETENCE_INCONSISTENT');
  }
  return true;
}
