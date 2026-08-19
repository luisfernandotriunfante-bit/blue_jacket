import type { CompassTarget, RcaMap, Row, SalesTransaction } from './runtime';
import type { CanonicalVendorResult } from '../../domain/canonical';
import { buildVendorResults } from './aggregate';
import { normalizeCnpj, normalizeText, parseNumber } from './utils';

export interface RawSalesAudit {
  sourceRows:number;
  validRows:number;
  ignoredRows:number;
  ignoredStatus:number;
  ignoredSaleType:number;
  ignoredZeroValue:number;
  invoiced:number;
  toInvoice:number;
  total:number;
  cases:number;
  units:number;
  validCnpjs:number;
  invalidOrAmbiguousCnpjRows:number;
  vendors:number;
  products:number;
  invoicedPositivation:number;
  futurePositivation:number;
  totalPositivation:number;
}

export function isValidSalesCnpj(transaction:Pick<SalesTransaction,'cnpj'|'cnpjRaw'|'cnpjNormalizationStatus'>):boolean {
  const status=transaction.cnpjNormalizationStatus||normalizeCnpj(transaction.cnpjRaw||transaction.cnpj).status;
  const canonical=normalizeCnpj(transaction.cnpj).canonical;
  return ['EXACT_14','PADDED_EXCEL','TRIMMED_LEADING_ZERO'].includes(status)&&/^\d{14}$/.test(canonical);
}

/**
 * Auditoria deliberadamente independente do parser de transações. Lê a matriz
 * original do 8022 e mede valores, volumes, cardinalidades e positivação sem usar
 * os agregadores canônicos. Assim uma divergência do parser não se autocertifica.
 */
export function auditRawSales8022(rows:Row[]):RawSalesAudit {
  let validRows=0;let ignoredRows=0;let ignoredStatus=0;let ignoredSaleType=0;let ignoredZeroValue=0;
  let invoiced=0;let toInvoice=0;let cases=0;let units=0;let invalidOrAmbiguousCnpjRows=0;
  const allValidCnpjs=new Set<string>();const invoicedCnpjs=new Set<string>();const pendingCnpjs=new Set<string>();
  const vendors=new Set<string>();const products=new Set<string>();

  for(let index=1;index<rows.length;index+=1){
    const row=rows[index];
    const status=normalizeText(row[15]);
    const saleType=normalizeText(row[32]);
    const value=parseNumber(row[31]);
    if(status!=='FATURADO'&&status!=='A FATURAR'){ignoredStatus+=1;ignoredRows+=1;continue}
    if(saleType&&saleType!=='VENDA'){ignoredSaleType+=1;ignoredRows+=1;continue}
    if(!value){ignoredZeroValue+=1;ignoredRows+=1;continue}

    validRows+=1;
    if(status==='FATURADO')invoiced+=value;else toInvoice+=value;
    cases+=parseNumber(row[26]);units+=parseNumber(row[27]);
    const vendor=String(row[17]??'').trim().replace(/^0+/,'');if(vendor)vendors.add(vendor);
    const product=[row[21],row[22],row[24]].map(value=>String(value??'').trim()).find(Boolean)||'';if(product)products.add(product);

    const normalized=normalizeCnpj(row[5]);
    if(/^\d{14}$/.test(normalized.canonical)&&['EXACT_14','PADDED_EXCEL','TRIMMED_LEADING_ZERO'].includes(normalized.status)){
      allValidCnpjs.add(normalized.canonical);
      if(status==='FATURADO')invoicedCnpjs.add(normalized.canonical);else pendingCnpjs.add(normalized.canonical);
    }else invalidOrAmbiguousCnpjRows+=1;
  }

  const futurePositivation=Array.from(pendingCnpjs).filter(cnpj=>!invoicedCnpjs.has(cnpj)).length;
  return{
    sourceRows:Math.max(rows.length-1,0),validRows,ignoredRows,ignoredStatus,ignoredSaleType,ignoredZeroValue,
    invoiced,toInvoice,total:invoiced+toInvoice,cases,units,validCnpjs:allValidCnpjs.size,invalidOrAmbiguousCnpjRows,
    vendors:vendors.size,products:products.size,invoicedPositivation:invoicedCnpjs.size,futurePositivation,totalPositivation:invoicedCnpjs.size+futurePositivation,
  };
}

export function summarizeTransactionPositivity(transactions:SalesTransaction[]){
  const valid=transactions.filter(isValidSalesCnpj);
  const invoiced=new Set(valid.filter(tx=>tx.status==='FATURADO').map(tx=>normalizeCnpj(tx.cnpj).canonical));
  const pending=new Set(valid.filter(tx=>tx.status==='A FATURAR').map(tx=>normalizeCnpj(tx.cnpj).canonical));
  const future=Array.from(pending).filter(cnpj=>!invoiced.has(cnpj));
  return{invoiced:invoiced.size,future:future.length,total:invoiced.size+future.length,validCnpjs:new Set([...invoiced,...pending]).size};
}

function unassignedVendorRow(transactions:SalesTransaction[]):CanonicalVendorResult|null {
  const rows=transactions.filter(tx=>!tx.vendorCode);
  if(!rows.length)return null;
  const invoiced=rows.filter(tx=>tx.status==='FATURADO').reduce((sum,tx)=>sum+tx.value,0);
  const toInvoice=rows.filter(tx=>tx.status==='A FATURAR').reduce((sum,tx)=>sum+tx.value,0);
  const positivity=summarizeTransactionPositivity(rows);
  const total=invoiced+toInvoice;
  return{
    newCode:'SEM_VENDEDOR',oldCode:'SEM_VENDEDOR',name:'NÃO CLASSIFICADO',coordinatorCode:'SEM_COORDENADOR',coordinatorName:'SEM COORDENADOR',
    salesTarget:0,positivityTarget:0,invoiced,toInvoice,total,attainment:0,
    invoicedPositivation:positivity.invoiced,futurePositivation:positivity.future,totalPositivation:positivity.total,positivityAttainment:0,
    idealSalesToday:0,salesGapToIdeal:0,salesGapToTarget:0,idealPositivationToday:0,positivityGapToIdeal:0,positivityGapToTarget:0,positivityDailyTarget:0,
  };
}

/**
 * Mantém TODO o valor de venda por vendedor, inclusive linhas cujo CNPJ esteja
 * ausente/ambíguo, mas impede que identificadores que não são CNPJ contem como
 * positivação. Linhas sem vendedor entram em um bucket explícito NÃO CLASSIFICADO
 * para que nenhuma venda desapareça das somas de vendedor/coordenação.
 */
export function buildVendorResultsWithValidatedPositivity(
  transactions:SalesTransaction[],
  rcaByNew:Map<string,RcaMap>,
  rcaByOld:Map<string,RcaMap>,
  targets:CompassTarget[],
  business:{total:number;elapsed:number;remaining:number},
):CanonicalVendorResult[]{
  const salesRows=buildVendorResults(transactions,rcaByNew,rcaByOld,targets,business);
  const positivityRows=buildVendorResults(transactions.filter(isValidSalesCnpj),rcaByNew,rcaByOld,targets,business);
  const positivityByKey=new Map(positivityRows.map(row=>[row.oldCode||row.newCode,row]));
  const rows=salesRows.map(row=>{
    const pos=positivityByKey.get(row.oldCode||row.newCode);
    const invoicedPositivation=pos?.invoicedPositivation||0;
    const futurePositivation=pos?.futurePositivation||0;
    const totalPositivation=invoicedPositivation+futurePositivation;
    const positivityGapToTarget=Math.max(row.positivityTarget-totalPositivation,0);
    const idealPositivationToday=business.total>0?row.positivityTarget*(business.elapsed/business.total):0;
    return{
      ...row,
      invoicedPositivation,
      futurePositivation,
      totalPositivation,
      positivityAttainment:row.positivityTarget>0?totalPositivation/row.positivityTarget:0,
      idealPositivationToday,
      positivityGapToIdeal:Math.max(idealPositivationToday-totalPositivation,0),
      positivityGapToTarget,
      positivityDailyTarget:business.remaining>0?positivityGapToTarget/business.remaining:positivityGapToTarget,
    };
  });
  const unassigned=unassignedVendorRow(transactions);
  if(unassigned)rows.push(unassigned);
  return rows.sort((a,b)=>b.salesTarget-a.salesTarget||b.total-a.total);
}
