export type ComboClientTransactionRef = {
  cnpj?: string;
  clientCode?: string;
  clientName?: string;
};

export type ComboClientLookupEntry = {
  cnpj: string;
  name: string;
  codes: string[];
};

/**
 * Normalização específica da criação de combo. Como a entrada é declaradamente
 * uma lista de CNPJs, recompomos zeros à esquerda quando o Excel os removeu.
 */
export function normalizeComboCnpj(value: unknown): string {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 14) return digits;
  if (digits.length >= 11 && digits.length <= 13) return digits.padStart(14, '0');
  if (digits.length > 14 && /^0+/.test(digits)) {
    while (digits.length > 14 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length === 14) return digits;
  }
  return '';
}

export function extractComboCnpjs(values: unknown[]): Set<string> {
  const cnpjs = new Set<string>();
  values.forEach(value => {
    String(value ?? '')
      .split(/[\s,;|]+/)
      .forEach(token => {
        const cnpj = normalizeComboCnpj(token);
        if (cnpj) cnpjs.add(cnpj);
      });
  });
  return cnpjs;
}

export function normalizeComboClientCode(value: unknown): string {
  const raw = String(value ?? '').trim().replace(/\.0+$/, '');
  const digits = raw.replace(/\D/g, '');
  return digits.replace(/^0+(?=\d)/, '');
}

/**
 * O único vínculo CNPJ -> código de cliente Winthor disponível hoje no estado
 * canônico vem do 8022, através de transaction.clientCode. Não escolhemos um
 * código silenciosamente quando o mesmo CNPJ aparece com códigos diferentes.
 */
export function buildComboClientLookup(transactions: ComboClientTransactionRef[]): Map<string, ComboClientLookupEntry> {
  const grouped = new Map<string, { name: string; codes: Set<string> }>();

  transactions.forEach(transaction => {
    const cnpj = normalizeComboCnpj(transaction.cnpj);
    if (!cnpj) return;
    const code = normalizeComboClientCode(transaction.clientCode);
    const current = grouped.get(cnpj) || { name: '', codes: new Set<string>() };
    if (!current.name && transaction.clientName) current.name = String(transaction.clientName).trim();
    if (code) current.codes.add(code);
    grouped.set(cnpj, current);
  });

  return new Map(
    Array.from(grouped.entries()).map(([cnpj, value]) => [cnpj, {
      cnpj,
      name: value.name,
      codes: Array.from(value.codes).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    }]),
  );
}
