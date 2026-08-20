export * from './stockModelCore';

import type { CanonicalInventoryProduct, CanonicalProductSupport } from './canonical';
import { buildStockPresentation as buildCore } from './stockModelCore';
import type { StockPresentationInput as CoreStockPresentationInput } from './stockModelCore';

export interface StockItemCodeSupport {
  internalCode: string;
  ean: string;
  factoryCode: string;
  unitsPerCase?: number;
}

type InventoryWithPackaging = CanonicalInventoryProduct & { unitsPerCase?: number };
export type StockPresentationInputWithPackaging = CoreStockPresentationInput & { itemCodeSupport?: StockItemCodeSupport[] };

const clean = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
const cleanCode = (value: unknown) => String(value ?? '').trim().replace(/^0+/, '');

function packagingFactor(item: InventoryWithPackaging, itemCodes: StockItemCodeSupport[]): number {
  const direct = Math.max(Number(item.unitsPerCase) || 0, 0);
  if (direct > 0) return direct;
  const internal = cleanCode(item.code); const factory = cleanCode(item.factoryCode); const ean = clean(item.ean);
  const match = itemCodes.find(candidate => {
    const candidateInternal = cleanCode(candidate.internalCode); const candidateFactory = cleanCode(candidate.factoryCode); const candidateEan = clean(candidate.ean);
    return Boolean((internal && candidateInternal === internal) || (factory && candidateFactory === factory) || (ean && candidateEan === ean));
  });
  return Math.max(Number(match?.unitsPerCase) || 0, 0);
}

function augmentProductSupport(input: StockPresentationInputWithPackaging): CanonicalProductSupport[] {
  const result = [...(input.productSupport || [])];
  const itemCodes = input.itemCodeSupport || [];
  input.inventory.forEach(rawItem => {
    const item = rawItem as InventoryWithPackaging;
    const unitsPerCase = packagingFactor(item, itemCodes);
    if (unitsPerCase <= 0) return;
    const factory = cleanCode(item.factoryCode); const ean = clean(item.ean);
    const index = result.findIndex(master => Boolean((factory && cleanCode(master.sku) === factory) || (ean && clean(master.ean) === ean)));
    if (index >= 0) {
      if ((Number(result[index].unitsPerCase) || 0) <= 0) result[index] = { ...result[index], unitsPerCase };
      return;
    }
    if (!factory && !ean) return;
    result.push({ sku: factory, ean, description: item.description || '', category: '', subcategory: '', brand: '', isLaunch: Boolean(item.isLaunch), boxPrice: 0, unitPrice: 0, unitsPerCase, line: '' });
  });
  return result;
}

export function buildStockPresentation(input: StockPresentationInputWithPackaging) {
  const { itemCodeSupport: _itemCodeSupport, ...coreInput } = input;
  return buildCore({ ...coreInput, productSupport: augmentProductSupport(input) });
}
