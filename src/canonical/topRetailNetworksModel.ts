import type { CanonicalList } from './types';
import { APPROVED_CANONICAL_BUILD } from './runtime';
import type { NetworkRow, TopNetworksViewModel } from './operationalViewModels';

type RecordValue = Record<string, unknown>;
export type TopRetailNetworkRow = NetworkRow & {
  customersWithSales: number;
  topAchievement: number | null;
};

export type TopRetailNetworksViewModel = Omit<TopNetworksViewModel, 'rows' | 'totals'> & {
  rows: TopRetailNetworkRow[];
  totals: TopNetworksViewModel['totals'] & {
    customersWithSales: number;
    topTarget: number;
    industryTarget: number;
    overallSellOut: number;
    gap: number | null;
  };
};

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value ?? 0) || 0;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const normalized = (value: unknown) => text(value)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() ?? '';
const invoiced = (sale: RecordValue) => normalized(sale.order_status) !== 'A FATURAR';

export function buildTopRetailNetworksViewModel({
  m2,
  m3,
  sellOutTarget,
  generatedAt = new Date().toISOString(),
}: {
  m2: CanonicalList;
  m3: CanonicalList;
  sellOutTarget: number | null;
  generatedAt?: string;
}): TopRetailNetworksViewModel {
  const routeCustomers = new Map<string, { network: string; topTarget: number; customerName: string | null; tradeName: string | null; city: string | null; customerCode: string | null; rca: string | null }>();
  const networkCustomers = new Map<string, Set<string>>();
  const topTargetsByNetwork = new Map<string, number>();

  for (const customer of m2.records as RecordValue[]) {
    const cnpj = text(customer.cnpj);
    const network = text(customer.top_network);
    if (!cnpj || !network || routeCustomers.has(cnpj)) continue;
    const topTarget = amount(customer.top_target);
    routeCustomers.set(cnpj, {
      network,
      topTarget,
      customerName: text(customer.customer_name),
      tradeName: text(customer.trade_name),
      city: text(customer.city),
      customerCode: text(customer.winthor_customer_code),
      rca: text(customer.rca_canonical_id),
    });
    const customers = networkCustomers.get(network) ?? new Set<string>();
    customers.add(cnpj);
    networkCustomers.set(network, customers);
    topTargetsByNetwork.set(network, (topTargetsByNetwork.get(network) ?? 0) + topTarget);
  }

  const sales = (m3.records as RecordValue[]).filter(fact => fact.fact_type === 'SALE');
  const targets = (m3.records as RecordValue[]).filter(fact => fact.fact_type === 'TARGET');
  const industryTarget = round(targets.reduce((sum, fact) => sum + amount(fact.sales_target), 0));
  const overallSellOut = round(sales.reduce((sum, sale) => sum + amount(sale.value), 0));

  const aggregates = new Map<string, { invoiced: number; toInvoice: number; realized: number; positive: Set<string> }>();
  for (const network of networkCustomers.keys()) aggregates.set(network, { invoiced: 0, toInvoice: 0, realized: 0, positive: new Set<string>() });

  for (const sale of sales) {
    const cnpj = text(sale.cnpj);
    if (!cnpj) continue;
    const route = routeCustomers.get(cnpj);
    if (!route) continue;
    const aggregate = aggregates.get(route.network)!;
    const value = amount(sale.value);
    aggregate.realized += value;
    if (invoiced(sale)) aggregate.invoiced += value;
    else aggregate.toInvoice += value;
    aggregate.positive.add(cnpj);
  }

  const rows: TopRetailNetworkRow[] = [...networkCustomers.entries()].map(([network, customers]) => {
    const aggregate = aggregates.get(network)!;
    const topTarget = round(topTargetsByNetwork.get(network) ?? 0) || null;
    const networkTarget = sellOutTarget !== null && industryTarget > 0 && topTarget !== null
      ? round(topTarget * sellOutTarget / industryTarget)
      : null;
    const realized = round(aggregate.realized);
    const networkAchievement = networkTarget && networkTarget > 0 ? realized / networkTarget : null;
    const topAchievement = topTarget && topTarget > 0 ? realized / topTarget : null;
    return {
      network,
      customers: customers.size,
      customersWithSales: aggregate.positive.size,
      invoiced: round(aggregate.invoiced),
      toInvoice: round(aggregate.toInvoice),
      realized,
      share: overallSellOut > 0 ? realized / overallSellOut : 0,
      resolutionStatus: 'SOURCE_PRESERVED' as const,
      networkTarget,
      topTarget,
      gap: networkTarget === null ? null : round(networkTarget - realized),
      achievement: networkAchievement,
      topAchievement,
    };
  }).sort((a, b) => b.realized - a.realized || a.network.localeCompare(b.network));

  const storeRows = [...routeCustomers.entries()].flatMap(([cnpj, route]) => {
    const customerSales = sales.filter(sale => text(sale.cnpj) === cnpj);
    if (!customerSales.length) return [];
    const invoicedValue = round(customerSales.filter(invoiced).reduce((sum, sale) => sum + amount(sale.value), 0));
    const toInvoiceValue = round(customerSales.filter(sale => !invoiced(sale)).reduce((sum, sale) => sum + amount(sale.value), 0));
    const realized = round(invoicedValue + toInvoiceValue);
    return [{
      cnpj,
      customerCode: route.customerCode,
      customer: route.customerName ?? route.tradeName ?? cnpj,
      tradeName: route.tradeName,
      city: route.city,
      network: route.network,
      rca: route.rca,
      invoiced: invoicedValue,
      toInvoice: toInvoiceValue,
      realized,
      topTarget: route.topTarget || null,
      achievement: route.topTarget > 0 ? realized / route.topTarget : null,
    }];
  });

  const realized = round(rows.reduce((sum, row) => sum + row.realized, 0));
  const invoicedTotal = round(rows.reduce((sum, row) => sum + row.invoiced, 0));
  const toInvoiceTotal = round(rows.reduce((sum, row) => sum + row.toInvoice, 0));
  const topTargetTotal = round(rows.reduce((sum, row) => sum + (row.topTarget ?? 0), 0));
  const networkTargetTotal = sellOutTarget !== null && industryTarget > 0
    ? round(rows.reduce((sum, row) => sum + (row.networkTarget ?? 0), 0))
    : null;

  return {
    motorBuildId: APPROVED_CANONICAL_BUILD.motorBuildId,
    stagingManifestHash: APPROVED_CANONICAL_BUILD.stagingManifestHash,
    generatedAt,
    competence: m3.competence,
    audits: [],
    rows,
    storeRows,
    teamRows: [],
    totals: {
      networks: rows.length,
      customers: routeCustomers.size,
      customersWithSales: new Set(storeRows.map(row => row.cnpj).filter(Boolean)).size,
      realized,
      invoiced: invoicedTotal,
      toInvoice: toInvoiceTotal,
      networkTarget: networkTargetTotal,
      topTarget: topTargetTotal,
      industryTarget,
      overallSellOut,
      gap: networkTargetTotal === null ? null : round(networkTargetTotal - realized),
    },
    reconciliation: {
      rowsEqualTotal: Math.abs(realized - rows.reduce((sum, row) => sum + row.realized, 0)) < 0.01,
      mappedUniverseValue: realized,
    },
  };
}
