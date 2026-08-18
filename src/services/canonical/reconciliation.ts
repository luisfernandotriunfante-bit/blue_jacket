import type { CanonicalNetworkAssignmentAudit, CanonicalReconciliationCheck, ReconciliationLevel } from '../../domain/canonical';
import type { PremiseClient, RouteStore, SalesTransaction } from './runtime';
import { resolveClientNetwork } from './networkResolution';
import type { Row } from './runtime';
import { normalizeText, parseNumber } from './utils';

export interface NumericCheckInput {
  id:string;
  level:ReconciliationLevel;
  label:string;
  expected:number;
  calculated:number;
  source:string;
  tolerance?:number;
  note?:string;
}

export function numericCheck(input:NumericCheckInput):CanonicalReconciliationCheck {
  const tolerance=Math.max(Number(input.tolerance)||0,0);
  const difference=input.calculated-input.expected;
  return{
    ...input,
    tolerance,
    difference,
    status:Math.abs(difference)<=tolerance?'OK':'DIVERGENT',
  };
}

export function blockedCheck(id:string,label:string,source:string,note:string):CanonicalReconciliationCheck {
  return{id,level:'SPREADSHEET',label,expected:null,calculated:null,difference:null,tolerance:0,status:'BLOCKED',source,note};
}

export function reconcileNetworkAssignments(
  transactions:SalesTransaction[],
  premisesByCnpj:Map<string,PremiseClient>,
  routeStores:RouteStore[],
  referenceNetworks:Map<string,string>,
):CanonicalNetworkAssignmentAudit[] {
  const routeByCnpj=new Map(routeStores.map(store=>[store.cnpj,store]));
  const byCnpj=new Map<string,CanonicalNetworkAssignmentAudit>();
  transactions.forEach(transaction=>{
    const premise=premisesByCnpj.get(transaction.cnpj);
    const route=routeByCnpj.get(transaction.cnpj);
    const resolution=resolveClientNetwork(premise?.network||'',route?.networkRaw||'',referenceNetworks.get(transaction.cnpj)||'');
    const current=byCnpj.get(transaction.cnpj)||{cnpj:transaction.cnpj,value:0,network:resolution.network,source:resolution.source,divergentSources:resolution.divergentSources};
    current.value+=transaction.value;
    byCnpj.set(transaction.cnpj,current);
  });
  return Array.from(byCnpj.values()).sort((left,right)=>left.cnpj.localeCompare(right.cnpj));
}

export function sumTransactions(transactions:SalesTransaction[],status?:SalesTransaction['status']):number {
  return transactions.reduce((sum,transaction)=>sum+(!status||transaction.status===status?transaction.value:0),0);
}

export interface RawSalesTotals { invoiced:number;toInvoice:number;total:number;validRows:number;ignoredRows:number; }

/**
 * Soma independente e deliberadamente pequena do 8022. Ela não cria transações,
 * não consulta cadastros e não usa os agregadores do motor; serve para provar que
 * o valor lido diretamente da fonte chegou inteiro à base canônica.
 */
export function sumRawSales8022(rows:Row[]):RawSalesTotals {
  let invoiced=0;let toInvoice=0;let validRows=0;let ignoredRows=0;
  for(let index=1;index<rows.length;index+=1){
    const row=rows[index];
    const status=normalizeText(row[15]);
    const saleType=normalizeText(row[32]);
    const value=parseNumber(row[31]);
    if((status!=='FATURADO'&&status!=='A FATURAR')||(saleType&&saleType!=='VENDA')||!value){ignoredRows+=1;continue}
    if(status==='FATURADO')invoiced+=value;else toInvoice+=value;
    validRows+=1;
  }
  return{invoiced,toInvoice,total:invoiced+toInvoice,validRows,ignoredRows};
}
