import { normalizeComboClientCode, normalizeComboCnpj, type ComboClientLookupEntry } from './comboClients';

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function sortedCodes(codes: Set<string>): string[] {
  return Array.from(codes).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

/**
 * Lê o layout do "Relatório Carteira de Clientes" do Winthor.
 * O cabeçalho real contém as colunas "Código Cliente", "CNPJ" e "Cliente".
 * O relatório pode repetir cabeçalhos ao longo das páginas/seções, por isso os
 * índices são redetectados durante a leitura.
 */
export function buildComboPortfolioLookup(rows: unknown[][]): Map<string, ComboClientLookupEntry> {
  const grouped = new Map<string, { name: string; codes: Set<string> }>();
  let codeIndex = -1;
  let cnpjIndex = -1;
  let nameIndex = -1;

  rows.forEach(row => {
    const headers = row.map(normalizeHeader);
    const detectedCode = headers.findIndex(value => value === 'codigo cliente' || value === 'cod cliente');
    const detectedCnpj = headers.findIndex(value => value === 'cnpj');

    if (detectedCode >= 0 && detectedCnpj >= 0) {
      codeIndex = detectedCode;
      cnpjIndex = detectedCnpj;
      nameIndex = headers.findIndex(value => value === 'cliente' || value === 'razao social');
      return;
    }

    if (codeIndex < 0 || cnpjIndex < 0) return;

    const cnpj = normalizeComboCnpj(row[cnpjIndex]);
    const code = normalizeComboClientCode(row[codeIndex]);
    if (!cnpj || !code) return;

    const current = grouped.get(cnpj) || { name: '', codes: new Set<string>() };
    const name = nameIndex >= 0 ? String(row[nameIndex] ?? '').trim() : '';
    if (!current.name && name) current.name = name;
    current.codes.add(code);
    grouped.set(cnpj, current);
  });

  return new Map(
    Array.from(grouped.entries()).map(([cnpj, value]) => [cnpj, {
      cnpj,
      name: value.name,
      codes: sortedCodes(value.codes),
    }]),
  );
}
