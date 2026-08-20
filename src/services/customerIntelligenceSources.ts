import * as XLSX from 'xlsx';
import { cleanCode, cleanDigits, normalizeCnpj, normalizeText, parseNumber } from './canonical/utils';
import type {
  AssortmentCompetence,
  CustomerCommercialProfile,
  CustomerIntelligenceSupport,
  OfficialAssortmentSku,
  PurchaseHistory310,
  SkuLineageRecord,
} from '../domain/customerIntelligenceTypes';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../domain/customerIntelligenceTypes';

type Row = unknown[];

const KNOWN_CHANNELS = new Map<string, string>([
  ['HIPER', 'Hiper'],
  ['SUPER G', 'Super G'],
  ['SUPER P', 'Super P'],
  ['CLUBS', 'Clubs'],
  ['C&C', 'C&C'],
  ['DROGARIA', 'Drogaria'],
  ['FARMA BAIRRO 1 A 4', 'Farma Bairro 1 a 4'],
  ['FARMA BAIRRO 5 A 8', 'Farma Bairro 5 a 8'],
  ['VIZINHANCA GDE', 'Vizinhança GDE'],
  ['VIZINHANCA PEQ', 'Vizinhança PEQ'],
  ['TRADICIONAL INDEPENDENTE', 'Tradicional Independente'],
  ['SORTIMENTO ATACADOS', 'Sortimento Atacados'],
  ['SORTIMENTO DISTRIBUIDORES', 'Sortimento Distribuidores'],
  ['E-COMMERCE PURE PLAYERS 1P + 3P', 'E-commerce Pure Players 1P + 3P'],
  ['E-COMMERCE PURE PLAYERS INDIRETO', 'E-commerce Pure Players Indireto'],
]);

function rows(workbook: XLSX.WorkBook, sheetName: string): Row[] {
  const sheet = workbook.Sheets[sheetName];
  return sheet ? XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, defval: '' }) : [];
}

function canonicalChannel(value: unknown): string {
  const normalized = normalizeText(value).replace(/\s+/g, ' ').trim();
  return KNOWN_CHANNELS.get(normalized) || '';
}

function findHeader(data: Row[], required: string[]): number {
  return data.findIndex(row => {
    const values = row.map(normalizeText);
    return required.every(requiredValue => values.some(value => value === requiredValue || value.includes(requiredValue)));
  });
}

function codeCandidates(row: Row, eanIndex: number): string[] {
  return row.slice(0, Math.min(eanIndex, 6)).map(cleanCode).filter(value => value && value !== 'N/A');
}

function localWinthorCode(row: Row, eanIndex: number): string {
  return codeCandidates(row, eanIndex).find(value => /^111\d{5}$/.test(value)) || '';
}

function colgateCode(row: Row, eanIndex: number): string {
  const candidates = codeCandidates(row, eanIndex).filter(value => !/^111\d{5}$/.test(value));
  return candidates.find(value => /^\d{8}$/.test(value)) || candidates[0] || '';
}

function parseAssortmentSheet(data: Row[], sheetName: string, key: string, label: string, validFrom: string, validTo: string): AssortmentCompetence {
  const headerIndex = findHeader(data, ['EAN', 'DESCRI']);
  if (headerIndex < 0) throw new Error(`${sheetName}: cabeçalho oficial de sortimento não reconhecido.`);
  const header = data[headerIndex].map(value => String(value ?? ''));
  const eanIndex = header.findIndex(value => normalizeText(value) === 'EAN');
  const descriptionIndex = header.findIndex(value => normalizeText(value).includes('DESCRI'));
  const fieldIndex = (name: string, fallback: number) => {
    const index = header.findIndex(value => normalizeText(value) === normalizeText(name));
    return index >= 0 ? index : fallback;
  };
  const channelColumns = header.map((value, index) => ({ index, channel: canonicalChannel(value) })).filter(item => item.channel);
  const expectedTotalsByChannel: Record<string, { total: number; mandatory: number; important: number }> = {};
  channelColumns.forEach(({ index, channel }) => {
    expectedTotalsByChannel[channel] = {
      total: parseNumber(data[Math.max(headerIndex - 4, 0)]?.[index]),
      mandatory: parseNumber(data[Math.max(headerIndex - 3, 0)]?.[index]),
      important: parseNumber(data[Math.max(headerIndex - 2, 0)]?.[index]),
    };
  });
  const products: OfficialAssortmentSku[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < data.length; rowIndex += 1) {
    const row = data[rowIndex];
    const ean = cleanDigits(row[eanIndex]);
    if (!ean || ean.length < 8) continue;
    const lifecycleStatus = String(row[0] ?? '').trim();
    const launchCell = String(row[fieldIndex('LANÇAMENTO', 14)] ?? '').trim();
    const launchLabel = normalizeText(lifecycleStatus).includes('LANCAMENTO') ? lifecycleStatus : normalizeText(launchCell).includes('LANCAMENTO') ? launchCell : '';
    products.push({
      ean,
      colgateSku: colgateCode(row, eanIndex),
      winthorCode: localWinthorCode(row, eanIndex),
      description: String(row[descriptionIndex] ?? '').trim(),
      categoryMaster: String(row[fieldIndex('CATEGORIA MASTER', 4)] ?? '').trim(),
      category: String(row[fieldIndex('CATEGORIA', 5)] ?? '').trim(),
      subcategory: String(row[fieldIndex('SUBCATEGORIA', 6)] ?? '').trim(),
      brand: String(row[fieldIndex('MARCA', 7)] ?? '').trim(),
      subbrand: String(row[fieldIndex('SUBMARCA', 8)] ?? '').trim(),
      segment: String(row[fieldIndex('SEGMENTO', 9)] ?? '').trim(),
      subsegment: String(row[fieldIndex('SUBSEGMENTO', 10)] ?? '').trim(),
      contents: String(row[fieldIndex('CONTENTS', 11)] ?? '').trim(),
      amount: String(row[fieldIndex('AMOUNT', 12)] ?? '').trim(),
      promoPack: String(row[fieldIndex('PROMO', 13)] ?? '').trim(),
      launchLabel,
      lifecycleStatus,
      recommendations: channelColumns.map(({ index, channel }) => ({ channel, value: parseNumber(row[index]) })),
      sourceSheet: sheetName,
    });
  }
  return { key, label, validFrom, validTo, sourceSheet: sheetName, products, expectedTotalsByChannel };
}

function parseHairOverride(data: Row[]): { products: OfficialAssortmentSku[]; lineage: SkuLineageRecord[] } {
  const sheetName = 'SORTIMENTO HAIR CARE AGO26 &SET';
  const headerIndex = findHeader(data, ['EAN ANTIGO', 'EAN NOVO', 'DESCRI']);
  if (headerIndex < 0) return { products: [], lineage: [] };
  const header = data[headerIndex].map(value => String(value ?? ''));
  const indexOf = (name: string) => header.findIndex(value => normalizeText(value) === normalizeText(name));
  const oldSkuIndex = indexOf('COD ANTIGO');
  const oldEanIndex = indexOf('EAN ANTIGO');
  const newSkuIndex = indexOf('COD NOVO');
  const newEanIndex = indexOf('EAN NOVO');
  const descriptionIndex = header.findIndex(value => normalizeText(value).includes('DESCRI'));
  const channelColumns = header.map((value, index) => ({ index, channel: canonicalChannel(value) })).filter(item => item.channel);
  const products: OfficialAssortmentSku[] = [];
  const lineage: SkuLineageRecord[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < data.length; rowIndex += 1) {
    const row = data[rowIndex];
    const statusRaw = String(row[0] ?? '').trim();
    const status = normalizeText(statusRaw);
    if (!status) continue;
    const oldSku = cleanCode(row[oldSkuIndex]);
    const oldEan = cleanDigits(row[oldEanIndex]);
    const newSku = cleanCode(row[newSkuIndex]);
    const newEan = cleanDigits(row[newEanIndex]);
    const description = String(row[descriptionIndex] ?? '').trim();
    if (status.includes('MUDANCA SKU AGO')) lineage.push({ oldSku, oldEan, newSku, newEan, description, status: 'MIGRACAO_VIGENTE', effectiveFrom: '2026-08-01', sourceSheet: sheetName });
    else if (status.includes('MUDANCA OCORRERA EM Q4')) lineage.push({ oldSku, oldEan, newSku, newEan, description, status: 'MIGRACAO_FUTURA', effectiveFrom: '2026-10-01', sourceSheet: sheetName });
    else if (status.includes('DESCONTINUADO')) lineage.push({ oldSku: oldSku || newSku, oldEan: oldEan || newEan, newSku: '', newEan: '', description, status: 'DESCONTINUADO', effectiveFrom: '2026-08-01', sourceSheet: sheetName });

    const shouldApplyCurrent = !status.includes('MUDANCA OCORRERA EM Q4') && !status.includes('DESCONTINUADO');
    if (!shouldApplyCurrent || !newEan) continue;
    products.push({
      ean: newEan,
      colgateSku: newSku,
      winthorCode: /^111\d{5}$/.test(newSku) ? newSku : '',
      description,
      categoryMaster: String(row[5] ?? '').trim(),
      category: String(row[6] ?? '').trim(),
      subcategory: String(row[7] ?? '').trim(),
      brand: String(row[8] ?? '').trim(),
      subbrand: String(row[9] ?? '').trim(),
      segment: String(row[10] ?? '').trim(),
      subsegment: String(row[11] ?? '').trim(),
      contents: String(row[12] ?? '').trim(),
      amount: String(row[13] ?? '').trim(),
      promoPack: String(row[14] ?? '').trim(),
      launchLabel: status.includes('LANCAMENTO') ? statusRaw : '',
      lifecycleStatus: statusRaw,
      recommendations: channelColumns.map(({ index, channel }) => ({ channel, value: parseNumber(row[index]) })),
      sourceSheet: sheetName,
    });
  }
  return { products, lineage };
}

function parseDiscontinued(data: Row[]): SkuLineageRecord[] {
  const sheetName = 'Descontinuados Q326';
  const headerIndex = findHeader(data, ['EAN', 'DESCRI']);
  if (headerIndex < 0) return [];
  const header = data[headerIndex].map(normalizeText);
  const eanIndex = header.findIndex(value => value === 'EAN');
  const skuIndex = header.findIndex(value => value === 'COD');
  const descriptionIndex = header.findIndex(value => value.includes('DESCRI'));
  return data.slice(headerIndex + 1).map(row => ({
    oldSku: cleanCode(row[skuIndex]),
    oldEan: cleanDigits(row[eanIndex]),
    newSku: '',
    newEan: '',
    description: String(row[descriptionIndex] ?? '').trim(),
    status: 'DESCONTINUADO' as const,
    effectiveFrom: '2026-07-01',
    sourceSheet: sheetName,
  })).filter(item => item.oldEan);
}

function applyHairOverride(base: AssortmentCompetence, override: ReturnType<typeof parseHairOverride>): AssortmentCompetence {
  const removeEans = new Set(override.lineage.filter(item => item.status === 'MIGRACAO_VIGENTE').map(item => item.oldEan).filter(Boolean));
  const byEan = new Map(base.products.filter(product => !removeEans.has(product.ean)).map(product => [product.ean, product]));
  override.products.forEach(product => byEan.set(product.ean, product));
  return { ...base, products: Array.from(byEan.values()) };
}

export function parseOfficialAssortmentWorkbook(workbook: XLSX.WorkBook) {
  const julySheet = workbook.SheetNames.find(name => normalizeText(name).includes('JUL26') && normalizeText(name).includes('SORTIMENTO'));
  const augSepSheet = workbook.SheetNames.find(name => normalizeText(name).includes('AGO') && normalizeText(name).includes('SET26') && normalizeText(name).includes('BASE_SORTIMENTO'));
  if (!julySheet || !augSepSheet) throw new Error('Sortimento Oficial: não encontrei simultaneamente as bases de Julho/26 e Agosto/Setembro/26.');
  const july = parseAssortmentSheet(rows(workbook, julySheet), julySheet, '2026-07', 'Julho/26', '2026-07-01', '2026-07-31');
  const augSepBase = parseAssortmentSheet(rows(workbook, augSepSheet), augSepSheet, '2026-08_09', 'Agosto/Setembro/26', '2026-08-01', '2026-09-30');
  const hairSheet = workbook.SheetNames.find(name => normalizeText(name).includes('SORTIMENTO HAIR CARE'));
  const hair = hairSheet ? parseHairOverride(rows(workbook, hairSheet)) : { products: [], lineage: [] };
  const augSep = applyHairOverride(augSepBase, hair);
  const discontinuedSheet = workbook.SheetNames.find(name => normalizeText(name).includes('DESCONTINUADOS Q326'));
  const discontinued = discontinuedSheet ? parseDiscontinued(rows(workbook, discontinuedSheet)) : [];
  const lineageMap = new Map<string, SkuLineageRecord>();
  [...hair.lineage, ...discontinued].forEach(item => lineageMap.set(`${item.status}:${item.oldEan}:${item.newEan}`, item));
  return { competences: [july, augSep], lineage: Array.from(lineageMap.values()) };
}

export function channelFromTier(tier: string): string {
  const normalized = normalizeText(tier);
  const match = normalized.match(/FAIXA\s*(\d)/);
  const value = match?.[1] || '';
  if (value === '1') return 'Hiper';
  if (value === '2') return 'Super G';
  if (value === '3') return 'Super P';
  if (value === '4') return 'Vizinhança GDE';
  if (value === '5') return 'Vizinhança PEQ';
  if (value === '6') return 'Tradicional Independente';
  if (normalized.includes('C&C') || normalized === 'CC') return 'C&C';
  return '';
}

export function parseCustomerAndPurchaseWorkbook(workbook: XLSX.WorkBook) {
  const purchaseSheet = workbook.SheetNames.find(name => normalizeText(name).includes('310 TOTAL 2026'));
  if (!purchaseSheet) throw new Error('Compras 310: aba "310 total 2026" não encontrada.');
  const purchaseRows = rows(workbook, purchaseSheet);
  const purchaseHeader = purchaseRows[0]?.map(normalizeText) || [];
  const col = (name: string) => purchaseHeader.findIndex(value => value === normalizeText(name));
  const aggregate = new Map<string, PurchaseHistory310>();
  for (const row of purchaseRows.slice(1)) {
    const normalized = normalizeCnpj(row[col('CNPJ')], { declaredCnpj: true });
    const cnpj = normalized.canonical;
    const winthorCode = cleanCode(row[col('Codigo')]);
    if (!cnpj || cnpj.length !== 14 || !winthorCode) continue;
    const key = `${cnpj}:${winthorCode}`;
    const current = aggregate.get(key) || {
      cnpj, cnpjRaw: normalized.raw, winthorCode, description: String(row[col('Descricao')] ?? '').trim(), volumes: 0, quantity: 0,
      purchaseValue: 0, returnVolume: 0, returnValue: 0, netValue: 0, vendorCode: cleanCode(row[col('Vendedor')]), groupingCode: cleanCode(row[col('Agrupamento')]), groupingDescription: String(row[col('DescricaoAgrupamento')] ?? '').trim(),
    };
    current.volumes += parseNumber(row[col('Volumes')]);
    current.quantity += parseNumber(row[col('QtdCompra')]);
    current.purchaseValue += parseNumber(row[col('ValorCompras')]);
    current.returnVolume += parseNumber(row[col('VolumeDevolucao')]);
    current.returnValue += parseNumber(row[col('ValorDevolucoes')]);
    current.netValue = current.purchaseValue - current.returnValue;
    aggregate.set(key, current);
  }

  const customerSheet = workbook.SheetNames.find(name => normalizeText(name).includes('EXPORTACAO PDVS'));
  const customers: CustomerCommercialProfile[] = [];
  if (customerSheet) {
    const customerRows = rows(workbook, customerSheet);
    const header = customerRows[0]?.map(normalizeText) || [];
    const ci = (name: string) => header.findIndex(value => value === normalizeText(name));
    for (const row of customerRows.slice(1)) {
      const normalized = normalizeCnpj(row[ci('COD CLIENTE')], { declaredCnpj: true });
      if (!normalized.canonical || normalized.canonical.length !== 14) continue;
      const tier = String(row[ci('FAIXAS')] ?? '').trim();
      customers.push({
        cnpj: normalized.canonical,
        cnpjRaw: normalized.raw,
        name: String(row[ci('NOME_CLIENTE')] ?? '').trim(),
        clientCode: '',
        network: ci('REDE') >= 0 ? String(row[ci('REDE')] ?? '').trim() : '',
        environment: String(row[ci('AMBIENTE')] ?? '').trim(),
        profile: String(row[ci('PERFIL')] ?? '').trim(),
        tier,
        assortmentChannel: channelFromTier(tier),
        city: String(row[ci('CIDADE')] ?? '').trim(),
        state: String(row[ci('ESTADO')] ?? '').trim(),
        vendorCode: '', coordinatorCode: '', coordinatorName: '',
        source: customerSheet,
      });
    }
  }
  return { purchases: Array.from(aggregate.values()), customers };
}

export async function readCustomerIntelligenceWorkbook(file: File): Promise<XLSX.WorkBook> {
  const data = await file.arrayBuffer();
  return XLSX.read(data, { type: 'array', cellDates: false });
}

export function detectCustomerIntelligenceSource(workbook: XLSX.WorkBook): 'OFFICIAL_ASSORTMENT' | 'PURCHASE_310' | 'PROTOTYPE' | 'UNKNOWN' {
  const sheets = workbook.SheetNames.map(normalizeText);
  if (sheets.some(name => name.includes('AGO') && name.includes('SET26') && name.includes('SORTIMENTO')) && sheets.some(name => name.includes('DESCONTINUADOS'))) return 'OFFICIAL_ASSORTMENT';
  if (sheets.some(name => name.includes('310 TOTAL 2026'))) return 'PURCHASE_310';
  if (sheets.some(name => name.includes('RECOM POR CNPJ'))) return 'PROTOTYPE';
  return 'UNKNOWN';
}

export function mergeCustomerIntelligenceSupport(previous: CustomerIntelligenceSupport | null, update: Partial<CustomerIntelligenceSupport> & { source?: { kind: string; fileName: string; note: string } }): CustomerIntelligenceSupport {
  const base = previous || EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT;
  const updatedAt = new Date().toISOString();
  const sources = update.source ? [...base.sources.filter(item => item.kind !== update.source!.kind), { ...update.source, loadedAt: updatedAt }] : base.sources;
  return {
    schemaVersion: 1,
    updatedAt,
    sources,
    assortmentCompetences: update.assortmentCompetences ?? base.assortmentCompetences,
    lineage: update.lineage ?? base.lineage,
    customers: update.customers ?? base.customers,
    purchases: update.purchases ?? base.purchases,
    promotions: update.promotions ?? base.promotions,
    pricingRules: update.pricingRules ?? base.pricingRules,
    warnings: Array.from(new Set([...(base.warnings || []), ...(update.warnings || [])])),
  };
}
