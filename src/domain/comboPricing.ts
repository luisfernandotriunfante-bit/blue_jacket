import { productMatchesStockCodeList } from './stockCodeFilter';

export type ComboProductRef = {
  codigo: string;
  descricao: string;
  ean?: string;
  factoryCode?: string;
  vendaUnitario: number;
  hasWinthor?: boolean;
};

export function isComboProductEligible(product: ComboProductRef): boolean {
  return product.hasWinthor === true && Number.isFinite(product.vendaUnitario) && product.vendaUnitario > 0;
}

export function selectComboProducts(products: ComboProductRef[], codes: Set<string>): ComboProductRef[] {
  if (!codes.size) return [];
  return products.filter(product => isComboProductEligible(product) && productMatchesStockCodeList(product, codes));
}

export function parseComboPrice(raw: string): number | null {
  let value = String(raw ?? '').trim().replace(/r\$/gi, '').replace(/\s/g, '');
  if (!value) return null;
  if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, '');
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function comboDiscount(tablePrice: number, practicedPrice: number | null): number | null {
  if (!Number.isFinite(tablePrice) || tablePrice <= 0 || practicedPrice === null || !Number.isFinite(practicedPrice) || practicedPrice < 0) return null;
  return (tablePrice - practicedPrice) / tablePrice;
}
