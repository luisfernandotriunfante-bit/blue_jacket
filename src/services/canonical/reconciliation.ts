import type { CanonicalNetworkAssignmentAudit, CanonicalReconciliationCheck, ReconciliationLevel } from '../../domain/canonical';
import type { PremiseClient, ReferenceClientNetwork, RouteStore, SalesTransaction } from './runtime';
import { resolveClientNetwork } from './networkResolution';
import type { Row } from './runtime';
import { normalizeCnpj, normalizeText, parseNumber } from './utils';

export interface NumericCheckInput { id:string; level:ReconciliationLevel; label:string; expected:number; calculated:number; source:string; tolerance?:number; note?:string; }

export function numericCheck(input:NumericCheckInput):CanonicalReconciliationCheck {
  const tolerance=Math.max(Number(input.tolerance)||0,0); const difference=input.calculated-input.expected;
  return{...input,tolerance,difference,status:Math.abs(difference)<=tolerance?'OK':'DIVERGENT'};
}

export function blockedCheck(id:string,label:string,source:string,note:string):CanonicalReconciliationCheck {
  return{id,level:'SPREADSHEET',label,expected:null,calculated:null,difference:null,tolerance:0,status:'BLOCKED',source,note};
}

export function reconcileNetworkAssignments(
  transactions:SalesTransaction[], premisesByCnpj:Map<string,PremiseClient>, routeStores:RouteStore[], referenceNetworks:Map<string,string>, referenceByCnpj:Map<string,ReferenceClientNetwork>=new Map(),
):CanonicalNetworkAssignmentAudit[] {
  const routeByCnpj=new Map(routeStores.map(store=>[store.cnpj,store])); const byCustomer=new Map<string,CanonicalNetworkAssignmentAudit>();
  transactions.forEach(transaction=>{
    const validCnpj=/^\d{14}$/.test(transaction.cnpj); const cnpj=validCnpj?transaction.cnpj:''; const transactionKey=validCnpj?cnpj:(transaction.customerKey||`CLIENTE:${transaction.clientCode||transaction.clientName}`);
    const premise=cnpj?premisesByCnpj.get(cnpj):undefined; const route=cnpj?routeByCnpj.get(cnpj):undefined; const reference=cnpj?referenceByCnpj.get(cnpj):undefined;
    const resolution=resolveClientNetwork(premise?.network||'',route?.networkRaw||'',cnpj?referenceNetworks.get(cnpj)||'':'');
    const originals={ '8022':[transaction.cnpjRaw||transaction.cnpj||transactionKey], ...(premise?{PREMISSAS:[premise.cnpjRaw||premise.cnpj]}:{}), ...(route?{ROTEIRO:[route.cnpjRaw||route.cnpj]}:{}), ...(reference?{REFERENCIA:[reference.cnpjRaw||reference.cnpj]}:{}) };
    const issues=[
      {source:'8022',status:transaction.cnpjNormalizationStatus||normalizeCnpj(transaction.cnpjRaw||transaction.cnpj).status},
      ...(premise?[{source:'PREMISSAS',status:premise.cnpjNormalizationStatus||normalizeCnpj(premise.cnpjRaw||premise.cnpj).status}]:[]),
      ...(route?[{source:'ROTEIRO',status:route.cnpjNormalizationStatus||normalizeCnpj(route.cnpjRaw||route.cnpj).status}]:[]),
      ...(reference?[{source:'REFERENCIA',status:reference.cnpjNormalizationStatus||normalizeCnpj(reference.cnpjRaw||reference.cnpj).status}]:[]),
    ].filter(item=>item.status!=='EXACT_14').map(item=>`${item.source}: ${item.status}`);
    const current=byCustomer.get(transactionKey)||{
      cnpj,value:0,network:resolution.network,source:resolution.source,divergentSources:resolution.divergentSources,
      sourcePresence:{'8022':true,PREMISSAS:Boolean(premise),ROTEIRO:Boolean(route),REFERENCIA:Boolean(cnpj&&referenceNetworks.has(cnpj))},
      sourceNetworks:{...(premise?.network?{PREMISSAS:premise.network}:{}),...(route?.networkRaw?{ROTEIRO:route.networkRaw}:{}),...(cnpj&&referenceNetworks.get(cnpj)?{REFERENCIA:referenceNetworks.get(cnpj)!}:{})},
      originalCnpjs:originals,normalizationIssues:[...new Set(issues)],
    };
    current.value+=transaction.value; current.originalCnpjs!['8022']=[...new Set([...(current.originalCnpjs!['8022']||[]),transaction.cnpjRaw||transaction.cnpj||transactionKey])]; current.normalizationIssues=[...new Set([...(current.normalizationIssues||[]),...issues])]; byCustomer.set(transactionKey,current);
  });
  return Array.from(byCustomer.values()).sort((left,right)=>(left.cnpj||'').localeCompare(right.cnpj||''));
}

export function sumTransactions(transactions:SalesTransaction[],status?:SalesTransaction['status']):number { return transactions.reduce((sum,transaction)=>sum+(!status||transaction.status===status?transaction.value:0),0); }

export interface RawSalesTotals { invoiced:number;toInvoice:number;total:number;validRows:number;ignoredRows:number; }

/** Soma independente do 8022 para reconciliação de fonte. */
export function sumRawSales8022(rows:Row[]):RawSalesTotals {
  let invoiced=0;let toInvoice=0;let validRows=0;let ignoredRows=0;
  for(let index=1;index<rows.length;index+=1){const row=rows[index];const status=normalizeText(row[15]);const saleType=normalizeText(row[32]);const value=parseNumber(row[31]);if((status!=='FATURADO'&&status!=='A FATURAR')||(saleType&&saleType!=='VENDA')||!value){ignoredRows+=1;continue}if(status==='FATURADO')invoiced+=value;else toInvoice+=value;validRows+=1;}
  return{invoiced,toInvoice,total:invoiced+toInvoice,validRows,ignoredRows};
}
