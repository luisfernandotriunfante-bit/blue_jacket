import type { AdminRegistryState } from './adminRegistry';
import { evaluateSourceReplacementReadiness, type ReplacementReadinessDetail, type SourceReplacementReadiness } from './sourceDependencyContract';
import { proveSourceReplacementEquivalence, type SourceStageEvidence } from './sourceReplacementAuthority';
import { createRcaResolver, rcaMasterEntries } from './rcaResolver';
import { REPLACEABLE_SOURCE_IDS, sourceScopeFor, type SourceReplacementAuthority, type SourceReplacementScope } from './sourceContract';
import {
  SOURCE_REPLACEMENT_PROOF_VERSION,
  coverageHashFor,
  type SourceReplacementCertificate,
} from './sourceReplacementState';
import { replacementCertificateCoverageValid } from './sourceReplacementRuntime';
import type { TargetState } from './targetStore';
import type { ParsedSource, RawTyped } from './types';

const RCA_SOURCE = 'NOVOS RCAS.xlsx';
const LAUNCH_SOURCE = 'lançamentos.xlsx';
const TOP_SOURCE = "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx";
const TARGET_SOURCE = 'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx';
const replaceable = new Set<string>(REPLACEABLE_SOURCE_IDS);
const typed = (row: Record<string, RawTyped>, field: string) => row[field]?.typed ?? row[field]?.raw ?? null;
const clean = (value: unknown) => String(value ?? '').trim().replace(/\.0+$/, '');
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const normalizeEan = (value: unknown) => { const raw = digits(value); return raw.length === 12 ? `0${raw}` : raw; };
const normalizeCnpj = (value: unknown) => digits(value).padStart(14, '0').slice(-14);

export function evaluateSourceReplacementReadinessV21(stages: ParsedSource[], registry: AdminRegistryState | null, targetState: TargetState | null): SourceReplacementReadiness[] {
  const base = evaluateSourceReplacementReadiness(stages, registry, targetState);
  return base.map(item => {
    if (item.sourceId !== RCA_SOURCE || item.status === 'READY') return item;
    const physical = stages.find(stage => stage.source === RCA_SOURCE);
    if (!physical || !registry?.rcas.length) return item;
    const currentDetail = item.details[0];
    if (!currentDetail || currentDetail.conflicts > 0) return item;
    const resolver = createRcaResolver([], registry);
    const coverageResolvable = rcaMasterEntries([physical]).every(entry => {
      const resolutions = [resolver.resolveCurrent(entry.currentCode, entry.name), ...(entry.legacyCode ? [resolver.resolveLegacy(entry.legacyCode, entry.name)] : [])];
      return resolutions.every(resolution => Boolean(resolution.canonicalId) || resolution.auditCode === 'ADMIN_REGISTRY_RCA_TOMBSTONE');
    });
    if (!coverageResolvable) return item;
    const proof = proveSourceReplacementEquivalence(RCA_SOURCE, stages, registry, targetState);
    if (!proof.equivalent) return item;
    const detail: ReplacementReadinessDetail = {
      ...currentDetail,
      status: 'READY',
      coveredInternally: currentDetail.sourceRecords,
      unresolved: 0,
      reason: 'v21: M2/M3/M4, namespaces current/legacy, papel, coordenador e audit_flags permanecem integralmente equivalentes sem NOVOS RCAS após a correção do residual RCA_UNRESOLVED.',
    };
    return { ...item, status: 'READY', classification: 'REPLACEABLE_CANDIDATE', details: [detail] };
  });
}

async function coverageKeysForV21(sourceId: string, scope: SourceReplacementScope, physical: ParsedSource, allStages: ParsedSource[], registry: AdminRegistryState | null) {
  if (sourceId === RCA_SOURCE) {
    const resolver = createRcaResolver([], registry);
    const keys = rcaMasterEntries([physical]).flatMap(entry => {
      const current = resolver.resolveCurrent(entry.currentCode, entry.name);
      const currentRole = current.canonicalId ? current.role : entry.role;
      const legacy = entry.legacyCode ? resolver.resolveLegacy(entry.legacyCode, entry.name) : null;
      const legacyRole = legacy?.canonicalId ? legacy.role : entry.role;
      return [
        `RCA|CURRENT|${entry.currentCode}|${currentRole}`,
        ...(entry.legacyCode ? [`RCA|LEGACY|${entry.legacyCode}|${legacyRole}`] : []),
      ];
    });
    return [...new Set(keys)].sort();
  }
  if (sourceId === LAUNCH_SOURCE) {
    return physical.rows.map(row => {
      const code = clean(typed(row, 'launch_winthor_code'));
      const ean = normalizeEan(typed(row, 'launch_ean'));
      return `LAUNCH|WINTHOR:${code || '-'}|EAN:${ean || '-'}`;
    }).sort();
  }
  if (!scope.startsWith('COMPETENCE:')) return [];
  const competence = scope.slice('COMPETENCE:'.length);
  if (sourceId === TOP_SOURCE) return physical.rows.map(row => `TOP|${competence}|CNPJ:${normalizeCnpj(typed(row, 'cnpj'))}`).sort();
  if (sourceId === TARGET_SOURCE) {
    const resolver = createRcaResolver(allStages, registry);
    const keys: string[] = [];
    for (const row of physical.rows) {
      if (String(typed(row, 'pasta_type') ?? '').trim().toUpperCase() !== 'MCD' || String(typed(row, 'industry_name') ?? '').trim().toUpperCase() !== 'COLGATE') continue;
      const resolution = resolver.resolveLegacy(typed(row, 'target_rca_code'), typed(row, 'target_rca_name'), competence);
      if (resolution.canonicalId) keys.push(`TARGET|${competence}|${resolution.canonicalId}`);
    }
    return keys.sort();
  }
  return [];
}

export async function certifySourceReplacementV21(input: {
  sourceId: string;
  scope: SourceReplacementScope;
  physicalStage: SourceStageEvidence | null;
  allStages: ParsedSource[];
  adminRegistryState: AdminRegistryState | null;
  targetState: TargetState | null;
  now?: string;
}): Promise<SourceReplacementCertificate> {
  if (!replaceable.has(input.sourceId)) throw new Error('SOURCE_REPLACEMENT_NOT_SUPPORTED');
  if (!input.physicalStage || input.physicalStage.source !== input.sourceId) throw new Error('SOURCE_REPLACEMENT_PHYSICAL_STAGE_REQUIRED');
  const competence = input.scope === 'GLOBAL' ? null : input.scope.slice('COMPETENCE:'.length);
  if (sourceScopeFor(input.sourceId, competence) !== input.scope) throw new Error('SOURCE_REPLACEMENT_SCOPE_INVALID');

  const readiness = evaluateSourceReplacementReadinessV21(input.allStages, input.adminRegistryState, input.targetState).find(item => item.sourceId === input.sourceId);
  const detail = input.scope === 'GLOBAL'
    ? readiness?.details.find(item => item.competence === null) ?? readiness?.details[0]
    : readiness?.details.find(item => `COMPETENCE:${item.competence}` === input.scope);
  if (!readiness || !detail || detail.status !== 'READY') throw new Error('SOURCE_REPLACEMENT_NOT_READY');
  if (detail.conflicts > 0 || detail.unresolved > 0) throw new Error('SOURCE_REPLACEMENT_CONFLICTED');

  const proof = proveSourceReplacementEquivalence(input.sourceId, input.allStages, input.adminRegistryState, input.targetState);
  if (!proof.equivalent) throw new Error('SOURCE_REPLACEMENT_EQUIVALENCE_FAILED');
  const coverageKeys = await coverageKeysForV21(input.sourceId, input.scope, input.physicalStage.parsed, input.allStages, input.adminRegistryState);
  if (!coverageKeys.length) throw new Error('SOURCE_REPLACEMENT_COVERAGE_EMPTY');
  const coverageHash = await coverageHashFor(coverageKeys);
  const certificate: SourceReplacementCertificate = {
    id: `${input.sourceId}|${input.scope}|${coverageHash.slice(0, 16)}`,
    sourceId: input.sourceId,
    scope: input.scope,
    replacementAuthority: readiness.replacementAuthority as SourceReplacementAuthority,
    sourceFileHash: input.physicalStage.manifest.fileHash,
    sourceParserVersion: input.physicalStage.manifest.parserVersion,
    sourceSchemaVersion: input.physicalStage.manifest.schemaVersion,
    sourceRows: input.physicalStage.manifest.parsedRows,
    coverageKeys,
    coverageHash,
    proofVersion: SOURCE_REPLACEMENT_PROOF_VERSION,
    certifiedAt: input.now ?? new Date().toISOString(),
  };
  if (!replacementCertificateCoverageValid(certificate, input.adminRegistryState, input.targetState)) throw new Error('SOURCE_REPLACEMENT_COVERAGE_BROKEN');
  return certificate;
}

export const sourceReplacementCertificationTestHelpers = { coverageKeysForV21 };
