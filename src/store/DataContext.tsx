import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { applyManualConfiguration, CanonicalState, DEFAULT_MANUAL_CONFIGURATION, ManualConfiguration } from '../domain/canonical';

export interface ProdutoEstoque { codigo:string; descricao:string; ean:string; quantidade:number; saldoMinimo:number; custoUnitario:number; vendaUnitario:number; entradas:number; saidas:number; saldoPedido:number; saldoPedidoValorCusto?:number; saldoPedidoValorVenda?:number; isLancamento?:boolean; hasWinthor?:boolean; }
export interface VendedorSellOut { codVendedor:string; nomeVendedor:string; codCoord:string; nomeCoord:string; faturado:number; aFaturar:number; positivacao:number; }
export interface CoordenadorSellOut { codCoord:string; nomeCoord:string; faturado:number; aFaturar:number; positivacao:number; vendedores:VendedorSellOut[]; }
export interface DiaVenda { data:string; diaSemana:string; venda:number; faturado:number; positivacao:number; }
export interface ClienteRanking { cnpj:string; nome:string; cidade:string; faturado:number; aFaturar:number; }
export interface SellOutData { faturadoTotal:number; aFaturarTotal:number; vendaTotal:number; positivacaoFaturado:number; positivacaoTotal:number; ticketMedio:number; diasDeVenda:DiaVenda[]; topClientes:ClienteRanking[]; coordenadores:CoordenadorSellOut[]; }
export interface MetricasEstoque { valorEstoqueCompra:number; valorEstoqueVenda:number; saldoPedidoCusto:number; saldoPedidoVenda:number; coberturaDiasAtual:number; coberturaEstoqueMaisSaldo:number; produtosRuptura:number; metaCobertura:number; }

interface DataContextType {
  produtos:ProdutoEstoque[]; setProdutos:(produtos:ProdutoEstoque[])=>void;
  metricas:MetricasEstoque; setMetricas:(metricas:MetricasEstoque)=>void;
  sellOut:SellOutData|null; setSellOut:(data:SellOutData|null)=>void;
  canonical:CanonicalState|null; setCanonical:(data:CanonicalState|null)=>void;
  manualConfig:ManualConfiguration; setManualConfig:(config:ManualConfiguration)=>void;
  isLoaded:boolean;
}

const defaultMetricas:MetricasEstoque={valorEstoqueCompra:0,valorEstoqueVenda:0,saldoPedidoCusto:0,saldoPedidoVenda:0,coberturaDiasAtual:0,coberturaEstoqueMaisSaldo:0,produtosRuptura:0,metaCobertura:60};
const DataContext=createContext<DataContextType>({produtos:[],setProdutos:()=>{},metricas:defaultMetricas,setMetricas:()=>{},sellOut:null,setSellOut:()=>{},canonical:null,setCanonical:()=>{},manualConfig:DEFAULT_MANUAL_CONFIGURATION,setManualConfig:()=>{},isLoaded:false});

function readStored<T>(key:string,fallback:T):T{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback}catch{return fallback}}

export const DataProvider=({children}:{children:ReactNode})=>{
  const [produtos,setProdutosState]=useState<ProdutoEstoque[]>([]);
  const [metricas,setMetricasState]=useState<MetricasEstoque>(defaultMetricas);
  const [sellOut,setSellOutState]=useState<SellOutData|null>(null);
  const [canonicalBase,setCanonicalBase]=useState<CanonicalState|null>(null);
  const [manualConfig,setManualConfigState]=useState<ManualConfiguration>(DEFAULT_MANUAL_CONFIGURATION);
  const [isLoaded,setIsLoaded]=useState(false);

  React.useEffect(()=>{
    const storedProdutos=readStored<ProdutoEstoque[]>('bj_produtos',[]);
    const storedMetricas=readStored<MetricasEstoque>('bj_metricas',defaultMetricas);
    const storedSellOut=readStored<SellOutData|null>('bj_sellout',null);
    const storedCanonical=readStored<CanonicalState|null>('bj_canonical',null);
    const storedManual=readStored<ManualConfiguration>('bj_manual_config',DEFAULT_MANUAL_CONFIGURATION);
    setProdutosState(storedProdutos);setMetricasState(storedMetricas);setSellOutState(storedSellOut);setCanonicalBase(storedCanonical);
    setManualConfigState({...DEFAULT_MANUAL_CONFIGURATION,...storedManual,networkTargets:storedManual.networkTargets||{},lineShares:{...DEFAULT_MANUAL_CONFIGURATION.lineShares,...(storedManual.lineShares||{})},holidays:storedManual.holidays||[]});
    setIsLoaded(Boolean(storedCanonical||storedSellOut||storedProdutos.length));
  },[]);

  const canonical=useMemo(()=>applyManualConfiguration(canonicalBase,manualConfig),[canonicalBase,manualConfig]);
  const setProdutos=(newProdutos:ProdutoEstoque[])=>{setProdutosState(newProdutos);localStorage.setItem('bj_produtos',JSON.stringify(newProdutos));if(newProdutos.length>0)setIsLoaded(true)};
  const setMetricas=(newMetricas:MetricasEstoque)=>{const normalized={...newMetricas,metaCobertura:manualConfig.coverageTargetDays};setMetricasState(normalized);localStorage.setItem('bj_metricas',JSON.stringify(normalized))};
  const setSellOut=(data:SellOutData|null)=>{setSellOutState(data);if(data){localStorage.setItem('bj_sellout',JSON.stringify(data));setIsLoaded(true)}else localStorage.removeItem('bj_sellout')};
  const setCanonical=(data:CanonicalState|null)=>{setCanonicalBase(data);if(data){localStorage.setItem('bj_canonical',JSON.stringify(data));setIsLoaded(true)}else localStorage.removeItem('bj_canonical')};
  const setManualConfig=(config:ManualConfiguration)=>{const normalized:ManualConfiguration={...DEFAULT_MANUAL_CONFIGURATION,...config,sellOutTarget:Math.max(Number(config.sellOutTarget)||0,0),coverageTargetDays:Math.max(Number(config.coverageTargetDays)||0,0),networkTargets:config.networkTargets||{},holidays:config.holidays||[],lineShares:{...DEFAULT_MANUAL_CONFIGURATION.lineShares,...(config.lineShares||{})}};setManualConfigState(normalized);localStorage.setItem('bj_manual_config',JSON.stringify(normalized));setMetricasState(current=>{const updated={...current,metaCobertura:normalized.coverageTargetDays};localStorage.setItem('bj_metricas',JSON.stringify(updated));return updated})};

  return <DataContext.Provider value={{produtos,setProdutos,metricas,setMetricas,sellOut,setSellOut,canonical,setCanonical,manualConfig,setManualConfig,isLoaded}}>{children}</DataContext.Provider>;
};

export const useData=()=>useContext(DataContext);
