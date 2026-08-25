import type { CanonicalList } from './types';
import type { SellOutViewModel } from './operationalViewModels';

export type SellOutDashboardTargets = {
  sellOutTarget: number | null;
  positivityTarget: number | null;
};

export type SellOutDashboardDay = {
  date: string;
  invoiced: number;
  toInvoice: number;
  total: number;
  invoicedPositivation: number;
  totalPositivation: number;
};

export type SellOutDashboardModel = {
  operationalModel: SellOutViewModel;
  dailyRows: SellOutDashboardDay[];
  latestDate: string | null;
  totals: {
    sellOutTarget: number | null;
    realized: number;
    invoiced: number;
    toInvoice: number;
    positivityTarget: number | null;
    positiveCustomers: number;
    invoicedPositiveCustomers: number;
    salesAchievement: number | null;
    invoicedShare: number | null;
    positivityAchievement: number | null;
    invoicedPositivityAchievement: number | null;
  };
  lineRows: SellOutViewModel['salesByLine'];
};

type RecordValue = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const normalized = (value: unknown) => text(value)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() ?? '';
const validTarget = (value: number | null) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const isIsoDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

export function buildSellOutDashboardModel({ base, m3, targets }: { base: SellOutViewModel; m3: CanonicalList; targets: SellOutDashboardTargets }): SellOutDashboardModel {
  const sellOutTarget = validTarget(targets.sellOutTarget);
  const positivityTarget = validTarget(targets.positivityTarget);
  const totalPositivation = new Map<string, Set<string>>();
  const invoicedPositivation = new Map<string, Set<string>>();
  const invoicedPositiveCustomers = new Set<string>();

  for (const fact of m3.records as RecordValue[]) {
    if (fact.fact_type !== 'SALE') continue;
    const date = text(fact.event_date);
    const customer = text(fact.customer_canonical_id) ?? text(fact.cnpj);
    if (!customer) continue;

    const isInvoiced = normalized(fact.order_status) !== 'A FATURAR';
    if (isInvoiced) invoicedPositiveCustomers.add(customer);
    if (!isIsoDate(date)) continue;

    const totalSet = totalPositivation.get(date!) ?? new Set<string>();
    totalSet.add(customer);
    totalPositivation.set(date!, totalSet);

    if (isInvoiced) {
      const invoicedSet = invoicedPositivation.get(date!) ?? new Set<string>();
      invoicedSet.add(customer);
      invoicedPositivation.set(date!, invoicedSet);
    }
  }

  const dailyRows = base.dailyRows
    .filter(row => isIsoDate(row.date))
    .map(row => ({
      date: row.date,
      invoiced: row.invoiced,
      toInvoice: row.toInvoice,
      total: row.realized,
      invoicedPositivation: invoicedPositivation.get(row.date)?.size ?? 0,
      totalPositivation: totalPositivation.get(row.date)?.size ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const salesAchievement = sellOutTarget && sellOutTarget > 0 ? base.totals.realized / sellOutTarget : null;
  const positivityAchievement = positivityTarget && positivityTarget > 0 ? base.totals.positiveCustomers / positivityTarget : null;
  const invoicedPositivityAchievement = positivityTarget && positivityTarget > 0 ? invoicedPositiveCustomers.size / positivityTarget : null;
  const invoicedShare = base.totals.realized > 0 ? base.totals.invoiced / base.totals.realized : null;

  const operationalModel: SellOutViewModel = {
    ...base,
    totals: {
      ...base.totals,
      salesTarget: sellOutTarget ?? 0,
      positivityTarget: positivityTarget ?? 0,
      salesAchievement,
      positivityAchievement,
    },
  };

  return {
    operationalModel,
    dailyRows,
    latestDate: dailyRows.at(-1)?.date ?? null,
    totals: {
      sellOutTarget,
      realized: base.totals.realized,
      invoiced: base.totals.invoiced,
      toInvoice: base.totals.toInvoice,
      positivityTarget,
      positiveCustomers: base.totals.positiveCustomers,
      invoicedPositiveCustomers: invoicedPositiveCustomers.size,
      salesAchievement,
      invoicedShare,
      positivityAchievement,
      invoicedPositivityAchievement,
    },
    lineRows: base.salesByLine,
  };
}
