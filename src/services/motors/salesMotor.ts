import type * as XLSX from 'xlsx';
import type {
  DataQualityIssue,
  InboundOrderFactRecord,
  ItemMasterRecord,
  ReceiptHeaderRecord,
  ReceiptItemRecord,
  RcaMasterRecord,
  SalesFactRecord,
  TargetFactRecord,
} from '../../domain/unified';
import type { Row } from '../canonical/runtime';
import { cleanCode, cleanDigits, normalizeCnpj, normalizeText, parseNumber, toIsoDate } from '../canonical/utils';
import { parseCompassTargets } from './sourceParsers';
import { parseInvoiceIdentity } from '../../domain/invoiceIdentity';
import { parseEntryNotes218, type OperationalSourceState } from '../operationalSources';

const validCnpj = (value: string) => /^\d{14}$/.test(value);
const headerMap = (row: Row) => new Map(row.map((value, index) => [normalizeText(value), index]).filter(([key]) => Boolean(key)) as Array<[string, number]>);
const idx = (map: Map<string, number>, ...names: string[]) => {
  for (const name of names) {
    const value = map.get(normalizeText(name));
    if (value !== undefined) return value;
  }
  return -1;
};
const cell = (row: Row, index: number) => index >= 0 ? row[index] : '';

export interface SalesMotorResult {
  salesFacts: SalesFactRecord[];
  inboundOrders: InboundOrderFactRecord[];
  receiptHeaders: ReceiptHeaderRecord[];
  receiptItems: ReceiptItemRecord[];
  targets: TargetFactRecord[];
  qualityIssues: DataQualityIssue[];
}

function itemIndexes(items: ItemMasterRecord[]) {
  return {
    byWinthor: new Map(items.filter(item => item.winthorCode && item.hasWinthor).map(item => [cleanCode(item.winthorCode), item])),
    bySku: new Map(items.filter(item => item.industrySku).map(item => [cleanCode(item.industrySku), item])),
    byEan: new Map(items.flatMap(item => [item.internalEan, item.industryEan].filter(Boolean).map(ean => [cleanDigits(ean), item] as const))),
  };
}

export function parseSales8022(rows: Row[], items: ItemMasterRecord[], rcas: RcaMasterRecord[]) {
  const facts: SalesFactRecord[] = [];
  const qualityIssues: DataQualityIssue[] = [];
  if (!rows.length) return { facts, qualityIssues };

  const headerIndex = rows.findIndex(row => {
    const values = row.map(normalizeText);
    return values.includes('DATA MOVIMENTO') && values.includes('STATUS PEDIDO') && values.includes('VALOR R$ NF');
  });
  if (headerIndex < 0) {
    return {
      facts,
      qualityIssues: [{
        id: '8022_SCHEMA',
        domain: 'SALES',
        severity: 'ERROR',
        code: 'SALES_8022_SCHEMA_NOT_RECOGNIZED',
        message: '8022 sem cabeçalho transacional esperado.',
        source: '8022',
      } as DataQualityIssue],
    };
  }

  const header = headerMap(rows[headerIndex]);
  const itemIndex = itemIndexes(items);
  const rcaByCode = new Map<string, RcaMasterRecord>();
  rcas.forEach(rca => {
    if (rca.currentRcaCode) rcaByCode.set(cleanCode(rca.currentRcaCode), rca);
    // O 8022 pode carregar o código legado. O código atual tem precedência
    // quando houver colisão, mas o legado oficial também é resolvido.
    if (rca.legacyRcaCode && !rcaByCode.has(cleanCode(rca.legacyRcaCode))) rcaByCode.set(cleanCode(rca.legacyRcaCode), rca);
  });

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const status = normalizeText(cell(row, idx(header, 'STATUS PEDIDO')));
    if (status !== 'FATURADO' && status !== 'A FATURAR') continue;
    const saleType = normalizeText(cell(row, idx(header, 'TIPO VENDA')));
    if (saleType && saleType !== 'VENDA') continue;
    const value = parseNumber(cell(row, idx(header, 'VALOR R$ NF')));
    if (!value) continue;

    const rawCnpj = String(cell(row, idx(header, 'CNPJ/CPF CLIENTE')) ?? '').trim();
    const normalizedCnpj = normalizeCnpj(rawCnpj, { declaredCnpj: rawCnpj.replace(/\D/g, '').length >= 12 });
    const cnpj = validCnpj(normalizedCnpj.canonical) ? normalizedCnpj.canonical : '';
    const seller = cleanCode(cell(row, idx(header, 'COD. VENDEDOR')));
    const rca = rcaByCode.get(cleanCode(seller));
    const winthor = cleanCode(cell(row, idx(header, 'CODPROD. WINTHOR')));
    const sku = cleanCode(cell(row, idx(header, 'CODIGO FABRICANTE')));
    const ean = cleanDigits(cell(row, idx(header, 'EAN PRODUTO')) || cell(row, idx(header, 'EAN CADASTRO')));
    const item = itemIndex.byWinthor.get(winthor) || itemIndex.bySku.get(sku) || itemIndex.byEan.get(ean);
    const rawMovementDate = cell(row, idx(header, 'DATA MOVIMENTO'));
    const date = toIsoDate(rawMovementDate);

    facts.push({
      salesFactId: `8022:${date}:${cleanCode(cell(row, idx(header, 'NUMERO PED. WINTHOR')))}:${winthor}:${rowIndex}`,
      movementDate: date,
      customerCanonicalId: cnpj ? `CNPJ:${cnpj}` : '',
      winthorCustomerCode: cleanCode(cell(row, idx(header, 'COD. CLIENTE'))),
      cnpj,
      rcaCanonicalId: rca?.rcaCanonicalId || '',
      transactionRcaCode: seller,
      rcaAssignmentStatus: rca ? 'RESOLVED' : seller ? 'NON_COLGATE' : 'UNRESOLVED',
      itemCanonicalId: item?.itemCanonicalId || '',
      winthorProductCode: winthor,
      industrySku: sku,
      orderWinthor: cleanCode(cell(row, idx(header, 'NUMERO PED. WINTHOR'))),
      orderRca: cleanCode(cell(row, idx(header, 'NUMERO PED. RCA'))),
      invoiceNumber: cleanCode(cell(row, idx(header, 'NUMERO NOTA FISCAL'))),
      invoiceDate: toIsoDate(cell(row, idx(header, 'DATA EMISSAO NF'))),
      rawOrderStatus: String(cell(row, idx(header, 'STATUS PEDIDO')) ?? '').trim(),
      rawBlockStatus: String(cell(row, idx(header, 'STATUS BLOQUEIO')) ?? '').trim(),
      salesStatus: status as SalesFactRecord['salesStatus'],
      units: parseNumber(cell(row, idx(header, 'UNIDADES VENDIDAS'))),
      cases: parseNumber(cell(row, idx(header, 'CAIXAS VENDIDAS'))),
      grossWeightKg: parseNumber(cell(row, idx(header, 'PESO BRUTO KG'))),
      netWeightKg: parseNumber(cell(row, idx(header, 'PESO LIQUIDO KG'))),
      weightTons: parseNumber(cell(row, idx(header, 'PESO T'))),
      value,
      saleType: String(cell(row, idx(header, 'TIPO VENDA')) ?? '').trim(),
      line: '',
      source: '8022',
    });

    if (!date) qualityIssues.push({
      id: `8022_DATE:${rowIndex}`,
      domain: 'SALES',
      severity: 'WARNING',
      code: 'SALES_MOVEMENT_DATE_UNRESOLVED',
      message: 'Venda preservada no Sell Out mensal, mas sem data de movimento válida; não participa da série diária.',
      source: '8022',
      entityKey: String(rawMovementDate ?? '').trim() || `linha ${rowIndex + 1}`,
      details: { row: rowIndex + 1, value },
    });
    if (!cnpj) qualityIssues.push({
      id: `8022_CNPJ:${rowIndex}`,
      domain: 'SALES',
      severity: 'WARNING',
      code: 'SALES_CUSTOMER_UNRESOLVED',
      message: 'Venda preservada sem CNPJ canônico; não conta em positivação.',
      source: '8022',
      entityKey: rawCnpj,
    });
    if (!item) qualityIssues.push({
      id: `8022_ITEM:${rowIndex}`,
      domain: 'SALES',
      severity: 'WARNING',
      code: 'SALES_ITEM_UNRESOLVED',
      message: 'Venda preservada sem ITEM_MASTER resolvido.',
      source: '8022',
      entityKey: winthor || sku || ean,
    });
    if (seller && !rca) qualityIssues.push({
      id: `8022_RCA:${rowIndex}`,
      domain: 'RCA',
      severity: 'WARNING',
      code: 'SALES_RCA_NOT_OFFICIAL',
      message: 'Venda preservada, mas o vendedor não está no RCA_MASTER oficial.',
      source: '8022',
      entityKey: seller,
    });
  }

  return { facts, qualityIssues };
}

export function buildTargets(workbook: XLSX.WorkBook | null, rcas: RcaMasterRecord[], referenceDate: string) {
  const qualityIssues: DataQualityIssue[] = [];
  if (!workbook) return { targets: [] as TargetFactRecord[], qualityIssues };
  const byRcaCode = new Map<string, RcaMasterRecord>();
  rcas.forEach(rca => {
    if (rca.legacyRcaCode) byRcaCode.set(cleanCode(rca.legacyRcaCode), rca);
    // Algumas versões da Bússola carregam o código atual, enquanto outras
    // carregam o legado. Ambos pertencem ao mesmo RCA_MASTER oficial.
    if (rca.currentRcaCode && !byRcaCode.has(cleanCode(rca.currentRcaCode))) {
      byRcaCode.set(cleanCode(rca.currentRcaCode), rca);
    }
  });
  const competence = referenceDate.slice(0, 7);
  const targets = parseCompassTargets(workbook).map((raw, index) => {
    const legacyRcaCode = cleanCode(raw.oldCode);
    const rca = byRcaCode.get(legacyRcaCode);
    if (!rca) qualityIssues.push({
      id: `TARGET_RCA:${legacyRcaCode}:${index}`,
      domain: 'TARGET',
      severity: 'WARNING',
      code: 'TARGET_UNASSIGNED_RCA',
      message: 'Meta preservada no total da indústria sem RCA oficial resolvido.',
      source: 'BUSSOLA',
      entityKey: legacyRcaCode,
    });
    return {
      targetFactId: `BUSSOLA:${competence}:${legacyRcaCode}:${index}`,
      competence,
      industry: 'COLGATE',
      legacyRcaCode,
      rcaCanonicalId: rca?.rcaCanonicalId || '',
      salesTarget: Number(raw.salesTarget) || 0,
      positivityTarget: Number(raw.positivityTarget) || 0,
      assignmentStatus: rca ? 'RESOLVED' : 'UNRESOLVED_RCA',
      source: 'BUSSOLA',
    } as TargetFactRecord;
  });
  return { targets, qualityIssues };
}

function isOperationalSourceState(value: Row[] | OperationalSourceState): value is OperationalSourceState {
  return !Array.isArray(value);
}

function receiptSource(entry218OrOperational: Row[] | OperationalSourceState, operational?: OperationalSourceState) {
  const compatibilityOperational = isOperationalSourceState(entry218OrOperational) ? entry218OrOperational : operational;
  const entry218Rows = Array.isArray(entry218OrOperational) ? entry218OrOperational : [];
  if (entry218Rows.length) return parseEntryNotes218(entry218Rows);
  return {
    invoices: compatibilityOperational?.currentInvoices || [],
    items: compatibilityOperational?.receiptItems || [],
  };
}

export function buildInboundFacts(
  rows: Row[],
  items: ItemMasterRecord[],
  entry218OrOperational: Row[] | OperationalSourceState = [],
  allowedSourceRows?: number[],
  operational?: OperationalSourceState,
) {
  const qualityIssues: DataQualityIssue[] = [];
  const itemIndex = itemIndexes(items);
  const inboundOrders: InboundOrderFactRecord[] = [];
  const headerIndex = rows.findIndex(row => {
    const values = row.map(normalizeText);
    return values.includes('ORDER DATE') && values.includes('MATERIAL') && values.includes('ORDER QTY') && values.includes('BILL QTY');
  });

  const compatibilityOperational = isOperationalSourceState(entry218OrOperational) ? entry218OrOperational : operational;
  const parsed218 = receiptSource(entry218OrOperational, operational);
  const receiptHeaders: ReceiptHeaderRecord[] = parsed218.invoices.map((invoice, index) => ({
    receiptId: `218:${invoice.invoiceNormalized || invoice.invoice}:${index}`,
    receiptDate: invoice.entryDate,
    entryTransactionNumber: '',
    invoiceRaw: invoice.invoiceRaw || invoice.invoice,
    invoiceNormalized: invoice.invoiceNormalized || invoice.invoice,
    entryType: '',
    series: invoice.invoiceSeries || '',
    invoiceIssueDate: invoice.issueDate,
    branch: '',
    supplier: 'COLGATE',
    supplierCnpj: '',
    uf: '',
    totalValue: invoice.totalValue,
    ipiValue: 0,
    source: '218',
  }));
  const receiptIdByInvoice = new Map(receiptHeaders.map(header => [header.invoiceNormalized, header.receiptId]));
  const receiptItems: ReceiptItemRecord[] = parsed218.items.map((receipt, index) => {
    const item = itemIndex.byWinthor.get(cleanCode(receipt.sku));
    return {
      receiptId: receiptIdByInvoice.get(receipt.invoiceNormalized || receipt.invoice) || `218:${receipt.invoiceNormalized || receipt.invoice}:${index}`,
      itemCanonicalId: item?.itemCanonicalId || '',
      winthorProductCode: cleanCode(receipt.sku),
      description: receipt.product,
      branch: '',
      pack: '',
      unit: 'UN',
      receivedUnits: receipt.units,
      unitPrice: receipt.unitPrice,
      previousFinancialCost: 0,
      currentFinancialCost: 0,
      fiscalCode: '',
      operationCode: '',
      inboundMatchStatus: 'UNMATCHED',
    };
  });

  const received = new Map<string, number>();
  parsed218.items.forEach(receipt => {
    const item = itemIndex.byWinthor.get(cleanCode(receipt.sku));
    const key = `${receipt.invoiceNormalized || receipt.invoice}|${item?.itemCanonicalId || cleanCode(receipt.sku)}`;
    received.set(key, (received.get(key) || 0) + receipt.units);
  });

  const continuityRows = allowedSourceRows ?? compatibilityOperational?.portfolioRows.map(row => row.sourceRow);
  const allowed = continuityRows?.length ? new Set(continuityRows) : null;
  if (headerIndex >= 0) {
    const header = headerMap(rows[headerIndex]);
    for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      if (allowed && !allowed.has(rowIndex + 1)) continue;
      const row = rows[rowIndex];
      const material = cleanCode(cell(row, idx(header, 'Material')));
      const orderQty = Math.max(parseNumber(cell(row, idx(header, 'Order Qty'))), 0);
      const billQty = Math.max(parseNumber(cell(row, idx(header, 'Bill Qty'))), 0);
      const netValue = Math.max(parseNumber(cell(row, idx(header, 'Net Value ( ZINV )'))), 0);
      if (!material || (orderQty <= 0 && billQty <= 0 && netValue <= 0)) continue;

      const item = itemIndex.bySku.get(material) || itemIndex.byWinthor.get(material);
      const factor = item?.industryUnitsPerCase || null;
      const cases = orderQty + billQty;
      const units = factor ? cases * factor : null;
      const invoiceRaw = String(cell(row, idx(header, 'Nota Fiscal Number')) ?? '').trim();
      const invoiceNormalized = parseInvoiceIdentity(invoiceRaw).normalized;
      const receivedUnits = invoiceNormalized ? (received.get(`${invoiceNormalized}|${item?.itemCanonicalId || material}`) || 0) : 0;
      const remaining = units === null ? null : Math.max(units - receivedUnits, 0);
      let status: InboundOrderFactRecord['inboundStatus'] = 'OPEN_INBOUND';
      if (billQty > 0 && receivedUnits <= 0) status = 'BILLED_BY_COLGATE_IN_TRANSIT';
      else if (receivedUnits > 0 && units !== null && receivedUnits < units) status = 'PARTIALLY_RECEIVED';
      else if (receivedUnits > 0 && units !== null && receivedUnits >= units) status = 'RECEIVED_BY_MILENIO';
      else if (orderQty > 0 && billQty === 0) status = 'ORDERED_FROM_COLGATE';

      inboundOrders.push({
        inboundFactId: `CARTEIRA:${cleanCode(cell(row, idx(header, 'Order Number')))}:${material}:${rowIndex}`,
        orderDate: toIsoDate(cell(row, idx(header, 'Order Date'))),
        colgateCustomerNumber: cleanCode(cell(row, idx(header, 'Customer Number'))),
        orderNumber: cleanCode(cell(row, idx(header, 'Order Number'))),
        itemCanonicalId: item?.itemCanonicalId || '',
        industrySku: material,
        orderQtyCases: orderQty,
        billQtyCases: billQty,
        pipelineQtyCases: cases,
        pipelineUnits: units,
        netValue,
        invoiceRaw,
        invoiceNormalized,
        billingType: String(cell(row, idx(header, 'Billing Type')) ?? '').trim(),
        billingDate: toIsoDate(cell(row, idx(header, 'Billing Date'))),
        grossWeight: parseNumber(cell(row, idx(header, 'Gross Weight'))),
        receivedUnits,
        remainingInTransitUnits: remaining,
        inboundStatus: status,
        source: 'CARTEIRA_COLGATE',
      });

      if (!item) qualityIssues.push({
        id: `INBOUND_ITEM:${rowIndex}`,
        domain: 'INBOUND',
        severity: 'INFO',
        code: 'INBOUND_ITEM_UNRESOLVED',
        message: 'Carteira sem correspondência no Cadastro 286 desta fotografia; a linha foi preservada e será resolvida quando a próxima carga trouxer o vínculo.',
        source: 'CARTEIRA_COLGATE',
        entityKey: material,
      });
      if (cases > 0 && !factor) qualityIssues.push({
        id: `INBOUND_PACK:${rowIndex}`,
        domain: 'INBOUND',
        severity: 'INFO',
        code: 'INDUSTRIAL_PACK_MISSING',
        message: 'Sem Un/CX industrial para converter a Carteira; as caixas foram preservadas e a conversão aparecerá quando a próxima lista trouxer o fator.',
        source: 'CARTEIRA_COLGATE',
        entityKey: material,
      });
    }
  }

  const inboundByInvoiceItem = new Map(inboundOrders.filter(row => row.invoiceNormalized).map(row => [`${row.invoiceNormalized}|${row.itemCanonicalId}`, row]));
  receiptItems.forEach(receipt => {
    const header = receiptHeaders.find(candidate => candidate.receiptId === receipt.receiptId);
    const inbound = header ? inboundByInvoiceItem.get(`${header.invoiceNormalized}|${receipt.itemCanonicalId}`) : undefined;
    if (!inbound) {
      receipt.inboundMatchStatus = 'UNMATCHED';
      return;
    }
    if (inbound.pipelineUnits === null) {
      receipt.inboundMatchStatus = 'MATCHED';
      return;
    }
    receipt.inboundMatchStatus = receipt.receivedUnits > inbound.pipelineUnits
      ? 'OVERAGE'
      : receipt.receivedUnits < inbound.pipelineUnits
        ? 'PARTIAL'
        : 'MATCHED';
  });

  return { inboundOrders, receiptHeaders, receiptItems, qualityIssues };
}

export function runSalesMotor(input: {
  salesRows: Row[];
  portfolioRows: Row[];
  entry218Rows?: Row[];
  portfolioAllowedSourceRows?: number[];
  items: ItemMasterRecord[];
  rcas: RcaMasterRecord[];
  compassWorkbook: XLSX.WorkBook | null;
  operational?: OperationalSourceState;
  referenceDate: string;
}): SalesMotorResult {
  const sales = parseSales8022(input.salesRows, input.items, input.rcas);
  const inbound = buildInboundFacts(
    input.portfolioRows,
    input.items,
    input.entry218Rows || input.operational || [],
    input.portfolioAllowedSourceRows,
    input.operational,
  );
  const targets = buildTargets(input.compassWorkbook, input.rcas, input.referenceDate);
  return {
    salesFacts: sales.facts,
    inboundOrders: inbound.inboundOrders,
    receiptHeaders: inbound.receiptHeaders,
    receiptItems: inbound.receiptItems,
    targets: targets.targets,
    qualityIssues: [...sales.qualityIssues, ...inbound.qualityIssues, ...targets.qualityIssues],
  };
}
