import type { CustomerIntelligenceSupport, CustomerCommercialProfile, HistoricalPurchaseRecord } from '../../domain/customerIntelligenceTypes';
import type { UnifiedCanonicalState } from './unifiedEngine';
import { channelFromTier } from '../customerIntelligenceSources';

const unique = (values:string[]) => Array.from(new Set(values.filter(Boolean)));

export function customerIntelligenceFromUnified(state:UnifiedCanonicalState):CustomerIntelligenceSupport {
  const base=state.customerIntelligenceSupport;
  const itemById=new Map(state.unified.items.map(item=>[item.itemCanonicalId,item]));
  const customerByCnpj=new Map(state.unified.customers.map(customer=>[customer.cnpj,customer]));
  const rcaById=new Map(state.unified.rcas.map(rca=>[rca.rcaCanonicalId,rca]));

  const sellerContext=new Map<string,{legacy:string[];canonical:string[];current:string[]}>();
  state.unified.historicalSalesFacts
    .filter(fact=>fact.movementClass!=='OTHER'&&fact.customerCnpj)
    .forEach(fact=>{
      const key=`${fact.customerCnpj}|${fact.itemCanonicalId}|${fact.legacyProductCode}|${fact.sourceYear}`;
      const current=sellerContext.get(key)||{legacy:[],canonical:[],current:[]};
      current.legacy.push(fact.legacyRcaCode);
      current.canonical.push(fact.rcaCanonicalId);
      const rca=rcaById.get(fact.rcaCanonicalId);
      if(rca?.currentRcaCode) current.current.push(rca.currentRcaCode);
      sellerContext.set(key,current);
    });

  const historicalPurchases:HistoricalPurchaseRecord[]=state.unified.historicalCustomerProduct.map(row=>{
    const item=itemById.get(row.itemCanonicalId);
    const year=row.period;
    const sellers=sellerContext.get(`${row.cnpj}|${row.itemCanonicalId}|${row.legacyProductCode}|${year}`)||{legacy:row.legacySellerContext.split(',').map(value=>value.trim()).filter(Boolean),canonical:[],current:[]};
    return {
      cnpj:row.cnpj,
      cnpjRaw:row.cnpj,
      period:row.period,
      itemCanonicalId:row.itemCanonicalId,
      legacyProductCode:row.legacyProductCode,
      ean:item?.internalEan||item?.industryEan||'',
      winthorCode:item?.winthorCode||'',
      industrySku:item?.industrySku||item?.manufacturerCode||'',
      description:item?.internalDescription||item?.industryDescription||'',
      grossSaleUnits:row.grossSaleUnits,
      returnUnits:row.returnUnits,
      netSignedUnits:row.netSignedUnits,
      grossSalesValue:row.grossSalesValue,
      returnValue:row.returnValue,
      netValue:row.netSalesValue,
      purchaseInvoiceCount:row.purchaseInvoiceCount,
      legacyRcaCodes:unique(sellers.legacy),
      rcaCanonicalIds:unique(sellers.canonical),
      currentRcaCodes:unique(sellers.current),
      source:'379',
    };
  });

  const latestClassification=new Map<string,typeof state.unified.customerClassifications[number]>();
  [...state.unified.customerClassifications].sort((a,b)=>a.competence.localeCompare(b.competence)).forEach(row=>latestClassification.set(row.cnpj,row));
  const customers:CustomerCommercialProfile[]=Array.from(latestClassification.values()).map(classification=>{
    const customer=customerByCnpj.get(classification.cnpj);const tier=classification.range;
    return{cnpj:classification.cnpj,cnpjRaw:customer?.cnpjRaw||classification.cnpj,name:customer?.customerName||'',clientCode:customer?.winthorCustomerCode||'',network:classification.premiseNetwork,environment:classification.environment,profile:classification.profile,tier,assortmentChannel:channelFromTier(tier)||'',city:customer?.city||classification.premiseCity,state:classification.premiseState,vendorCode:'',coordinatorCode:'',coordinatorName:'',source:'UNIFIED_CUSTOMER_CLASSIFICATION'};
  });

  return{
    ...base,
    historicalPurchases,
    customers,
    updatedAt:state.unified.generatedAt||base.updatedAt,
    warnings:Array.from(new Set([...base.warnings,'Histórico comercial calculado exclusivamente pelo 379 canônico; o 310 permanece somente como reconciliação.'])),
  };
}
