export const LINE_NAMES = [
  'Creme Dental',
  'Esc + Enx + Fio',
  'Sabonetes',
  'Hair',
  'Limpeza',
] as const;

export type LineName = (typeof LINE_NAMES)[number];

export interface ManualConfiguration {
  sellOutTarget: number;
  coverageTargetDays: number;
  networkTargets: Record<string, number>;
  holidays: string[];
  lineShares: Record<LineName, number>;
}

export const DEFAULT_MANUAL_CONFIGURATION: ManualConfiguration = {
  sellOutTarget: 0,
  coverageTargetDays: 60,
  networkTargets: {},
  holidays: [],
  lineShares: {
    'Creme Dental': 0.525,
    'Esc + Enx + Fio': 0.095,
    'Sabonetes': 0.20,
    Hair: 0.095,
    Limpeza: 0.085,
  },
};

export type SourceKind =
  | 'sales8022'
  | 'stock105'
  | 'stock8013'
  | 'items286'
  | 'purchasePortfolio'
  | 'rcaMap'
  | 'priceList'
  | 'premises'
  | 'compassTargets'
  | 'activeRoute'
  | 'legacyTopNetworks'
  | 'unknown';

export interface CanonicalSalesTransaction {
  date: string;
  status: 'FATURADO' | 'A FATURAR';
  clientCode: string;
  clientName: string;
  cnpj: string;
  city: string;
  vendorCode: string;
  vendorName: string;
  supervisorCode: string;
  supervisorName: string;
  manufacturerCode: string;
  ean: string;
  internalProductCode: string;
  productDescription: string;
  cases: number;
  units: number;
  value: number;
  saleType: string;
  line: LineName | '';
}

export interface CanonicalInventoryProduct {
  code: string;
  description: string;
  ean: string;
  quantity: number;
  costUnit: number;
  saleUnit: number;
  pendingQty: number;
  pendingCost: number;
  pendingSale: number;
  isLaunch: boolean;
  hasWinthor: boolean;
  factoryCode: string;
  physicalCases: number;
  physicalUnits: number;
  grossKg: number;
}

export interface CanonicalRcaSupport {
  newCode: string;
  oldCode: string;
  name: string;
  coordinatorCode: string;
  coordinatorName: string;
}

export interface CanonicalVendorTargetSupport {
  oldCode: string;
  name: string;
  supervisorName: string;
  salesTarget: number;
  positivityTarget: number;
}

export interface CanonicalClientSupport {
  cnpj: string;
  name: string;
  city: string;
  network: string;
  profile: string;
  isTop: boolean;
}

export interface CanonicalRouteStoreSupport {
  cnpj: string;
  name: string;
  fantasyName: string;
  city: string;
  networkRaw: string;
  managerCnpj: string;
  groupingCode: string;
  tier: string;
  storeType: string;
  target: number;
}

export interface CanonicalProductSupport {
  sku: string;
  ean: string;
  description: string;
  category: string;
  subcategory: string;
  brand: string;
  isLaunch: boolean;
  boxPrice: number;
  unitPrice: number;
  line: LineName | '';
}

export interface CanonicalItemCodeSupport {
  internalCode: string;
  description: string;
  ean: string;
  factoryCode: string;
}

export interface CanonicalSupportData {
  rcas: CanonicalRcaSupport[];
  vendorTargets: CanonicalVendorTargetSupport[];
  clients: CanonicalClientSupport[];
  activeRoute: CanonicalRouteStoreSupport[];
  legacyNetworkTargets: Record<string, number>;
  products: CanonicalProductSupport[];
  itemCodes: CanonicalItemCodeSupport[];
}

export const EMPTY_CANONICAL_SUPPORT: CanonicalSupportData = {
  rcas: [],
  vendorTargets: [],
  clients: [],
  activeRoute: [],
  legacyNetworkTargets: {},
  products: [],
  itemCodes: [],
};

export interface SourceAudit {
  kind: SourceKind;
  fileName: string;
  loaded: boolean;
  rows: number;
  note?: string;
}

export interface CanonicalDailyMovement {
  date: string;
  invoiced: number;
  toInvoice: number;
  total: number;
  invoicedPositivation: number;
  totalPositivation: number;
}

export interface CanonicalClientResult {
  cnpj: string;
  name: string;
  city: string;
  network: string;
  invoiced: number;
  toInvoice: number;
  total: number;
}

export interface CanonicalVendorResult {
  newCode: string;
  oldCode: string;
  name: string;
  coordinatorCode: string;
  coordinatorName: string;
  salesTarget: number;
  positivityTarget: number;
  invoiced: number;
  toInvoice: number;
  total: number;
  attainment: number;
  invoicedPositivation: number;
  futurePositivation: number;
  totalPositivation: number;
  positivityAttainment: number;
  idealSalesToday: number;
  salesGapToIdeal: number;
  salesGapToTarget: number;
  idealPositivationToday: number;
  positivityGapToIdeal: number;
  positivityGapToTarget: number;
  positivityDailyTarget: number;
}

export interface CanonicalCoordinatorResult {
  code: string;
  name: string;
  salesTarget: number;
  positivityTarget: number;
  invoiced: number;
  toInvoice: number;
  total: number;
  attainment: number;
  invoicedPositivation: number;
  futurePositivation: number;
  totalPositivation: number;
  positivityAttainment: number;
  vendors: CanonicalVendorResult[];
}

export interface CanonicalNetworkStore {
  cnpj: string;
  name: string;
  fantasyName: string;
  city: string;
  managerCnpj: string;
  groupingCode: string;
  tier: string;
  storeType: string;
  topTarget: number;
  invoiced: number;
  toInvoice: number;
  total: number;
}

export interface CanonicalNetworkResult {
  key: string;
  name: string;
  detectedNetworkTarget: number;
  networkTarget: number;
  topTarget: number;
  invoiced: number;
  toInvoice: number;
  total: number;
  networkAttainment: number;
  topAttainment: number;
  gapToNetworkTarget: number;
  gapToTopTarget: number;
  clients: number;
  stores: CanonicalNetworkStore[];
}

export interface CanonicalLineResult {
  name: LineName;
  share: number;
  target: number;
  invoiced: number;
  toInvoice: number;
  total: number;
  attainment: number;
}

export interface CanonicalStockSummary {
  costValue: number;
  saleValue: number;
  pendingPurchaseCost: number;
  pendingPurchaseSale: number;
  projectedCostValue: number;
  projectedSaleValue: number;
  physicalUnits: number;
  physicalCases: number;
  grossKg: number;
  coverageCurrentDays: number;
  coverageProjectedDays: number;
  coverageTargetDays: number;
}

export interface CanonicalSellOutSummary {
  invoiced: number;
  toInvoice: number;
  total: number;
  sellOutTarget: number;
  attainment: number;
  invoicedPositivation: number;
  futurePositivation: number;
  totalPositivation: number;
  industryPositivityTarget: number;
  positivityAttainment: number;
  ticketAverage: number;
  businessDaysTotal: number;
  businessDaysElapsed: number;
  businessDaysRemaining: number;
  invoicedDailyAverage: number;
  totalDailyAverage: number;
  neededDailyAverage: number;
  invoicedTrend: number;
  totalTrend: number;
}

export interface CanonicalState {
  schemaVersion: 2;
  generatedAt: string;
  referenceDate: string;
  periodStart: string;
  periodEnd: string;
  sources: SourceAudit[];
  support: CanonicalSupportData;
  transactions: CanonicalSalesTransaction[];
  inventory: CanonicalInventoryProduct[];
  daily: CanonicalDailyMovement[];
  industryTarget: number;
  industryPositivityTarget: number;
  sellOut: CanonicalSellOutSummary;
  stock: CanonicalStockSummary;
  vendors: CanonicalVendorResult[];
  coordinators: CanonicalCoordinatorResult[];
  clients: CanonicalClientResult[];
  networks: CanonicalNetworkResult[];
  lines: CanonicalLineResult[];
  warnings: string[];
}

const ratio = (value: number, target: number) => target > 0 ? value / target : 0;
const positiveGap = (target: number, value: number) => Math.max(target - value, 0);

export function applyManualConfiguration(
  base: CanonicalState | null,
  config: ManualConfiguration,
): CanonicalState | null {
  if (!base) return null;

  const sellOutTarget = Math.max(config.sellOutTarget || 0, 0);
  const coverageTargetDays = Math.max(config.coverageTargetDays || 0, 0);
  const businessDaysRemaining = base.sellOut.businessDaysRemaining;
  const neededDailyAverage = businessDaysRemaining > 0
    ? positiveGap(sellOutTarget, base.sellOut.total) / businessDaysRemaining
    : positiveGap(sellOutTarget, base.sellOut.total);

  const networks = base.networks.map(network => {
    const configured = config.networkTargets[network.key];
    const networkTarget = Number.isFinite(configured) ? Math.max(configured, 0) : network.detectedNetworkTarget;
    return {
      ...network,
      networkTarget,
      networkAttainment: ratio(network.total, networkTarget),
      topAttainment: ratio(network.total, network.topTarget),
      gapToNetworkTarget: positiveGap(networkTarget, network.total),
      gapToTopTarget: positiveGap(network.topTarget, network.total),
    };
  });

  const lines = base.lines.map(line => {
    const share = config.lineShares[line.name] ?? line.share;
    const target = sellOutTarget * share;
    return {
      ...line,
      share,
      target,
      attainment: ratio(line.total, target),
    };
  });

  return {
    ...base,
    sellOut: {
      ...base.sellOut,
      sellOutTarget,
      attainment: ratio(base.sellOut.total, sellOutTarget),
      neededDailyAverage,
    },
    stock: {
      ...base.stock,
      coverageTargetDays,
    },
    networks,
    lines,
  };
}
