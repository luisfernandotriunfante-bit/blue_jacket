import { buildSellOutCommercialLineRows } from './commercialLines';
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
  lineUnclassifiedValue: number;
  lineUnclassifiedRecords: number;
  lineUnclassifiedExamples: string[];
};

const validTarget = (value: number | null) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function buildSellOutDashboardModel({ base, m1, m3, targets }: { base: SellOutViewModel; m1?: CanonicalList; m3: CanonicalList; targets: SellOutDashboardTargets }): SellOutDashboardModel {
  const sellOutTarget = validTarget(targets.sellOutTarget);
  const positivityTarget = validTarget(targets.positivityTarget);
  const dailyRows = base.dailyRows
    .map(row => ({
      date: row.date,
      invoiced: row.invoiced,
      toInvoice: row.toInvoice,
      total: row.realized,
      invoicedPositivation: row.invoicedPositivation,
      totalPositivation: row.totalPositivation,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const salesAchievement = sellOutTarget && sellOutTarget > 0 ? base.totals.realized / sellOutTarget : null;
  const positivityAchievement = positivityTarget && positivityTarget > 0 ? base.totals.positiveCustomers / positivityTarget : null;
  const invoicedPositivityAchievement = positivityTarget && positivityTarget > 0 ? base.totals.invoicedPositiveCustomers / positivityTarget : null;
  const invoicedShare = base.totals.realized > 0 ? base.totals.invoiced / base.totals.realized : null;
  const preparedLines = m1
    ? buildSellOutCommercialLineRows({ m1, m3, sellOutTotal: base.totals.realized })
      : {
        rows: base.salesByLine,
        unclassifiedValue: base.salesByLine.filter(row => row.resolutionStatus === 'UNCLASSIFIED').reduce((sum, row) => sum + row.realized, 0),
        unclassifiedRecords: 0,
        unclassifiedExamples: [],
      };

  const operationalModel: SellOutViewModel = {
    ...base,
    totals: {
      ...base.totals,
      salesTarget: sellOutTarget ?? 0,
      positivityTarget: positivityTarget ?? 0,
      salesAchievement,
      positivityAchievement,
    },
    salesByLine: preparedLines.rows,
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
      invoicedPositiveCustomers: base.totals.invoicedPositiveCustomers,
      salesAchievement,
      invoicedShare,
      positivityAchievement,
      invoicedPositivityAchievement,
    },
    lineRows: preparedLines.rows,
    lineUnclassifiedValue: preparedLines.unclassifiedValue,
    lineUnclassifiedRecords: preparedLines.unclassifiedRecords,
    lineUnclassifiedExamples: preparedLines.unclassifiedExamples,
  };
}
