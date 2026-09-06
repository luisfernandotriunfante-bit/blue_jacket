import type { CanonicalList } from './types';

type RecordValue = Record<string, unknown>;
type Namespace = 'ID' | 'WINTHOR' | 'WINTHOR_NORMALIZED' | 'SKU' | 'SKU_NORMALIZED' | 'EAN';
export type ProductResolution = { status: 'RESOLVED' | 'NOT_FOUND' | 'AMBIGUOUS'; item?: RecordValue; matchedBy?: Namespace; identifier?: string };

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : value === null || value === undefined ? null : String(value).trim() || null;
export const normalizedProductCode = (value: unknown) => {
  const raw = text(value)?.replace(/\.0$/, '').replace(/\s+/g, '') ?? '';
  if (!raw) return null;
  return /^\d+$/.test(raw) ? raw.replace(/^0+(?=\d)/, '') : raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
};

const gtinCheckDigit = (payload: string) => {
  let total = 0;
  for (let index = payload.length - 1, weight = 3; index >= 0; index -= 1, weight = weight === 3 ? 1 : 3) total += Number(payload[index]) * weight;
  return String((10 - total % 10) % 10);
};

/** Mantém o alias declarado e as equivalências GTIN já homologadas no motor M1. */
export function productEanKeys(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return [];
  const keys = new Set([digits]);
  if (digits.length === 12) keys.add(`0${digits}`);
  if (digits.length === 14) {
    const payload = digits.slice(1, 13);
    keys.add(`${payload}${gtinCheckDigit(payload)}`);
  }
  return [...keys];
}

const values = (record: RecordValue, fields: string[]) => fields.flatMap(field => {
  const value = text(record[field]);
  return value ? [value] : [];
});

export function createCanonicalProductResolver(m1: CanonicalList) {
  const maps = new Map<Namespace, Map<string, RecordValue>>();
  const ambiguous = new Map<Namespace, Set<string>>();
  const mapFor = (namespace: Namespace) => maps.get(namespace) ?? (maps.set(namespace, new Map()), maps.get(namespace)!);
  const ambiguousFor = (namespace: Namespace) => ambiguous.get(namespace) ?? (ambiguous.set(namespace, new Set()), ambiguous.get(namespace)!);
  const add = (namespace: Namespace, key: string | null, item: RecordValue) => {
    if (!key) return;
    const conflicts = ambiguousFor(namespace);
    if (conflicts.has(key)) return;
    const map = mapFor(namespace);
    const previous = map.get(key);
    if (previous && previous !== item) { map.delete(key); conflicts.add(key); return; }
    map.set(key, item);
  };

  for (const item of m1.records as RecordValue[]) {
    for (const id of values(item, ['item_canonical_id'])) add('ID', id, item);
    for (const winthor of values(item, ['winthor_code'])) { add('WINTHOR', winthor, item); add('WINTHOR_NORMALIZED', normalizedProductCode(winthor), item); }
    for (const sku of values(item, ['industry_sku', 'manufacturer_code', 'manufacturer_code_286'])) { add('SKU', sku, item); add('SKU_NORMALIZED', normalizedProductCode(sku), item); }
    for (const ean of values(item, ['internal_ean', 'industry_ean', 'ean', 'dun14'])) for (const key of productEanKeys(ean)) add('EAN', key, item);
  }

  const find = (namespace: Namespace, keys: Array<string | null>): ProductResolution => {
    for (const key of keys) {
      if (!key) continue;
      if (ambiguousFor(namespace).has(key)) return { status: 'AMBIGUOUS', matchedBy: namespace, identifier: key };
      const item = mapFor(namespace).get(key);
      if (item) return { status: 'RESOLVED', item, matchedBy: namespace, identifier: key };
    }
    return { status: 'NOT_FOUND' };
  };
  const firstConclusive = (steps: Array<() => ProductResolution>) => {
    for (const step of steps) { const result = step(); if (result.status !== 'NOT_FOUND') return result; }
    return { status: 'NOT_FOUND' as const };
  };
  const resolveIdentifiers = ({ ids = [], winthor = [], skus = [], eans = [], eanFirst = false }: { ids?: unknown[]; winthor?: unknown[]; skus?: unknown[]; eans?: unknown[]; eanFirst?: boolean }) => {
    const eanStep = () => find('EAN', eans.flatMap(productEanKeys));
    const ordinary = [
      () => find('ID', ids.map(text)),
      () => find('WINTHOR', winthor.map(text)),
      () => find('WINTHOR_NORMALIZED', winthor.map(normalizedProductCode)),
      () => find('SKU', skus.map(text)),
      () => find('SKU_NORMALIZED', skus.map(normalizedProductCode)),
      eanStep,
    ];
    return firstConclusive(eanFirst ? [eanStep, ...ordinary.slice(0, -1)] : ordinary);
  };
  const resolve = (record: RecordValue) => resolveIdentifiers({
    ids: values(record, ['item_canonical_id']),
    winthor: values(record, ['winthor_product_code', 'winthor_code', 'legacy_product_code']),
    skus: values(record, ['industry_sku', 'manufacturer_code', 'industry_material']),
    eans: values(record, ['ean_product', 'internal_ean', 'industry_ean', 'ean', 'historical_gtin', 'ean_commercial', 'ean_tax']),
  });
  const addSkuAlias = (sku: unknown, item: RecordValue) => { const exact = text(sku); add('SKU', exact, item); add('SKU_NORMALIZED', normalizedProductCode(exact), item); };
  const ambiguousKeys = () => [...ambiguous.entries()].flatMap(([namespace, keys]) => [...keys].map(key => `${namespace}:${key}`));
  return {
    resolve,
    resolveIdentifiers,
    addSkuAlias,
    get ambiguousIdentifierKeys() { return ambiguousKeys().length; },
    get ambiguousExamples() { return ambiguousKeys().slice(0, 5); },
  };
}
