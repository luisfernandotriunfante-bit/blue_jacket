import { globalAuditGate, sortGlobalAuditFindings, type GlobalAuditFinding, type GlobalAuditReport } from './globalAudit';
import { validateCompetenceState, type CompetenceState } from './competenceStore';
import {
  MONTHLY_CLOSING_FORMAT,
  activeCloseEvent,
  closingEventsForCompetence,
  latestCloseEvent,
  type MonthlyClosingBuildIdentity,
  type MonthlyClosingCloseEvent,
  type MonthlyClosingEvidence,
  type MonthlyClosingState,
  type MonthlyClosingWarningEvidence,
  validateMonthlyClosingState,
} from './monthlyClosingState';
import { CANONICAL_ENGINE_VERSION } from './sourceImport';
import type { ActiveCanonicalBundle } from './runtime';

export const MONTHLY_CLOSING_CERTIFICATE_FORMAT = 'blue-jacket-monthly-closing-certificate/v1' as const;
const encoder = new TextEncoder();

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
  }
  return value;
}

async function sha256(value: unknown) {
  const bytes = encoder.encode(JSON.stringify(normalize(value)));
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

const sortReplacements = (items: Array<{ source: string; scope: string }>) => [...items].sort((a, b) => a.source.localeCompare(b.source) || a.scope.localeCompare(b.scope));
const sortIds = (ids: string[]) => [...new Set(ids)].sort();

export function monthlyClosingBuildIdentity(active: ActiveCanonicalBundle | null): MonthlyClosingBuildIdentity {
  if (!active
    || active.engineVersion !== CANONICAL_ENGINE_VERSION
    || !active.motorBuildId
    || !active.stagingManifestHash
    || !active.adminRegistryHash
    || !active.rcaTargetRegistryHash
    || active.sourceContractVersion !== 'v2'
    || !active.sourceReplacementProofHash
    || !Array.isArray(active.sourceReplacements)
    || !active.canonicalInputHash
    || !active.schemaVersion) throw new Error('MONTHLY_CLOSE_ACTIVE_BUILD_INVALID');
  return {
    motorBuildId: active.motorBuildId,
    engineVersion: active.engineVersion,
    stagingManifestHash: active.stagingManifestHash,
    adminRegistryHash: active.adminRegistryHash,
    rcaTargetRegistryHash: active.rcaTargetRegistryHash,
    sourceReplacementProofHash: active.sourceReplacementProofHash,
    sourceReplacements: sortReplacements(active.sourceReplacements),
    canonicalInputHash: active.canonicalInputHash,
    schemaVersion: active.schemaVersion,
    sourceContractVersion: active.sourceContractVersion,
  };
}

function semanticFinding(finding: GlobalAuditFinding) {
  return {
    id: finding.id,
    code: finding.code,
    status: finding.status,
    domain: finding.domain,
    count: finding.count,
    source: finding.source ?? null,
    listId: finding.listId ?? null,
    competence: finding.competence ?? null,
    scope: finding.scope ?? null,
    message: finding.message,
    action: finding.action,
    technicalDetails: normalize(finding.technicalDetails ?? null),
  };
}

export function monthlyClosingAuditProjection(report: GlobalAuditReport) {
  return {
    format: report.format,
    activeBuildIdentity: monthlyClosingBuildIdentity(report.activeBuild),
    partial: report.partial,
    overallStatus: report.overallStatus,
    summary: { ...report.summary },
    findings: sortGlobalAuditFindings(report.findings).map(semanticFinding),
  };
}

export const monthlyClosingAuditHash = (report: GlobalAuditReport) => sha256(monthlyClosingAuditProjection(report));

function canonicalClosingState(state: MonthlyClosingState | null) {
  if (!state) return null;
  const valid = validateMonthlyClosingState(state);
  const events = [...valid.events].sort((a, b) => a.competence.localeCompare(b.competence)
    || a.revision - b.revision
    || (a.type === b.type ? 0 : a.type === 'CLOSE' ? -1 : 1)
    || a.eventId.localeCompare(b.eventId));
  return { ...valid, events };
}

export const monthlyClosingStateHash = (state: MonthlyClosingState | null) => sha256(['blue-jacket-monthly-closing-state-hash/v1', canonicalClosingState(state)]);

export function monthlyClosingSyncProjection(competenceState: CompetenceState | null, closingState: MonthlyClosingState | null) {
  const competence = competenceState ? validateCompetenceState(competenceState) : null;
  return {
    format: 'blue-jacket-monthly-closing-sync/v1',
    competenceState: competence ? { ...competence, records: [...competence.records].sort((a, b) => a.id.localeCompare(b.id)) } : null,
    monthlyClosingState: canonicalClosingState(closingState),
  };
}

export const monthlyClosingSyncHash = (competenceState: CompetenceState | null, closingState: MonthlyClosingState | null) => sha256(monthlyClosingSyncProjection(competenceState, closingState));

export function warningEvidence(report: GlobalAuditReport): MonthlyClosingWarningEvidence[] {
  return report.findings.filter(item => item.status === 'WARNING').map(item => ({ id: item.id, code: item.code, domain: item.domain, count: item.count, message: item.message })).sort((a, b) => a.id.localeCompare(b.id));
}

export async function buildMonthlyClosingEvidence(report: GlobalAuditReport): Promise<MonthlyClosingEvidence> {
  const warnings = warningEvidence(report);
  const activeBuildIdentity = monthlyClosingBuildIdentity(report.activeBuild);
  return {
    auditFormat: report.format,
    auditSemanticHash: await monthlyClosingAuditHash(report),
    auditOverallStatus: report.overallStatus,
    auditSummary: { ...report.summary },
    activeBuildIdentity,
    warnings,
    warningIds: warnings.map(item => item.id),
    sourceContractVersion: activeBuildIdentity.sourceContractVersion,
  };
}

export type MonthlyClosingAcknowledgement = { reviewed: boolean; warningIds: string[]; note: string };
export type MonthlyClosingPreview = {
  competence: string;
  activeBuildIdentity: MonthlyClosingBuildIdentity | null;
  auditSemanticHash: string | null;
  auditStatus: GlobalAuditReport['overallStatus'];
  partial: boolean;
  blockers: GlobalAuditFinding[];
  warnings: GlobalAuditFinding[];
  warningIds: string[];
  canClose: boolean;
  reason: string | null;
};

export async function previewMonthlyClosing(report: GlobalAuditReport, competenceState: CompetenceState | null, competence: string, acknowledgement?: MonthlyClosingAcknowledgement): Promise<MonthlyClosingPreview> {
  const blockers = report.findings.filter(item => item.status === 'BLOCKER');
  const warnings = report.findings.filter(item => item.status === 'WARNING');
  const warningIds = warnings.map(item => item.id).sort();
  let activeBuildIdentity: MonthlyClosingBuildIdentity | null = null;
  let auditSemanticHash: string | null = null;
  try { activeBuildIdentity = monthlyClosingBuildIdentity(report.activeBuild); auditSemanticHash = await monthlyClosingAuditHash(report); }
  catch { /* reason below */ }
  const record = competenceState?.records.find(item => item.id === competence) ?? null;
  let reason: string | null = null;
  if (!record || record.status !== 'OPEN' || competenceState?.currentCompetence !== competence) reason = 'MONTHLY_CLOSE_NOT_CURRENT';
  else if (report.partial) reason = 'MONTHLY_CLOSE_AUDIT_PARTIAL';
  else if (globalAuditGate(report) === 'BLOCKED') reason = 'MONTHLY_CLOSE_AUDIT_BLOCKED';
  else if (!activeBuildIdentity || !auditSemanticHash) reason = 'MONTHLY_CLOSE_ACTIVE_BUILD_INVALID';
  else if (warnings.length) {
    const ackIds = sortIds(acknowledgement?.warningIds ?? []);
    if (!acknowledgement?.reviewed || ackIds.length !== warningIds.length || ackIds.some((id, index) => id !== warningIds[index])) reason = 'MONTHLY_CLOSE_WARNINGS_ACK_REQUIRED';
    else if (!acknowledgement.note.trim()) reason = 'MONTHLY_CLOSE_WARNING_NOTE_REQUIRED';
  }
  return { competence, activeBuildIdentity, auditSemanticHash, auditStatus: report.overallStatus, partial: report.partial, blockers, warnings, warningIds, canClose: reason === null, reason };
}

export async function monthlyClosingEvidenceHash(closeEvent: MonthlyClosingCloseEvent) {
  return sha256({
    format: 'blue-jacket-monthly-closing-evidence/v1',
    competence: closeEvent.competence,
    revision: closeEvent.revision,
    auditSemanticHash: closeEvent.evidence.auditSemanticHash,
    activeBuildIdentity: closeEvent.evidence.activeBuildIdentity,
    warningIds: sortIds(closeEvent.evidence.warningIds),
    warningAcknowledgement: { acknowledged: closeEvent.warningAcknowledgement.acknowledged, warningIds: sortIds(closeEvent.warningAcknowledgement.warningIds) },
    note: closeEvent.note,
  });
}

export async function monthlyClosingCertificate(state: MonthlyClosingState, competence: string, revision: number) {
  const valid = validateMonthlyClosingState(state);
  const close = closingEventsForCompetence(valid, competence).find((event): event is MonthlyClosingCloseEvent => event.type === 'CLOSE' && event.revision === revision);
  if (!close) throw new Error('MONTHLY_CLOSING_CLOSE_NOT_FOUND');
  const reopen = closingEventsForCompetence(valid, competence).find(event => event.type === 'REOPEN' && event.revision === revision) ?? null;
  return {
    format: MONTHLY_CLOSING_CERTIFICATE_FORMAT,
    competence,
    revision,
    closedAt: close.occurredAt,
    evidence: close.evidence,
    warningAcknowledgement: close.warningAcknowledgement,
    note: close.note,
    reopen,
    evidenceHash: await monthlyClosingEvidenceHash(close),
  } as const;
}

export async function exportMonthlyClosingCertificateJson(state: MonthlyClosingState, competence: string, revision: number) {
  return JSON.stringify(normalize(await monthlyClosingCertificate(state, competence, revision)), null, 2);
}

export const monthlyClosingIdentityTestHelpers = { normalize, sha256, semanticFinding, canonicalClosingState, latestCloseEvent, activeCloseEvent, MONTHLY_CLOSING_FORMAT };
