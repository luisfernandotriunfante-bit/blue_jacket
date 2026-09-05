export type ProductSearchable = {
  description: string;
  winthor: string;
  distributor: string;
  ean: string;
  line: string;
  brand: string;
  subbrand: string;
  category: string;
};

const normalize = (value: unknown) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const identifierKey = (value: unknown) => normalize(value).replace(/^0+(?=\d)/, '');

export function matchesProductSearch(item: ProductSearchable, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const exactIdentifiers = [item.winthor, item.distributor, item.ean].filter(Boolean).map(identifierKey);
  if (/^[\d\s.\-/]+$/.test(trimmed)) return exactIdentifiers.includes(identifierKey(trimmed));
  return exactIdentifiers.includes(identifierKey(trimmed)) || [item.description, item.line, item.brand, item.subbrand, item.category].map(normalize).some(value => value.includes(normalize(trimmed)));
}
