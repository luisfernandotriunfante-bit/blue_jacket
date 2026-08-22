import * as XLSX from 'xlsx';
import type { CustomerCommercialProfile } from '../domain/customerIntelligenceTypes';
import { channelFromTier } from './customerIntelligenceSources';
import { normalizeCnpj, normalizeText } from './canonical/utils';

type Row = unknown[];

function findProfileSheet(workbook: XLSX.WorkBook): string | undefined {
  return workbook.SheetNames.find(name => normalizeText(name).includes('EXPORTACAO PDVS'));
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: string): Row[] {
  return XLSX.utils.sheet_to_json<Row>(workbook.Sheets[sheetName], { header: 1, defval: '' });
}

function findHeaderIndex(rows: Row[]): number {
  return rows.findIndex(row => {
    const values = row.map(normalizeText);
    return values.includes('COD CLIENTE')
      && values.includes('NOME_CLIENTE')
      && values.includes('FAIXAS')
      && values.includes('PERFIL')
      && values.includes('TIPO');
  });
}

export function hasStandaloneCustomerProfile(workbook: XLSX.WorkBook): boolean {
  const sheetName = findProfileSheet(workbook);
  if (!sheetName) return false;
  return findHeaderIndex(sheetRows(workbook, sheetName)) >= 0;
}

export function parseStandaloneCustomerProfiles(workbook: XLSX.WorkBook): {
  customers: CustomerCommercialProfile[];
  rejectedIdentifiers: number;
  sourceSheet: string;
} {
  const sourceSheet = findProfileSheet(workbook);
  if (!sourceSheet) throw new Error('Base de clientes: aba "Exportação PDVs" não encontrada.');
  const rows = sheetRows(workbook, sourceSheet);
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) throw new Error(`${sourceSheet}: cabeçalho de clientes não reconhecido.`);

  const header = rows[headerIndex].map(normalizeText);
  const col = (name: string) => header.findIndex(value => value === normalizeText(name));
  const index = {
    environment: col('AMBIENTE'),
    client: col('COD CLIENTE'),
    name: col('NOME_CLIENTE'),
    tier: col('FAIXAS'),
    state: col('ESTADO'),
    city: col('CIDADE'),
    profile: col('PERFIL'),
    type: col('TIPO'),
    network: col('REDE'),
  };

  const customers = new Map<string, CustomerCommercialProfile>();
  let rejectedIdentifiers = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    if (normalizeText(row[index.type]) !== 'CNPJ') continue;
    const normalized = normalizeCnpj(row[index.client], { declaredCnpj: true });
    const cnpj = normalized.canonical;
    if (!/^\d{14}$/.test(cnpj)) {
      rejectedIdentifiers += 1;
      continue;
    }
    const tier = String(row[index.tier] ?? '').trim();
    const current: CustomerCommercialProfile = {
      cnpj,
      cnpjRaw: normalized.raw,
      name: String(row[index.name] ?? '').trim(),
      clientCode: '',
      network: index.network >= 0 ? String(row[index.network] ?? '').trim() : '',
      environment: index.environment >= 0 ? String(row[index.environment] ?? '').trim() : '',
      profile: String(row[index.profile] ?? '').trim(),
      tier,
      assortmentChannel: channelFromTier(tier),
      city: String(row[index.city] ?? '').trim(),
      state: String(row[index.state] ?? '').trim(),
      vendorCode: '',
      coordinatorCode: '',
      coordinatorName: '',
      source: sourceSheet,
    };

    const previous = customers.get(cnpj);
    if (!previous) customers.set(cnpj, current);
    else customers.set(cnpj, {
      ...previous,
      name: previous.name || current.name,
      network: previous.network || current.network,
      environment: previous.environment || current.environment,
      profile: previous.profile || current.profile,
      tier: previous.tier || current.tier,
      assortmentChannel: previous.assortmentChannel || current.assortmentChannel,
      city: previous.city || current.city,
      state: previous.state || current.state,
    });
  }

  return { customers: Array.from(customers.values()), rejectedIdentifiers, sourceSheet };
}
