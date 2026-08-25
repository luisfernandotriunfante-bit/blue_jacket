import type { CanonicalList } from './types';
import { APPROVED_CANONICAL_BUILD } from './runtime';
import type { NetworkRow, TopNetworksViewModel } from './operationalViewModels';

type RecordValue = Record<string, unknown>;
export type TopRetailNetworkRow = NetworkRow & {
  customersWithSales: number;
  topAchievement: number | null;
  tcReferenceTarget: number | null;
  targetWeight: number;
  groupKey: string;
  managerCnpj: string | null;
  groupCode: string | null;
};

export type TopRetailNetworksViewModel = Omit<TopNetworksViewModel, 'rows' | 'totals'> & {
  rows: TopRetailNetworkRow[];
  totals: TopNetworksViewModel['totals'] & {
    customersWithSales: number;
    topTarget: number;
    industryTarget: number;
    sellOutTarget: number | null;
    overallSellOut: number;
    gap: number | null;
  };
  progress: {
    networkAchievement: number | null;
    customerCoverage: number | null;
    sellOutShare: number | null;
    gapShare: number | null;
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
  networkTargetTotal,
  generatedAt = new Date().toISOString(),
}: {
  m2: CanonicalList;
  m3: CanonicalList;
  sellOutTarget: number | null;
  networkTargetTotal: number | null;
  generatedAt?: string;
}): TopRetailNetworksViewModel {
  const routeCustomers = new Map<string, {
    groupKey: string;
    managerCnpj: string | null;
    groupCode: string | null;
    sourceNetwork: string;
    topTarget: number;
    customerName: string | null;
    tradeName: string | null;
    city: string | null;
    customerCode: string | null;
    rca: string | null;
  }>();
  const groupCustomers = new Map<string, Set<string>>();
  const topTargetsByGroup = new Map<string, number>();
  const groupDisplayName = new Map<string, string>();
  const groupManager = new Map<string, string | null>();
  const groupCodeByKey = new Map<string, string | null>();

  for (const customer of m2.records as RecordValue[]) {
    const cnpj = text(customer.cnpj);
    const sourceNetwork = text(customer.top_network);
    if (!cnpj || !sourceNetwork || routeCustomers.has(cnpj)) continue;
    const managerCnpj = text(customer.manager_cnpj);
    const groupCode = text(customer.top_group_code);
    const groupKey = managerCnpj ?? groupCode ?? cnpj;
    const topTarget = amount(customer.top_target);

    routeCustomers.set(cnpj, {
      groupKey,
      managerCnpj,
      groupCode,
      sourceNetwork,
      topTarget,
      customerName: text(customer.customer_name),
      tradeName: text(customer.trade_name),
      city: text(customer.city),
      customerCode: text(customer.winthor_customer_code),
      rca: text(customer.rca_canonical_id),
    });

    const customers = groupCustomers.get(groupKey) ?? new Set<string>();
    customers.add(cnpj);
    groupCustomers.set(groupKey, customers);
    topTargetsByGroup.set(groupKey, (topTargetsByGroup.get(groupKey) ?? 0) + topTarget);
    groupManager.set(groupKey, managerCnpj ?? groupManager.get(groupKey) ?? null);
    groupCodeByKey.set(groupKey, groupCode ?? groupCodeByKey.get(groupKey) ?? null);

    if (!groupDisplayName.has(groupKey) || (managerCnpj && cnpj === managerCnpj)) {
      groupDisplayName.set(groupKey, sourceNetwork);
    }
  }

  const sales = (m3.records as RecordValue[]).filter(fact => fact.fact_type === 'SALE');
  const targets = (m3.records as RecordValue[]).filter(fact => fact.fact_type === 'TARGET');
  const industryTarget = round(targets.reduce((sum, fact) => sum + amount(fact.sales_target), 0));
  const overallSellOut = round(sales.reduce((sum, sale) => sum + amount(sale.value), 0));

  const tcReferenceByGroup = new Map<string, number>();
  for (const [groupKey, topTarget] of topTargetsByGroup) {
    tcReferenceByGroup.set(groupKey, sellOutTarget !== null && industryTarget > 0 ? topTarget * sellOutTarget / industryTarget : 0);
  }
  const referenceTotal = [...tcReferenceByGroup.values()].reduce((sum, value) => sum + Math.max(value, 0), 0);

  const aggregates = new Map<string, { invoiced: number; toInvoice: number; realized: number; positive: Set<string> }>();
  for (const groupKey of groupCustomers.keys()) aggregates.set(groupKey, { invoiced: 0, toInvoice: 0, realized: 0, positive: new Set<string>() });

  for (const sale of sales) {
    const cnpj = text(sale.cnpj);
    if (!cnpj) continue;
    const route = routeCustomers.get(cnpj);
    if (!route) continue;
    const aggregate = aggregates.get(route.groupKey)!;
    const value = amount(sale.value);
    aggregate.realized += value;
    if (invoiced(sale)) aggregate.invoiced += value;
    else aggregate.toInvoice += value;
    aggregate.positive.add(cnpj);
  }

  const rows: TopRetailNetworkRow[] = [...groupCustomers.entries()].map(([groupKey, customers]) => {
    const aggregate = aggregates.get(groupKey)!;
    const topTarget = round(topTargetsByGroup.get(groupKey) ?? 0) || null;
    const tcReferenceTarget = sellOutTarget !== null && industryTarget > 0 && topTarget !== null
      ? round(topTarget * sellOutTarget / industryTarget)
      : null;
    const weight = referenceTotal > 0 ? (tcReferenceByGroup.get(groupKey) ?? 0) / referenceTotal : 0;
    const networkTarget = networkTargetTotal !== null && referenceTotal > 0
      ? round(networkTargetTotal * weight)
      : null;
    const realized = round(aggregate.realized);
    const networkAchievement = networkTarget && networkTarget > 0 ? realized / networkTarget : null;
    const topAchievement = topTarget && topTarget > 0 ? realized / topTarget : null;
    return {
      network: groupDisplayName.get(groupKey) ?? groupKey,
      groupKey,
      managerCnpj: groupManager.get(groupKey) ?? null,
      groupCode: groupCodeByKey.get(groupKey) ?? null,
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
      tcReferenceTarget,
      targetWeight: weight,
    };
  }).sort((a, b) => b.realized - a.realized || a.network.localeCompare(b.network));

  if (networkTargetTotal !== null && referenceTotal > 0 && rows.length) {
    const assigned = round(rows.reduce((sum, row) => sum + (row.networkTarget ?? 0), 0));
    const difference = round(networkTargetTotal - assigned);
    const last = rows[rows.length - 1];
    if (last && Math.abs(difference) > 0) {
      last.networkTarget = round((last.networkTarget ?? 0) + difference);
      last.achievement = last.networkTarget > 0 ? last.realized / last.networkTarget : null;
      last.gap = round(last.networkTarget - last.realized);
    }
  }

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
      network: groupDisplayName.get(route.groupKey) ?? route.sourceNetwork,
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
  const calculatedNetworkTargetTotal = networkTargetTotal !== null && referenceTotal > 0
    ? round(rows.reduce((sum, row) => sum + (row.networkTarget ?? 0), 0))
    : null;
  const customersWithSales = new Set(storeRows.map(row => row.cnpj).filter(Boolean)).size;
  const gap = calculatedNetworkTargetTotal === null ? null : round(calculatedNetworkTargetTotal - realized);
  const networkAchievement = calculatedNetworkTargetTotal && calculatedNetworkTargetTotal > 0 ? realized / calculatedNetworkTargetTotal : null;
  const customerCoverage = routeCustomers.size > 0 ? customersWithSales / routeCustomers.size : null;
  const sellOutShare = overallSellOut > 0 ? realized / overallSellOut : null;
  const gapShare = calculatedNetworkTargetTotal && calculatedNetworkTargetTotal > 0 && gap !== null ? Math.max(gap, 0) / calculatedNetworkTargetTotal : null;

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
      customersWithSales,
      realized,
      invoiced: invoicedTotal,
      toInvoice: toInvoiceTotal,
      networkTarget: calculatedNetworkTargetTotal,
      topTarget: topTargetTotal,
      industryTarget,
      sellOutTarget,
      overallSellOut,
      gap,
    },
    progress: {
      networkAchievement,
      customerCoverage,
      sellOutShare,
      gapShare,
    },
    reconciliation: {
      rowsEqualTotal: Math.abs(realized - rows.reduce((sum, row) => sum + row.realized, 0)) < 0.01,
      mappedUniverseValue: realized,
    },
  };
}
