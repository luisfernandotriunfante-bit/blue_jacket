import * as XLSX from 'xlsx';
import type { CustomerCommercialProfile } from '../domain/customerIntelligenceTypes';
import { normalizeCnpj, normalizeText } from './canonical/utils';

export interface CustomerProfileValidation {
  customers: CustomerCommercialProfile[];
  removedInvalidType: number;
}

/**
 * Exportação PDVs declara explicitamente se COD CLIENTE representa CNPJ ou
 * CPF/código inválido. O módulo respeita essa declaração para nunca transformar
 * CPF em CNPJ artificialmente, preservando a regra canônica de 14 dígitos.
 */
export function filterCustomerProfilesByDeclaredCnpj(workbook: XLSX.WorkBook, customers: CustomerCommercialProfile[]): CustomerProfileValidation {
  const sheetName = workbook.SheetNames.find(name => normalizeText(name).includes('EXPORTACAO PDVS'));
  if (!sheetName) return { customers, removedInvalidType: 0 };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
  if (!rows.length) return { customers, removedInvalidType: 0 };
  const header = rows[0].map(normalizeText);
  const typeIndex = header.findIndex(value => value === 'TIPO');
  const clientIndex = header.findIndex(value => value === 'COD CLIENTE');
  if (typeIndex < 0 || clientIndex < 0) return { customers, removedInvalidType: 0 };
  const allowed = new Set<string>();
  rows.slice(1).forEach(row => {
    if (normalizeText(row[typeIndex]) !== 'CNPJ') return;
    const normalized = normalizeCnpj(row[clientIndex], { declaredCnpj: true });
    if (normalized.canonical.length === 14) allowed.add(normalized.canonical);
  });
  const filtered = customers.filter(customer => allowed.has(customer.cnpj));
  return { customers: filtered, removedInvalidType: customers.length - filtered.length };
}
