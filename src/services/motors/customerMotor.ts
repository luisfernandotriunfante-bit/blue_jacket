import type * as XLSX from 'xlsx';
import type {
  CustomerClassificationRecord,
  CustomerMasterRecord,
  CustomerRcaRelationRecord,
  DataQualityIssue,
  RcaMasterRecord,
  TopRetailerSnapshotRecord,
} from '../../domain/unified';
import { cleanCode, normalizeCnpj, normalizeText, parseNumber, sheetRows } from '../canonical/utils';
import { parseRcaMap } from '../canonical/support';
import type { Row } from '../canonical/runtime';

const validCnpj=(value:string)=>/^\d{14}$/.test(value);
const customerId=(cnpj:string)=>cnpj?`CNPJ:${cnpj}`:'';
const headerMap=(row:Row)=>new Map(row.map((cell,index)=>[normalizeText(cell),index]).filter(([name])=>Boolean(name)) as Array<[string,number]>);
const idx=(map:Map<string,number>,...names:string[])=>{for(const name of names){const found=map.get(normalizeText(name));if(found!==undefined)return found}return-1};
const cell=(row:Row,index:number)=>index>=0?row[index]:'';

export interface CustomerMotorResult {
  customers:CustomerMasterRecord[];
  classifications:CustomerClassificationRecord[];
  rcas:RcaMasterRecord[];
  relations:CustomerRcaRelationRecord[];
  topRetailers:TopRetailerSnapshotRecord[];
  qualityIssues:DataQualityIssue[];
}

export function parseRcaMaster(rows:Row[],source='NOVOS RCAS'):RcaMasterRecord[]{
  return parseRcaMap(rows).map(rca=>({rcaCanonicalId:`RCA:${rca.newCode}`,currentRcaCode:rca.newCode,legacyRcaCode:rca.oldCode,rcaName:rca.name,coordinatorCode:rca.coordinatorCode,coordinatorName:rca.coordinatorName,isColgate:true,effectiveFrom:'',effectiveTo:'',source}));
}

export function parsePremisesClassification(rows:Row[],source='PREMISSAS'): { classifications:CustomerClassificationRecord[]; customerSeeds:Partial<CustomerMasterRecord>[]; qualityIssues:DataQualityIssue[] } {
  const qualityIssues:DataQualityIssue[]=[]; const classifications:CustomerClassificationRecord[]=[]; const customerSeeds:Partial<CustomerMasterRecord>[]=[];
  if(!rows.length)return{classifications,customerSeeds,qualityIssues};
  const headerIndex=rows.findIndex(row=>{const values=row.map(normalizeText);return values.includes('SEMESTRE_PREMISSA')&&values.includes('COD CLIENTE')&&values.includes('TIPO')});
  if(headerIndex<0)return{classifications,customerSeeds,qualityIssues:[{id:'PREMISSES_SCHEMA',domain:'CUSTOMER',severity:'ERROR',code:'PREMISES_SCHEMA_NOT_RECOGNIZED',message:'Base de Premissas sem cabeçalho esperado.',source}]};
  const h=headerMap(rows[headerIndex]);
  const c={competence:idx(h,'SEMESTRE_PREMISSA'),environment:idx(h,'AMBIENTE'),identifier:idx(h,'COD CLIENTE'),name:idx(h,'NOME_CLIENTE'),range:idx(h,'FAIXAS'),state:idx(h,'ESTADO'),city:idx(h,'CIDADE'),cluster:idx(h,'IND_CLUSTER_COD'),clusterDesc:idx(h,'IND_CLUSTER_DESC'),avg:idx(h,'AVG 12 MESES'),distributor:idx(h,'AREA DISTRIBUIDOR'),nielsen:idx(h,'AREA NIELSEN'),profile:idx(h,'PERFIL'),type:idx(h,'TIPO'),pdv:idx(h,'CHECK PDV'),network:idx(h,'REDE')};
  for(let i=headerIndex+1;i<rows.length;i++){
    const row=rows[i]; const declared=normalizeText(cell(row,c.type)); if(!declared)continue;
    const raw=String(cell(row,c.identifier)??'').trim(); const normalized=normalizeCnpj(raw,{declaredCnpj:declared==='CNPJ'});
    if(declared!=='CNPJ')continue;
    if(!validCnpj(normalized.canonical)){qualityIssues.push({id:`PREMISSES_CNPJ:${i}`,domain:'CUSTOMER',severity:'WARNING',code:'PREMISES_INVALID_CNPJ',message:'Registro declarado como CNPJ não pôde ser normalizado para 14 dígitos.',source,entityKey:raw});continue}
    const cnpj=normalized.canonical; const competence=String(cell(row,c.competence)??'').trim(); const quarter=(competence.match(/Q\d/i)||[''])[0].toUpperCase(); const semester=(competence.match(/[12]SEM\d{2}/i)||[''])[0].toUpperCase();
    classifications.push({customerCanonicalId:customerId(cnpj),cnpj,competence,semester,quarter,environment:String(cell(row,c.environment)??'').trim(),range:String(cell(row,c.range)??'').trim(),profile:String(cell(row,c.profile)??'').trim(),premiseNetwork:String(cell(row,c.network)??'').trim(),clusterCode:cleanCode(cell(row,c.cluster)),clusterDescription:String(cell(row,c.clusterDesc)??'').trim(),avg12Months:c.avg>=0?parseNumber(cell(row,c.avg)):null,distributorArea:String(cell(row,c.distributor)??'').trim(),nielsenArea:String(cell(row,c.nielsen)??'').trim(),pdvStatus:String(cell(row,c.pdv)??'').trim(),premiseCity:String(cell(row,c.city)??'').trim(),premiseState:String(cell(row,c.state)??'').trim(),source});
    customerSeeds.push({customerCanonicalId:customerId(cnpj),cnpj,cnpjRaw:raw,cnpjNormalizationStatus:normalized.status,customerName:String(cell(row,c.name)??'').trim(),city:String(cell(row,c.city)??'').trim()});
  }
  return{classifications,customerSeeds,qualityIssues};
}

export function parseCustomerPortfolio(rows:Row[],rcaByCurrent:Map<string,RcaMasterRecord>,snapshotDate:string,source='CARTEIRA_CLIENTES'):{customers:CustomerMasterRecord[];relations:CustomerRcaRelationRecord[];qualityIssues:DataQualityIssue[]} {
  const customersByCnpj=new Map<string,CustomerMasterRecord>(); const relations:CustomerRcaRelationRecord[]=[]; const qualityIssues:DataQualityIssue[]=[];
  let columns:Map<string,number>|null=null; let currentRepresentative='';
  for(let i=0;i<rows.length;i++){
    const row=rows[i]; const first=String(row[0]??'').trim(); const representativeMatch=first.match(/^0*(\d+)\s*-\s*/); if(representativeMatch){currentRepresentative=String(Number(representativeMatch[1]));continue}
    const values=row.map(normalizeText); if(values.includes('CODIGO CLIENTE')&&values.includes('CNPJ')&&values.includes('REPRESENTANTE')){columns=headerMap(row);continue}
    if(!columns)continue;
    const codeCol=idx(columns,'Código Cliente'); const cnpjCol=idx(columns,'CNPJ'); const nameCol=idx(columns,'Cliente');
    const rawCnpj=String(cell(row,cnpjCol)??'').trim(); const normalized=normalizeCnpj(rawCnpj,{declaredCnpj:true}); if(!validCnpj(normalized.canonical))continue;
    const cnpj=normalized.canonical; const repCol=idx(columns,'Representante'); const representativeCode=cleanCode(cell(row,repCol))||currentRepresentative;
    const record:CustomerMasterRecord={customerCanonicalId:customerId(cnpj),winthorCustomerCode:cleanCode(cell(row,codeCol)),cnpj,cnpjRaw:rawCnpj,cnpjNormalizationStatus:normalized.status,customerName:String(cell(row,nameCol)??'').trim(),tradeName:String(cell(row,idx(columns,'Fantasia'))??'').trim(),commercialActivity:String(cell(row,idx(columns,'Atividade Comercial'))??'').trim(),city:String(cell(row,idx(columns,'Cidade'))??'').trim(),district:String(cell(row,idx(columns,'Bairro'))??'').trim(),address:String(cell(row,idx(columns,'Endereço'))??'').trim(),latitude:Number.isFinite(Number(cell(row,idx(columns,'Latitude'))))?Number(cell(row,idx(columns,'Latitude'))):null,longitude:Number.isFinite(Number(cell(row,idx(columns,'Longitude'))))?Number(cell(row,idx(columns,'Longitude'))):null,buyer:String(cell(row,idx(columns,'Comprador'))??'').trim(),phone:String(cell(row,idx(columns,'Telefone'))??'').trim(),firstSeenAt:snapshotDate,lastSeenAt:snapshotDate};
    customersByCnpj.set(cnpj,record);
    if(representativeCode){const official=rcaByCurrent.get(representativeCode);relations.push({customerCanonicalId:record.customerCanonicalId,cnpj,rcaCanonicalId:official?.rcaCanonicalId||'',representativeCode,snapshotDate,frequency:String(cell(row,idx(columns,'Frequência'))??'').trim(),visitDay:String(cell(row,idx(columns,'Visita'))??'').trim(),daysWithoutPurchase:idx(columns,'Dias Sem Comprar')>=0?parseNumber(cell(row,idx(columns,'Dias Sem Comprar'))):null,isColgateRca:Boolean(official),active:true,source});if(!official)qualityIssues.push({id:`NON_COLGATE_REP:${cnpj}:${representativeCode}`,domain:'RCA',severity:'INFO',code:'NON_COLGATE_REPRESENTATIVE',message:'Representante da Carteira não pertence à população oficial Colgate desta fotografia.',source,entityKey:representativeCode})}
  }
  return{customers:Array.from(customersByCnpj.values()),relations,qualityIssues};
}

export function parseTopRetailerSnapshot(workbook:XLSX.WorkBook,competence:string,source='ROTEIRO_ATIVO'):TopRetailerSnapshotRecord[]{
  const rows=sheetRows(workbook,'Roteiro Ativo'); if(!rows.length)return[]; const headerIndex=rows.findIndex(row=>row.map(normalizeText).includes('CNPJ')&&row.map(normalizeText).includes('CNPJ GESTOR')); if(headerIndex<0)return[]; const h=headerMap(rows[headerIndex]);
  return rows.slice(headerIndex+1).map(row=>{const normalized=normalizeCnpj(cell(row,idx(h,'CNPJ')),{declaredCnpj:true});if(!validCnpj(normalized.canonical))return null;const cnpj=normalized.canonical;const manager=normalizeCnpj(cell(row,idx(h,'CNPJ GESTOR')),{declaredCnpj:true}).canonical;const targetCol=Array.from(h.entries()).find(([name])=>name.startsWith('META '))?.[1]??-1;return{customerCanonicalId:customerId(cnpj),cnpj,competence,isTopRetailerActive:true,apg:String(cell(row,idx(h,'APG'))??'').trim(),distributor:String(cell(row,idx(h,'DISTRIBUIDOR'))??'').trim(),storeName:String(cell(row,idx(h,'LOJA'))??'').trim(),banner:String(cell(row,idx(h,'BANDEIRA'))??'').trim(),topRetailerNetwork:String(cell(row,idx(h,'REDE'))??'').trim(),topAddress:String(cell(row,idx(h,'ENDEREÇO'))??'').trim(),topState:String(cell(row,idx(h,'UF'))??'').trim(),managerCnpj:validCnpj(manager)?manager:'',groupCode:String(cell(row,idx(h,'COD AGRUPAMENTO'))??'').trim(),topCategory:String(cell(row,idx(h,'CATEGORIA'))??'').trim(),storeType:String(cell(row,idx(h,'TIPO LOJA'))??'').trim(),scanntech:String(cell(row,idx(h,'SCANNTECH'))??'').trim(),purchaseModel:String(cell(row,idx(h,'COMPRA'))??'').trim(),retailEnvironment:String(cell(row,idx(h,'AMBIENTE DE VAREJO'))??'').trim(),topTradeName:String(cell(row,idx(h,'NOME FANTASIA'))??'').trim(),topCity:String(cell(row,idx(h,'CIDADE'))??'').trim(),regional:String(cell(row,idx(h,'REGIONAL'))??'').trim(),target:targetCol>=0?parseNumber(cell(row,targetCol)):0,source} as TopRetailerSnapshotRecord}).filter((row):row is TopRetailerSnapshotRecord=>Boolean(row));
}

function parseSalesCustomerSeeds(rows:Row[],referenceDate:string):Partial<CustomerMasterRecord>[] {
  if(!rows.length)return[];const headerIndex=rows.findIndex(row=>{const n=row.map(normalizeText);return n.includes('CNPJ/CPF CLIENTE')&&n.includes('COD. CLIENTE')});if(headerIndex<0)return[];const h=headerMap(rows[headerIndex]);const cCnpj=idx(h,'CNPJ/CPF CLIENTE'),cCode=idx(h,'COD. CLIENTE'),cName=idx(h,'NOME CLIENTE','CLIENTE','RAZAO SOCIAL'),cCity=idx(h,'CIDADE');const map=new Map<string,Partial<CustomerMasterRecord>>();for(let i=headerIndex+1;i<rows.length;i++){const raw=String(cell(rows[i],cCnpj)??'').trim();const normalized=normalizeCnpj(raw,{declaredCnpj:raw.replace(/\D/g,'').length>=12});if(!validCnpj(normalized.canonical))continue;const cnpj=normalized.canonical;const old=map.get(cnpj)||{};map.set(cnpj,{...old,customerCanonicalId:customerId(cnpj),cnpj,cnpjRaw:raw,cnpjNormalizationStatus:normalized.status,winthorCustomerCode:cleanCode(cell(rows[i],cCode))||old.winthorCustomerCode||'',customerName:String(cell(rows[i],cName)??'').trim()||old.customerName||'',city:String(cell(rows[i],cCity)??'').trim()||old.city||'',firstSeenAt:referenceDate,lastSeenAt:referenceDate})}return Array.from(map.values());
}

export function buildCustomerMaster(input:{portfolioCustomers:CustomerMasterRecord[];premiseSeeds:Partial<CustomerMasterRecord>[];topRetailers:TopRetailerSnapshotRecord[];salesSeeds:Partial<CustomerMasterRecord>[];referenceDate:string}):CustomerMasterRecord[]{
  const map=new Map<string,CustomerMasterRecord>(); const ensure=(cnpj:string,partial:Partial<CustomerMasterRecord>)=>{if(!validCnpj(cnpj))return;const current=map.get(cnpj);const blank:CustomerMasterRecord={customerCanonicalId:customerId(cnpj),winthorCustomerCode:'',cnpj,cnpjRaw:cnpj,cnpjNormalizationStatus:'',customerName:'',tradeName:'',commercialActivity:'',city:'',district:'',address:'',latitude:null,longitude:null,buyer:'',phone:'',firstSeenAt:input.referenceDate,lastSeenAt:input.referenceDate};map.set(cnpj,{...blank,...current,...partial,customerCanonicalId:customerId(cnpj),cnpj})};
  input.salesSeeds.forEach(seed=>seed.cnpj&&ensure(seed.cnpj,seed)); input.premiseSeeds.forEach(seed=>seed.cnpj&&ensure(seed.cnpj,seed)); input.topRetailers.forEach(top=>ensure(top.cnpj,{customerName:top.storeName,tradeName:top.topTradeName})); input.portfolioCustomers.forEach(customer=>ensure(customer.cnpj,customer)); return Array.from(map.values());
}

export function runCustomerMotor(input:{premisesRows:Row[];rcaRows:Row[];customerPortfolioRows:Row[];routeWorkbook:XLSX.WorkBook|null;routeCompetence:string;salesRows:Row[];snapshotDate:string}):CustomerMotorResult {
  const rcas=parseRcaMaster(input.rcaRows); const rcaByCurrent=new Map(rcas.map(row=>[row.currentRcaCode,row])); const premises=parsePremisesClassification(input.premisesRows); const portfolio=parseCustomerPortfolio(input.customerPortfolioRows,rcaByCurrent,input.snapshotDate); const topRetailers=input.routeWorkbook?parseTopRetailerSnapshot(input.routeWorkbook,input.routeCompetence):[];const salesSeeds=parseSalesCustomerSeeds(input.salesRows,input.snapshotDate);
  const customers=buildCustomerMaster({portfolioCustomers:portfolio.customers,premiseSeeds:premises.customerSeeds,topRetailers,salesSeeds,referenceDate:input.snapshotDate});
  return{customers,classifications:premises.classifications,rcas,relations:portfolio.relations,topRetailers,qualityIssues:[...premises.qualityIssues,...portfolio.qualityIssues]};
}
