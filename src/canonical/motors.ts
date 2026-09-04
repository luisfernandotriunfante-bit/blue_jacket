import contract from './contracts/blueJacketContractV1.json' with { type: 'json' };
import { createRcaResolver, type RcaResolution } from './rcaResolver';
import type { CanonicalAudit, CanonicalBundle, CanonicalList, ParsedSource, RawTyped } from './types';

type Id = CanonicalList['id'];
type Schema = { field: string; type: string }[];
type RcaAuditBucket = { resolution: RcaResolution; source: string; count: number };

const schemas = contract.motor_schemas as Record<Id, Schema>;
const value = (row: Record<string, RawTyped>, ...names: string[]) => {
  for (const name of names) {
    const candidate = row[name]?.typed;
    if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
  }
  return null;
};
const rows = (sources: ParsedSource[], name: string) => sources.find(item => item.source === name)?.rows ?? [];
const now = () => new Date().toISOString();
const competence = () => new Date().toISOString().slice(0, 7);
const blank = (id: Id) => Object.fromEntries(schemas[id].map(field => [field.field, null])) as Record<string, unknown>;
const codeKey = (input: unknown) => {
  const raw = String(input ?? '').trim().replace(/\.0$/, '').replace(/\s+/g, '');
  if (!raw) return '';
  return /^\d+$/.test(raw) ? raw.replace(/^0+(?=\d)/, '') : raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
};

const gtinCheckDigit = (payload: string) => {
  let total = 0;
  for (let index = payload.length - 1, weight = 3; index >= 0; index -= 1, weight = weight === 3 ? 1 : 3) total += Number(payload[index]) * weight;
  return String((10 - total % 10) % 10);
};

/** UPC-A may appear com 12 dígitos e a embalagem pode trazer DUN-14 no Winthor. */
const gtinKeys = (input: unknown) => {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length === 12) return [`0${digits}`];
  if (digits.length === 13) return [digits];
  if (digits.length === 14) {
    // DUN-14 = indicador + 12 dígitos do EAN + dígito verificador próprio.
    // Reconstituímos o EAN-13 para encontrar a classificação do 8013.
    const eanPayload = digits.slice(1, 13);
    return [digits, `${eanPayload}${gtinCheckDigit(eanPayload)}`];
  }
  return [];
};

const ean13Key = (input: unknown) => gtinKeys(input).find(key => key.length === 13) ?? null;

function stock8013ByEan(records: Array<Record<string, RawTyped>>) {
  const index = new Map<string, Record<string, RawTyped>>();
  const conflicted = new Set<string>();
  for (const record of records) {
    for (const key of [...gtinKeys(value(record, 'ean13')), ...gtinKeys(value(record, 'dun14'))]) {
      if (conflicted.has(key)) continue;
      const previous = index.get(key);
      if (!previous) {
        index.set(key, record);
        continue;
      }
      const sameClassification = ['subbrand_8013', 'category_8013'].every(field => value(previous, field) === value(record, field));
      if (!sameClassification) {
        index.delete(key);
        conflicted.add(key);
      }
    }
  }
  return index;
}

function stock8013For(index: Map<string, Record<string, RawTyped>>, ...candidates: unknown[]) {
  for (const candidate of candidates) {
    for (const key of gtinKeys(candidate)) {
      const found = index.get(key);
      if (found) return found;
    }
  }
  return undefined;
}
const issue = (code: string, message: string, source = 'motor', severity: CanonicalAudit['severity'] = 'WARNING'): CanonicalAudit => ({
  code,
  severity,
  source,
  file: '',
  message,
  action: 'Revisar a fonte e resolver o vínculo antes de utilizar o registro dependente.',
});
function list(id: Id, records: Array<Record<string, unknown>>, sources: string[], audits: CanonicalAudit[]): CanonicalList {
  return {
    id,
    records,
    sources,
    generatedAt: now(),
    competence: competence(),
    snapshotDate: new Date().toISOString().slice(0, 10),
    warnings: audits.filter(audit => audit.severity === 'WARNING' || audit.severity === 'INFO'),
    errors: audits.filter(audit => audit.severity === 'BLOCKED' || audit.severity === 'BLOCKED_DEPENDENT_CALC'),
  };
}

function registerRcaAudit(buckets: Map<string, RcaAuditBucket>, resolution: RcaResolution, source: string) {
  if (resolution.status === 'RESOLVED_CURRENT_CONTEXT' || resolution.status === 'RESOLVED_LEGACY_CONTEXT' || !resolution.inputCode) return;
  const key = `${source}|${resolution.context}|${resolution.status}|${resolution.inputCode}|${resolution.candidateCurrentCodes.join(',')}`;
  const existing = buckets.get(key);
  if (existing) existing.count += 1;
  else buckets.set(key, { resolution, source, count: 1 });
}
function materializeRcaAudits(buckets: Map<string, RcaAuditBucket>) {
  return [...buckets.values()].map(({ resolution, source, count }) => {
    const candidates = resolution.candidateCurrentCodes.length ? ` Candidatos atuais: ${resolution.candidateCurrentCodes.join(', ')}.` : '';
    const context = resolution.context === 'CURRENT' ? 'atual' : 'legado';
    return issue(
      resolution.status,
      `RCA ${resolution.inputCode} no contexto ${context} não foi resolvido de forma única em ${count} registro(s).${candidates}`,
      source,
    );
  });
}

export function buildM1(sources: ParsedSource[]) {
  const audits: CanonicalAudit[] = [];
  const base = [...rows(sources, 'cadastro-itens-286.xls'), ...rows(sources, 'posicao-estoque-105.xls')];
  const seen = new Set<string>();
  const listPriceRows = rows(sources, 'Lista_de_Preco (8).xlsx');
  const listByEan = new Map<string, Record<string, RawTyped>>();
  for (const row of listPriceRows) {
    const ean = ean13Key(value(row, 'ean'));
    if (ean) listByEan.set(ean, row);
  }
  const listBySku = new Map(listPriceRows.map(row => [codeKey(value(row, 'sku')), row]));
  const stock8013 = stock8013ByEan(rows(sources, 'estoque-8013.xls'));
  const records = base.map(row => {
    const winthor = String(value(row, 'winthor_code', 'product_code', 'item_code', 'code') ?? '');
    const ean = value(row, 'ean', 'internal_ean', 'ean_internal');
    const manufacturer = value(row, 'manufacturer_code');
    const industry = listByEan.get(ean13Key(ean) ?? '') ?? listBySku.get(codeKey(manufacturer));
    const source8013 = stock8013For(stock8013, ean, industry ? value(industry, 'ean') : null, industry ? value(industry, 'dun_14') : null);
    const id = winthor || String(ean ?? '');
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const out = blank('M1_ITEM_ESTOQUE');
    Object.assign(out, {
      snapshot_date: new Date().toISOString().slice(0, 10), competence: competence(), item_canonical_id: `ITEM:${id}`,
      winthor_code: winthor || null, manufacturer_code: manufacturer, internal_ean: ean || null,
      industry_sku: industry ? value(industry, 'sku') : null, industry_ean: industry ? value(industry, 'ean') : ean || null,
      dun14: (industry ? value(industry, 'dun_14') : null) ?? (source8013 ? value(source8013, 'dun14') : null), description_internal: value(row, 'description', 'product_description', 'description_internal'),
      description_industry: (industry ? value(industry, 'descricao_padrao') : null) ?? (source8013 ? value(source8013, 'description_8013') : null),
      category: source8013 ? value(source8013, 'category_8013') : null, subbrand: source8013 ? value(source8013, 'subbrand_8013') : null,
      units_per_case_industry: industry ? value(industry, 'un_cx') : null, cases_per_pallet: industry ? value(industry, 'cx_pal') : null,
      physical_stock_units: value(row, 'physical_stock', 'stock', 'quantity', 'quantity_stock'),
      unit_weight_kg: source8013 ? value(source8013, 'unit_weight_kg') : null, case_weight_kg: source8013 ? value(source8013, 'case_weight_kg') : null,
      stock_8013_units: source8013 ? value(source8013, 'stock_units_8013') : null, stock_8013_cases: source8013 ? value(source8013, 'stock_cases_8013') : null, stock_8013_weight_kg: source8013 ? value(source8013, 'stock_weight_kg') : null,
      source_system: 'Winthor', source_file: source8013 ? '286/105/8013' : '286/105', source_row: value(row, '__source_row'),
    });
    if (!winthor || !ean) audits.push(issue('ITEM_UNRESOLVED', `Item ${id} sem ${!winthor ? 'código Winthor' : 'EAN'}.`));
    return out;
  }).filter(Boolean) as Array<Record<string, unknown>>;
  const price = new Map(rows(sources, 'pctabpr 13.xlsx').map(row => [String(value(row, 'product_code', 'winthor_code', 'codprod') ?? ''), value(row, 'official_price', 'p_venda_1', 'pvenda1')]));
  for (const record of records) record.official_price = price.get(String(record.winthor_code)) ?? null;
  return list('M1_ITEM_ESTOQUE', records, ['cadastro-itens-286.xls', 'posicao-estoque-105.xls', 'estoque-8013.xls', 'pctabpr 13.xlsx', 'Lista_de_Preco (8).xlsx', 'lançamentos.xlsx', "Sortimento Recomendado - Q3'26.xlsx"], audits);
}

export function buildM2(sources: ParsedSource[]) {
  const audits: CanonicalAudit[] = [];
  const rcaAudits = new Map<string, RcaAuditBucket>();
  const resolver = createRcaResolver(sources);
  const portfolio = new Map(rows(sources, 'relatorio_carteira_clientes.xls').map(row => [String(value(row, 'customer_cnpj') ?? ''), row]));
  const records = rows(sources, 'Nova Base de Premissas - Q3.xlsx').map(row => {
    const cnpj = String(value(row, 'customer_document_declared', 'customer_cnpj', 'cnpj', 'customer_document') ?? '');
    const portfolioRow = portfolio.get(cnpj);
    const representative = value(portfolioRow ?? row, 'representative_code', 'rca_code', 'seller_code');
    const rca = representative ? resolver.resolveCurrent(representative) : null;
    if (rca) registerRcaAudit(rcaAudits, rca, 'M2/Carteira Clientes');
    const out = blank('M2_CLIENTE_RCA');
    Object.assign(out, {
      competence: competence(), snapshot_date: new Date().toISOString().slice(0, 10),
      customer_canonical_id: cnpj.length === 14 ? `CUSTOMER:${cnpj}` : null, cnpj: cnpj.length === 14 ? cnpj : null,
      customer_name: value(portfolioRow ?? row, 'customer_name', 'customer_name_premise', 'name'), city: value(portfolioRow ?? row, 'city'), state: value(row, 'state', 'uf'),
      environment: value(row, 'environment'), profile: value(row, 'profile'), representative_code_snapshot: representative,
      rca_canonical_id: rca?.canonicalId ?? null, rca_current_code: rca?.currentCode ?? null, rca_legacy_code: rca?.legacyCode ?? null,
      rca_name: rca?.name ?? null, coordinator_code: rca?.coordinatorCode ?? null, coordinator_name: rca?.coordinatorName ?? null,
      source_lineage: 'Premissas|Carteira Clientes|NOVOS RCAS', audit_flags: rca && !rca.canonicalId ? rca.status : null,
    });
    if (cnpj.length !== 14) audits.push(issue('INVALID_CNPJ', `Cliente ${String(value(row, 'customer_name_premise', 'customer_name') ?? '')} sem CNPJ de 14 dígitos.`));
    return out;
  });
  audits.push(...materializeRcaAudits(rcaAudits));
  return list('M2_CLIENTE_RCA', records, ['Nova Base de Premissas - Q3.xlsx', 'NOVOS RCAS.xlsx', 'relatorio_carteira_clientes.xls', "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx"], audits);
}

export function buildM3(sources: ParsedSource[]) {
  const resolver = createRcaResolver(sources);
  const rcaAudits = new Map<string, RcaAuditBucket>();
  const records: Array<Record<string, unknown>> = [];
  for (const row of rows(sources, 'vendas-8022.xls')) {
    const code = value(row, 'seller_code');
    const rca = resolver.resolveCurrent(code);
    registerRcaAudit(rcaAudits, rca, '8022');
    const cnpj = String(value(row, 'customer_document') ?? '');
    const out = blank('M3_MOVIMENTO_VENDAS');
    Object.assign(out, {
      fact_type: 'SALE', competence: competence(), event_date: value(row, 'movement_date'), invoice_issue_date: value(row, 'invoice_issue_date'),
      customer_canonical_id: cnpj.length === 14 ? `CUSTOMER:${cnpj}` : null, cnpj: cnpj.length === 14 ? cnpj : null, customer_winthor_code: value(row, 'customer_winthor_code'), customer_name: value(row, 'customer_name'), seller_name: value(row, 'seller_name'),
      rca_canonical_id: rca.canonicalId, transaction_rca_code: code, winthor_product_code: value(row, 'winthor_product_code'),
      industry_sku: value(row, 'manufacturer_code'), ean_product: value(row, 'ean_product'), product_description: value(row, 'product_description'), order_winthor: value(row, 'order_winthor'), order_rca: value(row, 'order_rca'),
      invoice_number: value(row, 'invoice_number'), order_status: value(row, 'order_status'), block_status: value(row, 'block_status'),
      sale_type: value(row, 'sale_type'), order_origin: value(row, 'order_origin'), units: value(row, 'units_sold'), cases: value(row, 'cases_sold'),
      gross_weight_kg: value(row, 'gross_weight_kg'), net_weight_kg: value(row, 'net_weight_kg'), value: value(row, 'sale_value'),
      source_lineage: '8022|NOVOS RCAS:CURRENT', audit_flags: rca.canonicalId ? null : rca.status,
    });
    records.push(out);
  }
  for (const row of rows(sources, 'CARTEIRA 24.08.xlsx')) {
    const out = blank('M3_MOVIMENTO_VENDAS');
    Object.assign(out, { fact_type: 'INBOUND_ORDER', competence: competence(), order_date: value(row, 'order_date'), billing_date: value(row, 'billing_date'), industry_material: value(row, 'industry_material'), industry_order_number: value(row, 'industry_order_number'), invoice_number: value(row, 'invoice_raw'), order_qty: value(row, 'order_qty'), bill_qty: value(row, 'bill_qty'), inbound_net_value: value(row, 'net_value'), billing_type: value(row, 'billing_type'), source_lineage: 'Carteira Colgate' });
    records.push(out);
  }
  for (const row of rows(sources, 'entrada-notas-218.xls')) {
    const out = blank('M3_MOVIMENTO_VENDAS');
    Object.assign(out, { fact_type: 'RECEIPT', competence: competence(), receipt_date: value(row, 'receipt_date'), invoice_issue_date: value(row, 'invoice_issue_date'), invoice_number: value(row, 'invoice_raw'), invoice_series: value(row, 'invoice_series'), winthor_product_code: value(row, 'receipt_item_code + description'), received_units: value(row, 'received_units'), receipt_unit_price: value(row, 'receipt_unit_price'), receipt_invoice_value: value(row, 'invoice_total'), current_financial_cost: value(row, 'current_financial_cost'), fiscal_code: value(row, 'fiscal_code'), operation_code: value(row, 'operation_code'), receipt_scope: value(row, '__receipt_scope') ?? 'ITEM', source_lineage: value(row, '__receipt_scope') === 'INVOICE' ? '218:NF' : '218:ITEM' });
    records.push(out);
  }
  for (const row of rows(sources, 'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx')) {
    if (String(value(row, 'pasta_type') ?? '').trim().toUpperCase() !== 'MCD' || String(value(row, 'industry_name') ?? '').trim().toUpperCase() !== 'COLGATE') continue;
    const code = value(row, 'target_rca_code');
    const rca = resolver.resolveLegacy(code, value(row, 'target_rca_name'));
    registerRcaAudit(rcaAudits, rca, 'Bússola');
    const out = blank('M3_MOVIMENTO_VENDAS');
    Object.assign(out, { fact_type: 'TARGET', competence: competence(), transaction_rca_code: code, rca_canonical_id: rca.canonicalId, sales_target: value(row, 'sales_target_pna'), positivity_target: value(row, 'positivity_target'), target_assignment_status: rca.status, source_lineage: 'Bússola: Metas | MCD + COLGATE | NOVOS RCAS:LEGACY', audit_flags: rca.canonicalId ? null : rca.status });
    records.push(out);
  }
  return list('M3_MOVIMENTO_VENDAS', records, ['vendas-8022.xls', 'CARTEIRA 24.08.xlsx', 'entrada-notas-218.xls', 'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx'], materializeRcaAudits(rcaAudits));
}

export function buildM4(sources: ParsedSource[]) {
  const audits: CanonicalAudit[] = [];
  const resolver = createRcaResolver(sources);
  const rcaAudits = new Map<string, RcaAuditBucket>();
  const movements = [...rows(sources, '379 25.txt'), ...rows(sources, '379 26.txt')];
  const records = movements.map(row => {
    const kind = value(row, 'movement_class');
    const code = value(row, 'legacy_rca_code');
    const rca = resolver.resolveLegacy(code);
    registerRcaAudit(rcaAudits, rca, '379');
    const out = blank('M4_HISTORICO_TRANSICAO');
    Object.assign(out, { competence: competence(), movement_date: value(row, 'movement_date'), invoice_number: value(row, 'invoice_number'), invoice_series: value(row, 'invoice_series'), legacy_product_code: value(row, 'legacy_product_code'), customer_document_raw: value(row, 'customer_document'), legacy_rca_code: code, rca_canonical_id: rca.canonicalId, operation_code: value(row, 'operation_code'), cfop: value(row, 'cfop'), quantity_raw: value(row, 'quantity_raw'), value_raw: value(row, 'value_raw'), discount_raw: value(row, 'discount_raw'), net_weight: value(row, 'net_weight'), gross_weight: value(row, 'gross_weight'), movement_class: kind, mapping_status: rca.canonicalId ? rca.status : rca.status, source_lineage: '379|NOVOS RCAS:LEGACY', audit_flags: rca.canonicalId ? null : rca.status });
    if (kind === 'OTHER') audits.push(issue('UNKNOWN_OPERATION_CFOP', `Par ${value(row, 'operation_code')}/${value(row, 'cfop')} preservado como OTHER/PENDING.`));
    return out;
  });
  audits.push(...materializeRcaAudits(rcaAudits));
  return list('M4_HISTORICO_TRANSICAO', records, ['379 25.txt', '379 26.txt', '310 total 2026.txt', '12.322.txt'], audits);
}

export function buildCanonicalBundle(parsedSources: ParsedSource[]): CanonicalBundle {
  const rejected = parsedSources.some(source => source.audits.some(audit => audit.severity === 'BLOCKED'));
  if (rejected) throw new Error('SOURCE_REJECTED_KEEP_PREVIOUS: uma ou mais fontes falharam validação estrutural.');
  const lists = { M1_ITEM_ESTOQUE: buildM1(parsedSources), M2_CLIENTE_RCA: buildM2(parsedSources), M3_MOVIMENTO_VENDAS: buildM3(parsedSources), M4_HISTORICO_TRANSICAO: buildM4(parsedSources) };
  return { version: 'v1', generatedAt: now(), lists, parsedSources };
}

/** Stage 3 consumes only normalized staging rows. */
export function buildCanonicalBundleFromStaging(parsedSources: ParsedSource[]): CanonicalBundle {
  const bundle = buildCanonicalBundle(parsedSources);
  const snapshot = new Date().toISOString().slice(0, 10);
  const comp = competence();
  const fieldOnly = (id: Id, record: Record<string, unknown>) => Object.fromEntries(schemas[id].map(schema => [schema.field, record[schema.field] ?? null]));
  const resolver = createRcaResolver(parsedSources);

  // M1
  const stock105 = new Map(rows(parsedSources, 'posicao-estoque-105.xls').map(row => [String(value(row, 'winthor_code') ?? ''), row]));
  const pVenda = new Map(rows(parsedSources, 'pctabpr 13.xlsx').map(row => [String(value(row, 'codprod') ?? ''), value(row, 'pvenda1')]));
  const launches = new Map(rows(parsedSources, 'lançamentos.xlsx').map(row => [String(value(row, 'launch_winthor_code') ?? ''), row]));
  const listPriceRows = rows(parsedSources, 'Lista_de_Preco (8).xlsx');
  const listByEan = new Map<string, Record<string, RawTyped>>();
  for (const row of listPriceRows) {
    const ean = ean13Key(value(row, 'ean'));
    if (ean) listByEan.set(ean, row);
  }
  const listBySku = new Map(listPriceRows.map(row => [codeKey(value(row, 'sku')), row]));
  const stock8013 = stock8013ByEan(rows(parsedSources, 'estoque-8013.xls'));
  const items = new Map<string, Record<string, unknown>>();
  for (const row of [...rows(parsedSources, 'cadastro-itens-286.xls'), ...rows(parsedSources, 'posicao-estoque-105.xls')]) {
    const code = String(value(row, 'winthor_code') ?? '');
    if (!code || items.has(code)) continue;
    const stock = stock105.get(code); const launch = launches.get(code);
    const ean = value(row, 'internal_ean');
    const manufacturer = value(row, 'manufacturer_code');
    const industry = listByEan.get(ean13Key(ean) ?? '') ?? listBySku.get(codeKey(manufacturer));
    const source8013 = stock8013For(stock8013, ean, industry ? value(industry, 'ean') : null, industry ? value(industry, 'dun_14') : null);
    items.set(code, fieldOnly('M1_ITEM_ESTOQUE', {
      snapshot_date: snapshot, competence: comp, item_canonical_id: `ITEM:${code}`, winthor_code: code,
      manufacturer_code: manufacturer, industry_sku: industry ? value(industry, 'sku') : null,
      internal_ean: value(row, 'internal_ean'), industry_ean: industry ? value(industry, 'ean') : null, dun14: (industry ? value(industry, 'dun_14') : null) ?? (source8013 ? value(source8013, 'dun14') : null),
      description_internal: value(row, 'description_286', 'description_105'), description_industry: (industry ? value(industry, 'descricao_padrao') : null) ?? (source8013 ? value(source8013, 'description_8013') : null),
      category: source8013 ? value(source8013, 'category_8013') : null, subbrand: source8013 ? value(source8013, 'subbrand_8013') : null,
      pack_internal: value(row, 'pack_286', 'pack_105'), units_per_case_industry: industry ? value(industry, 'un_cx') : null, cases_per_pallet: industry ? value(industry, 'cx_pal') : null,
      physical_stock_units: value(stock ?? row, 'physical_stock_units'), stock_286_physical: value(row, 'physical_286'), stock_286_blocked: value(row, 'blocked_286'), stock_286_reserved: value(row, 'reserved_286'), stock_286_available: value(row, 'available_286'),
      unit_weight_kg: source8013 ? value(source8013, 'unit_weight_kg') : null, case_weight_kg: source8013 ? value(source8013, 'case_weight_kg') : null,
      stock_8013_units: source8013 ? value(source8013, 'stock_units_8013') : null, stock_8013_cases: source8013 ? value(source8013, 'stock_cases_8013') : null, stock_8013_weight_kg: source8013 ? value(source8013, 'stock_weight_kg') : null,
      cost_unit_105: value(stock ?? row, 'unit_cost_real'), sale_price_105: value(stock ?? row, 'sale_price_105'), pVenda1_region11: pVenda.get(code) ?? null,
      is_launch: launch ? true : false, launch_status: launch ? value(launch, 'launch_status') : null, has_winthor: true, mapping_status: industry ? 'WINTHOR+LIST_PRICE' : 'WINTHOR',
      source_lineage: `${industry ? '286|105|PCTABPR|ListaPreço' : '286|105|PCTABPR'}${source8013 ? '|8013' : ''}|Lançamentos`,
    }));
  }
  bundle.lists.M1_ITEM_ESTOQUE = list('M1_ITEM_ESTOQUE', [...items.values()], ['cadastro-itens-286.xls', 'posicao-estoque-105.xls', 'estoque-8013.xls', 'pctabpr 13.xlsx', 'Lista_de_Preco (8).xlsx', 'lançamentos.xlsx', "Sortimento Recomendado - Q3'26.xlsx"], []);

  // M2 — CNPJ é a chave; Carteira fornece representante atual e NOVOS RCAS resolve identidade canônica.
  const m2RcaAudits = new Map<string, RcaAuditBucket>();
  const portfolio = new Map(rows(parsedSources, 'relatorio_carteira_clientes.xls').map(row => [String(value(row, 'customer_cnpj') ?? ''), row]));
  const m2 = new Map<string, Record<string, unknown>>();
  for (const row of [...rows(parsedSources, 'Nova Base de Premissas - Q3.xlsx'), ...rows(parsedSources, 'relatorio_carteira_clientes.xls')]) {
    const cnpj = String(value(row, 'customer_document_declared', 'customer_cnpj') ?? '');
    if (!cnpj || m2.has(cnpj)) continue;
    const portfolioRow = portfolio.get(cnpj);
    const representative = value(portfolioRow ?? row, 'representative_code');
    const rca = representative ? resolver.resolveCurrent(representative) : null;
    if (rca) registerRcaAudit(m2RcaAudits, rca, 'Carteira Clientes');
    m2.set(cnpj, fieldOnly('M2_CLIENTE_RCA', {
      snapshot_date: snapshot, competence: comp, customer_canonical_id: cnpj.length === 14 ? `CUSTOMER:${cnpj}` : null, cnpj: cnpj.length === 14 ? cnpj : null,
      winthor_customer_code: value(portfolioRow ?? row, 'winthor_customer_code'), customer_name: value(portfolioRow ?? row, 'customer_name', 'customer_name_premise'), trade_name: value(portfolioRow ?? row, 'trade_name'), commercial_activity: value(portfolioRow ?? row, 'commercial_activity'), city: value(portfolioRow ?? row, 'city'), state: value(row, 'state'), district: value(portfolioRow ?? row, 'district'), address: value(portfolioRow ?? row, 'address'), latitude: value(portfolioRow ?? row, 'latitude'), longitude: value(portfolioRow ?? row, 'longitude'), buyer: value(portfolioRow ?? row, 'buyer'), phone: value(portfolioRow ?? row, 'phone'),
      environment: value(row, 'environment'), tier: value(row, 'tier'), profile: value(row, 'profile'), cluster_code: value(row, 'cluster_code'), cluster_description: value(row, 'cluster_description'), avg_12_months: value(row, 'avg_12_months'), premise_network: value(row, 'premise_network'),
      representative_code_snapshot: representative, rca_canonical_id: rca?.canonicalId ?? null, rca_current_code: rca?.currentCode ?? null, rca_legacy_code: rca?.legacyCode ?? null, rca_name: rca?.name ?? null, coordinator_code: rca?.coordinatorCode ?? null, coordinator_name: rca?.coordinatorName ?? null,
      visit_frequency: value(portfolioRow ?? row, 'visit_frequency'), visit_day: value(portfolioRow ?? row, 'visit_day'), days_without_purchase: value(portfolioRow ?? row, 'days_without_purchase'), network_resolution_status: 'SOURCE_PRESERVED', source_lineage: 'Premissas|Carteira Clientes|NOVOS RCAS', audit_flags: rca && !rca.canonicalId ? rca.status : null,
    }));
  }
  bundle.lists.M2_CLIENTE_RCA = list('M2_CLIENTE_RCA', [...m2.values()], ['Nova Base de Premissas - Q3.xlsx', 'NOVOS RCAS.xlsx', 'relatorio_carteira_clientes.xls', "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx"], materializeRcaAudits(m2RcaAudits));

  // M3 — 8022 é contexto ATUAL; Bússola homologada é contexto LEGADO com nome para desambiguar.
  const m3RcaAudits = new Map<string, RcaAuditBucket>();
  const m3: Record<string, unknown>[] = [];
  for (const row of rows(parsedSources, 'vendas-8022.xls')) {
    const code = value(row, 'seller_code'); const rca = resolver.resolveCurrent(code); registerRcaAudit(m3RcaAudits, rca, '8022');
    const document = String(value(row, 'customer_document') ?? '');
    m3.push(fieldOnly('M3_MOVIMENTO_VENDAS', { fact_id: `8022:${value(row, '__source_row')}`, fact_type: 'SALE', source: '8022', competence: comp, event_date: value(row, 'movement_date'), invoice_issue_date: value(row, 'invoice_issue_date'), customer_canonical_id: document.length === 14 ? `CUSTOMER:${document}` : null, cnpj: document.length === 14 ? document : null, customer_winthor_code: value(row, 'customer_winthor_code'), customer_name: value(row, 'customer_name'), seller_name: value(row, 'seller_name'), rca_canonical_id: rca.canonicalId, transaction_rca_code: code, winthor_product_code: value(row, 'winthor_product_code'), industry_sku: value(row, 'manufacturer_code'), ean_product: value(row, 'ean_product'), product_description: value(row, 'product_description'), order_winthor: value(row, 'order_winthor'), order_rca: value(row, 'order_rca'), invoice_number: value(row, 'invoice_number'), order_status: value(row, 'order_status'), block_status: value(row, 'block_status'), sale_type: value(row, 'sale_type'), order_origin: value(row, 'order_origin'), units: value(row, 'units_sold'), cases: value(row, 'cases_sold'), gross_weight_kg: value(row, 'gross_weight_kg'), net_weight_kg: value(row, 'net_weight_kg'), value: value(row, 'sale_value'), source_lineage: '8022|NOVOS RCAS:CURRENT', audit_flags: rca.canonicalId ? null : rca.status }));
  }
  for (const row of rows(parsedSources, 'CARTEIRA 24.08.xlsx')) m3.push(fieldOnly('M3_MOVIMENTO_VENDAS', { fact_id: `CARTEIRA:${value(row, '__source_row')}`, fact_type: 'INBOUND_ORDER', source: 'CARTEIRA_COLGATE', competence: comp, order_date: value(row, 'order_date'), billing_date: value(row, 'billing_date'), industry_material: value(row, 'industry_material'), industry_order_number: value(row, 'industry_order_number'), invoice_number: value(row, 'invoice_raw'), order_qty: value(row, 'order_qty'), bill_qty: value(row, 'bill_qty'), inbound_net_value: value(row, 'net_value'), billing_type: value(row, 'billing_type'), source_lineage: 'Carteira Colgate' }));
  for (const row of rows(parsedSources, 'entrada-notas-218.xls')) m3.push(fieldOnly('M3_MOVIMENTO_VENDAS', { fact_id: `218:${value(row, '__source_row')}`, fact_type: 'RECEIPT', source: '218', competence: comp, receipt_date: value(row, 'receipt_date'), invoice_issue_date: value(row, 'invoice_issue_date'), invoice_number: value(row, 'invoice_raw'), invoice_series: value(row, 'invoice_series'), winthor_product_code: value(row, 'receipt_item_code + description'), received_units: value(row, 'received_units'), receipt_unit_price: value(row, 'receipt_unit_price'), receipt_invoice_value: value(row, 'invoice_total'), current_financial_cost: value(row, 'current_financial_cost'), fiscal_code: value(row, 'fiscal_code'), operation_code: value(row, 'operation_code'), receipt_scope: value(row, '__receipt_scope') ?? 'ITEM', source_lineage: value(row, '__receipt_scope') === 'INVOICE' ? '218:NF' : '218:ITEM' }));
  for (const row of rows(parsedSources, 'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx')) {
    if (String(value(row, 'pasta_type') ?? '').trim().toUpperCase() !== 'MCD' || String(value(row, 'industry_name') ?? '').trim().toUpperCase() !== 'COLGATE') continue;
    const code = value(row, 'target_rca_code'); const rca = resolver.resolveLegacy(code, value(row, 'target_rca_name')); registerRcaAudit(m3RcaAudits, rca, 'Bússola');
    m3.push(fieldOnly('M3_MOVIMENTO_VENDAS', { fact_id: `BUSSOLA:${value(row, '__source_row')}`, fact_type: 'TARGET', source: 'BUSSOLA', competence: comp, transaction_rca_code: code, rca_canonical_id: rca.canonicalId, sales_target: value(row, 'sales_target_pna'), positivity_target: value(row, 'positivity_target'), target_assignment_status: rca.status, source_lineage: 'Bússola: Metas | MCD + COLGATE | NOVOS RCAS:LEGACY', audit_flags: rca.canonicalId ? null : rca.status }));
  }
  bundle.lists.M3_MOVIMENTO_VENDAS = list('M3_MOVIMENTO_VENDAS', m3, ['vendas-8022.xls', 'CARTEIRA 24.08.xlsx', 'entrada-notas-218.xls', 'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx'], materializeRcaAudits(m3RcaAudits));

  // M4 — 379 e 310 usam exclusivamente o contexto LEGADO do mesmo RCA master.
  const m4Audits: CanonicalAudit[] = [];
  const m4RcaAudits = new Map<string, RcaAuditBucket>();
  const historical379 = (file: string, year: string) => rows(parsedSources, file).map(row => {
    const out = blank('M4_HISTORICO_TRANSICAO'); const klass = value(row, 'movement_class'); const legacyCode = value(row, 'legacy_rca_code', 'rca_code'); const rca = resolver.resolveLegacy(legacyCode); registerRcaAudit(m4RcaAudits, rca, file);
    Object.assign(out, { historical_fact_id: `${file}:${value(row, '__source_row') ?? ''}`, row_type: 'TRANSACTION_379', source: file, source_year: year, competence: null, movement_date: value(row, 'movement_date'), invoice_number: value(row, 'invoice_number'), invoice_series: value(row, 'invoice_series'), legacy_product_code: value(row, 'legacy_product_code'), historical_gtin: value(row, 'ean_commercial', 'ean_tax'), customer_document_raw: value(row, 'customer_document'), customer_cnpj: (() => { const document = String(value(row, 'customer_document') ?? ''); return document.length === 14 ? document : null; })(), legacy_rca_code: legacyCode, rca_canonical_id: rca.canonicalId, movement_class: klass, operation_code: value(row, 'operation_code'), cfop: value(row, 'cfop'), quantity_raw: value(row, 'quantity_raw'), signed_quantity: klass === 'RETURN' ? -(Number(value(row, 'quantity_raw') ?? 0)) : value(row, 'quantity_raw'), value_raw: value(row, 'value_raw'), signed_value: klass === 'RETURN' ? -(Number(value(row, 'value_raw') ?? 0)) : value(row, 'value_raw'), discount_raw: value(row, 'discount_raw'), signed_discount: klass === 'RETURN' ? -(Number(value(row, 'discount_raw') ?? 0)) : value(row, 'discount_raw'), net_weight: value(row, 'net_weight'), gross_weight: value(row, 'gross_weight'), historical_city: value(row, 'city'), historical_coordinator: value(row, 'coordinator'), historical_network: value(row, 'network'), historical_branch: value(row, 'branch'), qtd_cx: value(row, 'qtd_cx'), ean_commercial: value(row, 'ean_commercial'), ean_tax: value(row, 'ean_tax'), mapping_status: rca.canonicalId ? rca.status : rca.status, source_lineage: `${file}|NOVOS RCAS:LEGACY`, audit_flags: rca.canonicalId ? null : rca.status });
    if (klass === 'OTHER') m4Audits.push(issue('UNKNOWN_OPERATION_CFOP', `Par ${value(row, 'operation_code')}/${value(row, 'cfop')} preservado como OTHER.`, file));
    return out;
  });
  const aggregates = rows(parsedSources, '310 total 2026.txt').map(row => {
    const out = blank('M4_HISTORICO_TRANSICAO'); const document = String(value(row, 'customer_document') ?? ''); const legacyCode = value(row, 'seller_code_legacy'); const rca = resolver.resolveLegacy(legacyCode); if (legacyCode) registerRcaAudit(m4RcaAudits, rca, '310');
    Object.assign(out, { historical_fact_id: `310:${value(row, '__source_row') ?? ''}`, row_type: 'AGG_310', source: '310', source_year: '2026', competence: null, legacy_product_code: value(row, 'legacy_product_code'), customer_document_raw: document || null, customer_cnpj: document.length === 14 ? document : null, legacy_rca_code: legacyCode, rca_canonical_id: rca.canonicalId, purchase_value_ytd: value(row, 'purchase_value'), bonus_value_ytd: value(row, 'bonus_value'), discount_value_ytd: value(row, 'discount_value'), return_value_ytd: value(row, 'return_value'), quantity_raw: value(row, 'purchase_count'), net_weight: value(row, 'purchase_net_weight'), gross_weight: value(row, 'return_net_weight'), seller_code_310: legacyCode, group_code_310: value(row, 'group_code'), source_lineage: '310 total 2026.txt|NOVOS RCAS:LEGACY', mapping_status: rca.canonicalId ? rca.status : (document.length === 14 ? 'DOCUMENT_CNPJ' : 'DOCUMENT_CPF_OR_UNRESOLVED'), audit_flags: legacyCode && !rca.canonicalId ? rca.status : null });
    return out;
  });
  const receipts = rows(parsedSources, '12.322.txt').map(row => { const out = blank('M4_HISTORICO_TRANSICAO'); Object.assign(out, { historical_fact_id: `12.322:${value(row, '__source_row') ?? ''}`, row_type: 'RECEIPT_12322', source: '12.322.txt', source_year: '2026', competence: null, movement_date: value(row, 'invoice_issue_date'), invoice_number: value(row, 'invoice_raw'), accounting_date: value(row, 'accounting_date'), supplier_document: value(row, 'supplier_document'), supplier_name: value(row, 'supplier_name'), invoice_value: value(row, 'invoice_value'), discount_raw: value(row, 'discount'), receipt_class: value(row, 'operation_code') === '212.01' ? 'MERCHANDISE' : value(row, 'operation_code') === '299.40' ? 'SUPPLIES' : 'UNCLASSIFIED', mapping_status: 'INVOICE_GRAIN_ONLY', source_lineage: '12.322.txt' }); return out; });
  m4Audits.push(...materializeRcaAudits(m4RcaAudits));
  bundle.lists.M4_HISTORICO_TRANSICAO = list('M4_HISTORICO_TRANSICAO', [...historical379('379 25.txt', '2025'), ...historical379('379 26.txt', '2026'), ...aggregates, ...receipts], ['379 25.txt', '379 26.txt', '310 total 2026.txt', '12.322.txt'], m4Audits);
  return bundle;
}
