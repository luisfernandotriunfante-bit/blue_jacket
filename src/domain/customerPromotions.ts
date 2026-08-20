import type { CustomerResolvedProfile, PromotionRule } from './customerIntelligenceTypes';
import { normalizeText } from '../services/canonical/utils';

const code = (value: unknown) => String(value ?? '').trim().replace(/^0+/, '');
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');

function allows(values: string[], actual: string) {
  return !values.length || values.some(value => normalizeText(value) === normalizeText(actual));
}

export function isPromotionEligibleForProduct(rule: PromotionRule, customer: CustomerResolvedProfile, product: { ean: string; winthorCode: string }, referenceDate: string): boolean {
  if (rule.status !== 'ATIVA') return false;
  if (rule.validFrom && referenceDate < rule.validFrom) return false;
  if (rule.validTo && referenceDate > rule.validTo) return false;
  if (!allows(rule.environments, customer.environment)) return false;
  if (!allows(rule.tiers, customer.tier)) return false;
  if (!allows(rule.profiles, customer.profile)) return false;
  if (!allows(rule.networks, customer.network)) return false;
  if (rule.cnpjs.length && !rule.cnpjs.includes(customer.cnpj)) return false;
  if (!rule.eans.length && !rule.winthorCodes.length) return true;
  return rule.eans.some(ean => digits(ean) === digits(product.ean)) || rule.winthorCodes.some(sku => code(sku) === code(product.winthorCode));
}

export function eligiblePromotionsForProduct(rules: PromotionRule[], customer: CustomerResolvedProfile, product: { ean: string; winthorCode: string }, referenceDate: string): PromotionRule[] {
  return rules.filter(rule => isPromotionEligibleForProduct(rule, customer, product, referenceDate));
}

export function eligiblePromotionsForCustomer(rules: PromotionRule[], customer: CustomerResolvedProfile, referenceDate: string): PromotionRule[] {
  return rules.filter(rule => {
    if (rule.status !== 'ATIVA') return false;
    if (rule.validFrom && referenceDate < rule.validFrom) return false;
    if (rule.validTo && referenceDate > rule.validTo) return false;
    if (!allows(rule.environments, customer.environment) || !allows(rule.tiers, customer.tier) || !allows(rule.profiles, customer.profile) || !allows(rule.networks, customer.network)) return false;
    if (rule.cnpjs.length && !rule.cnpjs.includes(customer.cnpj)) return false;
    return true;
  });
}
