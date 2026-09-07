import type { AdminRegistryState } from './adminRegistry';
import { applyAdminRegistryCanonicalAuthority } from './adminRegistryCanonicalAuthority';
import { resolveLaunchAuthority, resolveTopAuthority } from './adminRegistryAuthority';
import { buildCanonicalBundleFromStaging } from './motors';
import { createRcaResolver, rcaMasterEntries } from './rcaResolver';
import { evaluateSourceReplacementReadiness, semanticBusinessEquivalent, type SourceReplacementAuthority } from './sourceDependencyContract';
import { REPLACEABLE_SOURCE_IDS, sourceScopeFor, type SourceReplacementScope } from './sourceContract';
import {
  SOURCE_REPLACEMENT_PROOF_VERSION,
  certificateFor,
  coverageHashFor,
  type SourceReplacementCertificate,
  type SourceReplacementState,
} from './sourceReplacementState';
import { applyTargetAuthorityToM3, resolveTargetAuthority } from './targetAuthority';
import type { TargetState } from './targetStore';
import { materializeTopRetailRouteInM2 } from './topRetailM2';
import type { CanonicalBundle, CanonicalList, ParsedSource, RawTyped } from './types';

export type SourceStageEvidence = {
  source: string;
  manifest: {
    fileHash: string;
    parserVersion: string;
    schemaVersion: string;
    parsedRows: number;
  };
  parsed: ParsedSource;
};

export type CertificateRuntimeStatus = 'NOT_ACTIVE' | 'ACTIVE' | 'REVIEW_REQUIRED' | 'COVERAGE_BROKEN' | 'WRONG_SCOPE';
export type CertificateRuntimeDiagnostic = {
  sourceId: string;
  scope: SourceReplacementScope | null;
  status: CertificateRuntimeStatus;
  certificate: SourceReplacementCertificate | null;
  reason: string;
};

const RCA_SOURCE = 'NOVOS RCAS.xlsx';
const LAUNCH_SOURCE = 'lançamentos.xlsx';
const TOP_SOURCE = "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx";
const TARGET_SOURCE = 'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx';
const replaceable = new Set<string>(REPLACEABLE_SOURCE_IDS);

const typedValue = (row: Record<string, RawTyped>, field: string) => row[field]?.typed ?? row[field]?.raw ?? null;
const cleanCode = (value: unknown) => String(value ?? '').trim().replace(/\.0+$/, '');
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const ean = (value: unknown) => { const valueDigits = digits(value); return valueDigits.length === 12 ? `0${valueDigits}` : valueDigits; };
const cnpj = (value: unknown) => digits(value).padStart(14, '0').slice(-14);
const without = (stages: ParsedSource[], sourceId: string) => stages.filter(stage => stage.source !== sourceId);

function competenceFromDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 7);
  const raw = String(value ?? '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12) return `${iso[1]}-${iso[2]}`;
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (br) return `${br[3].length === 2 ? `20${br[3]}` : br[3]}-${br[2].padStart(2, '0')}`;
  return null;
}

export function operationalCompetenceFromStages(stages: ParsedSource[]) {
  const sales = stages.find(stage => stage.source === 'vendas-8022.xls');
  if (!sales) return null;
  const values = [...new Set(sales.rows.map(row => competenceFromDate(typedValue(row, 'movement_date'))).filter((value): value is string => Boolean(value)))];
  return values.length === 1 ? values[0] : null;
}

function canonicalize(bundle: CanonicalBundle, stages: ParsedSource[], registry: AdminRegistryState | null, targetState: TargetState | null) {
  applyAdminRegistryCanonicalAuthority(bundle, stages, registry);
  bundle.lists.M3_MOVIMENTO_VENDAS = applyTargetAuthorityToM3(bundle.lists.M3_MOVIMENTO_VENDAS, stages, targetState, registry);
  bundle.lists.M2_CLIENTE_RCA = materializeTopRetailRouteInM2(bundle.lists.M2_CLIENTE_RCA, stages, registry);
  return bundle;
}

function stripExecutionMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripExecutionMetadata);
  if (!value || typeof value !== 'object') return value;
  const ignored = new Set(['generatedAt', 'approvedAt', 'motorBuildId', 'stagingManifestHash', 'adminRegistryHash', 'rcaTargetRegistryHash', 'canonicalInputHash', 'updatedAt', 'createdAt', 'certifiedAt']);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !ignored.has(key)).map(([key, item]) => [key, stripExecutionMetadata(item)]));
}

function rcaProjection(bundle: CanonicalBundle) {
  const m2 = bundle.lists.M2_CLIENTE_RCA.records.map(record => ({
    customer_canonical_id: record.customer_canonical_id,
    rca_canonical_id: record.rca_canonical_id,
    rca_current_code: record.rca_current_code,
    rca_legacy_code: record.rca_legacy_code,
    rca_name: record.rca_name,
    coordinator_code: record.coordinator_code,
    coordinator_name: record.coordinator_name,
    audit_flags: record.audit_flags,
  }));
  const m3 = bundle.lists.M3_MOVIMENTO_VENDAS.records.filter(record => record.fact_type === 'SALE' || record.fact_type === 'TARGET').map(record => ({
    fact_id: record.fact_id,
    fact_type: record.fact_type,
    transaction_rca_code: record.transaction_rca_code,
    rca_canonical_id: record.rca_canonical_id,
    target_assignment_status: record.target_assignment_status,
    audit_flags: record.audit_flags,
  }));
  const m4 = bundle.lists.M4_HISTORICO_TRANSICAO.records.map(record => ({
    row_type: record.row_type,
    movement_date: record.movement_date,
    legacy_rca_code: record.legacy_rca_code,
    rca_canonical_id: record.rca_canonical_id,
    mapping_status: record.mapping_status,
    audit_flags: record.audit_flags,
  }));
  return { m2, m3, m4 };
}

function launchProjection(list: CanonicalList) {
  return list.records.map(record => ({
    item_canonical_id: record.item_canonical_id,
    winthor_code: record.winthor_code,
    internal_ean: record.internal_ean,
    industry_ean: record.industry_ean,
    physical_stock_units: record.physical_stock_units,
    available_stock_units: record.available_stock_units,
    cost_unit_105: record.cost_unit_105,
    is_launch: record.is_launch,
    launch_status: record.launch_status,
    mapping_status: record.mapping_status,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function topProjection(list: CanonicalList) {
  return list.records.map(record => ({
    customer_canonical_id: record.customer_canonical_id,
    cnpj: record.cnpj,
    top_network: record.top_network,
    top_banner: record.top_banner,
    manager_cnpj: record.manager_cnpj,
    top_group_code: record.top_group_code,
    top_category: record.top_category,
    top_target: record.top_target,
    top_route_competence: record.top_route_competence,
    network_resolution_status: record.network_resolution_status,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function targetProjection(list: CanonicalList) {
  return list.records.filter(record => record.fact_type === 'TARGET').map(record => ({
    fact_id: record.fact_id,
    competence: record.competence,
    transaction_rca_code: record.transaction_rca_code,
    rca_canonical_id: record.rca_canonical_id,
    sales_target: record.sales_target,
    positivity_target: record.positivity_target,
    target_assignment_status: record.target_assignment_status,
    audit_flags: record.audit_flags,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function proveSourceReplacementEquivalence(sourceId: string, stages: ParsedSource[], registry: AdminRegistryState | null, targetState: TargetState | null) {
  if (!replaceable.has(sourceId)) return { equivalent: false, reason: 'SOURCE_NOT_REPLACEABLE' };
  const withSource = canonicalize(buildCanonicalBundleFromStaging(stages), stages, registry, targetState);
  const omittedStages = without(stages, sourceId);
  const withoutSource = canonicalize(buildCanonicalBundleFromStaging(omittedStages), omittedStages, registry, targetState);
  let left: unknown;
  let right: unknown;
  if (sourceId === RCA_SOURCE) { left = rcaProjection(withSource); right = rcaProjection(withoutSource); }
  else if (sourceId === LAUNCH_SOURCE) { left = launchProjection(withSource.lists.M1_ITEM_ESTOQUE); right = launchProjection(withoutSource.lists.M1_ITEM_ESTOQUE); }
  else if (sourceId === TOP_SOURCE) { left = topProjection(withSource.lists.M2_CLIENTE_RCA); right = topProjection(withoutSource.lists.M2_CLIENTE_RCA); }
  else { left = targetProjection(withSource.lists.M3_MOVIMENTO_VENDAS); right = targetProjection(withoutSource.lists.M3_MOVIMENTO_VENDAS); }
  const equivalent = semanticBusinessEquivalent(stripExecutionMetadata(left), stripExecutionMetadata(right));
  return { equivalent, reason: equivalent ? 'SEMANTICALLY_EQUIVALENT' : 'SEMANTIC_DIFFERENCE', withSource: left, withoutSource: right };
}

async function coverageKeysFor(sourceId: string, scope: SourceReplacementScope, stage: ParsedSource, stages: ParsedSource[], registry: AdminRegistryState | null, targetState: TargetState | null) {
  if (sourceId === RCA_SOURCE) {
    return rcaMasterEntries([stage]).flatMap(entry => [
      `RCA|CURRENT|${entry.currentCode}|${entry.role}`,
      ...(entry.legacyCode ? [`RCA|LEGACY|${entry.legacyCode}|${entry.role}`] : []),
    ]).sort();
  }
  if (sourceId === LAUNCH_SOURCE) {
    return stage.rows.map(row => {
      const code = cleanCode(typedValue(row, 'launch_winthor_code'));
      const itemEan = ean(typedValue(row, 'launch_ean'));
      return `LAUNCH|WINTHOR:${code || '-'}|EAN:${itemEan || '-'}`;
    }).sort();
  }
  const competence = scope.startsWith('COMPETENCE:') ? scope.slice('COMPETENCE:'.length) : null;
  if (!competence) return [];
  if (sourceId === TOP_SOURCE) {
    return stage.rows.map(row => `TOP|${competence}|CNPJ:${cnpj(typedValue(row, 'cnpj'))}`).sort();
  }
  const resolver = createRcaResolver(stages, registry);
  const keys: string[] = [];
  for (const row of stage.rows) {
    if (String(typedValue(row, 'pasta_type') ?? '').trim().toUpperCase() !== 'MCD' || String(typedValue(row, 'industry_name') ?? '').trim().toUpperCase() !== 'COLGATE') continue;
    const resolution = resolver.resolveLegacy(typedValue(row, 'target_rca_code'), typedValue(row, 'target_rca_name'), competence);
    if (resolution.canonicalId) keys.push(`TARGET|${competence}|${resolution.canonicalId}`);
  }
  return keys.sort();
}

function parseCoverageKey(key: string) { return key.split('|'); }

export function validateCertificateCoverage(certificate: SourceReplacementCertificate, stages: ParsedSource[], registry: AdminRegistryState | null, targetState: TargetState | null) {
  if (certificate.sourceId === RCA_SOURCE) {
    const resolver = createRcaResolver([], registry);
    for (const key of certificate.coverageKeys) {
      const [, namespace, code, role] = parseCoverageKey(key);
      const resolution = namespace === 'CURRENT' ? resolver.resolveCurrent(code) : resolver.resolveLegacy(code);
      const explicitTombstone = resolution.auditCode === 'ADMIN_REGISTRY_RCA_TOMBSTONE';
      if ((!resolution.canonicalId && !explicitTombstone) || (resolution.canonicalId && resolution.role !== role) || resolution.status === 'AMBIGUOUS_RCA_CODE') return false;
    }
    return true;
  }
  if (certificate.sourceId === LAUNCH_SOURCE) {
    for (const key of certificate.coverageKeys) {
      const match = key.match(/^LAUNCH\|WINTHOR:(.*?)\|EAN:(.*)$/);
      if (!match) return false;
      const result = resolveLaunchAuthority(registry, null, { winthorCode: match[1] === '-' ? null : match[1], eans: match[2] === '-' ? [] : [match[2]], competence: null });
      if (result.ambiguous || result.validityUnresolved || (!result.record && !result.tombstone)) return false;
    }
    return true;
  }
  if (certificate.sourceId === TOP_SOURCE) {
    for (const key of certificate.coverageKeys) {
      const match = key.match(/^TOP\|(\d{4}-\d{2})\|CNPJ:(\d{14})$/);
      if (!match) return false;
      const result = resolveTopAuthority(registry, match[1], match[2], null);
      if (result.ambiguous || (!result.record && !result.tombstone)) return false;
    }
    return true;
  }
  if (certificate.sourceId === TARGET_SOURCE) {
    for (const key of certificate.coverageKeys) {
      const match = key.match(/^TARGET\|(\d{4}-\d{2})\|(RCA:.+)$/);
      if (!match) return false;
      const result = resolveTargetAuthority(targetState, match[1], match[2]);
      if (result.ambiguous || (!result.record && !result.tombstone)) return false;
    }
    return true;
  }
  return false;
}

export async function createSourceReplacementCertificate(input: {
  sourceId: string;
  scope: SourceReplacementScope;
  physicalStage: SourceStageEvidence | null;
  allStages: ParsedSource[];
  adminRegistryState: AdminRegistryState | null;
  targetState: TargetState | null;
  now?: string;
}) {
  if (!replaceable.has(input.sourceId)) throw new Error('SOURCE_REPLACEMENT_NOT_SUPPORTED');
  if (!input.physicalStage || input.physicalStage.source !== input.sourceId) throw new Error('SOURCE_REPLACEMENT_PHYSICAL_STAGE_REQUIRED');
  const expectedScope = sourceScopeFor(input.sourceId, input.scope === 'GLOBAL' ? null : input.scope.slice('COMPETENCE:'.length));
  if (expectedScope !== input.scope) throw new Error('SOURCE_REPLACEMENT_SCOPE_INVALID');
  const readiness = evaluateSourceReplacementReadiness(input.allStages, input.adminRegistryState, input.targetState).find(item => item.sourceId === input.sourceId);
  const detail = input.scope === 'GLOBAL' ? readiness?.details.find(item => item.competence === null) ?? readiness?.details[0] : readiness?.details.find(item => `COMPETENCE:${item.competence}` === input.scope);
  if (!readiness || !detail || detail.status !== 'READY') throw new Error('SOURCE_REPLACEMENT_NOT_READY');
  if (detail.conflicts > 0 || detail.unresolved > 0) throw new Error('SOURCE_REPLACEMENT_CONFLICTED');
  const proof = proveSourceReplacementEquivalence(input.sourceId, input.allStages, input.adminRegistryState, input.targetState);
  if (!proof.equivalent) throw new Error('SOURCE_REPLACEMENT_EQUIVALENCE_FAILED');
  const coverageKeys = await coverageKeysFor(input.sourceId, input.scope, input.physicalStage.parsed, input.allStages, input.adminRegistryState, input.targetState);
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
  if (!validateCertificateCoverage(certificate, input.allStages, input.adminRegistryState, input.targetState)) throw new Error('SOURCE_REPLACEMENT_COVERAGE_BROKEN');
  return certificate;
}

export function certificateRuntimeDiagnostic(input: {
  sourceId: string;
  scope: SourceReplacementScope | null;
  state: SourceReplacementState | null;
  physicalStage: SourceStageEvidence | null;
  stages: ParsedSource[];
  registry: AdminRegistryState | null;
  targetState: TargetState | null;
}): CertificateRuntimeDiagnostic {
  if (!input.scope) return { sourceId: input.sourceId, scope: null, status: 'WRONG_SCOPE', certificate: null, reason: 'Competência operacional MIXED/UNRESOLVED; certificado mensal não pode ser inferido.' };
  const certificate = certificateFor(input.state, input.sourceId, input.scope);
  if (!certificate) return { sourceId: input.sourceId, scope: input.scope, status: 'NOT_ACTIVE', certificate: null, reason: 'Nenhum certificado ativo para este escopo.' };
  if (input.physicalStage && input.physicalStage.manifest.fileHash !== certificate.sourceFileHash) return { sourceId: input.sourceId, scope: input.scope, status: 'REVIEW_REQUIRED', certificate, reason: 'Nova versão física detectada; reconciliar/recertificar ou revogar explicitamente.' };
  if (!validateCertificateCoverage(certificate, input.stages, input.registry, input.targetState)) return { sourceId: input.sourceId, scope: input.scope, status: 'COVERAGE_BROKEN', certificate, reason: 'A autoridade interna deixou de cobrir alguma coverageKey certificada de forma inequívoca.' };
  return { sourceId: input.sourceId, scope: input.scope, status: 'ACTIVE', certificate, reason: 'Certificado válido para o escopo operacional atual.' };
}

export function activeCertificatesForBuild(input: {
  state: SourceReplacementState | null;
  physicalStages: SourceStageEvidence[];
  parsedStages: ParsedSource[];
  registry: AdminRegistryState | null;
  targetState: TargetState | null;
  operationalCompetence: string | null;
}) {
  const certificates: SourceReplacementCertificate[] = [];
  const diagnostics: CertificateRuntimeDiagnostic[] = [];
  for (const sourceId of REPLACEABLE_SOURCE_IDS) {
    const scope = sourceScopeFor(sourceId, input.operationalCompetence);
    const physicalStage = input.physicalStages.find(stage => stage.source === sourceId) ?? null;
    const diagnostic = certificateRuntimeDiagnostic({ sourceId, scope, state: input.state, physicalStage, stages: input.parsedStages, registry: input.registry, targetState: input.targetState });
    diagnostics.push(diagnostic);
    if (diagnostic.status === 'REVIEW_REQUIRED') throw new Error(`SOURCE_REPLACEMENT_REVIEW_REQUIRED:${sourceId}:${scope ?? 'UNRESOLVED'}`);
    if (diagnostic.status === 'COVERAGE_BROKEN') throw new Error(`SOURCE_REPLACEMENT_COVERAGE_BROKEN:${sourceId}:${scope ?? 'UNRESOLVED'}`);
    if (diagnostic.status === 'ACTIVE' && diagnostic.certificate) certificates.push(diagnostic.certificate);
  }
  return { certificates, diagnostics };
}

export const sourceReplacementAuthorityTestHelpers = { coverageKeysFor, rcaProjection, launchProjection, topProjection, targetProjection, stripExecutionMetadata, competenceFromDate };
