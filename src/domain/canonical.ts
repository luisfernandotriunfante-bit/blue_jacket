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
  portfolioSaleMarkup: number;
  networkTargets: Record<string, number>;
  holidays: string[];
  lineShares: Record<LineName, number>;
}

export const DEFAULT_MANUAL_CONFIGURATION: ManualConfiguration = {
  sellOutTarget: 0,
  coverageTargetDays: 60,
  portfolioSaleMarkup: 0.31530488350705,
  networkTargets: {},
  holidays: [
    '2026-01-01', '2026-04-03', '2026-04-21', '2026-05-01',
    '2026-06-04', '2026-06-13', '2026-08-26', '2026-09-07',
    '2026-10-11', '2026-10-12', '2026-11-02', '2026-11-15',
    '2026-11-20', '2026-12-25',
  ],
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
  | 'launchList'
  | 'premises'
  | 'compassTargets'
  | 'activeRoute'
  | 'history379_2025'
  | 'history379_2026'
  | 'unknown';

export interface CanonicalSalesTransaction {
  date: string;
  status: 'FATURADO' | 'A FATURAR';
  clientCode: string;
  clientName: string;
  cnpj: string;
  cnpjRaw?: string;
  cnpjNormalizationStatus?: CnpjNormalizationStatus;
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
  pendingCases: number;
  pendingCost: number;
  pendingSale: number;
  isLaunch: boolean;
  hasWinthor: boolean;
  factoryCode: string;
  physicalCases: number;
  physicalUnits: number;
  grossKg: number;
}

export interface CanonicalRcaSupport { newCode:string; oldCode:string; name:string; coordinatorCode:string; coordinatorName:string; }
export interface CanonicalVendorTargetSupport { oldCode:string; name:string; supervisorName:string; salesTarget:number; positivityTarget:number; }
export interface CanonicalClientSupport { cnpj:string; cnpjRaw?:string; cnpjNormalizationStatus?:CnpjNormalizationStatus; name:string; city:string; network:string; profile:string; isTop:boolean; }
export interface CanonicalRouteStoreSupport { cnpj:string; cnpjRaw?:string; cnpjNormalizationStatus?:CnpjNormalizationStatus; name:string; fantasyName:string; city:string; networkRaw:string; managerCnpj:string; managerCnpjRaw?:string; managerCnpjNormalizationStatus?:CnpjNormalizationStatus; groupingCode:string; tier:string; storeType:string; target:number; }
export interface CanonicalProductSupport { sku:string; ean:string; description:string; category:string; subcategory:string; brand:string; isLaunch:boolean; boxPrice:number; unitPrice:number; unitsPerCase:number; line:LineName|''; }
export interface CanonicalItemCodeSupport { internalCode:string; description:string; ean:string; factoryCode:string; }

export interface CanonicalSupportData {
  rcas: CanonicalRcaSupport[];
  vendorTargets: CanonicalVendorTargetSupport[];
  clients: CanonicalClientSupport[];
  activeRoute: CanonicalRouteStoreSupport[];
  legacyNetworkTargets: Record<string, number>;
  legacyNetworkOwners: Record<string, { teamCode:string; vendorCode:string }>;
  legacyClientNetworks: Record<string, string>;
  legacyClientOwners: Record<string, { teamCode:string; vendorCode:string }>;
  products: CanonicalProductSupport[];
  itemCodes: CanonicalItemCodeSupport[];
}

export const EMPTY_CANONICAL_SUPPORT: CanonicalSupportData = { rcas:[], vendorTargets:[], clients:[], activeRoute:[], legacyNetworkTargets:{}, legacyNetworkOwners:{}, legacyClientNetworks:{}, legacyClientOwners:{}, products:[], itemCodes:[] };

export interface SourceAudit {
  kind: SourceKind;
  fileName: string;
  loaded: boolean;
  rows: number;
  note?: string;
  updatedAt?: string;
  fileModifiedAt?: string;
}

export interface CanonicalHistoryMonth {
  key: string;
  year: number;
  month: number;
  value: number;
  grossSales: number;
  returns: number;
}

export interface CanonicalHistorySummary {
  months: CanonicalHistoryMonth[];
  sameMonthLastYear: number | null;
  sameMonthLastYearKey: string;
  average3ClosedMonths: number | null;
  average3MonthKeys: string[];
}

export type ReconciliationLevel = 'INTERNAL' | 'SOURCE' | 'SPREADSHEET';
export type ReconciliationStatus = 'OK' | 'DIVERGENT' | 'BLOCKED';
export type CnpjNormalizationStatus = 'EMPTY' | 'EXACT_14' | 'PADDED_EXCEL' | 'TRIMMED_LEADING_ZERO' | 'CPF_OR_AMBIGUOUS' | 'INVALID_LENGTH';
export type CnpjRelationshipSource = '8022' | 'PREMISSAS' | 'ROTEIRO' | 'REFERENCIA';

export interface CanonicalReconciliationCheck {
  id:string;
  level:ReconciliationLevel;
  label:string;
  expected:number | string | null;
  calculated:number | string | null;
  difference:number | null;
  tolerance:number;
  status:ReconciliationStatus;
  source:string;
  note?:string;
}

export type NetworkAssignmentSource = 'PREMISSAS' | 'ROTEIRO' | 'REFERENCIA' | 'SEM_REDE';
export interface CanonicalNetworkAssignmentAudit {
  cnpj:string;
  value:number;
  network:string;
  source:NetworkAssignmentSource;
  divergentSources:string[];
  sourcePresence?:Partial<Record<CnpjRelationshipSource,boolean>>;
  sourceNetworks?:Partial<Record<Exclude<CnpjRelationshipSource,'8022'>,string>>;
  originalCnpjs?:Partial<Record<CnpjRelationshipSource,string[]>>;
  normalizationIssues?:string[];
}

export interface CanonicalCnpjSourceSummary {
  source:CnpjRelationshipSource;
  rows:number;
  uniqueCanonical:number;
  exact14:number;
  paddedExcel:number;
  trimmedLeadingZero:number;
  cpfOrAmbiguous:number;
  invalidLength:number;
  duplicateCnpjs:number;
  conflictingNetworkCnpjs:number;
  matchedSalesCnpjs:number;
  matchedSalesValue:number;
}

export interface CanonicalCnpjIssue {
  source:CnpjRelationshipSource;
  raw:string;
  canonical:string;
  status:CnpjNormalizationStatus;
  note:string;
}

export interface CanonicalNetworkSourceConflict {
  source:CnpjRelationshipSource;
  cnpj:string;
  networks:string[];
}

export interface CanonicalRelationshipAudit {
  sourceSummaries:CanonicalCnpjSourceSummary[];
  normalizationIssues:CanonicalCnpjIssue[];
  networkConflicts:CanonicalNetworkSourceConflict[];
}

export interface CanonicalReconciliation {
  checks:CanonicalReconciliationCheck[];
  networkAssignments:CanonicalNetworkAssignmentAudit[];
  relationships?:CanonicalRelationshipAudit;
  blockedRules:string[];
}

export interface CanonicalDailyMovement { date:string; invoiced:number; toInvoice:number; total:number; invoicedPositivation:number; totalPositivation:number; }
export interface CanonicalClientResult { cnpj:string; name:string; city:string; network:string; invoiced:number; toInvoice:number; total:number; }

export interface CanonicalVendorResult {
  newCode:string; oldCode:string; name:string; coordinatorCode:string; coordinatorName:string;
  salesTarget:number; positivityTarget:number; invoiced:number; toInvoice:number; total:number; attainment:number;
  invoicedPositivation:number; futurePositivation:number; totalPositivation:number; positivityAttainment:number;
  idealSalesToday:number; salesGapToIdeal:number; salesGapToTarget:number; idealPositivationToday:number;
  positivityGapToIdeal:number; positivityGapToTarget:number; positivityDailyTarget:number;
}

export interface CanonicalCoordinatorResult {
  code:string; name:string; salesTarget:number; positivityTarget:number; invoiced:number; toInvoice:number; total:number;
  attainment:number; invoicedPositivation:number; futurePositivation:number; totalPositivation:number; positivityAttainment:number; vendors:CanonicalVendorResult[];
}

export interface CanonicalNetworkStore { cnpj:string; name:string; fantasyName:string; city:string; managerCnpj:string; groupingCode:string; tier:string; storeType:string; topTarget:number; invoiced:number; toInvoice:number; total:number; }
export interface CanonicalNetworkResult { key:string; name:string; teamCode:string; vendorCode:string; detectedNetworkTarget:number; networkTarget:number; topTarget:number; invoiced:number; toInvoice:number; total:number; networkAttainment:number; topAttainment:number; gapToNetworkTarget:number; gapToTopTarget:number; clients:number; stores:CanonicalNetworkStore[]; }
export interface CanonicalLineResult { name:LineName; share:number; target:number; invoiced:number; toInvoice:number; total:number; attainment:number; }

export interface CanonicalStockSummary {
  costValue:number; saleValue:number; pendingPurchaseCost:number; pendingPurchaseSale:number; projectedCostValue:number; projectedSaleValue:number;
  physicalUnits:number; physicalCases:number; grossKg:number;
  coverageCurrentDays:number; coverageProjectedDays:number;
  coverageCostCurrentDays:number; coverageCostProjectedDays:number;
  coverageTargetDays:number;
}

export interface CanonicalSellOutSummary {
  invoiced:number; toInvoice:number; total:number; sellOutTarget:number; attainment:number;
  invoicedPositivation:number; futurePositivation:number; totalPositivation:number; industryPositivityTarget:number; positivityAttainment:number;
  ticketAverage:number; businessDaysTotal:number; businessDaysElapsed:number; businessDaysRemaining:number;
  invoicedDailyAverage:number; totalDailyAverage:number; neededDailyAverage:number; invoicedTrend:number; totalTrend:number;
}

export interface CanonicalState {
  schemaVersion: 2;
  generatedAt:string; referenceDate:string; periodStart:string; periodEnd:string;
  sources:SourceAudit[]; support:CanonicalSupportData; transactions:CanonicalSalesTransaction[]; inventory:CanonicalInventoryProduct[]; daily:CanonicalDailyMovement[];
  history:CanonicalHistorySummary;
  industryTarget:number; industryPositivityTarget:number; sellOut:CanonicalSellOutSummary; stock:CanonicalStockSummary;
  vendors:CanonicalVendorResult[]; coordinators:CanonicalCoordinatorResult[]; clients:CanonicalClientResult[]; networks:CanonicalNetworkResult[]; lines:CanonicalLineResult[]; warnings:string[];
  reconciliation?:CanonicalReconciliation;
}

const ratio=(value:number,target:number)=>target>0?value/target:0;
const positiveGap=(target:number,value:number)=>Math.max(target-value,0);

function configuredBusinessDays(start:string,end:string,holidays:string[]){
  if(!start||!end)return 0;
  const holidaySet=new Set(holidays||[]);
  const cursor=new Date(`${start}T12:00:00Z`);
  const limit=new Date(`${end}T12:00:00Z`);
  if(Number.isNaN(cursor.getTime())||Number.isNaN(limit.getTime()))return 0;
  let count=0;
  while(cursor<=limit){
    const day=cursor.getUTCDay();const iso=cursor.toISOString().slice(0,10);
    if(day!==0&&day!==6&&!holidaySet.has(iso))count+=1;
    cursor.setUTCDate(cursor.getUTCDate()+1);
  }
  return count;
}

export function applyManualConfiguration(base:CanonicalState|null,config:ManualConfiguration):CanonicalState|null{
  if(!base)return null;
  const sellOutTarget=config.sellOutTarget>0?Math.max(config.sellOutTarget,0):Math.max(base.sellOut.sellOutTarget,0);
  const coverageTargetDays=Math.max(config.coverageTargetDays||0,0);
  const portfolioSaleMarkup=Math.max(Number(config.portfolioSaleMarkup)||0,0);
  const elapsedEnd=base.referenceDate<base.periodEnd?base.referenceDate:base.periodEnd;
  const businessDaysTotal=configuredBusinessDays(base.periodStart,base.periodEnd,config.holidays)||base.sellOut.businessDaysTotal;
  const businessDaysElapsed=configuredBusinessDays(base.periodStart,elapsedEnd,config.holidays);
  const businessDaysRemaining=Math.max(businessDaysTotal-businessDaysElapsed,0);
  const invoicedDailyAverage=businessDaysElapsed>0?base.sellOut.invoiced/businessDaysElapsed:0;
  const totalDailyAverage=businessDaysElapsed>0?base.sellOut.total/businessDaysElapsed:0;
  const invoicedTrend=invoicedDailyAverage*businessDaysTotal;
  const totalTrend=totalDailyAverage*businessDaysTotal;
  const neededDailyAverage=businessDaysRemaining>0?positiveGap(sellOutTarget,base.sellOut.total)/businessDaysRemaining:positiveGap(sellOutTarget,base.sellOut.total);

  const networks=base.networks.map(network=>{
    const configured=config.networkTargets[network.key];
    const networkTarget=Number.isFinite(configured)?Math.max(configured,0):Math.max(network.networkTarget,0);
    return{...network,networkTarget,networkAttainment:ratio(network.total,networkTarget),topAttainment:ratio(network.total,network.topTarget),gapToNetworkTarget:positiveGap(networkTarget,network.total),gapToTopTarget:positiveGap(network.topTarget,network.total)};
  });
  const lines=base.lines.map(line=>{const share=config.lineShares[line.name]??line.share;const target=sellOutTarget*share;return{...line,share,target,attainment:ratio(line.total,target)}});
  const inventory=base.inventory.map(item=>{
    const pendingSale=item.saleUnit>0&&item.pendingQty>0?item.pendingQty*item.saleUnit:item.pendingCost*(1+portfolioSaleMarkup);
    return{...item,pendingSale};
  });
  const pendingPurchaseSale=inventory.reduce((sum,item)=>sum+item.pendingSale,0);
  const projectedSaleValue=base.stock.saleValue+pendingPurchaseSale;
  const historyAverage=base.history.average3ClosedMonths||0;
  const coverageProjectedDays=historyAverage>0?Math.round(projectedSaleValue/historyAverage*30):0;

  const vendors=base.vendors.map(vendor=>{
    const idealSalesToday=businessDaysTotal>0?vendor.salesTarget*(businessDaysElapsed/businessDaysTotal):0;
    const idealPositivationToday=businessDaysTotal>0?vendor.positivityTarget*(businessDaysElapsed/businessDaysTotal):0;
    const positivityGapToTarget=positiveGap(vendor.positivityTarget,vendor.totalPositivation);
    return{...vendor,idealSalesToday,salesGapToIdeal:positiveGap(idealSalesToday,vendor.total),salesGapToTarget:positiveGap(vendor.salesTarget,vendor.total),idealPositivationToday,positivityGapToIdeal:positiveGap(idealPositivationToday,vendor.totalPositivation),positivityGapToTarget,positivityDailyTarget:businessDaysRemaining>0?positivityGapToTarget/businessDaysRemaining:positivityGapToTarget};
  });
  const coordinatorGroups=new Map<string,CanonicalVendorResult[]>();
  vendors.forEach(vendor=>{const key=vendor.coordinatorCode||vendor.coordinatorName||'SEM_COORDENADOR';const rows=coordinatorGroups.get(key)||[];rows.push(vendor);coordinatorGroups.set(key,rows)});
  const coordinators=Array.from(coordinatorGroups.entries()).map(([code,members])=>{
    const salesTarget=members.reduce((sum,v)=>sum+v.salesTarget,0);const positivityTarget=members.reduce((sum,v)=>sum+v.positivityTarget,0);const invoiced=members.reduce((sum,v)=>sum+v.invoiced,0);const toInvoice=members.reduce((sum,v)=>sum+v.toInvoice,0);const total=members.reduce((sum,v)=>sum+v.total,0);const invoicedPositivation=members.reduce((sum,v)=>sum+v.invoicedPositivation,0);const futurePositivation=members.reduce((sum,v)=>sum+v.futurePositivation,0);const totalPositivation=members.reduce((sum,v)=>sum+v.totalPositivation,0);
    return{code,name:members[0]?.coordinatorName||code,salesTarget,positivityTarget,invoiced,toInvoice,total,attainment:ratio(total,salesTarget),invoicedPositivation,futurePositivation,totalPositivation,positivityAttainment:ratio(totalPositivation,positivityTarget),vendors:members};
  });

  return{...base,inventory,networks,lines,vendors,coordinators,sellOut:{...base.sellOut,sellOutTarget,attainment:ratio(base.sellOut.total,sellOutTarget),businessDaysTotal,businessDaysElapsed,businessDaysRemaining,invoicedDailyAverage,totalDailyAverage,neededDailyAverage,invoicedTrend,totalTrend},stock:{...base.stock,pendingPurchaseSale,projectedSaleValue,coverageProjectedDays,coverageTargetDays}};
}
