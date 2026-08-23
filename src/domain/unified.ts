import type { CnpjNormalizationStatus, LineName } from './canonical';

export type DataQualitySeverity = 'INFO' | 'WARNING' | 'ERROR';
export type DataQualityDomain = 'ITEM' | 'CUSTOMER' | 'RCA' | 'SALES' | 'INBOUND' | 'TARGET' | 'HISTORY' | 'SOURCE';

export interface SourceSnapshotMetadata {
  sourceType: string;
  sourceName: string;
  competence: string;
  referenceDate: string;
  version: string;
  schemaSignature: string;
  loadedAt: string;
  recordCount: number;
  fileHash: string;
}

export interface DataQualityIssue {
  id: string;
  domain: DataQualityDomain;
  severity: DataQualitySeverity;
  code: string;
  message: string;
  source: string;
  entityKey?: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface ItemMasterRecord {
  itemCanonicalId: string;
  winthorCode: string;
  internalDescription: string;
  internalEan: string;
  manufacturerCode: string;
  industrySku: string;
  industryDescription: string;
  industryEan: string;
  industryDun14: string;
  internalUnitsPerCase: number | null;
  industryUnitsPerCase: number | null;
  casesPerPallet: number | null;
  physicalStockUnits: number;
  blockedStockUnits: number;
  reservedStockUnits: number;
  availableStockUnits: number;
  salePricePvenDa1: number | null;
  pVenda: number | null;
  vlSt: number | null;
  isLaunch: boolean;
  hasWinthor: boolean;
  sourceKeys: Record<string, string>;
}

export interface CustomerMasterRecord {
  customerCanonicalId: string;
  winthorCustomerCode: string;
  cnpj: string;
  cnpjRaw: string;
  cnpjNormalizationStatus: CnpjNormalizationStatus | '';
  customerName: string;
  tradeName: string;
  commercialActivity: string;
  city: string;
  district: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  buyer: string;
  phone: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface CustomerClassificationRecord {
  customerCanonicalId: string;
  cnpj: string;
  competence: string;
  semester: string;
  quarter: string;
  environment: string;
  range: string;
  profile: string;
  premiseNetwork: string;
  clusterCode: string;
  clusterDescription: string;
  avg12Months: number | null;
  distributorArea: string;
  nielsenArea: string;
  pdvStatus: string;
  premiseCity: string;
  premiseState: string;
  source: string;
}

export interface RcaMasterRecord {
  rcaCanonicalId: string;
  currentRcaCode: string;
  legacyRcaCode: string;
  rcaName: string;
  coordinatorCode: string;
  coordinatorName: string;
  isColgate: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  source: string;
}

export interface CustomerRcaRelationRecord {
  customerCanonicalId: string;
  cnpj: string;
  rcaCanonicalId: string;
  representativeCode: string;
  snapshotDate: string;
  frequency: string;
  visitDay: string;
  daysWithoutPurchase: number | null;
  isColgateRca: boolean;
  active: boolean;
  source: string;
}

export interface TopRetailerSnapshotRecord {
  customerCanonicalId: string;
  cnpj: string;
  competence: string;
  isTopRetailerActive: boolean;
  apg: string;
  distributor: string;
  storeName: string;
  banner: string;
  topRetailerNetwork: string;
  topAddress: string;
  topState: string;
  managerCnpj: string;
  groupCode: string;
  topCategory: string;
  storeType: string;
  scanntech: string;
  purchaseModel: string;
  retailEnvironment: string;
  topTradeName: string;
  topCity: string;
  regional: string;
  target: number;
  source: string;
}

export type SalesStatus = 'FATURADO' | 'A FATURAR';
export interface SalesFactRecord {
  salesFactId: string;
  movementDate: string;
  customerCanonicalId: string;
  winthorCustomerCode: string;
  cnpj: string;
  rcaCanonicalId: string;
  transactionRcaCode: string;
  rcaAssignmentStatus: 'RESOLVED' | 'UNRESOLVED' | 'NON_COLGATE';
  itemCanonicalId: string;
  winthorProductCode: string;
  industrySku: string;
  orderWinthor: string;
  orderRca: string;
  invoiceNumber: string;
  invoiceDate: string;
  rawOrderStatus: string;
  rawBlockStatus: string;
  salesStatus: SalesStatus;
  units: number;
  cases: number;
  grossWeightKg: number;
  netWeightKg: number;
  weightTons: number;
  value: number;
  saleType: string;
  line: LineName | '';
  source: '8022';
}

export type InboundStatus = 'ORDERED_FROM_COLGATE' | 'BILLED_BY_COLGATE_IN_TRANSIT' | 'PARTIALLY_RECEIVED' | 'RECEIVED_BY_MILENIO' | 'OPEN_INBOUND';
export interface InboundOrderFactRecord {
  inboundFactId: string;
  orderDate: string;
  colgateCustomerNumber: string;
  orderNumber: string;
  itemCanonicalId: string;
  industrySku: string;
  orderQtyCases: number;
  billQtyCases: number;
  pipelineQtyCases: number;
  pipelineUnits: number | null;
  netValue: number;
  invoiceRaw: string;
  invoiceNormalized: string;
  billingType: string;
  billingDate: string;
  grossWeight: number;
  receivedUnits: number;
  remainingInTransitUnits: number | null;
  inboundStatus: InboundStatus;
  source: 'CARTEIRA_COLGATE';
}

export interface ReceiptHeaderRecord {
  receiptId: string;
  receiptDate: string;
  entryTransactionNumber: string;
  invoiceRaw: string;
  invoiceNormalized: string;
  entryType: string;
  series: string;
  invoiceIssueDate: string;
  branch: string;
  supplier: string;
  supplierCnpj: string;
  uf: string;
  totalValue: number;
  ipiValue: number;
  source: '218';
}

export interface ReceiptItemRecord {
  receiptId: string;
  itemCanonicalId: string;
  winthorProductCode: string;
  description: string;
  branch: string;
  pack: string;
  unit: string;
  receivedUnits: number;
  unitPrice: number;
  previousFinancialCost: number;
  currentFinancialCost: number;
  fiscalCode: string;
  operationCode: string;
  inboundMatchStatus: 'MATCHED' | 'PARTIAL' | 'OVERAGE' | 'UNMATCHED';
}

export interface TargetFactRecord {
  targetFactId: string;
  competence: string;
  industry: string;
  legacyRcaCode: string;
  rcaCanonicalId: string;
  salesTarget: number;
  positivityTarget: number;
  assignmentStatus: 'RESOLVED' | 'UNRESOLVED_RCA';
  source: 'BUSSOLA';
}

export type HistoricalMovementClass = 'SALE' | 'RETURN' | 'OTHER';
export interface HistoricalSalesFactRecord {
  historicalSalesFactId: string;
  movementDate: string;
  invoiceNumber: string;
  invoiceSeries: string;
  legacyProductCode: string;
  historicalGtin: string;
  gtinType: 'EAN13' | 'GTIN14' | 'GTIN_OTHER' | 'UNKNOWN';
  itemCanonicalId: string;
  quantityRaw: number;
  signedQuantity: number;
  valueRaw: number;
  signedValue: number;
  discountRaw: number;
  signedDiscount: number;
  operationCode: string;
  cfop: string;
  movementClass: HistoricalMovementClass;
  orderNumber: string;
  supplier: string;
  customerCnpj: string;
  customerRaw: string;
  customerCanonicalId: string;
  legacyRcaCode: string;
  rcaCanonicalId: string;
  netWeight: number;
  grossWeight: number;
  historicalCity: string;
  historicalCoordinator: string;
  historicalNetwork: string;
  historicalBranch: string;
  historicalGroup: string;
  qtdCx: number;
  sourceYear: number;
  source: '379';
}

export interface LegacyProductMapRecord {
  legacyProductCode: string;
  historicalGtin: string;
  gtinType: HistoricalSalesFactRecord['gtinType'];
  itemCanonicalId: string;
  firstSeenDate: string;
  lastSeenDate: string;
  mappingStatus: 'RESOLVED' | 'UNRESOLVED' | 'CONFLICT';
}

export interface HistoricalCustomerProductAggregateRecord {
  customerCanonicalId: string;
  cnpj: string;
  itemCanonicalId: string;
  legacyProductCode: string;
  period: string;
  grossSaleUnits: number;
  returnUnits: number;
  netSignedUnits: number;
  grossSalesValue: number;
  returnValue: number;
  netSalesValue: number;
  netDiscount: number;
  purchaseInvoiceCount: number;
  legacySellerContext: string;
}

export interface HistoricalReceiptHeaderRecord {
  historicalReceiptId: string;
  invoiceRaw: string;
  invoiceNormalized: string;
  invoiceIssueDate: string;
  accountingDate: string;
  supplierDocument: string;
  supplierName: string;
  operationCode: string;
  representativeRaw: string;
  invoiceValue: number;
  discount: number;
  exchangeDiscount: number;
  series: string;
  uf: string;
  observations: string;
  orderNumber: string;
  receiptClass: 'MERCHANDISE' | 'SUPPLIES' | 'OTHER';
  reconciliationStatus: 'MATCHED' | 'UNMATCHED' | 'NOT_APPLICABLE';
  source: '12.322';
}

export interface UnifiedSalesRecord {
  unifiedSalesId: string;
  movementDate: string;
  itemCanonicalId: string;
  customerCanonicalId: string;
  rcaCanonicalId: string;
  units: number;
  value: number;
  movementClass: 'SALE' | 'RETURN' | 'TO_INVOICE';
  invoiceNumber: string;
  sourceSystem: 'LEGACY' | 'WINTHOR';
  sourceFile: string;
}

export interface UnifiedDataLayer {
  schemaVersion: 1;
  generatedAt: string;
  sources: SourceSnapshotMetadata[];
  qualityIssues: DataQualityIssue[];
  items: ItemMasterRecord[];
  customers: CustomerMasterRecord[];
  customerClassifications: CustomerClassificationRecord[];
  rcas: RcaMasterRecord[];
  customerRcaRelations: CustomerRcaRelationRecord[];
  topRetailerSnapshots: TopRetailerSnapshotRecord[];
  salesFacts: SalesFactRecord[];
  inboundOrders: InboundOrderFactRecord[];
  receiptHeaders: ReceiptHeaderRecord[];
  receiptItems: ReceiptItemRecord[];
  targets: TargetFactRecord[];
  historicalSalesFacts: HistoricalSalesFactRecord[];
  legacyProductMap: LegacyProductMapRecord[];
  historicalCustomerProduct: HistoricalCustomerProductAggregateRecord[];
  historicalReceipts: HistoricalReceiptHeaderRecord[];
  unifiedSales: UnifiedSalesRecord[];
}

export const EMPTY_UNIFIED_DATA_LAYER: UnifiedDataLayer = {
  schemaVersion: 1,
  generatedAt: '',
  sources: [],
  qualityIssues: [],
  items: [],
  customers: [],
  customerClassifications: [],
  rcas: [],
  customerRcaRelations: [],
  topRetailerSnapshots: [],
  salesFacts: [],
  inboundOrders: [],
  receiptHeaders: [],
  receiptItems: [],
  targets: [],
  historicalSalesFacts: [],
  legacyProductMap: [],
  historicalCustomerProduct: [],
  historicalReceipts: [],
  unifiedSales: [],
};
