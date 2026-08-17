import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { applyManualConfiguration, CanonicalState, CanonicalVendorResult, DEFAULT_MANUAL_CONFIGURATION, ManualConfiguration } from '../domain/canonical';

export interface ProdutoEstoque { codigo:string; descricao:string; ean:string; quantidade:number; saldoMinimo:number; custoUnitario:number; vendaUnitario:number; entradas:number; saidas:number; saldoPedido:number; saldoPedidoValorCusto?:number; saldoPedidoValorVenda?:number; isLancamento?:boolean; hasWinthor?:boolean; factoryCode?:string; physicalCases?:number; physicalUnits?:number; grossKg?:number; }
export interface VendedorSellOut { codVendedor:string; nomeVendedor:string; codCoord:string; nomeCoord:string; faturado:number; aFaturar:number; positivacao:number; }
export interface CoordenadorSellOut { codCoord:string; nomeCoord:string; faturado:number; aFaturar:number; positivacao:number; vendedores:VendedorSellOut[]; }
export interface DiaVenda { data:string; diaSemana:string; venda:number; faturado:number; positivacao:number; }
export interface ClienteRanking { cnpj:string; nome:string; cidade:string; faturado:number; aFaturar:number; }
export interface SellOutData { faturadoTotal:number; aFaturarTotal:number; vendaTotal:number; positivacaoFaturado:number; positivacaoTotal:number; ticketMedio:number; diasDeVenda:DiaVenda[]; topClientes:ClienteRanking[]; coordenadores:CoordenadorSellOut[]; }
export interface MetricasEstoque { valorEstoqueCompra:number; valorEstoqueVenda:number; saldoPedidoCusto:number; saldoPedidoVenda:number; coberturaDiasAtual:number; coberturaEstoqueMaisSaldo:number; coberturaDiasAtualCusto?:number; coberturaEstoqueMaisSaldoCusto?:number; produtosRuptura:number; metaCobertura:number; }

interface DataContextType {
  produtos:ProdutoEstoque[]; setProdutos:(produtos:ProdutoEstoque[])=>void;
  metricas:MetricasEstoque; setMetricas:(metricas:MetricasEstoque)=>void;
  sellOut:SellOutData|null; setSellOut:(data:SellOutData|null)=>void;
  canonical:CanonicalState|null; setCanonical:(data:CanonicalState|null)=>void;
  manualConfig:ManualConfiguration; setManualConfig:(config:ManualConfiguration)=>void;
  isLoaded:boolean;
}

const defaultMetricas:MetricasEstoque={valorEstoqueCompra:0,valorEstoqueVenda:0,saldoPedidoCusto:0,saldoPedidoVenda:0,coberturaDiasAtual:0,coberturaEstoqueMaisSaldo:0,coberturaDiasAtualCusto:0,coberturaEstoqueMaisSaldoCusto:0,produtosRuptura:0,metaCobertura:60};
const DataContext=createContext<DataContextType>({produtos:[],setProdutos:()=>{},metricas:defaultMetricas,setMetricas:()=>{},sellOut:null,setSellOut:()=>{},canonical:null,setCanonical:()=>{},manualConfig:DEFAULT_MANUAL_CONFIGURATION,setManualConfig:()=>{},isLoaded:false});

function readStored<T>(key:string,fallback:T):T{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback}catch{return fallback}}
function canonicalCoordinatorName(value:string){
  const original=value?.trim()||'SEM COORDENADOR';
  const normalized=original.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
  if(normalized.includes('CLAUDIO'))return'FLAVIO';
  if(normalized==='THIAGO'||normalized.includes('THIAGO DA SILVA CONEGUNDES'))return'THIAGO';
  return original;
}

/** Dias trabalhados pertencem sempre à competência apurada. */
function standardWorkedDays(periodStart:string,periodEnd:string,referenceDate:string,holidays:string[]){
  if(!periodStart||!periodEnd||!referenceDate)return 0;
  const start=new Date(`${periodStart}T12:00:00Z`);const periodLimit=new Date(`${periodEnd}T12:00:00Z`);const reference=new Date(`${referenceDate}T12:00:00Z`);
  if(Number.isNaN(start.getTime())||Number.isNaN(periodLimit.getTime())||Number.isNaN(reference.getTime()))return 0;
  const end=reference<periodLimit?reference:periodLimit;
  const holidaySet=new Set(holidays||[]);let count=0;const cursor=new Date(start);
  while(cursor<=end){const iso=cursor.toISOString().slice(0,10);const dow=cursor.getUTCDay();if(dow!==0&&dow!==6&&!holidaySet.has(iso))count+=1;cursor.setUTCDate(cursor.getUTCDate()+1)}
  return count;
}

function normalizeCanonicalTeam(state:CanonicalState|null,config:ManualConfiguration):CanonicalState|null{
  if(!state)return null;

  // Recalcula em um único ponto todas as métricas dependentes de tempo para que
  // Resumo, Redes, Gerencial, Equipes e Documentos usem exatamente a mesma regra.
  const totalDays=state.sellOut.businessDaysTotal;
  const calculatedWorked=standardWorkedDays(state.periodStart,state.periodEnd,state.referenceDate,config.holidays);
  const workedDays=calculatedWorked>0?calculatedWorked:state.sellOut.businessDaysElapsed;
  const remainingDays=Math.max(totalDays-workedDays,0);
  const invoicedDailyAverage=workedDays>0?state.sellOut.invoiced/workedDays:0;
  const totalDailyAverage=workedDays>0?state.sellOut.total/workedDays:0;
  const invoicedTrend=workedDays>0?invoicedDailyAverage*totalDays:0;
  const totalTrend=workedDays>0?totalDailyAverage*totalDays:0;
  const sellOutGap=Math.max(state.sellOut.sellOutTarget-state.sellOut.total,0);
  const neededDailyAverage=remainingDays>0?sellOutGap/remainingDays:sellOutGap;
  const sellOut={...state.sellOut,businessDaysElapsed:workedDays,businessDaysRemaining:remainingDays,invoicedDailyAverage,totalDailyAverage,neededDailyAverage,invoicedTrend,totalTrend};

  const canonicalCode=new Map<string,string>();
  state.vendors.forEach(v=>{const canonicalName=canonicalCoordinatorName(v.coordinatorName);if(v.coordinatorCode&&!canonicalCode.has(canonicalName))canonicalCode.set(canonicalName,v.coordinatorCode)});
  const vendors:CanonicalVendorResult[]=state.vendors.map(v=>{
    const coordinatorName=canonicalCoordinatorName(v.coordinatorName);
    const idealSalesToday=totalDays>0?v.salesTarget*(workedDays/totalDays):0;
    const idealPositivationToday=totalDays>0?v.positivityTarget*(workedDays/totalDays):0;
    const positivityGapToTarget=Math.max(v.positivityTarget-v.totalPositivation,0);
    return{...v,coordinatorName,coordinatorCode:canonicalCode.get(coordinatorName)||v.coordinatorCode,idealSalesToday,salesGapToIdeal:Math.max(idealSalesToday-v.total,0),idealPositivationToday,positivityGapToIdeal:Math.max(idealPositivationToday-v.totalPositivation,0),positivityGapToTarget,positivityDailyTarget:remainingDays>0?positivityGapToTarget/remainingDays:positivityGapToTarget}
  });
  const groups=new Map<string,CanonicalVendorResult[]>();
  vendors.forEach(v=>{const key=v.coordinatorName||'SEM COORDENADOR';if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(v)});
  const coordinators=Array.from(groups.entries()).map(([name,members])=>{const salesTarget=members.reduce((s,v)=>s+v.salesTarget,0);const positivityTarget=members.reduce((s,v)=>s+v.positivityTarget,0);const invoiced=members.reduce((s,v)=>s+v.invoiced,0);const toInvoice=members.reduce((s,v)=>s+v.toInvoice,0);const total=invoiced+toInvoice;const invoicedPositivation=members.reduce((s,v)=>s+v.invoicedPositivation,0);const futurePositivation=members.reduce((s,v)=>s+v.futurePositivation,0);const totalPositivation=invoicedPositivation+futurePositivation;return{code:canonicalCode.get(name)||members[0]?.coordinatorCode||name,name,salesTarget,positivityTarget,invoiced,toInvoice,total,attainment:salesTarget>0?total/salesTarget:0,invoicedPositivation,futurePositivation,totalPositivation,positivityAttainment:positivityTarget>0?totalPositivation/positivityTarget:0,vendors:members.sort((a,b)=>b.total-a.total)}}).sort((a,b)=>b.salesTarget-a.salesTarget||b.total-a.total);
  return{...state,sellOut,vendors,coordinators};
}

export const DataProvider=({children}:{children:ReactNode})=>{
  const[produtos,setProdutosState]=useState<ProdutoEstoque[]>([]);const[metricas,setMetricasState]=useState<MetricasEstoque>(defaultMetricas);const[sellOut,setSellOutState]=useState<SellOutData|null>(null);const[canonicalBase,setCanonicalBase]=useState<CanonicalState|null>(null);const[manualConfig,setManualConfigState]=useState<ManualConfiguration>(DEFAULT_MANUAL_CONFIGURATION);const[isLoaded,setIsLoaded]=useState(false);
  React.useEffect(()=>{const storedProdutos=readStored<ProdutoEstoque[]>('bj_produtos',[]);const storedMetricas=readStored<MetricasEstoque>('bj_metricas',defaultMetricas);const storedSellOut=readStored<SellOutData|null>('bj_sellout',null);const storedCanonical=readStored<CanonicalState|null>('bj_canonical',null);const storedManual=readStored<ManualConfiguration>('bj_manual_config',DEFAULT_MANUAL_CONFIGURATION);setProdutosState(storedProdutos);setMetricasState({...defaultMetricas,...storedMetricas});setSellOutState(storedSellOut);setCanonicalBase(storedCanonical);setManualConfigState({...DEFAULT_MANUAL_CONFIGURATION,...storedManual,networkTargets:storedManual.networkTargets||{},lineShares:{...DEFAULT_MANUAL_CONFIGURATION.lineShares,...(storedManual.lineShares||{})},holidays:storedManual.holidays||[]});setIsLoaded(Boolean(storedCanonical||storedSellOut||storedProdutos.length))},[]);
  const canonical=useMemo(()=>normalizeCanonicalTeam(applyManualConfiguration(canonicalBase,manualConfig),manualConfig),[canonicalBase,manualConfig]);
  const setProdutos=(newProdutos:ProdutoEstoque[])=>{setProdutosState(newProdutos);localStorage.setItem('bj_produtos',JSON.stringify(newProdutos));if(newProdutos.length>0)setIsLoaded(true)};
  const setMetricas=(newMetricas:MetricasEstoque)=>{const normalized={...defaultMetricas,...newMetricas,metaCobertura:manualConfig.coverageTargetDays};setMetricasState(normalized);localStorage.setItem('bj_metricas',JSON.stringify(normalized))};
  const setSellOut=(data:SellOutData|null)=>{setSellOutState(data);if(data){localStorage.setItem('bj_sellout',JSON.stringify(data));setIsLoaded(true)}else localStorage.removeItem('bj_sellout')};
  const setCanonical=(data:CanonicalState|null)=>{setCanonicalBase(data);if(data){localStorage.setItem('bj_canonical',JSON.stringify(data));setIsLoaded(true)}else localStorage.removeItem('bj_canonical')};
  const setManualConfig=(config:ManualConfiguration)=>{const normalized:ManualConfiguration={...DEFAULT_MANUAL_CONFIGURATION,...config,sellOutTarget:Math.max(Number(config.sellOutTarget)||0,0),coverageTargetDays:Math.max(Number(config.coverageTargetDays)||0,0),networkTargets:config.networkTargets||{},holidays:config.holidays||[],lineShares:{...DEFAULT_MANUAL_CONFIGURATION.lineShares,...(config.lineShares||{})}};setManualConfigState(normalized);localStorage.setItem('bj_manual_config',JSON.stringify(normalized));setMetricasState(current=>{const updated={...current,metaCobertura:normalized.coverageTargetDays};localStorage.setItem('bj_metricas',JSON.stringify(updated));return updated})};
  return <DataContext.Provider value={{produtos,setProdutos,metricas,setMetricas,sellOut,setSellOut,canonical,setCanonical,manualConfig,setManualConfig,isLoaded}}>{children}</DataContext.Provider>;
};

export const useData=()=>useContext(DataContext);
