import contract from './contracts/blueJacketContractV1.json' with { type: 'json' };
import type { AdminRegistryState, LaunchRegistryRecord } from './adminRegistry';
import { authorityAudit, competenceFromDateEvidence, effectiveRegistryLaunches, resolveLaunchAuthority } from './adminRegistryAuthority';
import { createRcaResolver, type RcaResolution } from './rcaResolver';
import type { CanonicalAudit, CanonicalBundle, CanonicalList, ParsedSource, RawTyped } from './types';

const schemas = contract.motor_schemas as Record<CanonicalList['id'], Array<{ field: string }>>;
const value = (row: Record<string, RawTyped>, ...fields: string[]) => {
  for (const field of fields) {
    const candidate = row[field]?.typed;
    if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
  }
  return null;
};
const rows = (sources: ParsedSource[], source: string) => sources.find(item => item.source === source)?.rows ?? [];
const validCompetence = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const codeKey = (input: unknown) => String(input ?? '').trim().replace(/\.0$/, '').replace(/^0+(?=\d)/, '');
const eanKey = (input: unknown) => {
  const digits = String(input ?? '').replace(/\D/g, '');
  return digits.length === 12 ? `0${digits}` : digits.length === 13 ? digits : digits.length === 14 ? digits : '';
};
const appendLineage = (current: unknown, origin: string) => {
  const text = String(current ?? '').trim();
  if (text.split('|').includes(origin)) return text;
  return text ? `${text}|${origin}` : origin;
};
const appendSource = (sources: string[], source: string) => sources.includes(source) ? sources : [...sources, source];
const isRegistryAuthority = (authority: string) => authority === 'MANUAL_REGISTRY' || authority === 'ADMIN_REGISTRY';
const isRcaAudit = (audit: CanonicalAudit) => audit.code === 'AMBIGUOUS_RCA_CODE' || audit.code === 'RCA_UNRESOLVED' || audit.code.startsWith('ADMIN_REGISTRY_RCA_') || audit.code === 'ADMIN_REGISTRY_VALIDITY_UNRESOLVED';

function rcaAudit(resolution: RcaResolution, source: string): CanonicalAudit | null {
  if (!resolution.auditCode) return null;
  const candidates = resolution.candidateCurrentCodes.length ? ` Candidatos: ${resolution.candidateCurrentCodes.join(', ')}.` : '';
  return authorityAudit(resolution.auditCode, `RCA ${resolution.inputCode ?? 'sem código'} não pôde ser resolvido na autoridade administrativa.${candidates}`, source);
}

function uniqueAudits(audits: CanonicalAudit[]) {
  const seen = new Set<string>();
  return audits.filter(audit => {
    const key = `${audit.code}|${audit.source}|${audit.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function replaceListAudits(list: CanonicalList, audits: CanonicalAudit[]) {
  const all = uniqueAudits(audits);
  return {
    ...list,
    warnings: all.filter(audit => audit.severity === 'WARNING' || audit.severity === 'INFO'),
    errors: all.filter(audit => audit.severity === 'BLOCKED' || audit.severity === 'BLOCKED_DEPENDENT_CALC'),
  };
}

function applyRcaAuthority(bundle: CanonicalBundle, sources: ParsedSource[], registry: AdminRegistryState) {
  const resolver = createRcaResolver(sources, registry);

  const rewrite = (list: CanonicalList, mode: 'M2' | 'M3' | 'M4') => {
    const audits = [...list.warnings, ...list.errors].filter(audit => !isRcaAudit(audit));
    let usedRegistry = false;
    const records = list.records.map(record => {
      let resolution: RcaResolution | null = null;
      if (mode === 'M2') {
        const code = record.representative_code_snapshot;
        const competence = validCompetence(record.competence) ? record.competence : validCompetence(list.competence) ? list.competence : null;
        if (code) resolution = resolver.resolveCurrent(code, undefined, competence);
      } else if (mode === 'M3') {
        const code = record.transaction_rca_code;
        if (record.fact_type === 'SALE' && code) resolution = resolver.resolveCurrent(code, undefined, competenceFromDateEvidence(record.event_date));
        if (record.fact_type === 'TARGET' && code) resolution = resolver.resolveLegacy(code, undefined, validCompetence(record.competence) ? record.competence : null);
      } else {
        const code = record.legacy_rca_code;
        if (code) resolution = resolver.resolveLegacy(code, undefined, competenceFromDateEvidence(record.movement_date));
      }
      if (!resolution) return { ...record };
      const audit = rcaAudit(resolution, mode);
      if (audit) audits.push(audit);
      if (isRegistryAuthority(resolution.authority)) usedRegistry = true;
      const lineage = isRegistryAuthority(resolution.authority) ? appendLineage(record.source_lineage, 'AdminRegistry:RCAs') : record.source_lineage;
      if (mode === 'M2') return {
        ...record,
        rca_canonical_id: resolution.canonicalId,
        rca_current_code: resolution.currentCode,
        rca_legacy_code: resolution.legacyCode,
        rca_name: resolution.name,
        coordinator_code: resolution.coordinatorCode,
        coordinator_name: resolution.coordinatorName,
        source_lineage: lineage,
        audit_flags: resolution.canonicalId ? null : resolution.status,
      };
      if (mode === 'M3') return {
        ...record,
        rca_canonical_id: resolution.canonicalId,
        target_assignment_status: record.fact_type === 'TARGET' ? resolution.status : record.target_assignment_status,
        source_lineage: lineage,
        audit_flags: resolution.canonicalId ? null : resolution.status,
      };
      return {
        ...record,
        rca_canonical_id: resolution.canonicalId,
        mapping_status: resolution.canonicalId ? resolution.status : (record.row_type === 'AGG_310' && !resolution.inputCode ? record.mapping_status : resolution.status),
        source_lineage: lineage,
        audit_flags: resolution.inputCode && !resolution.canonicalId ? resolution.status : record.audit_flags,
      };
    });
    return replaceListAudits({ ...list, records, sources: usedRegistry ? appendSource(list.sources, 'AdminRegistry:RCAs') : list.sources }, audits);
  };

  bundle.lists.M2_CLIENTE_RCA = rewrite(bundle.lists.M2_CLIENTE_RCA, 'M2');
  bundle.lists.M3_MOVIMENTO_VENDAS = rewrite(bundle.lists.M3_MOVIMENTO_VENDAS, 'M3');
  bundle.lists.M4_HISTORICO_TRANSICAO = rewrite(bundle.lists.M4_HISTORICO_TRANSICAO, 'M4');
}

function importedLaunchIndexes(sources: ParsedSource[]) {
  const byCode = new Map<string, Record<string, RawTyped>>();
  const byEan = new Map<string, Record<string, RawTyped>>();
  for (const row of rows(sources, 'lançamentos.xlsx')) {
    const code = codeKey(value(row, 'launch_winthor_code'));
    const ean = eanKey(value(row, 'launch_ean'));
    if (code) byCode.set(code, row);
    if (ean) byEan.set(ean, row);
  }
  return { byCode, byEan };
}

function launchStatus(record: LaunchRegistryRecord | Record<string, RawTyped> | null) {
  if (!record) return null;
  return 'id' in record ? record.status : value(record, 'launch_status');
}

function launchDescription(record: LaunchRegistryRecord) { return record.description; }

function applyLaunchAuthority(bundle: CanonicalBundle, sources: ParsedSource[], registry: AdminRegistryState) {
  const list = bundle.lists.M1_ITEM_ESTOQUE;
  const comp = validCompetence(list.competence) ? list.competence : null;
  const imported = importedLaunchIndexes(sources);
  const audits = [...list.warnings, ...list.errors].filter(audit => !audit.code.startsWith('ADMIN_REGISTRY_LAUNCH_') && audit.code !== 'ADMIN_REGISTRY_VALIDITY_UNRESOLVED');
  let usedRegistry = false;

  const records = list.records.flatMap(record => {
    const code = codeKey(record.winthor_code);
    const eans = [record.internal_ean, record.industry_ean];
    const importedRow = imported.byEan.get(eanKey(record.internal_ean)) ?? imported.byEan.get(eanKey(record.industry_ean)) ?? imported.byCode.get(code) ?? null;
    const resolution = resolveLaunchAuthority(registry, importedRow, { winthorCode: code, eans, competence: comp });
    if (resolution.ambiguous) audits.push(authorityAudit('ADMIN_REGISTRY_LAUNCH_AMBIGUOUS', `Lançamento ${code || eanKey(record.internal_ean) || record.item_canonical_id} possui conflito na camada administrativa.`));
    if (resolution.validityUnresolved) audits.push(authorityAudit('ADMIN_REGISTRY_VALIDITY_UNRESOLVED', `Lançamento ${code || eanKey(record.internal_ean) || record.item_canonical_id} possui vigência sem competência inequívoca.`));
    if (isRegistryAuthority(resolution.authority)) usedRegistry = true;
    if ((resolution.tombstone || resolution.ambiguous || resolution.validityUnresolved) && record.mapping_status === 'LAUNCH_PENDING_CATALOG') return [];
    const isLaunch = Boolean(resolution.record) && !resolution.tombstone && !resolution.ambiguous && !resolution.validityUnresolved;
    return [{
      ...record,
      is_launch: isLaunch,
      launch_status: isLaunch ? launchStatus(resolution.record) : null,
      source_lineage: isRegistryAuthority(resolution.authority) ? appendLineage(record.source_lineage, 'AdminRegistry:Lançamentos') : record.source_lineage,
    }];
  });

  const effective = effectiveRegistryLaunches(registry, comp);
  audits.push(...effective.audits);
  for (const launch of effective.records) {
    const exists = records.some(record => (launch.winthorCode && codeKey(record.winthor_code) === codeKey(launch.winthorCode)) || (launch.ean && [record.internal_ean, record.industry_ean].some(value => eanKey(value) === eanKey(launch.ean))));
    if (exists) continue;
    usedRegistry = true;
    const blank = Object.fromEntries(schemas.M1_ITEM_ESTOQUE.map(field => [field.field, null]));
    const id = launch.winthorCode || launch.ean;
    Object.assign(blank, {
      snapshot_date: list.snapshotDate,
      competence: list.competence,
      item_canonical_id: `LAUNCH:${id}`,
      winthor_code: launch.winthorCode,
      internal_ean: launch.ean,
      description_internal: launchDescription(launch),
      is_launch: true,
      launch_status: launch.status,
      has_winthor: Boolean(launch.winthorCode),
      mapping_status: 'LAUNCH_PENDING_CATALOG',
      source_lineage: 'AdminRegistry:Lançamentos',
    });
    records.push(blank);
  }

  bundle.lists.M1_ITEM_ESTOQUE = replaceListAudits({
    ...list,
    records,
    sources: usedRegistry ? appendSource(list.sources, 'AdminRegistry:Lançamentos') : list.sources,
  }, audits);
}

/**
 * Deterministic canonical authority layer. It never reads IndexedDB or administrative
 * competence state. Null registry returns the physical-source bundle byte-for-byte
 * at record/audit level, preserving the pre-v19 operational fallback.
 */
export function applyAdminRegistryCanonicalAuthority(bundle: CanonicalBundle, sources: ParsedSource[], registry: AdminRegistryState | null) {
  if (!registry) return bundle;
  applyRcaAuthority(bundle, sources, registry);
  applyLaunchAuthority(bundle, sources, registry);
  return bundle;
}

export const adminRegistryCanonicalAuthorityTestHelpers = { appendLineage, importedLaunchIndexes, launchStatus, validCompetence };
