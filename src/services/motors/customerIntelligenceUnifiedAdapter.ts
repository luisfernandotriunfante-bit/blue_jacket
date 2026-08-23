import type { CustomerIntelligenceSupport, CustomerCommercialProfile, HistoricalPurchaseRecord } from '../../domain/customerIntelligenceTypes';
import type { UnifiedCanonicalState } from './unifiedEngine';
import { channelFromTier } from '../customerIntelligenceSources';

const unique = (values:string[]) => Array.from(new Set(values.filter(Boolean)));
const digits = (value:unknown) => String(value ?? '').replace(/\D/g,'');
const code = (value:unknown) => String(value ?? '').trim().replace(/^0+/,'');

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

  // A Lista Oficial de Lançamentos já foi materializada no ITEM_MASTER por EAN. O rótulo
  // existente no Sortimento Oficial é apenas informativo e não pode criar uma segunda autoridade.
  const itemByEan=new Map<string,typeof state.unified.items[number]>();
  const itemBySku=new Map<string,typeof state.unified.items[number]>();
  const itemByWinthor=new Map<string,typeof state.unified.items[number]>();
  state.unified.items.forEach(item=>{
    [item.internalEan,item.industryEan].map(digits).filter(Boolean).forEach(ean=>itemByEan.set(ean,item));
    [item.industrySku,item.manufacturerCode].map(code).filter(Boolean).forEach(sku=>itemBySku.set(sku,item));
    if(code(item.winthorCode)) itemByWinthor.set(code(item.winthorCode),item);
  });
  let launchLabelOverrides=0;
  const assortmentCompetences=base.assortmentCompetences.map(competence=>({
    ...competence,
    products:competence.products.map(product=>{
      const item=(digits(product.ean)?itemByEan.get(digits(product.ean)):undefined)
        ||(code(product.colgateSku)?itemBySku.get(code(product.colgateSku)):undefined)
        ||(code(product.winthorCode)?itemByWinthor.get(code(product.winthorCode)):undefined);
      const launchLabel=item?.isLaunch?'LANÇAMENTO':'';
      if((product.launchLabel||'')!==launchLabel) launchLabelOverrides+=1;
      return{...product,launchLabel};
    }),
  }));
  const launchWarning=launchLabelOverrides
    ? [`${launchLabelOverrides} rótulo(s) de lançamento do Sortimento Oficial foram normalizados pela Lista Oficial de Lançamentos materializada no ITEM_MASTER.`]
    : [];

  return{
    ...base,
    assortmentCompetences,
    historicalPurchases,
    customers,
    updatedAt:state.unified.generatedAt||base.updatedAt,
    warnings:Array.from(new Set([...base.warnings,...launchWarning,'Histórico comercial calculado exclusivamente pelo 379 canônico; o 310 permanece somente como reconciliação.'])),
  };
}
