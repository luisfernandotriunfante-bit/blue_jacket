import type { CustomerIntelligenceSupport, CustomerCommercialProfile, PurchaseHistory310 } from '../../domain/customerIntelligenceTypes';
import type { UnifiedCanonicalState } from './unifiedEngine';
import { channelFromTier } from '../customerIntelligenceSources';

export function customerIntelligenceFromUnified(state: UnifiedCanonicalState): CustomerIntelligenceSupport {
  const base = state.customerIntelligenceSupport;
  const itemById = new Map(state.unified.items.map(item => [item.itemCanonicalId, item]));
  const customerByCnpj = new Map(state.unified.customers.map(customer => [customer.cnpj, customer]));

  const purchases: PurchaseHistory310[] = state.unified.historicalCustomerProduct.map(row => {
    const item = itemById.get(row.itemCanonicalId);
    const sellers = row.legacySellerContext.split(',').map(value => value.trim()).filter(Boolean);
    return {
      cnpj: row.cnpj,
      cnpjRaw: row.cnpj,
      legacyProductCode: row.legacyProductCode,
      // Alias de compatibilidade. O conteúdo continua sendo código legado.
      winthorCode: row.legacyProductCode,
      description: item?.internalDescription || item?.industryDescription || '',
      volumes: Math.abs(row.netSignedUnits),
      quantity: row.purchaseInvoiceCount,
      purchaseValue: row.netSalesValue,
      returnVolume: row.returnUnits,
      returnValue: row.returnValue,
      netValue: row.netSalesValue,
      // Com múltiplos RPCs no período não escolhemos um vendedor por suposição.
      vendorCode: sellers.length === 1 ? sellers[0] : '',
      groupingCode: '',
      groupingDescription: '',
    };
  });

  const latestClassification = new Map<string, typeof state.unified.customerClassifications[number]>();
  [...state.unified.customerClassifications]
    .sort((left, right) => left.competence.localeCompare(right.competence))
    .forEach(row => latestClassification.set(row.cnpj, row));

  const customers: CustomerCommercialProfile[] = Array.from(latestClassification.values()).map(classification => {
    const customer = customerByCnpj.get(classification.cnpj);
    const tier = classification.range;
    return {
      cnpj: classification.cnpj,
      cnpjRaw: customer?.cnpjRaw || classification.cnpj,
      name: customer?.customerName || '',
      clientCode: customer?.winthorCustomerCode || '',
      network: classification.premiseNetwork,
      environment: classification.environment,
      profile: classification.profile,
      tier,
      assortmentChannel: channelFromTier(tier) || '',
      city: customer?.city || classification.premiseCity,
      state: classification.premiseState,
      vendorCode: '',
      coordinatorCode: '',
      coordinatorName: '',
      source: 'UNIFIED_CUSTOMER_CLASSIFICATION',
    };
  });

  return {
    ...base,
    purchases,
    customers,
    updatedAt: state.unified.generatedAt || base.updatedAt,
    warnings: Array.from(new Set([
      ...base.warnings,
      'Histórico comercial calculado pelo 379 canônico; o 310 é usado somente para reconciliação.',
    ])),
  };
}
