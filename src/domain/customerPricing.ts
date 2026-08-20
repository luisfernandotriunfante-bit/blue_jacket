import type { PricingRule } from './customerIntelligenceTypes';

export interface CustomerPricingResolution {
  basePrice: number | null;
  finalPrice: number | null;
  status: 'BASE_DISPONIVEL' | 'COMPOSICAO_FINAL_PENDENTE' | 'SEM_PRECO';
  composition: Array<{ step: string; value: number | null; source: string; status: 'APLICADO' | 'PENDENTE' }>;
}

/**
 * A ordem real entre acréscimo, rappel, promoção e outros ajustes ainda não foi
 * validada. Por isso este motor guarda as regras encontradas e expõe o preço-base,
 * mas não calcula um preço final hipotético.
 */
export function resolveCustomerPricing(basePrice: number | null, rules: PricingRule[], cnpj: string, network: string, referenceDate: string): CustomerPricingResolution {
  const applicable = rules.filter(rule => {
    if (rule.validFrom && referenceDate < rule.validFrom) return false;
    if (rule.validTo && referenceDate > rule.validTo) return false;
    if (rule.scope === 'CNPJ') return rule.scopeKey === cnpj;
    if (rule.scope === 'REDE') return rule.scopeKey === network;
    return rule.scope === 'GERAL';
  });
  const composition = applicable.map(rule => ({ step: rule.kind, value: rule.value, source: rule.source, status: 'PENDENTE' as const }));
  if (basePrice === null || !Number.isFinite(basePrice) || basePrice <= 0) return { basePrice: null, finalPrice: null, status: 'SEM_PRECO', composition };
  return { basePrice, finalPrice: null, status: 'COMPOSICAO_FINAL_PENDENTE', composition: [{ step: 'PRECO_BASE', value: basePrice, source: 'Tabela Oficial / preço canônico disponível', status: 'APLICADO' }, ...composition] };
}
