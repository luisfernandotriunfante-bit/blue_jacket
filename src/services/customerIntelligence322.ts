import type * as XLSX from 'xlsx';
import type { AssortmentCompetence } from '../domain/customerIntelligenceTypes';
import { cleanCode, cleanDigits, normalizeText } from './canonical/utils';

export interface Auxiliary322Enrichment {
  competences: AssortmentCompetence[];
  matchedByEan: number;
}

/**
 * O 322 é somente fallback auxiliar de correspondência EAN → Winthor/fabricante.
 * Ele nunca altera recomendação, competência ou classificação da fonte oficial.
 */
export function enrichAssortmentWith322(workbook: XLSX.WorkBook, competences: AssortmentCompetence[]): Auxiliary322Enrichment {
  const sheetName = workbook.SheetNames.find(name => normalizeText(name) === '322');
  if (!sheetName) return { competences, matchedByEan: 0 };
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  if (!rows.length) return { competences, matchedByEan: 0 };
  const header = rows[0].map(normalizeText);
  const codeIndex = header.findIndex(value => value === 'COD');
  const factoryIndex = header.findIndex(value => value.includes('COD FORN'));
  const eanIndex = header.findIndex(value => value.includes('COD BARRA'));
  if (codeIndex < 0 || eanIndex < 0) return { competences, matchedByEan: 0 };
  const byEan = new Map<string, { winthorCode: string; factoryCode: string }>();
  rows.slice(1).forEach(row => {
    const ean = cleanDigits(row[eanIndex]);
    const winthorCode = cleanCode(row[codeIndex]);
    if (!ean || !winthorCode) return;
    byEan.set(ean, { winthorCode, factoryCode: factoryIndex >= 0 ? cleanCode(row[factoryIndex]) : '' });
  });
  let matchedByEan = 0;
  const next = competences.map(competence => ({
    ...competence,
    products: competence.products.map(product => {
      const auxiliary = byEan.get(cleanDigits(product.ean));
      if (!auxiliary) return product;
      const needsWinthor = !product.winthorCode;
      const needsColgateSku = !product.colgateSku;
      if (needsWinthor || needsColgateSku) matchedByEan += 1;
      return {
        ...product,
        winthorCode: product.winthorCode || auxiliary.winthorCode,
        colgateSku: product.colgateSku || auxiliary.factoryCode,
      };
    }),
  }));
  return { competences: next, matchedByEan };
}
