import contract from './contracts/blueJacketContractV1.json' with { type: 'json' };
import type { AdminRegistryState, TopRetailRegistryRecord } from './adminRegistry';
import { authorityAudit, resolveTopAuthority } from './adminRegistryAuthority';
import { createRcaResolver } from './rcaResolver';
import type { CanonicalAudit, CanonicalList, ParsedSource, RawTyped } from './types';
import { competenceFromParsedSource } from './competence';

type RecordValue = Record<string, unknown>;
type ParsedRow = Record<string, RawTyped>;
const ROUTE_SOURCE = "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx";
const M2_FIELDS = (contract.motor_schemas as Record<string, Array<{ field: string }>>).M2_CLIENTE_RCA.map(field => field.field);

const typed = (row: ParsedRow | undefined, ...names: string[]) => {
  if (!row) return null;
  for (const name of names) {
    const value = row[name]?.typed;
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
};
const sourceRows = (sources: ParsedSource[], source: string) => sources.find(item => item.source === source)?.rows ?? [];
const blankM2 = () => Object.fromEntries(M2_FIELDS.map(field => [field, null])) as RecordValue;
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
const cnpjOf = (row: ParsedRow | undefined) => text(typed(row, 'cnpj', 'customer_cnpj', 'customer_document_declared', 'customer_document')).replace(/\D/g, '');
const validCompetence = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const appendLineage = (current: unknown, source: string) => {
  const value = text(current);
  return value.split('|').includes(source) ? value : `${value ? `${value}|` : ''}${source}`;
};

function routeWarnings(routeRows: ParsedRow[]) {
  const routeByCnpj = new Map<string, ParsedRow>();
  const warnings: CanonicalAudit[] = [];
  for (const row of routeRows) {
    const cnpj = cnpjOf(row);
    const previous = routeByCnpj.get(cnpj);
    if (!previous) { routeByCnpj.set(cnpj, row); continue; }
    const previousSemantic = JSON.stringify([typed(previous, 'top_network'), typed(previous, 'banner'), typed(previous, 'manager_cnpj'), typed(previous, 'group_code'), typed(previous, 'top_category'), typed(previous, 'top_target')]);
    const currentSemantic = JSON.stringify([typed(row, 'top_network'), typed(row, 'banner'), typed(row, 'manager_cnpj'), typed(row, 'group_code'), typed(row, 'top_category'), typed(row, 'top_target')]);
    if (previousSemantic !== currentSemantic) warnings.push({
      code: 'TOP_ROUTE_DUPLICATE_CNPJ', severity: 'WARNING', source: ROUTE_SOURCE, file: '',
      message: `CNPJ ${cnpj} aparece mais de uma vez no Roteiro Ativo com dados divergentes; nenhuma camada superior será substituída silenciosamente.`,
      action: 'Corrigir o Roteiro Ativo para manter um único vínculo mensal por CNPJ.',
    });
  }
  return { routeByCnpj, warnings };
}

function topFields(record: TopRetailRegistryRecord | ParsedRow) {
  if ('id' in record) return {
    network: record.network, banner: record.banner, managerCnpj: record.managerCnpj, groupCode: record.groupCode,
    category: record.category, topTarget: record.topTarget,
  };
  return {
    network: typed(record, 'top_network'), banner: typed(record, 'banner'), managerCnpj: typed(record, 'manager_cnpj'),
    groupCode: typed(record, 'group_code'), category: typed(record, 'top_category'), topTarget: typed(record, 'top_target'),
  };
}

export function materializeTopRetailRouteInM2(m2: CanonicalList, sources: ParsedSource[], registry: AdminRegistryState | null = null): CanonicalList {
  const routeSource = sources.find(item => item.source === ROUTE_SOURCE);
  const routeCompetence = competenceFromParsedSource(routeSource);
  const targetCompetence = validCompetence(m2.competence) ? m2.competence : validCompetence(routeCompetence) ? routeCompetence : null;
  const resolver = createRcaResolver(sources, registry);
  const portfolio = new Map(sourceRows(sources, 'relatorio_carteira_clientes.xls').map(row => [cnpjOf(row), row]));
  const physicalRows = targetCompetence && routeCompetence === targetCompetence
    ? sourceRows(sources, ROUTE_SOURCE).filter(row => cnpjOf(row).length === 14 && text(typed(row, 'top_network')))
    : [];
  const { routeByCnpj, warnings } = routeWarnings(physicalRows);

  const records = new Map<string, RecordValue>();
  for (const record of m2.records as RecordValue[]) {
    const cnpj = text(record.cnpj).replace(/\D/g, '');
    if (cnpj) records.set(cnpj, { ...record });
  }

  if (!targetCompetence) return { ...m2, warnings: [...m2.warnings, ...warnings] };

  const registryKeys = (registry?.topRetailers ?? []).filter(record => record.competence === targetCompetence).map(record => record.customerCnpj);
  const allCnpjs = [...new Set([...routeByCnpj.keys(), ...registryKeys])];
  let registryUsed = false;

  for (const cnpj of allCnpjs) {
    const imported = routeByCnpj.get(cnpj) ?? null;
    const resolution = resolveTopAuthority(registry, targetCompetence, cnpj, imported);
    if (resolution.ambiguous) {
      warnings.push(authorityAudit('ADMIN_REGISTRY_TOP_AMBIGUOUS', `Top Varejista ${targetCompetence} + ${cnpj} possui definições conflitantes na camada administrativa.`));
      continue;
    }
    if (resolution.tombstone || !resolution.record) continue;

    const isRegistry = resolution.authority === 'MANUAL_REGISTRY' || resolution.authority === 'ADMIN_REGISTRY';
    registryUsed ||= isRegistry;
    const fields = topFields(resolution.record);
    const existing = records.get(cnpj);
    const portfolioRow = portfolio.get(cnpj);
    const representative = typed(portfolioRow, 'representative_code');
    const rca = representative ? resolver.resolveCurrent(representative, undefined, targetCompetence) : null;
    const base = existing ? { ...existing } : blankM2();
    Object.assign(base, {
      snapshot_date: m2.snapshotDate,
      competence: m2.competence,
      customer_canonical_id: `CUSTOMER:${cnpj}`,
      cnpj,
      winthor_customer_code: base.winthor_customer_code ?? typed(portfolioRow, 'winthor_customer_code'),
      customer_name: base.customer_name ?? typed(portfolioRow, 'customer_name') ?? (imported ? typed(imported, 'store_name') : null),
      trade_name: base.trade_name ?? typed(portfolioRow, 'trade_name') ?? (imported ? typed(imported, 'trade_name', 'store_name') : null),
      city: base.city ?? typed(portfolioRow, 'city') ?? (imported ? typed(imported, 'city') : null),
      state: base.state ?? (imported ? typed(imported, 'state') : null),
      representative_code_snapshot: base.representative_code_snapshot ?? representative,
      rca_canonical_id: base.rca_canonical_id ?? rca?.canonicalId ?? null,
      rca_current_code: base.rca_current_code ?? rca?.currentCode ?? null,
      rca_legacy_code: base.rca_legacy_code ?? rca?.legacyCode ?? null,
      rca_name: base.rca_name ?? rca?.name ?? null,
      coordinator_code: base.coordinator_code ?? rca?.coordinatorCode ?? null,
      coordinator_name: base.coordinator_name ?? rca?.coordinatorName ?? null,
      top_network: fields.network,
      top_banner: fields.banner,
      manager_cnpj: fields.managerCnpj,
      top_group_code: fields.groupCode,
      top_category: fields.category,
      top_target: fields.topTarget,
      top_route_competence: targetCompetence,
      network_resolution_status: isRegistry ? (resolution.authority === 'MANUAL_REGISTRY' ? 'ADMIN_REGISTRY_MANUAL' : 'ADMIN_REGISTRY') : 'SOURCE_PRESERVED',
      source_lineage: appendLineage(base.source_lineage, isRegistry ? 'AdminRegistry:TopRetailers' : 'Roteiro Ativo Top Varejistas'),
    });
    records.set(cnpj, base);
  }

  return {
    ...m2,
    records: [...records.values()],
    sources: [...new Set([...m2.sources, ...(routeByCnpj.size ? [ROUTE_SOURCE] : []), ...(registryUsed ? ['AdminRegistry:TopRetailers'] : [])])],
    warnings: [...m2.warnings, ...warnings],
  };
}

export const topRetailM2TestHelpers = { topFields, validCompetence, routeWarnings };
