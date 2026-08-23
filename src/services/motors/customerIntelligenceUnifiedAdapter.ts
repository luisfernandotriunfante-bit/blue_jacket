import type { CustomerIntelligenceSupport, CustomerCommercialProfile, PurchaseHistory310 } from '../../domain/customerIntelligenceTypes';
import type { UnifiedCanonicalState } from './unifiedEngine';
import { channelFromTier } from '../customerIntelligenceSources';

export function customerIntelligenceFromUnified(state:UnifiedCanonicalState):CustomerIntelligenceSupport {
  const base=state.customerIntelligenceSupport;
  const itemById=new Map(state.unified.items.map(item=>[item.itemCanonicalId,item]));
  const customerByCnpj=new Map(state.unified.customers.map(customer=>[customer.cnpj,customer]));

  // O tipo PurchaseHistory310 é mantido por compatibilidade da camada comercial,
  // mas estes registros são reconstruídos do 379 canônico. Por isso purchaseValue
  // recebe venda bruta e netValue recebe o líquido: qualquer agregação que subtraia
  // devolução uma vez produzirá exatamente o netSalesValue do motor histórico.
  const purchases:PurchaseHistory310[]=state.unified.historicalCustomerProduct.map(row=>{
    const item=itemById.get(row.itemCanonicalId);const sellers=row.legacySellerContext.split(',').map(value=>value.trim()).filter(Boolean);
    return{cnpj:row.cnpj,cnpjRaw:row.cnpj,legacyProductCode:row.legacyProductCode,winthorCode:row.legacyProductCode,description:item?.internalDescription||item?.industryDescription||'',volumes:row.grossSaleUnits,quantity:row.purchaseInvoiceCount,purchaseValue:row.grossSalesValue,returnVolume:row.returnUnits,returnValue:row.returnValue,netValue:row.netSalesValue,vendorCode:sellers.length===1?sellers[0]:'',groupingCode:'',groupingDescription:''};
  });

  const latestClassification=new Map<string,typeof state.unified.customerClassifications[number]>();
  [...state.unified.customerClassifications].sort((a,b)=>a.competence.localeCompare(b.competence)).forEach(row=>latestClassification.set(row.cnpj,row));
  const customers:CustomerCommercialProfile[]=Array.from(latestClassification.values()).map(classification=>{
    const customer=customerByCnpj.get(classification.cnpj);const tier=classification.range;
    return{cnpj:classification.cnpj,cnpjRaw:customer?.cnpjRaw||classification.cnpj,name:customer?.customerName||'',clientCode:customer?.winthorCustomerCode||'',network:classification.premiseNetwork,environment:classification.environment,profile:classification.profile,tier,assortmentChannel:channelFromTier(tier)||'',city:customer?.city||classification.premiseCity,state:classification.premiseState,vendorCode:'',coordinatorCode:'',coordinatorName:'',source:'UNIFIED_CUSTOMER_CLASSIFICATION'};
  });

  return{...base,purchases,customers,updatedAt:state.unified.generatedAt||base.updatedAt,warnings:Array.from(new Set([...base.warnings,'Histórico comercial calculado pelo 379 canônico; o 310 é usado somente para reconciliação.']))};
}
