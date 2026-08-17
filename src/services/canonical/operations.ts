import type { CanonicalInventoryProduct } from '../../domain/canonical';
import type { Row, SalesTransaction, StockProduct } from './runtime';
import { cleanCode, cleanDigits, classifyLine, normalizeText, parseNumber, toIsoDate } from './utils';
import { parseCadastro286, parsePriceList } from './support';

export function parseStock105(rows: Row[], cadastro: ReturnType<typeof parseCadastro286>): Map<string, StockProduct> {
  const products = new Map<string, StockProduct>();
  const header = rows.findIndex(row => normalizeText(row[0]) === 'CODIGO' && normalizeText(row[1]) === 'DESCRICAO' && normalizeText(row[14]).includes('P. VENDA'));
  const start = header >= 0 ? header + 1 : 13;
  for (let i = start; i < rows.length; i++) {
    const row = rows[i]; const code = cleanCode(row[0]); if (!code || !/^\d+$/.test(code)) continue;
    const cad = cadastro.byInternal.get(code); const qty = parseNumber(row[8]);
    products.set(code, { codigo: code, descricao: String(row[1] ?? '').trim() || cad?.description || '', ean: cad?.ean || '', quantidade: qty, saldoMinimo: 0, custoUnitario: parseNumber(row[10]), vendaUnitario: parseNumber(row[14]), entradas: 0, saidas: 0, saldoPedido: 0, saldoPedidoValorCusto: 0, saldoPedidoValorVenda: 0, isLancamento: false, hasWinthor: true, factoryCode: cad?.factoryCode });
  }
  return products;
}

export function mergeStock8013(rows: Row[], products: Map<string, StockProduct>, priceList: ReturnType<typeof parsePriceList>) {
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]; const ean = cleanDigits(row[4]); if (!ean) continue;
    const existing = Array.from(products.values()).find(p => cleanDigits(p.ean) === ean);
    if (existing) { existing.physicalCases = parseNumber(row[12]); existing.physicalUnits = parseNumber(row[11]); existing.grossKg = parseNumber(row[13]); if (!existing.ean) existing.ean = ean; continue; }
    const master = priceList.byEan.get(ean); const code = master?.sku || ean;
    products.set(code, { codigo: code, descricao: String(row[6] ?? '').trim() || master?.description || '', ean, quantidade: 0, saldoMinimo: 0, custoUnitario: 0, vendaUnitario: 0, entradas: 0, saidas: 0, saldoPedido: 0, saldoPedidoValorCusto: 0, saldoPedidoValorVenda: 0, isLancamento: master?.isLaunch || false, hasWinthor: false, physicalCases: parseNumber(row[12]), physicalUnits: parseNumber(row[11]), grossKg: parseNumber(row[13]), factoryCode: master?.sku });
  }
}

/**
 * A CARTEIRA representa tudo o que continua pendente junto à indústria.
 *
 * Regra fechada para o Blue Jacket:
 * - CUSTO: soma 100% do valor informado na carteira. Não descartamos valor
 *   só porque o SKU ainda não foi conciliado com o cadastro interno.
 * - VENDA: calculamos somente quando existe preço de custo e preço de venda
 *   registrados no estoque do sistema (posição 105). Não usamos Lista de Preço
 *   Colgate, preço de caixa ou qualquer estimativa como substituto do preço de
 *   venda da Milênio.
 * - CATÁLOGO: quando a carteira conhece um material que ainda não existe na
 *   posição 105, ele entra no catálogo como SEM WINTHOR, com custo/venda unitários
 *   zerados. Lista de Preço/Cadastro 286 são usados apenas para identificação.
 */
export function applyPortfolio(rows: Row[], products: Map<string, StockProduct>, cadastro: ReturnType<typeof parseCadastro286>, priceList: ReturnType<typeof parsePriceList>): { cost: number; sale: number; unresolved: number } {
  let totalCost = 0; let totalSale = 0; let unresolved = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const portfolioCost = Math.max(parseNumber(row[8]), 0);
    const portfolioQty = Math.max(parseNumber(row[6]), 0);
    const rawMaterial = cleanCode(row[4]);

    if (portfolioQty <= 0 && portfolioCost <= 0) continue;

    totalCost += portfolioCost;

    if (!rawMaterial) {
      if (portfolioCost > 0) unresolved += 1;
      continue;
    }

    const internal = cadastro.factoryToInternal.get(rawMaterial) || rawMaterial;
    const cad = cadastro.byInternal.get(internal);
    const master = priceList.bySku.get(rawMaterial) || (cad?.ean ? priceList.byEan.get(cleanDigits(cad.ean)) : undefined);
    let product = products.get(internal);

    if (!product) {
      product = {
        codigo: internal,
        descricao: cad?.description || master?.description || `Material ${rawMaterial}`,
        ean: cad?.ean || master?.ean || '',
        quantidade: 0,
        saldoMinimo: 0,
        custoUnitario: 0,
        vendaUnitario: 0,
        entradas: 0,
        saidas: 0,
        saldoPedido: 0,
        saldoPedidoValorCusto: 0,
        saldoPedidoValorVenda: 0,
        isLancamento: master?.isLaunch || false,
        hasWinthor: false,
        factoryCode: rawMaterial,
      };
      products.set(internal, product);
    }

    let portfolioSale = 0;
    if (product.hasWinthor !== false && product.custoUnitario > 0 && product.vendaUnitario > 0 && portfolioCost > 0) {
      portfolioSale = portfolioCost * (product.vendaUnitario / product.custoUnitario);
      totalSale += portfolioSale;
    } else if (portfolioCost > 0 || portfolioQty > 0) {
      unresolved += 1;
    }

    product.saldoPedido += portfolioQty;
    product.saldoPedidoValorCusto = (product.saldoPedidoValorCusto || 0) + portfolioCost;
    product.saldoPedidoValorVenda = (product.saldoPedidoValorVenda || 0) + portfolioSale;
  }

  return { cost: totalCost, sale: totalSale, unresolved };
}

export function applyLaunchList(rows: Row[], products: Map<string, StockProduct>, priceList: ReturnType<typeof parsePriceList>): { matched: number; unresolved: number } {
  let matched = 0; let unresolved = 0;
  const productsByEan = new Map(Array.from(products.values()).filter(p => p.ean).map(p => [cleanDigits(p.ean), p]));
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const status = normalizeText(row[4]);
    if (status && status !== 'X' && status !== 'SIM' && status !== 'ATIVO') continue;
    const code = cleanCode(row[0]);
    const ean = cleanDigits(row[3]);
    if (!code && !ean) continue;

    let product = (code && products.get(code)) || (ean && productsByEan.get(ean));
    const master = (ean && priceList.byEan.get(ean)) || (code && priceList.bySku.get(code));

    if (!product && master) {
      const catalogCode = code || master.sku || ean;
      product = {
        codigo: catalogCode,
        descricao: master.description || `Lançamento ${catalogCode}`,
        ean: ean || master.ean || '',
        quantidade: 0,
        saldoMinimo: 0,
        custoUnitario: 0,
        vendaUnitario: 0,
        entradas: 0,
        saidas: 0,
        saldoPedido: 0,
        saldoPedidoValorCusto: 0,
        saldoPedidoValorVenda: 0,
        isLancamento: true,
        hasWinthor: false,
        factoryCode: master.sku || code,
      };
      products.set(catalogCode, product);
      if (product.ean) productsByEan.set(cleanDigits(product.ean), product);
    }

    let found = false;
    if (product) { product.isLancamento = true; found = true; }
    if (master) { master.isLaunch = true; found = true; }
    if (found) matched += 1; else unresolved += 1;
  }
  return { matched, unresolved };
}

export function parseSales(rows: Row[], priceList: ReturnType<typeof parsePriceList>): SalesTransaction[] {
  const transactions: SalesTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]; const statusRaw = normalizeText(row[15]);
    const status = statusRaw === 'FATURADO' ? 'FATURADO' : statusRaw === 'A FATURAR' ? 'A FATURAR' : ''; if (!status) continue;
    const saleType = normalizeText(row[32]); if (saleType && saleType !== 'VENDA') continue;
    const value = parseNumber(row[31]); if (!value) continue;
    const ean = cleanDigits(row[22] || row[23]); const manufacturerCode = cleanCode(row[21]); const description = String(row[25] ?? '').trim();
    const master = priceList.byEan.get(ean) || priceList.bySku.get(manufacturerCode);
    transactions.push({ date: toIsoDate(row[2] || row[12]), status, clientCode: cleanCode(row[3]), clientName: String(row[4] ?? '').trim(), cnpj: cleanDigits(row[5]) || cleanCode(row[3]), city: String(row[7] ?? '').trim(), vendorCode: cleanCode(row[17]), vendorName: String(row[18] ?? '').trim(), supervisorCode: cleanCode(row[19]), supervisorName: String(row[20] ?? '').trim(), manufacturerCode, ean, internalProductCode: cleanCode(row[24]), productDescription: description, cases: parseNumber(row[26]), units: parseNumber(row[27]), value, saleType, line: master?.line || classifyLine(description, master?.category, master?.subcategory) });
  }
  return transactions;
}

export function inventoryToCanonical(products: Map<string, StockProduct>): CanonicalInventoryProduct[] {
  return Array.from(products.values()).map(product => ({ code: product.codigo, description: product.descricao, ean: product.ean, quantity: product.quantidade, costUnit: product.custoUnitario, saleUnit: product.vendaUnitario, pendingQty: product.saldoPedido, pendingCost: product.saldoPedidoValorCusto || 0, pendingSale: product.saldoPedidoValorVenda || 0, isLaunch: Boolean(product.isLancamento), hasWinthor: product.hasWinthor !== false, factoryCode: product.factoryCode || '', physicalCases: product.physicalCases || 0, physicalUnits: product.physicalUnits || 0, grossKg: product.grossKg || 0 }));
}

export function canonicalToInventory(items: CanonicalInventoryProduct[] | undefined): Map<string, StockProduct> {
  const result = new Map<string, StockProduct>();
  (items || []).forEach(item => result.set(item.code, { codigo: item.code, descricao: item.description, ean: item.ean, quantidade: item.quantity, saldoMinimo: 0, custoUnitario: item.costUnit, vendaUnitario: item.saleUnit, entradas: 0, saidas: 0, saldoPedido: item.pendingQty, saldoPedidoValorCusto: item.pendingCost, saldoPedidoValorVenda: item.pendingSale, isLancamento: item.isLaunch, hasWinthor: item.hasWinthor, factoryCode: item.factoryCode, physicalCases: item.physicalCases, physicalUnits: item.physicalUnits, grossKg: item.grossKg }));
  return result;
}

export function refreshTransactionLines(transactions: SalesTransaction[], priceList: ReturnType<typeof parsePriceList>): SalesTransaction[] {
  return transactions.map(tx => { const master = (tx.ean ? priceList.byEan.get(cleanDigits(tx.ean)) : undefined) || (tx.manufacturerCode ? priceList.bySku.get(cleanCode(tx.manufacturerCode)) : undefined); return { ...tx, line: master?.line || classifyLine(tx.productDescription, master?.category || '', master?.subcategory || '') }; });
}

export function mergePriorPhysical(products: Map<string, StockProduct>, prior: Map<string, StockProduct>) {
  const priorByEan = new Map(Array.from(prior.values()).filter(p => p.ean).map(p => [cleanDigits(p.ean), p]));
  products.forEach(product => {
    const old = prior.get(product.codigo) || (product.ean ? priorByEan.get(cleanDigits(product.ean)) : undefined);
    if (!old) return;
    product.physicalCases = old.physicalCases;
    product.physicalUnits = old.physicalUnits;
    product.grossKg = old.grossKg;
    product.isLancamento = Boolean(old.isLancamento) || Boolean(product.isLancamento);
    if (!product.ean && old.ean) product.ean = old.ean;
    if (!product.factoryCode && old.factoryCode) product.factoryCode = old.factoryCode;
  });
  prior.forEach((old, code) => { if (products.has(code)) return; if (!(old.physicalUnits || old.physicalCases || old.grossKg || old.isLancamento) && old.hasWinthor !== false) return; products.set(code, { ...old, quantidade: 0, saldoPedido: 0, saldoPedidoValorCusto: 0, saldoPedidoValorVenda: 0 }); });
}

export function clearPortfolio(products: Map<string, StockProduct>) {
  products.forEach(product => { product.saldoPedido = 0; product.saldoPedidoValorCusto = 0; product.saldoPedidoValorVenda = 0; });
}
