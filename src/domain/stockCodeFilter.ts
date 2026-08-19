export function normalizeStockCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\.0+$/, '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
}

export function extractStockCodes(values: unknown[]): Set<string> {
  const codes = new Set<string>();

  values.forEach(value => {
    String(value ?? '')
      .split(/[\s,;|]+/)
      .forEach(token => {
        const code = normalizeStockCode(token);
        if (code.length >= 3 && /\d/.test(code)) codes.add(code);
      });
  });

  return codes;
}

export function productMatchesStockCodeList(
  product: { codigo?: string; factoryCode?: string; ean?: string },
  codes: Set<string>,
): boolean {
  if (!codes.size) return true;
  return [product.codigo, product.factoryCode, product.ean]
    .map(normalizeStockCode)
    .some(code => Boolean(code) && codes.has(code));
}

export function matchedStockCodes(
  products: Array<{ codigo?: string; factoryCode?: string; ean?: string }>,
  codes: Set<string>,
): Set<string> {
  const matched = new Set<string>();
  if (!codes.size) return matched;

  products.forEach(product => {
    [product.codigo, product.factoryCode, product.ean]
      .map(normalizeStockCode)
      .forEach(code => {
        if (code && codes.has(code)) matched.add(code);
      });
  });

  return matched;
}
