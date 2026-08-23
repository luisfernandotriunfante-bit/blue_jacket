import type {
  DataQualityIssue,
  HistoricalCustomerProductAggregateRecord,
  HistoricalMovementClass,
  HistoricalReceiptHeaderRecord,
  HistoricalSalesFactRecord,
  LegacyProductMapRecord,
} from '../../domain/unified';
import { normalizeCnpj } from '../canonical/utils';
import { parseInvoiceIdentity } from '../../domain/invoiceIdentity';

const SALE = new Set(['51201/5403','51216/5403','51234/5403','51201/5102','51216/5102','51234/5102']);
const RETURN = new Set(['13201/1411','13216/1411','13234/1411','13201/1202','13216/1202','13234/1202']);
const ROW = /^\s*(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(\S+)\s+(\d{8})\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d{11,15})\s+(\d{11,15})\s+(\d+)\s+([\d.,-]+)\s+([\d.,-]+)\s+(.*)$/;

const brNumber = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const parsed = Number(raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9+\-.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const iso = (value: string) => { const [d,m,y] = value.split('/'); return d&&m&&y ? `${y}-${m}-${d}` : ''; };
const validGtin = (value: string) => {
  if (![8,12,13,14].includes(value.length) || !/^\d+$/.test(value)) return false;
  const body=value.slice(0,-1); let sum=0;
  for(let i=body.length-1,p=0;i>=0;i--,p++) sum += Number(body[i])*(p%2===0?3:1);
  return (10-(sum%10))%10 === Number(value.at(-1));
};

export function classifyHistoricalMovement(operationCode: string, cfop: string): HistoricalMovementClass {
  const key=`${digits(operationCode)}/${digits(cfop)}`;
  if (SALE.has(key)) return 'SALE';
  if (RETURN.has(key)) return 'RETURN';
  return 'OTHER';
}

export function historicalMovementSign(movementClass: HistoricalMovementClass): -1|0|1 {
  return movementClass==='SALE'?1:movementClass==='RETURN'?-1:0;
}

function gtinType(gtin:string):HistoricalSalesFactRecord['gtinType'] {
  if (gtin.length===13) return 'EAN13';
  if (gtin.length===14) return 'GTIN14';
  if (gtin) return 'GTIN_OTHER';
  return 'UNKNOWN';
}

export interface Parse379Result { facts: HistoricalSalesFactRecord[]; qualityIssues: DataQualityIssue[]; }

export function parseHistorical379Transactions(text:string, sourceYear:number):Parse379Result {
  const facts:HistoricalSalesFactRecord[]=[]; const qualityIssues:DataQualityIssue[]=[];
  const identityByLegacy=new Map<string,string>();
  let rowIndex=0;
  for(const line of text.split(/\r\n|\n|\r/g)){
    const match=line.match(ROW); if(!match) continue; rowIndex+=1;
    const movementDate=iso(match[1]); const invoiceNumber=match[2]; const invoiceSeries=match[3]; const legacyProductCode=match[4];
    const quantityRaw=brNumber(match[5]); const valueRaw=brNumber(match[6]); const discountRaw=brNumber(match[7]);
    const operationCode=match[8]; const cfop=match[9]; const orderNumber=match[10]; const supplier=digits(match[11]); const customerRaw=digits(match[12]); const legacyRcaCode=String(Number(match[13]));
    const netWeight=brNumber(match[14]); const grossWeight=brNumber(match[15]); const remainder=match[16];
    const candidates=(remainder.match(/\b\d{8,14}\b/g)||[]).filter(validGtin);
    const historicalGtin=candidates[0]||'';
    const normalized=normalizeCnpj(customerRaw,{declaredCnpj:customerRaw.length>=12});
    const customerCnpj=/^\d{14}$/.test(normalized.canonical)?normalized.canonical:'';
    const movementClass=classifyHistoricalMovement(operationCode,cfop); const sign=historicalMovementSign(movementClass);
    const previous=identityByLegacy.get(legacyProductCode);
    if(previous && historicalGtin && previous!==historicalGtin){
      qualityIssues.push({id:`HISTORY_GTIN_CONFLICT:${legacyProductCode}:${rowIndex}`,domain:'HISTORY',severity:'ERROR',code:'HISTORICAL_PRODUCT_GTIN_CONFLICT',message:`Código legado ${legacyProductCode} apareceu com GTINs diferentes.`,source:`379 ${sourceYear}`,entityKey:legacyProductCode,details:{previous,current:historicalGtin}});
    } else if(historicalGtin) identityByLegacy.set(legacyProductCode,historicalGtin);
    if(!customerCnpj) qualityIssues.push({id:`HISTORY_CNPJ:${sourceYear}:${rowIndex}`,domain:'HISTORY',severity:'WARNING',code:'HISTORICAL_CUSTOMER_UNRESOLVED',message:'Transação histórica preservada sem CNPJ operacional válido.',source:`379 ${sourceYear}`,entityKey:customerRaw});
    facts.push({
      historicalSalesFactId:`379:${sourceYear}:${movementDate}:${invoiceNumber}:${invoiceSeries}:${legacyProductCode}:${rowIndex}`,
      movementDate,invoiceNumber,invoiceSeries,legacyProductCode,historicalGtin,gtinType:gtinType(historicalGtin),itemCanonicalId:'',quantityRaw,signedQuantity:quantityRaw*sign,valueRaw,signedValue:valueRaw*sign,discountRaw,signedDiscount:discountRaw*sign,operationCode,cfop,movementClass,orderNumber,supplier,customerCnpj,customerRaw,customerCanonicalId:customerCnpj?`CNPJ:${customerCnpj}`:'',legacyRcaCode,rcaCanonicalId:'',netWeight,grossWeight,historicalCity:'',historicalCoordinator:'',historicalNetwork:'',historicalBranch:'',historicalGroup:'',qtdCx:0,sourceYear,source:'379'
    });
  }
  return {facts,qualityIssues};
}

export function buildLegacyProductMap(facts:HistoricalSalesFactRecord[], itemByGtin:Map<string,string>):LegacyProductMapRecord[]{
  const grouped=new Map<string,HistoricalSalesFactRecord[]>(); facts.forEach(f=>{const current=grouped.get(f.legacyProductCode)||[];current.push(f);grouped.set(f.legacyProductCode,current)});
  return Array.from(grouped.entries()).map(([legacyProductCode,rows])=>{
    const gtins=Array.from(new Set(rows.map(r=>r.historicalGtin).filter(Boolean)));
    const historicalGtin=gtins[0]||''; const itemCanonicalId=historicalGtin?(itemByGtin.get(historicalGtin)||''):'';
    const dates=rows.map(r=>r.movementDate).filter(Boolean).sort();
    return {legacyProductCode,historicalGtin,gtinType:gtinType(historicalGtin),itemCanonicalId,firstSeenDate:dates[0]||'',lastSeenDate:dates.at(-1)||'',mappingStatus:gtins.length>1?'CONFLICT':itemCanonicalId?'RESOLVED':'UNRESOLVED'};
  });
}

export function applyHistoricalIdentity(facts:HistoricalSalesFactRecord[], legacyProducts:LegacyProductMapRecord[], rcaByLegacy:Map<string,string>):HistoricalSalesFactRecord[]{
  const productMap=new Map(legacyProducts.map(row=>[row.legacyProductCode,row.itemCanonicalId]));
  return facts.map(f=>({...f,itemCanonicalId:productMap.get(f.legacyProductCode)||'',rcaCanonicalId:rcaByLegacy.get(f.legacyRcaCode)||''}));
}

export function aggregateHistoricalCustomerProduct(facts:HistoricalSalesFactRecord[], period='YTD'):HistoricalCustomerProductAggregateRecord[]{
  const grouped=new Map<string,HistoricalSalesFactRecord[]>();
  facts.filter(f=>f.movementClass!=='OTHER'&&f.customerCnpj).forEach(f=>{const key=`${f.customerCnpj}:${f.legacyProductCode}`;const rows=grouped.get(key)||[];rows.push(f);grouped.set(key,rows)});
  return Array.from(grouped.values()).map(rows=>{
    const first=rows[0]; const sales=rows.filter(r=>r.movementClass==='SALE'); const returns=rows.filter(r=>r.movementClass==='RETURN');
    return {customerCanonicalId:first.customerCanonicalId,cnpj:first.customerCnpj,itemCanonicalId:first.itemCanonicalId,legacyProductCode:first.legacyProductCode,period,grossSaleUnits:sales.reduce((s,r)=>s+r.quantityRaw,0),returnUnits:returns.reduce((s,r)=>s+r.quantityRaw,0),netSignedUnits:rows.reduce((s,r)=>s+r.signedQuantity,0),grossSalesValue:sales.reduce((s,r)=>s+r.valueRaw,0),returnValue:returns.reduce((s,r)=>s+r.valueRaw,0),netSalesValue:rows.reduce((s,r)=>s+r.signedValue,0),netDiscount:rows.reduce((s,r)=>s+r.signedDiscount,0),purchaseInvoiceCount:new Set(sales.map(r=>`${r.invoiceNumber}:${r.invoiceSeries}`)).size,legacySellerContext:Array.from(new Set(rows.map(r=>r.legacyRcaCode).filter(Boolean))).join(',')};
  });
}

export function parseHistoricalReceipts12322(text:string):HistoricalReceiptHeaderRecord[]{
  const result:HistoricalReceiptHeaderRecord[]=[]; const seen=new Set<string>();
  const pattern=/^\s*(\d{6,9})\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{11,15})\s+(.+?)\s{2,}(\d{3}\.\d{2})\s+(\d{4})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+(\d{3})\s+([A-Z]{2})\s*(.*?)\s+(\d+)\s*$/gm;
  let m:RegExpExecArray|null;
  while((m=pattern.exec(text))!==null){
    const identity=parseInvoiceIdentity(m[1]); const key=identity.normalized||identity.number; if(!key||seen.has(key))continue; seen.add(key);
    const toIsoYY=(v:string)=>{const[d,mo,y]=v.split('/');return `20${y}-${mo}-${d}`}; const operationCode=m[6];
    result.push({historicalReceiptId:`12322:${key}`,invoiceRaw:m[1],invoiceNormalized:key,invoiceIssueDate:toIsoYY(m[2]),accountingDate:toIsoYY(m[3]),supplierDocument:digits(m[4]),supplierName:m[5].trim(),operationCode,representativeRaw:m[7],invoiceValue:brNumber(m[8]),discount:brNumber(m[9]),exchangeDiscount:brNumber(m[10]),series:m[11],uf:m[12],observations:m[13].trim(),orderNumber:m[14],receiptClass:operationCode==='212.01'?'MERCHANDISE':operationCode==='299.40'?'SUPPLIES':'OTHER',reconciliationStatus:operationCode==='212.01'?'UNMATCHED':'NOT_APPLICABLE',source:'12.322'});
  }
  return result;
}

export function historicalTotals(facts:HistoricalSalesFactRecord[]){
  const eligible=facts.filter(f=>f.movementClass!=='OTHER');
  return {grossSales:eligible.filter(f=>f.movementClass==='SALE').reduce((s,f)=>s+f.valueRaw,0),returns:eligible.filter(f=>f.movementClass==='RETURN').reduce((s,f)=>s+f.valueRaw,0),net:eligible.reduce((s,f)=>s+f.signedValue,0)};
}
