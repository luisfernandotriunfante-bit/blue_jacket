import * as XLSX from 'xlsx';
import type { CanonicalInventoryProduct, CanonicalState, CanonicalStockSummary, ManualConfiguration } from '../../domain/canonical';
import type { CustomerIntelligenceSupport } from '../../domain/customerIntelligenceTypes';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../../domain/customerIntelligenceTypes';
import {
  EMPTY_UNIFIED_DATA_LAYER,
  type DataQualityIssue,
  type SourceSnapshotMetadata,
  type TargetFactRecord,
  type UnifiedDataLayer,
  type UnifiedSalesRecord,
} from '../../domain/unified';
import { processCanonicalFiles } from '../canonicalEngine';
import { normalizeText, sheetRows } from '../canonical/utils';
import type { Row } from '../canonical/runtime';
import type { OperationalSourceState } from '../operationalSources';
import { processCustomerIntelligenceFiles } from '../customerIntelligenceRepository';
import { runItemMotor } from './itemMotor';
import { runCustomerMotor } from './customerMotor';
import { runSalesMotor } from './salesMotor';
import {
  aggregateHistoricalCustomerProduct,
  applyHistoricalIdentity,
  buildLegacyProductMap,
  parseHistorical379Transactions,
  parseHistoricalReceipts12322,
} from './historicalMotor';
import { projectCanonicalFromUnified } from './calculationService';

export interface UnifiedCanonicalState extends CanonicalState {
  unifiedSchemaVersion: 1;
  unified: UnifiedDataLayer;
  customerIntelligenceSupport: CustomerIntelligenceSupport;
}

export function isUnifiedCanonicalState(value:CanonicalState|null|undefined):value is UnifiedCanonicalState {
  return Boolean(value && (value as UnifiedCanonicalState).unifiedSchemaVersion===1 && (value as UnifiedCanonicalState).unified?.schemaVersion===1);
}

const name=(file:File)=>normalizeText(file.name);
const has=(file:File,token:string)=>name(file).includes(normalizeText(token));
const is8022=(file:File)=>has(file,'8022');
const is286=(file:File)=>has(file,'286')||has(file,'CADASTRO ITENS');
const is105=(file:File)=>has(file,'105')||has(file,'POSICAO ESTOQUE');
const is8013=(file:File)=>has(file,'8013');
const isPctabpr=(file:File)=>has(file,'PCTABPR');
const isPriceList=(file:File)=>has(file,'LISTA DE PRECO')&&!isPctabpr(file);
const isLaunchList=(file:File)=>has(file,'LANCAMENTO')&&!has(file,'SORTIMENTO');
const isPremises=(file:File)=>has(file,'PREMISSAS');
const isRca=(file:File)=>has(file,'NOVOS RCAS')||has(file,'DE PARA')||has(file,'DE-PARA');
const isCustomerPortfolio=(file:File)=>has(file,'CARTEIRA')&&has(file,'CLIENT');
const isRoute=(file:File)=>has(file,'ROTEIRO');
const isInboundPortfolio=(file:File)=>has(file,'CARTEIRA')&&!has(file,'CLIENT');
const isCompass=(file:File)=>has(file,'BUSSOLA');
const is379=(file:File)=>has(file,'379');
const is12322=(file:File)=>has(file,'12.322')||has(file,'12322');
const is310=(file:File)=>/(^|\D)310(\D|$)/.test(name(file));
const isAssortment=(file:File)=>has(file,'SORTIMENTO')&&!has(file,'310');
const isCustomerIntelligenceFile=(file:File)=>is310(file)||isAssortment(file)||isPremises(file);
const sum=<T>(rows:T[],value:(row:T)=>number)=>rows.reduce((total,row)=>total+(Number(value(row))||0),0);

function sourceType(file:File):string{
  if(is8022(file))return'8022';
  if(is286(file))return'286';
  if(is105(file))return'105';
  if(is8013(file))return'8013';
  if(isPctabpr(file))return'PCTABPR';
  if(isPriceList(file))return'LISTA_PRECO_COLGATE';
  if(isLaunchList(file))return'LANCAMENTOS';
  if(isPremises(file))return'PREMISSAS';
  if(isRca(file))return'NOVOS_RCAS';
  if(isCustomerPortfolio(file))return'CARTEIRA_CLIENTES';
  if(isRoute(file))return'ROTEIRO_TOP';
  if(isInboundPortfolio(file))return'CARTEIRA_COLGATE';
  if(isCompass(file))return'BUSSOLA';
  if(is379(file))return'379';
  if(is12322(file))return'12.322';
  if(is310(file))return'310';
  if(isAssortment(file))return'SORTIMENTO_OFICIAL';
  return'OUTRA';
}

class FileCache {
  private buffers=new Map<File,ArrayBuffer>();
  private workbooks=new Map<File,XLSX.WorkBook>();
  private texts=new Map<File,string>();
  async buffer(file:File){let value=this.buffers.get(file);if(!value){value=await file.arrayBuffer();this.buffers.set(file,value)}return value}
  async workbook(file:File){let value=this.workbooks.get(file);if(!value){value=XLSX.read(await this.buffer(file),{type:'array',cellDates:true});this.workbooks.set(file,value)}return value}
  async text(file:File){let value=this.texts.get(file);if(value===undefined){value=await file.text();this.texts.set(file,value)}return value}
  async rows(file:File):Promise<Row[]>{const workbook=await this.workbook(file);return sheetRows(workbook,workbook.SheetNames[0])}
}

function simpleHash(buffer:ArrayBuffer){let hash=2166136261;const bytes=new Uint8Array(buffer);for(const byte of bytes){hash^=byte;hash=Math.imul(hash,16777619)}return (hash>>>0).toString(16).padStart(8,'0')}
async function metadata(file:File,cache:FileCache,referenceDate:string):Promise<SourceSnapshotMetadata>{
  const type=sourceType(file);let recordCount=0;let schemaSignature='';
  try{
    if(/\.txt$/i.test(file.name)){const text=await cache.text(file);const lines=text.split(/\r\n|\n|\r/g);recordCount=lines.length;schemaSignature=normalizeText(lines.find(line=>line.trim())||'').slice(0,160)}
    else{const workbook=await cache.workbook(file);const rows=sheetRows(workbook,workbook.SheetNames[0]);recordCount=rows.length;schemaSignature=rows.slice(0,15).map(row=>row.map(normalizeText).filter(Boolean).join('|')).find(Boolean)?.slice(0,240)||''}
  }catch{/* metadado não bloqueia o fato */}
  return{sourceType:type,sourceName:file.name,competence:referenceDate.slice(0,7),referenceDate,version:String(file.lastModified||''),schemaSignature,loadedAt:new Date().toISOString(),recordCount,fileHash:simpleHash(await cache.buffer(file))};
}

function mergeCustomers<T extends {cnpj:string}>(previous:T[],next:T[]):T[]{
  if(!next.length)return previous;const map=new Map(previous.map(row=>[row.cnpj,row]));next.forEach(row=>{const old=map.get(row.cnpj);map.set(row.cnpj,old?{...old,...row}:row)});return Array.from(map.values());
}
function latestSource<T extends {source:string}>(previous:T[],next:T[],source:string){return next.length?[...previous.filter(row=>row.source!==source),...next]:previous}
function updateHistoryByYear(previous:UnifiedDataLayer['historicalSalesFacts'],next:UnifiedDataLayer['historicalSalesFacts'],year:number){return next.length?[...previous.filter(row=>row.sourceYear!==year),...next]:previous}

function remapTargets(previous:TargetFactRecord[],rcas:UnifiedDataLayer['rcas']):TargetFactRecord[]{
  const byLegacy=new Map(rcas.filter(row=>row.legacyRcaCode).map(row=>[row.legacyRcaCode,row]));
  return previous.map(row=>{const rca=byLegacy.get(row.legacyRcaCode);return{...row,rcaCanonicalId:rca?.rcaCanonicalId||'',assignmentStatus:rca?'RESOLVED':'UNRESOLVED_RCA'}});
}

function reconcileInbound(previous:UnifiedDataLayer['inboundOrders'],receipts:UnifiedDataLayer['receiptItems'],headers:UnifiedDataLayer['receiptHeaders']){
  const headerById=new Map(headers.map(header=>[header.receiptId,header]));const received=new Map<string,number>();
  receipts.forEach(item=>{const header=headerById.get(item.receiptId);if(!header?.invoiceNormalized||!item.itemCanonicalId)return;const key=`${header.invoiceNormalized}|${item.itemCanonicalId}`;received.set(key,(received.get(key)||0)+item.receivedUnits)});
  return previous.map(row=>{if(!row.invoiceNormalized||!row.itemCanonicalId)return row;const units=received.get(`${row.invoiceNormalized}|${row.itemCanonicalId}`)||0;const remaining=row.pipelineUnits===null?null:Math.max(row.pipelineUnits-units,0);let status=row.inboundStatus;if(units>0&&row.pipelineUnits!==null)status=units>=row.pipelineUnits?'RECEIVED_BY_MILENIO':'PARTIALLY_RECEIVED';else if(row.billQtyCases>0)status='BILLED_BY_COLGATE_IN_TRANSIT';else if(row.orderQtyCases>0)status='ORDERED_FROM_COLGATE';return{...row,receivedUnits:units,remainingInTransitUnits:remaining,inboundStatus:status}});
}

function unifiedSales(layer:UnifiedDataLayer):UnifiedSalesRecord[]{
  const historical:UnifiedSalesRecord[]=layer.historicalSalesFacts.filter(row=>row.movementClass!=='OTHER').map(row=>({unifiedSalesId:`H:${row.historicalSalesFactId}`,movementDate:row.movementDate,itemCanonicalId:row.itemCanonicalId,customerCanonicalId:row.customerCanonicalId,rcaCanonicalId:row.rcaCanonicalId,units:row.signedQuantity,value:row.signedValue,movementClass:row.movementClass,invoiceNumber:row.invoiceNumber,sourceSystem:'LEGACY',sourceFile:`379 ${row.sourceYear}`}));
  const current:UnifiedSalesRecord[]=layer.salesFacts.map(row=>({unifiedSalesId:`C:${row.salesFactId}`,movementDate:row.movementDate,itemCanonicalId:row.itemCanonicalId,customerCanonicalId:row.customerCanonicalId,rcaCanonicalId:row.rcaCanonicalId,units:row.units,value:row.value,movementClass:row.salesStatus==='A FATURAR'?'TO_INVOICE':'SALE',invoiceNumber:row.invoiceNumber,sourceSystem:'WINTHOR',sourceFile:'8022'}));
  return[...historical,...current].sort((a,b)=>a.movementDate.localeCompare(b.movementDate));
}

function reconcile310(layer:UnifiedDataLayer,support:CustomerIntelligenceSupport):DataQualityIssue[]{
  if(!support.purchases.length||!layer.historicalCustomerProduct.length)return[];
  const aggregate=new Map(layer.historicalCustomerProduct.map(row=>[`${row.cnpj}:${row.legacyProductCode}`,row]));const issues:DataQualityIssue[]=[];
  for(const purchase of support.purchases){
    const legacy=purchase.legacyProductCode||purchase.winthorCode;const row=aggregate.get(`${purchase.cnpj}:${legacy}`);
    if(!row){issues.push({id:`310_MISSING:${purchase.cnpj}:${legacy}`,domain:'HISTORY',severity:'ERROR',code:'HISTORICAL_310_RECONCILIATION_FAILURE',message:'Combinação CNPJ × produto do 310 não foi reproduzida pelo 379.',source:'310 × 379',entityKey:`${purchase.cnpj}:${legacy}`});continue}
    const valueDiff=Math.abs(row.netSalesValue-purchase.netValue);
    const returnValueDiff=Math.abs(row.returnValue-purchase.returnValue);
    const saleUnitsDiff=Math.abs(row.grossSaleUnits-purchase.volumes);
    const returnUnitsDiff=Math.abs(row.returnUnits-purchase.returnVolume);
    const invoiceDiff=Math.abs(row.purchaseInvoiceCount-purchase.quantity);
    if(valueDiff>.02||returnValueDiff>.02||saleUnitsDiff>.001||returnUnitsDiff>.001||invoiceDiff>.001){
      issues.push({id:`310_DIFF:${purchase.cnpj}:${legacy}`,domain:'HISTORY',severity:'ERROR',code:'HISTORICAL_310_RECONCILIATION_FAILURE',message:'310 diverge da reconstrução 379 em valor, devolução, volumes ou quantidade de compras.',source:'310 × 379',entityKey:`${purchase.cnpj}:${legacy}`,details:{value310:purchase.netValue,value379:row.netSalesValue,returnValue310:purchase.returnValue,returnValue379:row.returnValue,volumes310:purchase.volumes,volumes379:row.grossSaleUnits,returnVolume310:purchase.returnVolume,returnVolume379:row.returnUnits,purchases310:purchase.quantity,purchaseInvoices379:row.purchaseInvoiceCount}});
    }
  }
  return issues;
}

function compatibilityFiles(files:File[]){
  return files.filter(file=>!isCustomerPortfolio(file)&&!isInboundPortfolio(file)&&!is310(file)&&!isAssortment(file)&&!isPctabpr(file)&&!is12322(file));
}

function projectStrictInventory(base:CanonicalState,layer:UnifiedDataLayer,config:ManualConfiguration):{inventory:CanonicalInventoryProduct[];stock:CanonicalStockSummary}{
  const inboundByItem=new Map<string,UnifiedDataLayer['inboundOrders']>();
  layer.inboundOrders.filter(row=>row.inboundStatus!=='RECEIVED_BY_MILENIO').forEach(row=>{const rows=inboundByItem.get(row.itemCanonicalId)||[];rows.push(row);inboundByItem.set(row.itemCanonicalId,rows)});
  const inventory=layer.items.map(item=>{
    const inbound=inboundByItem.get(item.itemCanonicalId)||[];let pendingQty=0,pendingCases=0,pendingCost=0,pendingSale=0;
    for(const row of inbound){
      const factor=item.industryUnitsPerCase||0;const remainingUnits=row.remainingInTransitUnits??row.pipelineUnits;const knownUnits=remainingUnits!==null;const units=knownUnits?Math.max(remainingUnits||0,0):0;const cases=knownUnits&&factor>0?units/factor:Math.max(row.pipelineQtyCases,0);const fraction=knownUnits&&row.pipelineUnits&&row.pipelineUnits>0?Math.min(Math.max(units/row.pipelineUnits,0),1):1;
      pendingQty+=units;pendingCases+=cases;pendingCost+=Math.max(row.netValue,0)*fraction;pendingSale+=knownUnits&&units>0&&item.salePricePvenDa1!==null?units*item.salePricePvenDa1:Math.max(row.netValue,0)*fraction*(1+Math.max(config.portfolioSaleMarkup,0));
    }
    return{code:item.winthorCode||item.itemCanonicalId,description:item.internalDescription||item.industryDescription,ean:item.internalEan||item.industryEan,quantity:item.physicalStockUnits,costUnit:item.costUnit105,saleUnit:item.salePricePvenDa1??0,pendingQty,pendingCases,pendingCost,pendingSale,isLaunch:item.isLaunch,hasWinthor:item.hasWinthor,factoryCode:item.manufacturerCode||item.industrySku,physicalCases:item.physicalCases8013,physicalUnits:item.physicalUnits8013||item.physicalStockUnits,grossKg:item.grossKg8013} as CanonicalInventoryProduct;
  });
  const costValue=sum(inventory,row=>row.quantity*row.costUnit);const saleValue=sum(inventory,row=>row.quantity*row.saleUnit);const pendingPurchaseCost=sum(inventory,row=>row.pendingCost);const pendingPurchaseSale=sum(inventory,row=>row.pendingSale);const average=Math.max(base.history.average3ClosedMonths||0,0);const coverageCurrentDays=average>0?Math.round(saleValue/average*30):0;const coverageProjectedDays=average>0?Math.round((saleValue+pendingPurchaseSale)/average*30):0;const coverageCostCurrentDays=average>0?Math.round(costValue/average*30):0;const coverageCostProjectedDays=average>0?Math.round((costValue+pendingPurchaseCost)/average*30):0;
  return{inventory,stock:{costValue,saleValue,pendingPurchaseCost,pendingPurchaseSale,projectedCostValue:costValue+pendingPurchaseCost,projectedSaleValue:saleValue+pendingPurchaseSale,physicalUnits:sum(inventory,row=>row.quantity),physicalCases:sum(inventory,row=>row.physicalCases||0),grossKg:sum(inventory,row=>row.grossKg||0),coverageCurrentDays,coverageProjectedDays,coverageCostCurrentDays,coverageCostProjectedDays,coverageTargetDays:config.coverageTargetDays}};
}

export async function processUnifiedFiles(input:{allFiles:File[];engineFiles:File[];operational:OperationalSourceState;config:ManualConfiguration;previous:CanonicalState|null;continuityWarning?:string}):Promise<{canonical:UnifiedCanonicalState;sellOut:CanonicalState['sellOut']}> {
  const previousUnified=isUnifiedCanonicalState(input.previous)?input.previous.unified:EMPTY_UNIFIED_DATA_LAYER;
  const previousCi=isUnifiedCanonicalState(input.previous)?input.previous.customerIntelligenceSupport:EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT;
  const compat=compatibilityFiles(input.engineFiles);
  let base:CanonicalState;
  if(compat.length)base=(await processCanonicalFiles(compat,input.config,input.previous)).canonical;
  else if(input.previous)base=input.previous;
  else throw new Error('A primeira carga precisa conter ao menos uma fonte estrutural reconhecida além das fontes auxiliares.');

  const cache=new FileCache();const find=(predicate:(file:File)=>boolean)=>input.allFiles.find(predicate);const rows=async(predicate:(file:File)=>boolean)=>{const file=find(predicate);return file?cache.rows(file):Promise.resolve([] as Row[])};const workbook=async(predicate:(file:File)=>boolean)=>{const file=find(predicate);return file?cache.workbook(file):Promise.resolve(null)};
  const referenceDate=base.referenceDate||new Date().toISOString().slice(0,10);const generatedAt=new Date().toISOString();

  const itemResult=runItemMotor({
    normalized286Rows:await rows(is286),
    stock105Rows:await rows(is105),
    stock8013Rows:await rows(is8013),
    priceListRows:await rows(isPriceList),
    launchRows:await rows(isLaunchList),
    pctabprWorkbook:await workbook(isPctabpr),
    previousItems:previousUnified.items,
  });
  const items=itemResult.items;

  const customerResult=runCustomerMotor({premisesRows:await rows(isPremises),rcaRows:await rows(isRca),customerPortfolioRows:await rows(isCustomerPortfolio),routeWorkbook:await workbook(isRoute),routeCompetence:referenceDate.slice(0,7),salesRows:await rows(is8022),snapshotDate:referenceDate});
  const rcas=find(isRca)?customerResult.rcas:previousUnified.rcas.length?previousUnified.rcas:customerResult.rcas;
  const customers=mergeCustomers(previousUnified.customers,customerResult.customers);
  const classifications=find(isPremises)?latestSource(previousUnified.customerClassifications,customerResult.classifications,'PREMISSAS'):previousUnified.customerClassifications;
  const relations=find(isCustomerPortfolio)?latestSource(previousUnified.customerRcaRelations,customerResult.relations,'CARTEIRA_CLIENTES'):previousUnified.customerRcaRelations;
  const topRetailers=find(isRoute)?latestSource(previousUnified.topRetailerSnapshots,customerResult.topRetailers,'ROTEIRO_ATIVO'):previousUnified.topRetailerSnapshots;

  const salesResult=runSalesMotor({salesRows:await rows(is8022),portfolioRows:await rows(isInboundPortfolio),items,rcas,compassWorkbook:await workbook(isCompass),operational:input.operational,referenceDate});
  const salesFacts=find(is8022)?salesResult.salesFacts:previousUnified.salesFacts;
  const targets=find(isCompass)?salesResult.targets:find(isRca)?remapTargets(previousUnified.targets,rcas):previousUnified.targets;
  const receiptHeaders=find(file=>has(file,'218'))?salesResult.receiptHeaders:previousUnified.receiptHeaders;
  const receiptItems=find(file=>has(file,'218'))?salesResult.receiptItems:previousUnified.receiptItems;
  let inboundOrders=find(isInboundPortfolio)?salesResult.inboundOrders:previousUnified.inboundOrders;
  if(find(file=>has(file,'218'))&&!find(isInboundPortfolio))inboundOrders=reconcileInbound(inboundOrders,receiptItems,receiptHeaders);

  let historicalFacts=previousUnified.historicalSalesFacts;const historyIssues:DataQualityIssue[]=[];
  for(const file of input.allFiles.filter(is379)){
    const text=await cache.text(file);const yearMatch=text.match(/Vendas[^\n]*?(20\d{2})/i)||file.name.match(/(20)?(25|26)/);const year=yearMatch?Number(yearMatch[1]&&yearMatch[1].length===4?yearMatch[1]:`20${yearMatch[2]}`):0;if(!year)continue;const parsed=parseHistorical379Transactions(text,year);historicalFacts=updateHistoryByYear(historicalFacts,parsed.facts,year);historyIssues.push(...parsed.qualityIssues);
  }
  const itemByGtin=new Map<string,string>();items.forEach(item=>{[item.internalEan,item.industryEan,item.industryDun14].filter(Boolean).forEach(gtin=>itemByGtin.set(gtin,item.itemCanonicalId))});
  const legacyProductMap=buildLegacyProductMap(historicalFacts,itemByGtin);const rcaByLegacy=new Map(rcas.filter(row=>row.legacyRcaCode).map(row=>[row.legacyRcaCode,row.rcaCanonicalId]));historicalFacts=applyHistoricalIdentity(historicalFacts,legacyProductMap,rcaByLegacy);const historicalCustomerProduct=aggregateHistoricalCustomerProduct(historicalFacts,'YTD');
  let historicalReceipts=previousUnified.historicalReceipts;const file12322=find(is12322);if(file12322)historicalReceipts=parseHistoricalReceipts12322(await cache.text(file12322));

  const ciFiles=input.allFiles.filter(isCustomerIntelligenceFile);const customerIntelligenceSupport=ciFiles.length?await processCustomerIntelligenceFiles(ciFiles,previousCi):previousCi;
  const sourceMetadata=await Promise.all(input.allFiles.map(file=>metadata(file,cache,referenceDate)));const types=new Set(sourceMetadata.map(row=>row.sourceType));const sources=[...previousUnified.sources.filter(row=>!types.has(row.sourceType)),...sourceMetadata];
  const layer:UnifiedDataLayer={schemaVersion:1,generatedAt,sources,qualityIssues:[],items,customers,customerClassifications:classifications,rcas,customerRcaRelations:relations,topRetailerSnapshots:topRetailers,salesFacts,inboundOrders,receiptHeaders,receiptItems,targets,historicalSalesFacts:historicalFacts,legacyProductMap,historicalCustomerProduct,historicalReceipts,unifiedSales:[]};
  layer.unifiedSales=unifiedSales(layer);
  layer.qualityIssues=[...itemResult.qualityIssues,...customerResult.qualityIssues,...salesResult.qualityIssues,...historyIssues,...reconcile310(layer,customerIntelligenceSupport)];

  let projected=projectCanonicalFromUnified(base,layer,input.config);
  const strictInventory=projectStrictInventory(projected,layer,input.config);
  projected={...projected,inventory:strictInventory.inventory,stock:strictInventory.stock};
  if(input.continuityWarning)projected={...projected,warnings:[...projected.warnings.filter(warning=>!warning.startsWith('Carteira comparável:')),input.continuityWarning]};
  const canonical={...projected,unifiedSchemaVersion:1 as const,unified:layer,customerIntelligenceSupport} as UnifiedCanonicalState;
  return{canonical,sellOut:canonical.sellOut};
}
