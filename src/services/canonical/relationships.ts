import type { CanonicalCnpjIssue, CanonicalCnpjSourceSummary, CanonicalRelationshipAudit, CnpjNormalizationStatus, CnpjRelationshipSource } from '../../domain/canonical';
import type { PremiseClient, ReferenceClientNetwork, RouteStore, SalesTransaction } from './runtime';
import { networkKey, normalizeCnpj } from './utils';

interface NetworkIndex<T extends {cnpj:string}> {
  byCnpj:Map<string,T>;
  duplicateCnpjs:number;
  conflicts:Array<{source:CnpjRelationshipSource;cnpj:string;networks:string[]}>;
}

const operationalCnpj = (value: unknown) => /^\d{14}$/.test(String(value ?? ''));

function indexNetworkRows<T extends {cnpj:string}>(source:CnpjRelationshipSource,rows:T[],getNetwork:(row:T)=>string):NetworkIndex<T> {
  const grouped=new Map<string,T[]>();
  rows.forEach(row=>{const current=grouped.get(row.cnpj)||[];current.push(row);grouped.set(row.cnpj,current)});
  const byCnpj=new Map<string,T>();
  grouped.forEach((items,cnpj)=>{
    // Mantém a compatibilidade com o comportamento anterior (última linha),
    // mas uma linha vazia nunca apaga uma rede preenchida da mesma fonte.
    const selected=[...items].reverse().find(item=>Boolean(getNetwork(item).trim()))||items.at(-1)!;
    byCnpj.set(cnpj,selected);
  });
  const conflicts=Array.from(grouped.entries()).flatMap(([cnpj,items])=>{
    const networks=[...new Map(items.map(item=>[networkKey(getNetwork(item)),getNetwork(item).trim()] as const).filter(([key])=>Boolean(key))).values()];
    return networks.length>1?[{source,cnpj,networks}]:[];
  });
  return{byCnpj,duplicateCnpjs:Array.from(grouped.values()).filter(items=>items.length>1).length,conflicts};
}

function statusOf(row:{cnpj:string;cnpjRaw?:string;cnpjNormalizationStatus?:CnpjNormalizationStatus}):CnpjNormalizationStatus {
  return row.cnpjNormalizationStatus||normalizeCnpj(row.cnpjRaw??row.cnpj).status;
}

function rawOf(row:{cnpj:string;cnpjRaw?:string}):string { return row.cnpjRaw??row.cnpj; }

function sourceSummary(
  source:CnpjRelationshipSource,
  rows:Array<{cnpj:string;cnpjRaw?:string;cnpjNormalizationStatus?:CnpjNormalizationStatus}>,
  duplicateCnpjs:number,
  conflictingNetworkCnpjs:number,
  salesValues:Map<string,number>,
):CanonicalCnpjSourceSummary {
  const statuses=rows.map(statusOf);
  const unique=new Set(rows.map(row=>row.cnpj).filter(Boolean));
  const matched=[...unique].filter(cnpj=>salesValues.has(cnpj));
  return{
    source,rows:rows.length,uniqueCanonical:unique.size,
    exact14:statuses.filter(status=>status==='EXACT_14').length,
    paddedExcel:statuses.filter(status=>status==='PADDED_EXCEL').length,
    trimmedLeadingZero:statuses.filter(status=>status==='TRIMMED_LEADING_ZERO').length,
    cpfOrAmbiguous:statuses.filter(status=>status==='CPF_OR_AMBIGUOUS').length,
    invalidLength:statuses.filter(status=>status==='INVALID_LENGTH'||status==='EMPTY').length,
    duplicateCnpjs,conflictingNetworkCnpjs,
    matchedSalesCnpjs:matched.length,
    matchedSalesValue:matched.reduce((sum,cnpj)=>sum+(salesValues.get(cnpj)||0),0),
  };
}

function normalizationIssues(source:CnpjRelationshipSource,rows:Array<{cnpj:string;cnpjRaw?:string;cnpjNormalizationStatus?:CnpjNormalizationStatus}>):CanonicalCnpjIssue[] {
  const seen=new Set<string>();
  const issues:CanonicalCnpjIssue[]=[];
  rows.forEach(row=>{
    const initial=normalizeCnpj(row.cnpjRaw??row.cnpj);
    const status=row.cnpjNormalizationStatus||initial.status;
    const normalization=normalizeCnpj(row.cnpjRaw??row.cnpj,{declaredCnpj:status==='PADDED_EXCEL'&&initial.digits.length===11});
    if(status==='EXACT_14')return;
    const key=`${status}|${normalization.raw}|${row.cnpj}`;
    if(seen.has(key))return;
    seen.add(key);
    issues.push({source,raw:normalization.raw,canonical:row.cnpj,status,note:normalization.note});
  });
  return issues;
}

export interface RelationshipContext {
  premisesByCnpj:Map<string,PremiseClient>;
  routeByCnpj:Map<string,RouteStore>;
  referenceByCnpj:Map<string,ReferenceClientNetwork>;
  referenceNetworks:Map<string,string>;
  audit:CanonicalRelationshipAudit;
}

export function buildRelationshipContext(
  transactions:SalesTransaction[],
  premises:PremiseClient[],
  routeStores:RouteStore[],
  referenceRecords:ReferenceClientNetwork[],
):RelationshipContext {
  // Registros inválidos/ambíguos permanecem nas estruturas de auditoria abaixo,
  // porém nunca entram nos mapas usados por Clientes, Redes ou Sortimento.
  const operationalPremises = premises.filter(row=>operationalCnpj(row.cnpj));
  const operationalRoute = routeStores.filter(row=>operationalCnpj(row.cnpj));
  const operationalReference = referenceRecords.filter(row=>operationalCnpj(row.cnpj));
  const premiseIndex=indexNetworkRows('PREMISSAS',operationalPremises,row=>row.network);
  const routeIndex=indexNetworkRows('ROTEIRO',operationalRoute,row=>row.networkRaw);
  const referenceIndex=indexNetworkRows('REFERENCIA',operationalReference,row=>row.network);
  const routeCnpjRows=[...routeStores,...routeStores.filter(row=>Boolean(row.managerCnpjRaw||row.managerCnpj)).map(row=>({cnpj:row.managerCnpj,cnpjRaw:row.managerCnpjRaw,cnpjNormalizationStatus:row.managerCnpjNormalizationStatus}))];
  const salesValues=new Map<string,number>();
  transactions.forEach(row=>salesValues.set(row.cnpj,(salesValues.get(row.cnpj)||0)+row.value));
  const audit:CanonicalRelationshipAudit={
    sourceSummaries:[
      sourceSummary('8022',transactions,0,0,salesValues),
      sourceSummary('PREMISSAS',premises,premiseIndex.duplicateCnpjs,premiseIndex.conflicts.length,salesValues),
      sourceSummary('ROTEIRO',routeStores,routeIndex.duplicateCnpjs,routeIndex.conflicts.length,salesValues),
      sourceSummary('REFERENCIA',referenceRecords,referenceIndex.duplicateCnpjs,referenceIndex.conflicts.length,salesValues),
    ],
    normalizationIssues:[
      ...normalizationIssues('8022',transactions),
      ...normalizationIssues('PREMISSAS',premises),
      ...normalizationIssues('ROTEIRO',routeCnpjRows),
      ...normalizationIssues('REFERENCIA',referenceRecords),
    ],
    networkConflicts:[...premiseIndex.conflicts,...routeIndex.conflicts,...referenceIndex.conflicts],
  };
  return{
    premisesByCnpj:premiseIndex.byCnpj,
    routeByCnpj:routeIndex.byCnpj,
    referenceByCnpj:referenceIndex.byCnpj,
    referenceNetworks:new Map(Array.from(referenceIndex.byCnpj.entries()).map(([cnpj,row])=>[cnpj,row.network])),
    audit,
  };
}

export function originalCnpjValues<T extends {cnpj:string;cnpjRaw?:string}>(rows:T[],cnpj:string):string[] {
  return[...new Set(rows.filter(row=>row.cnpj===cnpj).map(rawOf).filter(Boolean))];
}
