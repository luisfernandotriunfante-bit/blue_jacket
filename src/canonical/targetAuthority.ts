import type { AdminRegistryState } from './adminRegistry';
import { competenceFromParsedSource, isValidCompetenceId } from './competence';
import { createRcaResolver, type RcaResolution } from './rcaResolver';
import type { TargetState, RcaTargetRecord } from './targetStore';
import type { CanonicalAudit, CanonicalList, ParsedSource, RawTyped } from './types';

export const BUSSOLA_SOURCE_ID = 'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx';

type TargetFact = Record<string, unknown>;
type TargetResolution = {
  record: RcaTargetRecord | null;
  authority: 'MANUAL' | 'SOURCE_SEED' | 'BUSSOLA' | 'NONE';
  tombstone: boolean;
  ambiguous: boolean;
};

const value = (row: Record<string, RawTyped>, field: string) => row[field]?.typed ?? null;
const bussolaContext = (row: Record<string, RawTyped>) => String(value(row, 'target_rca_code_context') ?? 'LEGACY').trim().toUpperCase();

export function resolveBussolaRca(resolver: ReturnType<typeof createRcaResolver>, row: Record<string, RawTyped>, competence?: string | null) {
  const code = value(row, 'target_rca_code');
  const name = value(row, 'target_rca_name');
  return bussolaContext(row) === 'CURRENT'
    ? resolver.resolveCurrent(code, name, competence)
    : resolver.resolveLegacy(code, name, competence);
}
const semantic = (record: RcaTargetRecord) => JSON.stringify({
  competence: record.competence,
  rcaCanonicalId: record.rcaCanonicalId,
  sourceRcaCode: record.sourceRcaCode,
  salesTarget: record.salesTarget,
  positivityTarget: record.positivityTarget,
  active: record.active,
  origin: record.origin,
});
const issue = (code: string, message: string, source = 'AdminTargetRegistry'): CanonicalAudit => ({
  code, severity: 'WARNING', source, file: '', message,
  action: 'Resolver a divergência em Administração → Metas antes de depender deste TARGET.',
});

function targetRecords(state: TargetState | null, competence: string, rcaCanonicalId: string) {
  return state?.records.find(record => record.competence === competence)?.rcaTargets.filter(record => record.rcaCanonicalId === rcaCanonicalId) ?? [];
}

export function resolveTargetAuthority(state: TargetState | null, competence: string, rcaCanonicalId: string): TargetResolution {
  const matching = targetRecords(state, competence, rcaCanonicalId);
  const manualActive = matching.filter(record => record.origin === 'MANUAL' && record.active);
  if (manualActive.length) {
    if (new Set(manualActive.map(semantic)).size > 1) return { record: null, authority: 'MANUAL', tombstone: false, ambiguous: true };
    return { record: manualActive[0], authority: 'MANUAL', tombstone: false, ambiguous: false };
  }
  const manualTombstone = matching.find(record => record.origin === 'MANUAL' && !record.active);
  if (manualTombstone) return { record: null, authority: 'MANUAL', tombstone: true, ambiguous: false };

  const seededActive = matching.filter(record => record.origin === 'SOURCE_SEED' && record.active);
  if (seededActive.length) {
    if (new Set(seededActive.map(semantic)).size > 1) return { record: null, authority: 'SOURCE_SEED', tombstone: false, ambiguous: true };
    return { record: seededActive[0], authority: 'SOURCE_SEED', tombstone: false, ambiguous: false };
  }
  return { record: null, authority: 'NONE', tombstone: false, ambiguous: false };
}

function physicalTargetRows(sources: ParsedSource[], registry: AdminRegistryState | null) {
  const source = sources.find(item => item.source === BUSSOLA_SOURCE_ID);
  const competence = source ? competenceFromParsedSource(source) : null;
  const resolver = createRcaResolver(sources, registry);
  const rows = (source?.rows ?? [])
    .filter(row => String(value(row, 'pasta_type') ?? '').trim().toUpperCase() === 'MCD' && String(value(row, 'industry_name') ?? '').trim().toUpperCase() === 'COLGATE')
    .map(row => {
      const code = value(row, 'target_rca_code');
      const resolution = resolveBussolaRca(resolver, row, competence);
      return { row, code, competence, resolution };
    });
  return { competence, rows };
}

function registryFact(record: RcaTargetRecord): TargetFact {
  return {
    fact_id: `TARGET_REGISTRY:${record.competence}:${record.rcaCanonicalId}:${record.id}`,
    fact_type: 'TARGET',
    source: 'ADMIN_TARGET_REGISTRY',
    competence: record.competence,
    transaction_rca_code: record.sourceRcaCode ?? record.rcaCanonicalId.replace(/^RCA:/, ''),
    rca_canonical_id: record.rcaCanonicalId,
    sales_target: record.salesTarget,
    positivity_target: record.positivityTarget,
    target_assignment_status: 'RESOLVED',
    source_lineage: `AdminTargetRegistry:${record.origin}`,
    audit_flags: null,
  };
}

function bussolaFact(row: Record<string, RawTyped>, code: unknown, competence: string | null, resolution: RcaResolution): TargetFact {
  return {
    fact_id: `BUSSOLA:${value(row, '__source_row') ?? ''}`,
    fact_type: 'TARGET',
    source: 'BUSSOLA',
    competence,
    transaction_rca_code: code,
    rca_canonical_id: resolution.canonicalId,
    sales_target: value(row, 'sales_target_pna'),
    positivity_target: value(row, 'positivity_target'),
    target_assignment_status: resolution.status,
    source_lineage: `Bússola: Metas | MCD + COLGATE | NOVOS RCAS:${bussolaContext(row)}`,
    audit_flags: resolution.canonicalId ? null : resolution.status,
  };
}

/** Single deterministic TARGET materializer. It never reads storage or CompetenceState. */
export function materializeEffectiveTargetFacts(sources: ParsedSource[], targetState: TargetState | null = null, registry: AdminRegistryState | null = null) {
  const physical = physicalTargetRows(sources, registry);
  const facts: TargetFact[] = [];
  const audits: CanonicalAudit[] = [];
  const handled = new Set<string>();

  for (const competenceRecord of targetState?.records ?? []) {
    const identities = [...new Set(competenceRecord.rcaTargets.map(record => record.rcaCanonicalId))];
    for (const rcaCanonicalId of identities) {
      const key = `${competenceRecord.competence}|${rcaCanonicalId}`;
      const resolution = resolveTargetAuthority(targetState, competenceRecord.competence, rcaCanonicalId);
      if (resolution.ambiguous) {
        audits.push(issue('AMBIGUOUS_TARGET', `Há metas divergentes na camada ${resolution.authority} para ${rcaCanonicalId} em ${competenceRecord.competence}; a Bússola inferior não será usada.`));
        handled.add(key);
        continue;
      }
      if (resolution.tombstone) { handled.add(key); continue; }
      if (resolution.record) {
        facts.push(registryFact(resolution.record));
        handled.add(key);
      }
    }
  }

  for (const item of physical.rows) {
    const competence = item.competence;
    const canonicalId = item.resolution.canonicalId;
    if (!competence || !canonicalId) {
      facts.push(bussolaFact(item.row, item.code, competence, item.resolution));
      if (!canonicalId) audits.push(issue(item.resolution.status, `RCA ${String(item.code ?? '')} da Bússola não foi resolvido de forma única.`, 'Bússola'));
      continue;
    }
    const key = `${competence}|${canonicalId}`;
    if (handled.has(key)) continue;
    const resolution = resolveTargetAuthority(targetState, competence, canonicalId);
    if (resolution.ambiguous) {
      audits.push(issue('AMBIGUOUS_TARGET', `Há metas divergentes na camada ${resolution.authority} para ${canonicalId} em ${competence}; a Bússola inferior não será usada.`));
      handled.add(key);
      continue;
    }
    if (resolution.tombstone) { handled.add(key); continue; }
    if (resolution.record) facts.push(registryFact(resolution.record));
    else facts.push(bussolaFact(item.row, item.code, competence, item.resolution));
    handled.add(key);
  }

  return { facts, audits, bussolaCompetence: physical.competence };
}

/** Replaces every provisional physical TARGET in M3 with the single effective authority result. SALE/INBOUND/RECEIPT remain byte-for-byte records. */
export function applyTargetAuthorityToM3(m3: CanonicalList, sources: ParsedSource[], targetState: TargetState | null, registry: AdminRegistryState | null): CanonicalList {
  const operationalCompetence = isValidCompetenceId(m3.competence) ? m3.competence : null;
  const scopedTargetState = operationalCompetence && targetState
    ? { ...targetState, records: targetState.records.filter(record => record.competence === operationalCompetence) }
    : targetState;
  const effective = materializeEffectiveTargetFacts(sources, scopedTargetState, registry);
  const nonTargets = m3.records.filter(record => record.fact_type !== 'TARGET');
  const previousNonTargetWarnings = m3.warnings.filter(audit => audit.source !== 'Bússola' && audit.source !== 'AdminTargetRegistry');
  const previousNonTargetErrors = m3.errors.filter(audit => audit.source !== 'Bússola' && audit.source !== 'AdminTargetRegistry');
  return {
    ...m3,
    records: [...nonTargets, ...effective.facts],
    sources: m3.sources.includes(BUSSOLA_SOURCE_ID) ? m3.sources : [...m3.sources, BUSSOLA_SOURCE_ID],
    warnings: [...previousNonTargetWarnings, ...effective.audits.filter(audit => audit.severity === 'WARNING' || audit.severity === 'INFO')],
    errors: [...previousNonTargetErrors, ...effective.audits.filter(audit => audit.severity === 'BLOCKED' || audit.severity === 'BLOCKED_DEPENDENT_CALC')],
  };
}

export const targetAuthorityTestHelpers = { semantic, physicalTargetRows, registryFact, bussolaFact };
