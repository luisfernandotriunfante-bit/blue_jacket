import type { ClienteRanking, CoordenadorSellOut, DiaVenda, SellOutData, VendedorSellOut } from '../../store/DataContext';
import type { CanonicalClientResult, CanonicalCoordinatorResult, CanonicalDailyMovement, CanonicalLineResult, CanonicalNetworkResult, CanonicalNetworkStore, CanonicalVendorResult, LineName } from '../../domain/canonical';
import { DEFAULT_MANUAL_CONFIGURATION, LINE_NAMES } from '../../domain/canonical';
import type { CompassTarget, PremiseClient, RcaMap, RouteStore, SalesTransaction } from './runtime';
import { DAY_NAMES } from './runtime';
import { displayNetwork, networkKey, normalizeText } from './utils';

export function periodBounds(referenceDate: string): { start: string; end: string } {
  if (!referenceDate) return { start: '', end: '' };
  const d = new Date(`${referenceDate}T12:00:00Z`); const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`; const last = new Date(Date.UTC(y, m + 1, 0));
  return { start, end: `${y}-${String(m + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}` };
}

export function businessDayStats(referenceDate: string, holidays: string[]) {
  if (!referenceDate) return { total: 0, elapsed: 0, remaining: 0 };
  const { start, end } = periodBounds(referenceDate); const holidaySet = new Set(holidays);
  const count = (from: string, to: string) => { let n = 0; const cursor = new Date(`${from}T12:00:00Z`); const limit = new Date(`${to}T12:00:00Z`); while (cursor <= limit) { const iso = cursor.toISOString().slice(0, 10); const dow = cursor.getUTCDay(); if (dow !== 0 && dow !== 6 && !holidaySet.has(iso)) n++; cursor.setUTCDate(cursor.getUTCDate() + 1); } return n; };
  const total = count(start, end); const elapsed = count(start, referenceDate); return { total, elapsed, remaining: Math.max(total - elapsed, 0) };
}

export function buildDaily(transactions: SalesTransaction[]): CanonicalDailyMovement[] {
  const byDate = new Map<string, { invoiced: number; toInvoice: number; invClients: Set<string>; allClients: Set<string> }>();
  transactions.forEach(tx => {
    if (!tx.date) return;
    if (!byDate.has(tx.date)) byDate.set(tx.date, { invoiced: 0, toInvoice: 0, invClients: new Set(), allClients: new Set() });
    const d = byDate.get(tx.date)!;
    if (tx.status === 'FATURADO') { d.invoiced += tx.value; d.invClients.add(tx.cnpj); }
    else d.toInvoice += tx.value;
    d.allClients.add(tx.cnpj);
  });
  return Array.from(byDate.entries()).map(([date, d]) => ({ date, invoiced: d.invoiced, toInvoice: d.toInvoice, total: d.invoiced + d.toInvoice, invoicedPositivation: d.invClients.size, totalPositivation: d.allClients.size })).sort((a,b) => a.date.localeCompare(b.date));
}

export function buildClients(transactions: SalesTransaction[], premisesByCnpj: Map<string, PremiseClient>): CanonicalClientResult[] {
  const map = new Map<string, CanonicalClientResult>();
  transactions.forEach(tx => { const key = tx.cnpj || tx.clientCode || tx.clientName; if (!key) return; const premise = premisesByCnpj.get(tx.cnpj); if (!map.has(key)) map.set(key, { cnpj: tx.cnpj, name: premise?.name || tx.clientName, city: premise?.city || tx.city, network: premise?.network || '', invoiced: 0, toInvoice: 0, total: 0 }); const item = map.get(key)!; if (tx.status === 'FATURADO') item.invoiced += tx.value; else item.toInvoice += tx.value; item.total = item.invoiced + item.toInvoice; });
  return Array.from(map.values()).sort((a,b) => b.total - a.total);
}

export function buildVendorResults(transactions: SalesTransaction[], rcaByNew: Map<string,RcaMap>, rcaByOld: Map<string,RcaMap>, targets: CompassTarget[], business: {total:number;elapsed:number;remaining:number}): CanonicalVendorResult[] {
  type Temp = { invoiced:number;toInvoice:number;invClients:Set<string>;pendingClients:Set<string>;name:string;supCode:string;supName:string };
  const activity = new Map<string,Temp>();
  transactions.forEach(tx => {
    const code=tx.vendorCode; if(!code)return;
    if(!activity.has(code)) activity.set(code,{invoiced:0,toInvoice:0,invClients:new Set(),pendingClients:new Set(),name:tx.vendorName,supCode:tx.supervisorCode,supName:tx.supervisorName});
    const a=activity.get(code)!;
    if(tx.status==='FATURADO'){a.invoiced+=tx.value;a.invClients.add(tx.cnpj)}
    else { a.toInvoice+=tx.value; a.pendingClients.add(tx.cnpj); }
  });
  const targetByOld=new Map(targets.map(t=>[t.oldCode,t])); const codes=new Set<string>(activity.keys()); targets.forEach(t=>{const rca=rcaByOld.get(t.oldCode);codes.add(rca?.newCode||t.oldCode)});
  const rows: CanonicalVendorResult[]=[];
  const cleanPersonName=(value:string)=>normalizeText(value).replace(/^(CLT|PJ)\s*-\s*/,'').trim();
  codes.forEach(newCode=>{
    const a=activity.get(newCode)||{invoiced:0,toInvoice:0,invClients:new Set<string>(),pendingClients:new Set<string>(),name:'',supCode:'',supName:''};
    const activityName=cleanPersonName(a.name);
    const nameMatch = activityName ? Array.from(rcaByNew.values()).find(item=>{const referenceName=cleanPersonName(item.name);return referenceName===activityName||referenceName.startsWith(activityName)||activityName.startsWith(referenceName)}) : undefined;
    const rca=rcaByNew.get(newCode)||rcaByOld.get(newCode)||nameMatch;
    const oldCode=rca?.oldCode||newCode; const target=targetByOld.get(oldCode);
    const salesTarget=target?.salesTarget||0; const positivityTarget=target?.positivityTarget||0; const total=a.invoiced+a.toInvoice;
    const futurePos=Array.from(a.pendingClients).filter(cnpj=>!a.invClients.has(cnpj)).length; const totalPos=a.invClients.size+futurePos;
    const idealSalesToday=business.total>0?salesTarget*(business.elapsed/business.total):0; const idealPositivationToday=business.total>0?positivityTarget*(business.elapsed/business.total):0;
    rows.push({ newCode, oldCode, name:rca?.name||a.name||target?.name||`Vendedor ${newCode}`, coordinatorCode:rca?.coordinatorCode||a.supCode, coordinatorName:rca?.coordinatorName||a.supName||target?.supervisorName||'', salesTarget, positivityTarget, invoiced:a.invoiced, toInvoice:a.toInvoice, total, attainment:salesTarget>0?total/salesTarget:0, invoicedPositivation:a.invClients.size, futurePositivation:futurePos, totalPositivation:totalPos, positivityAttainment:positivityTarget>0?totalPos/positivityTarget:0, idealSalesToday, salesGapToIdeal:Math.max(idealSalesToday-total,0), salesGapToTarget:Math.max(salesTarget-total,0), idealPositivationToday, positivityGapToIdeal:Math.max(idealPositivationToday-totalPos,0), positivityGapToTarget:Math.max(positivityTarget-totalPos,0), positivityDailyTarget:business.remaining>0?Math.max(positivityTarget-totalPos,0)/business.remaining:Math.max(positivityTarget-totalPos,0) });
  });
  return rows.sort((a,b)=>b.salesTarget-a.salesTarget||b.total-a.total);
}

export function buildCoordinators(vendors: CanonicalVendorResult[]): CanonicalCoordinatorResult[] {
  const groups=new Map<string,CanonicalVendorResult[]>(); vendors.forEach(v=>{const key=v.coordinatorCode||v.coordinatorName||'SEM COORDENADOR';if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(v)});
  return Array.from(groups.entries()).map(([code,members])=>{const salesTarget=members.reduce((s,v)=>s+v.salesTarget,0);const positivityTarget=members.reduce((s,v)=>s+v.positivityTarget,0);const invoiced=members.reduce((s,v)=>s+v.invoiced,0);const toInvoice=members.reduce((s,v)=>s+v.toInvoice,0);const total=invoiced+toInvoice;const invoicedPositivation=members.reduce((s,v)=>s+v.invoicedPositivation,0);const futurePositivation=members.reduce((s,v)=>s+v.futurePositivation,0);const totalPositivation=invoicedPositivation+futurePositivation;return{code,name:members.find(v=>v.coordinatorName)?.coordinatorName||code,salesTarget,positivityTarget,invoiced,toInvoice,total,attainment:salesTarget>0?total/salesTarget:0,invoicedPositivation,futurePositivation,totalPositivation,positivityAttainment:positivityTarget>0?totalPositivation/positivityTarget:0,vendors:members.sort((a,b)=>b.total-a.total)}}).sort((a,b)=>b.salesTarget-a.salesTarget||b.total-a.total);
}

export function buildNetworks(transactions: SalesTransaction[], premisesByCnpj: Map<string,PremiseClient>, routeStores: RouteStore[], detectedTargets: Map<string,number>): CanonicalNetworkResult[] {
  type Temp={name:string;invoiced:number;toInvoice:number;clients:Set<string>}; const activity=new Map<string,Temp>();
  transactions.forEach(tx=>{const premise=premisesByCnpj.get(tx.cnpj);const network=premise?.network||'';if(!network)return;const key=networkKey(network);if(!activity.has(key))activity.set(key,{name:network,invoiced:0,toInvoice:0,clients:new Set()});const a=activity.get(key)!;if(tx.status==='FATURADO')a.invoiced+=tx.value;else a.toInvoice+=tx.value;a.clients.add(tx.cnpj)});
  const storesByNetwork=new Map<string,CanonicalNetworkStore[]>();
  routeStores.forEach(store=>{const premise=premisesByCnpj.get(store.cnpj);const networkName=premise?.network||displayNetwork(store.networkRaw.startsWith('REDE')?store.networkRaw:`REDE ${store.networkRaw}`);const key=networkKey(networkName);if(!storesByNetwork.has(key))storesByNetwork.set(key,[]);const storeTx=transactions.filter(tx=>tx.cnpj===store.cnpj);const invoiced=storeTx.filter(tx=>tx.status==='FATURADO').reduce((s,tx)=>s+tx.value,0);const toInvoice=storeTx.filter(tx=>tx.status==='A FATURAR').reduce((s,tx)=>s+tx.value,0);storesByNetwork.get(key)!.push({cnpj:store.cnpj,name:store.name,fantasyName:store.fantasyName,city:store.city,managerCnpj:store.managerCnpj,groupingCode:store.groupingCode,tier:store.tier,storeType:store.storeType,topTarget:store.target,invoiced,toInvoice,total:invoiced+toInvoice});if(!activity.has(key))activity.set(key,{name:networkName,invoiced:0,toInvoice:0,clients:new Set()})});
  const keys=new Set([...activity.keys(),...storesByNetwork.keys(),...detectedTargets.keys()]);const networks:CanonicalNetworkResult[]=[];
  keys.forEach(key=>{const a=activity.get(key)||{name:key,invoiced:0,toInvoice:0,clients:new Set<string>()};const stores=storesByNetwork.get(key)||[];const topTarget=stores.reduce((s,store)=>s+store.topTarget,0);const detectedNetworkTarget=detectedTargets.get(key)||0;const total=a.invoiced+a.toInvoice;networks.push({key,name:a.name,detectedNetworkTarget,networkTarget:detectedNetworkTarget,topTarget,invoiced:a.invoiced,toInvoice:a.toInvoice,total,networkAttainment:detectedNetworkTarget>0?total/detectedNetworkTarget:0,topAttainment:topTarget>0?total/topTarget:0,gapToNetworkTarget:Math.max(detectedNetworkTarget-total,0),gapToTopTarget:Math.max(topTarget-total,0),clients:a.clients.size,stores:stores.sort((x,y)=>y.topTarget-x.topTarget||y.total-x.total)})});
  return networks.sort((a,b)=>b.detectedNetworkTarget-a.detectedNetworkTarget||b.total-a.total);
}

export function buildLines(transactions: SalesTransaction[]): CanonicalLineResult[] {
  const totals=new Map<LineName,{invoiced:number;toInvoice:number}>(); LINE_NAMES.forEach(name=>totals.set(name,{invoiced:0,toInvoice:0})); transactions.forEach(tx=>{if(!tx.line)return;const t=totals.get(tx.line)!;if(tx.status==='FATURADO')t.invoiced+=tx.value;else t.toInvoice+=tx.value});
  return LINE_NAMES.map(name=>{const t=totals.get(name)!;const share=DEFAULT_MANUAL_CONFIGURATION.lineShares[name];return{name,share,target:0,invoiced:t.invoiced,toInvoice:t.toInvoice,total:t.invoiced+t.toInvoice,attainment:0}});
}

export function legacySellOut(transactions:SalesTransaction[],vendors:CanonicalVendorResult[],clients:CanonicalClientResult[]):SellOutData {
  const daily=buildDaily(transactions);const diasDeVenda:DiaVenda[]=daily.map(d=>{const date=new Date(`${d.date}T12:00:00Z`);return{data:d.date,diaSemana:DAY_NAMES[date.getUTCDay()],venda:d.total,faturado:d.invoiced,positivacao:d.invoicedPositivation}});const topClientes:ClienteRanking[]=clients.slice(0,20).map(c=>({cnpj:c.cnpj,nome:c.name,cidade:c.city,faturado:c.invoiced,aFaturar:c.toInvoice}));
  const coordMap=new Map<string,CoordenadorSellOut>(); vendors.forEach(v=>{const key=v.coordinatorCode||v.coordinatorName||'SEM COORDENADOR';if(!coordMap.has(key))coordMap.set(key,{codCoord:v.coordinatorCode,nomeCoord:v.coordinatorName||key,faturado:0,aFaturar:0,positivacao:0,vendedores:[]});const c=coordMap.get(key)!;c.faturado+=v.invoiced;c.aFaturar+=v.toInvoice;c.positivacao+=v.invoicedPositivation;const legacyVendor:VendedorSellOut={codVendedor:v.newCode,nomeVendedor:v.name,codCoord:v.coordinatorCode,nomeCoord:v.coordinatorName,faturado:v.invoiced,aFaturar:v.toInvoice,positivacao:v.invoicedPositivation};c.vendedores.push(legacyVendor)});
  const coordenadores=Array.from(coordMap.values()).map(c=>({...c,vendedores:c.vendedores.sort((a,b)=>b.faturado-a.faturado)})).sort((a,b)=>b.faturado-a.faturado);const invoiced=transactions.filter(t=>t.status==='FATURADO').reduce((s,t)=>s+t.value,0);const toInvoice=transactions.filter(t=>t.status==='A FATURAR').reduce((s,t)=>s+t.value,0);const invClients=new Set(transactions.filter(t=>t.status==='FATURADO').map(t=>t.cnpj));const allClients=new Set(transactions.map(t=>t.cnpj));
  return{faturadoTotal:invoiced,aFaturarTotal:toInvoice,vendaTotal:invoiced+toInvoice,positivacaoFaturado:invClients.size,positivacaoTotal:allClients.size,ticketMedio:invClients.size>0?invoiced/invClients.size:0,diasDeVenda,topClientes,coordenadores};
}
