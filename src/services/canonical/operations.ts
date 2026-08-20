import type { CanonicalInventoryProduct } from '../../domain/canonical';
import type { Row, SalesTransaction, StockProduct } from './runtime';
import { canonicalCoordinatorName, cleanCode, cleanDigits, classifyLine, normalizeCnpj, normalizeText, parseNumber, toIsoDate } from './utils';
import { parseCadastro286, parsePriceList } from './support';

function stockHeaderColumns(rows: Row[]) {
  const headerIndex = rows.findIndex(row => {
    const cells = row.map(normalizeText);
    return cells.some(cell => cell === 'CODIGO' || cell === 'COD') && cells.some(cell => cell.includes('DESCR')) && cells.some(cell => cell.includes('VENDA'));
  });
  if (headerIndex < 0) throw new Error('Posição 105: cabeçalho de estoque não reconhecido. O arquivo não foi aplicado.');
  const header = rows[headerIndex].map(normalizeText);
  const find = (predicate: (value: string) => boolean, fallback: number) => { const index = header.findIndex(predicate); return index >= 0 ? index : fallback; };
  return {
    headerIndex,
    code: find(value => value === 'CODIGO' || value === 'COD', 0),
    description: find(value => value.includes('DESCR'), 1),
    quantity: find(value => value === 'ESTOQUE' || value.includes('QTD ESTOQUE') || value.includes('QTDE ESTOQUE') || value === 'SALDO' || value.includes('QTD DISPON') || value.includes('QTDE DISPON'), 8),
    unitsPerCase: find(value => value === 'MASTER' || value.includes('UN/CX') || value.includes('UN CX') || value.includes('QTD CX'), 5),
    cost: find(value => value.includes('CUSTO') && !value.includes('TOTAL'), 10),
    sale: find(value => value.includes('VENDA') && !value.includes('TOTAL'), 14),
  };
}

export function parseStock105(rows: Row[], cadastro: ReturnType<typeof parseCadastro286>): Map<string, StockProduct> {
  const products = new Map<string, StockProduct>();
  const columns = stockHeaderColumns(rows);
  for (let i = columns.headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]; const code = cleanCode(row[columns.code]);
    if (!code || !/^\d+$/.test(code)) continue;
    const cad = cadastro.byInternal.get(code);
    const unitsPerCase = Math.max(parseNumber(row[columns.unitsPerCase]), cad?.unitsPerCase || 0, 0);
    products.set(code, { codigo: code, descricao: String(row[columns.description] ?? '').trim() || cad?.description || '', ean: cad?.ean || '', quantidade: parseNumber(row[columns.quantity]), saldoMinimo: 0, custoUnitario: parseNumber(row[columns.cost]), vendaUnitario: parseNumber(row[columns.sale]), entradas: 0, saidas: 0, saldoPedido: 0, saldoPedidoValorCusto: 0, saldoPedidoValorVenda: 0, isLancamento: false, hasWinthor: true, factoryCode: cad?.factoryCode, unitsPerCase });
  }
  const items = Array.from(products.values());
  const costValue = items.reduce((sum, item) => sum + item.quantidade * item.custoUnitario, 0);
  const saleValue = items.reduce((sum, item) => sum + item.quantidade * item.vendaUnitario, 0);
  const ratio = costValue > 0 ? saleValue / costValue : 0;
  if (products.size < 50 || !Number.isFinite(costValue) || !Number.isFinite(saleValue) || costValue <= 0 || saleValue <= 0 || ratio < 0.5 || ratio > 5) throw new Error(`Posição 105 rejeitada por inconsistência estrutural: ${products.size} item(ns), custo ${costValue.toFixed(2)}, venda ${saleValue.toFixed(2)}. Nenhum valor foi salvo.`);
  return products;
}

export function mergeStock8013(rows: Row[], products: Map<string, StockProduct>, priceList: ReturnType<typeof parsePriceList>) {
  const productsByEan = new Map<string, StockProduct>(); const productsByFactory = new Map<string, StockProduct>();
  products.forEach(product => { const ean = cleanDigits(product.ean); const factory = cleanCode(product.factoryCode); if (ean) productsByEan.set(ean, product); if (factory) productsByFactory.set(factory, product); });
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]; const ean = cleanDigits(row[4]); if (!ean) continue;
    const master = priceList.byEan.get(ean); const existing = productsByEan.get(ean) || (master?.sku ? productsByFactory.get(cleanCode(master.sku)) : undefined);
    if (existing) { existing.physicalCases = parseNumber(row[12]); existing.physicalUnits = parseNumber(row[11]); existing.grossKg = parseNumber(row[13]); if (!existing.ean) existing.ean = ean; if (!existing.unitsPerCase && master?.unitsPerCase) existing.unitsPerCase = master.unitsPerCase; productsByEan.set(ean, existing); continue; }
    let code = master?.sku || `EAN-${ean}`; if (products.has(code)) code = `EAN-${ean}`;
    const product: StockProduct = { codigo: code, descricao: String(row[6] ?? '').trim() || master?.description || '', ean, quantidade: 0, saldoMinimo: 0, custoUnitario: 0, vendaUnitario: 0, entradas: 0, saidas: 0, saldoPedido: 0, saldoPedidoValorCusto: 0, saldoPedidoValorVenda: 0, isLancamento: false, hasWinthor: false, physicalCases: parseNumber(row[12]), physicalUnits: parseNumber(row[11]), grossKg: parseNumber(row[13]), factoryCode: master?.sku, unitsPerCase: master?.unitsPerCase || 0 };
    products.set(code, product); productsByEan.set(ean, product); if (master?.sku) productsByFactory.set(cleanCode(master.sku), product);
  }
}

/** CARTEIRA Colgate: única origem do status SEM WINTHOR. */
export function applyPortfolio(rows: Row[], products: Map<string, StockProduct>, cadastro: ReturnType<typeof parseCadastro286>, priceList: ReturnType<typeof parsePriceList>, saleMarkup: number): { cost: number; sale: number; unresolved: number } {
  let totalCost = 0; let totalSale = 0; let unresolved = 0;
  const productsByEan = new Map<string, StockProduct>(); const productsByFactory = new Map<string, StockProduct>(); const cadastroByEan = new Map<string, string>();
  products.forEach(product => { const ean = cleanDigits(product.ean); const factory = cleanCode(product.factoryCode); if (ean) productsByEan.set(ean, product); if (factory) productsByFactory.set(factory, product); });
  cadastro.byInternal.forEach((item, internalCode) => { const ean = cleanDigits(item.ean); if (ean && !cadastroByEan.has(ean)) cadastroByEan.set(ean, internalCode); });
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]; const orderedQty = Math.max(parseNumber(row[6]), 0); const billedQty = Math.max(parseNumber(row[7]), 0);
    // A precedência Order Qty/Bill Qty já existia no motor; permanece auditada como regra bloqueada até confirmação na planilha.
    const portfolioCases = orderedQty > 0 ? orderedQty : billedQty;
    const portfolioCost = Math.max(parseNumber(row[8]), 0); const rawMaterial = cleanCode(row[4]);
    if (portfolioCases <= 0 && portfolioCost <= 0) continue; totalCost += portfolioCost;
    if (!rawMaterial) { unresolved += 1; continue; }
    const directInternal = cadastro.byInternal.has(rawMaterial) ? rawMaterial : ''; const factoryInternal = cadastro.factoryToInternal.get(rawMaterial) || ''; const preliminaryInternal = directInternal || factoryInternal;
    const preliminaryCad = preliminaryInternal ? cadastro.byInternal.get(preliminaryInternal) : undefined;
    const preliminaryMaster = priceList.bySku.get(rawMaterial) || (preliminaryCad?.ean ? priceList.byEan.get(cleanDigits(preliminaryCad.ean)) : undefined);
    const candidateEan = cleanDigits(preliminaryCad?.ean || preliminaryMaster?.ean || ''); const eanInternal = candidateEan ? (cadastroByEan.get(candidateEan) || '') : ''; const mappedInternal = preliminaryInternal || eanInternal;
    const cad = mappedInternal ? cadastro.byInternal.get(mappedInternal) : undefined;
    const master = priceList.bySku.get(rawMaterial) || (cad?.ean ? priceList.byEan.get(cleanDigits(cad.ean)) : undefined) || (candidateEan ? priceList.byEan.get(candidateEan) : undefined);
    const resolvedEan = cleanDigits(cad?.ean || master?.ean || candidateEan || '');
    let product = (mappedInternal ? products.get(mappedInternal) : undefined) || products.get(rawMaterial) || productsByFactory.get(rawMaterial) || (resolvedEan ? productsByEan.get(resolvedEan) : undefined);
    if (product && mappedInternal) { product.hasWinthor = true; if (!product.ean && cad?.ean) product.ean = cleanDigits(cad.ean); if (!product.factoryCode && cad?.factoryCode) product.factoryCode = cad.factoryCode; }
    if (!product) {
      const code = mappedInternal || `PORTFOLIO-${rawMaterial}`; product = products.get(code);
      if (!product) { const initialUnitsPerCase = Math.max(master?.unitsPerCase || cad?.unitsPerCase || preliminaryCad?.unitsPerCase || 0, 0); product = { codigo: code, descricao: cad?.description || master?.description || `Item da carteira · ${rawMaterial}`, ean: cleanDigits(cad?.ean || master?.ean || ''), quantidade: 0, saldoMinimo: 0, custoUnitario: 0, vendaUnitario: 0, entradas: 0, saidas: 0, saldoPedido: 0, saldoPedidoValorCusto: 0, saldoPedidoValorVenda: 0, isLancamento: Boolean(master?.isLaunch), hasWinthor: Boolean(mappedInternal), factoryCode: cad?.factoryCode || rawMaterial, unitsPerCase: initialUnitsPerCase }; products.set(code, product); productsByFactory.set(rawMaterial, product); if (product.ean) productsByEan.set(cleanDigits(product.ean), product); }
    }
    if (!product) { unresolved += 1; continue; }
    const unitsPerCase = Math.max(master?.unitsPerCase || cad?.unitsPerCase || preliminaryCad?.unitsPerCase || product.unitsPerCase || 0, 0); const portfolioUnits = unitsPerCase > 0 ? portfolioCases * unitsPerCase : 0;
    if (portfolioCases > 0 && unitsPerCase <= 0) unresolved += 1; if (unitsPerCase > 0 && !product.unitsPerCase) product.unitsPerCase = unitsPerCase;
    const portfolioSale = portfolioCost * (1 + Math.max(Number(saleMarkup) || 0, 0)); totalSale += portfolioSale;
    product.saldoPedidoCaixas = (product.saldoPedidoCaixas || 0) + portfolioCases; product.saldoPedido += portfolioUnits; product.saldoPedidoValorCusto = (product.saldoPedidoValorCusto || 0) + portfolioCost; product.saldoPedidoValorVenda = (product.saldoPedidoValorVenda || 0) + portfolioSale; if (!product.factoryCode) product.factoryCode = rawMaterial;
  }
  return { cost: totalCost, sale: totalSale, unresolved };
}

/** Lista oficial carregada: única autoridade para LANÇAMENTO, por EAN. */
export function applyLaunchList(rows: Row[], products: Map<string, StockProduct>, priceList: ReturnType<typeof parsePriceList>): { matched: number; unresolved: number; unique: number } {
  products.forEach(product => { product.isLancamento = false; }); const masters = new Set([...priceList.bySku.values(), ...priceList.byEan.values()]); masters.forEach(master => { master.isLaunch = false; });
  let matched = 0; let unresolved = 0; const seen = new Set<string>(); const productsByEan = new Map(Array.from(products.values()).filter(p => cleanDigits(p.ean)).map(p => [cleanDigits(p.ean), p]));
  const headerIndex = rows.findIndex(row => row.some(cell => normalizeText(cell).includes('EAN'))); const header = headerIndex >= 0 ? rows[headerIndex] : []; const eanColumn = header.findIndex(cell => normalizeText(cell).includes('EAN')); const descriptionColumn = header.findIndex(cell => { const value = normalizeText(cell); return value.includes('DESCR') || value === 'PRODUTO' || value === 'ITEM'; }); const start = headerIndex >= 0 ? headerIndex + 1 : 1;
  for (let i = start; i < rows.length; i++) {
    const row = rows[i]; const ean = cleanDigits(eanColumn >= 0 ? row[eanColumn] : row[3]); if (!ean || seen.has(ean)) continue; seen.add(ean);
    let product = productsByEan.get(ean); const master = priceList.byEan.get(ean); const sourceDescription = descriptionColumn >= 0 ? String(row[descriptionColumn] ?? '').trim() : '';
    if (!product && master) { let catalogCode = master.sku || `EAN-${ean}`; if (products.has(catalogCode)) catalogCode = `EAN-${ean}`; product = { codigo: catalogCode, descricao: master.description || sourceDescription || `Lançamento ${ean}`, ean, quantidade: 0, saldoMinimo: 0, custoUnitario: 0, vendaUnitario: 0, entradas: 0, saidas: 0, saldoPedido: 0, saldoPedidoValorCusto: 0, saldoPedidoValorVenda: 0, isLancamento: true, hasWinthor: false, factoryCode: master.sku, unitsPerCase: master.unitsPerCase || 0 }; products.set(catalogCode, product); productsByEan.set(ean, product); }
    if (!product) { const catalogCode = `EAN-${ean}`; product = { codigo: catalogCode, descricao: sourceDescription || `Lançamento sem cadastro · ${ean}`, ean, quantidade: 0, saldoMinimo: 0, custoUnitario: 0, vendaUnitario: 0, entradas: 0, saidas: 0, saldoPedido: 0, saldoPedidoValorCusto: 0, saldoPedidoValorVenda: 0, isLancamento: true, hasWinthor: false, factoryCode: '', unitsPerCase: 0 }; products.set(catalogCode, product); productsByEan.set(ean, product); unresolved += 1; } else { product.isLancamento = true; matched += 1; }
    if (master) master.isLaunch = true;
  }
  return { matched, unresolved, unique: seen.size };
}

export function parseSales(rows: Row[], priceList: ReturnType<typeof parsePriceList>): SalesTransaction[] {
  const transactions: SalesTransaction[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]; const statusRaw = normalizeText(row[15]); const status = statusRaw === 'FATURADO' ? 'FATURADO' : statusRaw === 'A FATURAR' ? 'A FATURAR' : ''; if (!status) continue;
    const saleType = normalizeText(row[32]); if (saleType && saleType !== 'VENDA') continue; const value = parseNumber(row[31]); if (!value) continue;
    const ean = cleanDigits(row[22] || row[23]); const manufacturerCode = cleanCode(row[21]); const description = String(row[25] ?? '').trim(); const master = priceList.byEan.get(ean) || priceList.bySku.get(manufacturerCode); const normalizedCnpj=normalizeCnpj(row[5]);
    transactions.push({ date: toIsoDate(row[2] || row[12]), status, clientCode: cleanCode(row[3]), clientName: String(row[4] ?? '').trim(), cnpj: normalizedCnpj.canonical || `CLIENTE:${cleanCode(row[3])}`, cnpjRaw: normalizedCnpj.raw, cnpjNormalizationStatus: normalizedCnpj.status, city: String(row[7] ?? '').trim(), vendorCode: cleanCode(row[17]), vendorName: String(row[18] ?? '').trim(), supervisorCode: cleanCode(row[19]), supervisorName: canonicalCoordinatorName(row[20]), manufacturerCode, ean, internalProductCode: cleanCode(row[24]), productDescription: description, cases: parseNumber(row[26]), units: parseNumber(row[27]), value, saleType, line: master?.line || classifyLine(description, master?.category, master?.subcategory) });
  }
  return transactions;
}

export function inventoryToCanonical(products: Map<string, StockProduct>): CanonicalInventoryProduct[] {
  return Array.from(products.values()).map(product => ({ code: product.codigo, description: product.descricao, ean: product.ean, quantity: product.quantidade, costUnit: product.custoUnitario, saleUnit: product.vendaUnitario, pendingQty: product.saldoPedido, pendingCases: product.saldoPedidoCaixas || 0, pendingCost: product.saldoPedidoValorCusto || 0, pendingSale: product.saldoPedidoValorVenda || 0, isLaunch: Boolean(product.isLancamento), hasWinthor: product.hasWinthor !== false, factoryCode: product.factoryCode || '', physicalCases: product.physicalCases || 0, physicalUnits: product.physicalUnits || 0, grossKg: product.grossKg || 0, unitsPerCase: product.unitsPerCase || 0 } as CanonicalInventoryProduct & { unitsPerCase: number }));
}

export function canonicalToInventory(items: CanonicalInventoryProduct[] | undefined): Map<string, StockProduct> {
  const result = new Map<string, StockProduct>();
  (items || []).forEach(item => result.set(item.code, { codigo: item.code, descricao: item.description, ean: item.ean, quantidade: item.quantity, saldoMinimo: 0, custoUnitario: item.costUnit, vendaUnitario: item.saleUnit, entradas: 0, saidas: 0, saldoPedido: item.pendingQty, saldoPedidoCaixas: item.pendingCases || 0, saldoPedidoValorCusto: item.pendingCost, saldoPedidoValorVenda: item.pendingSale, isLancamento: item.isLaunch, hasWinthor: item.hasWinthor, factoryCode: item.factoryCode, physicalCases: item.physicalCases, physicalUnits: item.physicalUnits, grossKg: item.grossKg, unitsPerCase: (item as CanonicalInventoryProduct & { unitsPerCase?: number }).unitsPerCase || 0 }));
  return result;
}

export function refreshTransactionLines(transactions: SalesTransaction[], priceList: ReturnType<typeof parsePriceList>): SalesTransaction[] {
  return transactions.map(tx => { const master = (tx.ean ? priceList.byEan.get(cleanDigits(tx.ean)) : undefined) || (tx.manufacturerCode ? priceList.bySku.get(cleanCode(tx.manufacturerCode)) : undefined); return { ...tx, line: master?.line || classifyLine(tx.productDescription, master?.category || '', master?.subcategory || '') }; });
}

export function mergePriorPhysical(products: Map<string, StockProduct>, prior: Map<string, StockProduct>) {
  const priorByEan = new Map(Array.from(prior.values()).filter(p => p.ean).map(p => [cleanDigits(p.ean), p]));
  products.forEach(product => { const old = prior.get(product.codigo) || (product.ean ? priorByEan.get(cleanDigits(product.ean)) : undefined); if (!old) return; product.physicalCases = old.physicalCases; product.physicalUnits = old.physicalUnits; product.grossKg = old.grossKg; product.isLancamento = Boolean(old.isLancamento) || Boolean(product.isLancamento); if (!product.ean && old.ean) product.ean = old.ean; if (!product.factoryCode && old.factoryCode) product.factoryCode = old.factoryCode; if (!product.unitsPerCase && old.unitsPerCase) product.unitsPerCase = old.unitsPerCase; });
  prior.forEach((old, code) => { if (products.has(code)) return; if (!(old.physicalUnits || old.physicalCases || old.grossKg || old.isLancamento) && old.hasWinthor !== false) return; products.set(code, { ...old, quantidade: 0, saldoPedido: 0, saldoPedidoCaixas: 0, saldoPedidoValorCusto: 0, saldoPedidoValorVenda: 0 }); });
}

export function clearPortfolio(products: Map<string, StockProduct>) {
  for (const [code, product] of products.entries()) { if (code.startsWith('PORTFOLIO-')) { products.delete(code); continue; } product.saldoPedido = 0; product.saldoPedidoCaixas = 0; product.saldoPedidoValorCusto = 0; product.saldoPedidoValorVenda = 0; }
}
