import contract from './contracts/blueJacketContractV1.json' with { type: 'json' };
import { createRcaResolver } from './rcaResolver';
import type { CanonicalAudit, CanonicalList, ParsedSource, RawTyped } from './types';

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
const lineage = (current: unknown) => {
  const value = text(current);
  return value.includes('Roteiro Ativo Top Varejistas') ? value : `${value ? `${value}|` : ''}Roteiro Ativo Top Varejistas`;
};

export function materializeTopRetailRouteInM2(m2: CanonicalList, sources: ParsedSource[]): CanonicalList {
  const resolver = createRcaResolver(sources);
  const portfolio = new Map(sourceRows(sources, 'relatorio_carteira_clientes.xls').map(row => [cnpjOf(row), row]));
  const routeRows = sourceRows(sources, ROUTE_SOURCE).filter(row => cnpjOf(row).length === 14 && text(typed(row, 'top_network')));
  const routeByCnpj = new Map<string, ParsedRow>();
  const warnings: CanonicalAudit[] = [];

  for (const row of routeRows) {
    const cnpj = cnpjOf(row);
    const previous = routeByCnpj.get(cnpj);
    if (!previous) {
      routeByCnpj.set(cnpj, row);
      continue;
    }
    const previousNetwork = text(typed(previous, 'top_network'));
    const currentNetwork = text(typed(row, 'top_network'));
    const previousTarget = Number(typed(previous, 'top_target') ?? 0);
    const currentTarget = Number(typed(row, 'top_target') ?? 0);
    if (previousNetwork !== currentNetwork || Math.abs(previousTarget - currentTarget) > 0.01) {
      warnings.push({
        code: 'TOP_ROUTE_DUPLICATE_CNPJ',
        severity: 'WARNING',
        source: ROUTE_SOURCE,
        file: '',
        message: `CNPJ ${cnpj} aparece mais de uma vez no Roteiro Ativo com rede/meta divergente; a primeira linha foi preservada sem adivinhação.`,
        action: 'Corrigir o Roteiro Ativo para manter um único vínculo mensal por CNPJ.',
      });
    }
  }

  const records = new Map<string, RecordValue>();
  for (const record of m2.records as RecordValue[]) {
    const cnpj = text(record.cnpj).replace(/\D/g, '');
    if (cnpj) records.set(cnpj, { ...record });
  }

  for (const [cnpj, route] of routeByCnpj) {
    const existing = records.get(cnpj);
    const portfolioRow = portfolio.get(cnpj);
    const representative = typed(portfolioRow, 'representative_code');
    const rca = representative ? resolver.resolveCurrent(representative) : null;
    const base = existing ? { ...existing } : blankM2();
    Object.assign(base, {
      snapshot_date: m2.snapshotDate,
      competence: m2.competence,
      customer_canonical_id: `CUSTOMER:${cnpj}`,
      cnpj,
      winthor_customer_code: base.winthor_customer_code ?? typed(portfolioRow, 'winthor_customer_code'),
      customer_name: base.customer_name ?? typed(portfolioRow, 'customer_name') ?? typed(route, 'store_name'),
      trade_name: base.trade_name ?? typed(portfolioRow, 'trade_name') ?? typed(route, 'trade_name') ?? typed(route, 'store_name'),
      city: base.city ?? typed(portfolioRow, 'city') ?? typed(route, 'city'),
      state: base.state ?? typed(route, 'state'),
      representative_code_snapshot: base.representative_code_snapshot ?? representative,
      rca_canonical_id: base.rca_canonical_id ?? rca?.canonicalId ?? null,
      rca_current_code: base.rca_current_code ?? rca?.currentCode ?? null,
      rca_legacy_code: base.rca_legacy_code ?? rca?.legacyCode ?? null,
      rca_name: base.rca_name ?? rca?.name ?? null,
      coordinator_code: base.coordinator_code ?? rca?.coordinatorCode ?? null,
      coordinator_name: base.coordinator_name ?? rca?.coordinatorName ?? null,
      top_network: typed(route, 'top_network'),
      top_target: typed(route, 'top_target'),
      network_resolution_status: 'SOURCE_PRESERVED',
      source_lineage: lineage(base.source_lineage),
    });
    records.set(cnpj, base);
  }

  return {
    ...m2,
    records: [...records.values()],
    sources: [...new Set([...m2.sources, ROUTE_SOURCE])],
    warnings: [...m2.warnings, ...warnings],
  };
}
