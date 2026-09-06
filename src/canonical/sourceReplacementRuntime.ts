import type { AdminRegistryState } from './adminRegistry';
import { resolveLaunchAuthority, resolveTopAuthority } from './adminRegistryAuthority';
import { createRcaResolver } from './rcaResolver';
import { HARD_REQUIRED_SOURCE_IDS, REPLACEABLE_SOURCE_IDS, sourceScopeFor, type SourceReplacementScope } from './sourceContract';
import { certificateFor, type SourceReplacementCertificate, type SourceReplacementState } from './sourceReplacementState';
import { resolveTargetAuthority } from './targetAuthority';
import type { TargetState } from './targetStore';
import type { ParsedSource, RawTyped } from './types';

export type ReplacementStageEvidence = {
  source: string;
  manifest: {
    fileHash: string;
    parserVersion: string;
    schemaVersion: string;
    parsedRows: number;
    status?: string;
  };
  parsed: ParsedSource;
};

export type SourceBuildStatus = 'HARD_PRESENT' | 'HARD_MISSING' | 'PHYSICAL' | 'REPLACED' | 'REPLACEMENT_REQUIRED' | 'REVIEW_REQUIRED' | 'COVERAGE_BROKEN';
export type SourceBuildDiagnostic = { sourceId: string; status: SourceBuildStatus; scope: SourceReplacementScope | null; reason: string };

const RCA_SOURCE = 'NOVOS RCAS.xlsx';
const LAUNCH_SOURCE = 'lançamentos.xlsx';
const TOP_SOURCE = "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx";
const TARGET_SOURCE = 'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx';
const typedValue = (row: Record<string, RawTyped>, field: string) => row[field]?.typed ?? row[field]?.raw ?? null;

function competenceFromDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 7);
  const raw = String(value ?? '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12) return `${iso[1]}-${iso[2]}`;
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (!br) return null;
  const year = br[3].length === 2 ? `20${br[3]}` : br[3];
  const month = br[2].padStart(2, '0');
  return Number(month) >= 1 && Number(month) <= 12 ? `${year}-${month}` : null;
}

export function operationalCompetenceFromPhysicalStages(stages: ReplacementStageEvidence[]) {
  const sales = stages.find(stage => stage.source === 'vendas-8022.xls')?.parsed;
  if (!sales) return null;
  const values = [...new Set(sales.rows.map(row => competenceFromDate(typedValue(row, 'movement_date'))).filter((value): value is string => Boolean(value)))];
  return values.length === 1 ? values[0] : null;
}

function validateRcaCoverage(certificate: SourceReplacementCertificate, registry: AdminRegistryState | null) {
  const resolver = createRcaResolver([], registry);
  for (const key of certificate.coverageKeys) {
    const match = key.match(/^RCA\|(CURRENT|LEGACY)\|([^|]+)\|(PRINCIPAL|AUXILIAR)$/);
    if (!match) return false;
    const result = match[1] === 'CURRENT' ? resolver.resolveCurrent(match[2]) : resolver.resolveLegacy(match[2]);
    const tombstone = result.auditCode === 'ADMIN_REGISTRY_RCA_TOMBSTONE';
    if (result.status === 'AMBIGUOUS_RCA_CODE') return false;
    if (result.canonicalId) { if (result.role !== match[3]) return false; }
    else if (!tombstone) return false;
  }
  return true;
}

function validateLaunchCoverage(certificate: SourceReplacementCertificate, registry: AdminRegistryState | null) {
  for (const key of certificate.coverageKeys) {
    const match = key.match(/^LAUNCH\|WINTHOR:(.*?)\|EAN:(.*)$/);
    if (!match) return false;
    const result = resolveLaunchAuthority(registry, null, { winthorCode: match[1] === '-' ? null : match[1], eans: match[2] === '-' ? [] : [match[2]], competence: null });
    if (result.ambiguous || result.validityUnresolved || (!result.record && !result.tombstone)) return false;
  }
  return true;
}

function validateTopCoverage(certificate: SourceReplacementCertificate, registry: AdminRegistryState | null) {
  for (const key of certificate.coverageKeys) {
    const match = key.match(/^TOP\|(\d{4}-\d{2})\|CNPJ:(\d{14})$/);
    if (!match) return false;
    const result = resolveTopAuthority(registry, match[1], match[2], null);
    if (result.ambiguous || (!result.record && !result.tombstone)) return false;
  }
  return true;
}

function validateTargetCoverage(certificate: SourceReplacementCertificate, targetState: TargetState | null) {
  for (const key of certificate.coverageKeys) {
    const match = key.match(/^TARGET\|(\d{4}-\d{2})\|(RCA:.+)$/);
    if (!match) return false;
    const result = resolveTargetAuthority(targetState, match[1], match[2]);
    if (result.ambiguous || (!result.record && !result.tombstone)) return false;
  }
  return true;
}

export function replacementCertificateCoverageValid(certificate: SourceReplacementCertificate, registry: AdminRegistryState | null, targetState: TargetState | null) {
  if (certificate.sourceId === RCA_SOURCE) return validateRcaCoverage(certificate, registry);
  if (certificate.sourceId === LAUNCH_SOURCE) return validateLaunchCoverage(certificate, registry);
  if (certificate.sourceId === TOP_SOURCE) return validateTopCoverage(certificate, registry);
  if (certificate.sourceId === TARGET_SOURCE) return validateTargetCoverage(certificate, targetState);
  return false;
}

export function resolveEffectiveSourceSet(input: {
  physicalStages: ReplacementStageEvidence[];
  replacementState: SourceReplacementState | null;
  adminRegistryState: AdminRegistryState | null;
  targetState: TargetState | null;
}) {
  const operationalCompetence = operationalCompetenceFromPhysicalStages(input.physicalStages);
  const diagnostics: SourceBuildDiagnostic[] = [];
  const certificates: SourceReplacementCertificate[] = [];
  const omitted = new Set<string>();

  for (const sourceId of HARD_REQUIRED_SOURCE_IDS) {
    const present = input.physicalStages.some(stage => stage.source === sourceId);
    diagnostics.push({ sourceId, scope: null, status: present ? 'HARD_PRESENT' : 'HARD_MISSING', reason: present ? 'Fonte física hard-required disponível.' : 'Fonte física hard-required ausente.' });
  }

  for (const sourceId of REPLACEABLE_SOURCE_IDS) {
    const physical = input.physicalStages.find(stage => stage.source === sourceId) ?? null;
    const scope = sourceScopeFor(sourceId, operationalCompetence);
    const certificate = scope ? certificateFor(input.replacementState, sourceId, scope) : null;
    if (certificate) {
      if (physical && physical.manifest.fileHash !== certificate.sourceFileHash) {
        diagnostics.push({ sourceId, scope, status: 'REVIEW_REQUIRED', reason: 'Nova versão física difere do arquivo certificado; fallback físico continua bloqueado.' });
        continue;
      }
      if (!replacementCertificateCoverageValid(certificate, input.adminRegistryState, input.targetState)) {
        diagnostics.push({ sourceId, scope, status: 'COVERAGE_BROKEN', reason: 'CoverageKey certificada deixou de ter decisão administrativa inequívoca.' });
        continue;
      }
      diagnostics.push({ sourceId, scope, status: 'REPLACED', reason: 'Fonte fisicamente suportada, porém logicamente omitida pelo certificado ativo.' });
      certificates.push(certificate);
      omitted.add(sourceId);
      continue;
    }
    if (physical) diagnostics.push({ sourceId, scope, status: 'PHYSICAL', reason: 'Sem certificado aplicável; fonte física permanece obrigatória para este build.' });
    else diagnostics.push({ sourceId, scope, status: 'REPLACEMENT_REQUIRED', reason: scope ? 'Fonte física ausente e não há certificado válido para este escopo.' : 'Fonte física ausente e competência operacional não permite selecionar certificado mensal.' });
  }

  const hardMissing = diagnostics.filter(item => item.status === 'HARD_MISSING').map(item => item.sourceId);
  const replacementRequired = diagnostics.filter(item => item.status === 'REPLACEMENT_REQUIRED').map(item => item.sourceId);
  const reviewRequired = diagnostics.filter(item => item.status === 'REVIEW_REQUIRED').map(item => item.sourceId);
  const coverageBroken = diagnostics.filter(item => item.status === 'COVERAGE_BROKEN').map(item => item.sourceId);
  const canonicalStages = input.physicalStages.filter(stage => !omitted.has(stage.source));
  return { operationalCompetence, diagnostics, certificates, omitted: [...omitted], canonicalStages, hardMissing, replacementRequired, reviewRequired, coverageBroken };
}

export function assertEffectiveSourceSetReady(result: ReturnType<typeof resolveEffectiveSourceSet>) {
  if (result.hardMissing.length) throw new Error(`HARD_MISSING:${result.hardMissing.join('|')}`);
  if (result.reviewRequired.length) throw new Error(`REPLACEMENT_REVIEW_REQUIRED:${result.reviewRequired.join('|')}`);
  if (result.coverageBroken.length) throw new Error(`REPLACEMENT_COVERAGE_BROKEN:${result.coverageBroken.join('|')}`);
  if (result.replacementRequired.length) throw new Error(`REPLACEMENT_REQUIRED:${result.replacementRequired.join('|')}`);
  return result;
}

export const sourceReplacementRuntimeTestHelpers = { competenceFromDate, validateRcaCoverage, validateLaunchCoverage, validateTopCoverage, validateTargetCoverage };
