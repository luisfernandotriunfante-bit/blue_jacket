import type * as XLSX from 'xlsx';
import type { MetricasEstoque, ProdutoEstoque, SellOutData } from '../store/DataContext';
import type { CanonicalState, CanonicalSupportData, ManualConfiguration, SourceAudit, SourceKind } from '../domain/canonical';
import { DEFAULT_MANUAL_CONFIGURATION, EMPTY_CANONICAL_SUPPORT } from '../domain/canonical';
import type { CompassTarget, PremiseClient, ProductMaster, RcaMap, RouteStore, Row, SalesTransaction } from './canonical/runtime';
import { detectSource, readWorkbook, sheetRows, cleanCode, cleanDigits, normalizeText } from './canonical/utils';
import { parseActiveRoute, parseCadastro286, parseCompassTargets, parseLegacyNetworkTargets, parsePremises, parsePriceList, parseRcaMap } from './canonical/support';
import { applyLaunchList, applyPortfolio, canonicalToInventory, clearPortfolio, inventoryToCanonical, mergePriorPhysical, mergeStock8013, parseSales, parseStock105, refreshTransactionLines } from './canonical/operations';
import { buildClients, buildCoordinators, buildDaily, buildLines, buildNetworks, buildVendorResults, businessDayStats, legacySellOut, periodBounds } from './canonical/aggregate';

export interface CanonicalProcessResult { canonical: CanonicalState; sellOut: SellOutData; produtos: ProdutoEstoque[]; metricas: MetricasEstoque; }

export async function processCanonicalFiles(files: File[], config: ManualConfiguration = DEFAULT_MANUAL_CONFIGURATION, previousState: CanonicalState | null = null): Promise<CanonicalProcessResult> {
  const warnings: string[] = []; const sources: SourceAudit[] = [];
  const workbooks = new Map<SourceKind, { file: File; workbook: XLSX.WorkBook; rows: Row[] }>();
  let launchRows: Row[] | null = null;

  for (const file of files) {
    const normalizedName = normalizeText(file.name);
    const isLaunchFile = normalizedName.includes('LANCAMENTO');
    const kind = isLaunchFile ? 'unknown' : detectSource(file.name);
    try {
      const workbook = await readWorkbook(file, kind);
      const rows = sheetRows(workbook);
      if (isLaunchFile) {
        launchRows = rows;
        sources.push({ kind: 'unknown', fileName: file.name, loaded: true, rows: rows.length, note: 'Lista oficial de lançamentos.' });
      } else {
        sources.push({ kind, fileName: file.name, loaded: true, rows: rows.length });
        if (kind !== 'unknown') workbooks.set(kind, { file, workbook, rows });
        else sources[sources.length - 1].note = 'Arquivo não utilizado pelo motor canônico.';
      }
    } catch (error) {
      sources.push({ kind, fileName: file.name, loaded: false, rows: 0, note: error instanceof Error ? error.message : 'Falha de leitura' });
    }
  }

  const previousSupport = previousState?.support || EMPTY_CANONICAL_SUPPORT;
  const priorProductList = previousSupport.products || [];
  const priorPriceList = { bySku: new Map(priorProductList.filter(p => p.sku).map(p => [p.sku, p as ProductMaster])), byEan: new Map(priorProductList.filter(p => p.ean).map(p => [p.ean, p as ProductMaster])) };
  const priceList = workbooks.has('priceList') ? parsePriceList(workbooks.get('priceList')!.rows) : priorPriceList;
  const priorItems = previousSupport.itemCodes || [];
  const priorCadastro = { byInternal: new Map(priorItems.map(item => [item.internalCode, { description: item.description, ean: item.ean, factoryCode: item.factoryCode }])), factoryToInternal: new Map(priorItems.filter(item => item.factoryCode).map(item => [item.factoryCode, item.internalCode])) };
  const cadastro = workbooks.has('items286') ? parseCadastro286(workbooks.get('items286')!.rows) : priorCadastro;

  const rcas = workbooks.has('rcaMap') ? parseRcaMap(workbooks.get('rcaMap')!.rows) : (previousSupport.rcas || []) as RcaMap[];
  const rcaByNew = new Map(rcas.map(r => [r.newCode, r])); const rcaByOld = new Map(rcas.filter(r => r.oldCode).map(r => [r.oldCode, r]));
  const targets = workbooks.has('compassTargets') ? parseCompassTargets(workbooks.get('compassTargets')!.workbook) : (previousSupport.vendorTargets || []) as CompassTarget[];
  const premises = workbooks.has('premises') ? parsePremises(workbooks.get('premises')!.rows) : (previousSupport.clients || []) as PremiseClient[];
  const premisesByCnpj = new Map(premises.map(p => [p.cnpj, p]));
  const routeStores = workbooks.has('activeRoute') ? parseActiveRoute(workbooks.get('activeRoute')!.workbook) : (previousSupport.activeRoute || []) as RouteStore[];
  const detectedNetworkTargets = workbooks.has('legacyTopNetworks') ? parseLegacyNetworkTargets(workbooks.get('legacyTopNetworks')!.workbook) : new Map<string, number>(Object.entries(previousSupport.legacyNetworkTargets || {}));

  const priorTransactions = (previousState?.transactions || []) as SalesTransaction[];
  const transactions = refreshTransactionLines(workbooks.has('sales8022') ? parseSales(workbooks.get('sales8022')!.rows, priceList) : priorTransactions, priceList);
  if (!transactions.length) warnings.push('Vendas 8022 não carregadas ou sem movimentos válidos; Sell Out ficará zerado.');
  if (!targets.length) warnings.push('Bússola de Metas não carregada; metas de indústria, vendedores e positivação ficarão zeradas.');
  if (!premises.length) warnings.push('Base de Premissas não carregada; consolidação por rede ficará limitada.');
  if (!rcas.length) warnings.push('NOVOS RCAS não carregado; o de-para entre códigos novos e antigos não será aplicado.');

  const maxDate = transactions.map(t => t.date).filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0, 10);
  const { start: periodStart, end: periodEnd } = periodBounds(maxDate); const business = businessDayStats(maxDate, config.holidays);
  const industryTarget = targets.reduce((s, t) => s + t.salesTarget, 0); const industryPositivityTarget = targets.reduce((s, t) => s + t.positivityTarget, 0);
  const clients = buildClients(transactions, premisesByCnpj); const vendors = buildVendorResults(transactions, rcaByNew, rcaByOld, targets, business); const coordinators = buildCoordinators(vendors); const networks = buildNetworks(transactions, premisesByCnpj, routeStores, detectedNetworkTargets); const lines = buildLines(transactions); const daily = buildDaily(transactions);

  const priorInventory = canonicalToInventory(previousState?.inventory);
  let products = workbooks.has('stock105') ? parseStock105(workbooks.get('stock105')!.rows, cadastro) : canonicalToInventory(previousState?.inventory);
  if (workbooks.has('stock105')) mergePriorPhysical(products, priorInventory);
  if (workbooks.has('stock8013')) mergeStock8013(workbooks.get('stock8013')!.rows, products, priceList);

  let portfolio = { cost: previousState?.stock.pendingPurchaseCost || 0, sale: previousState?.stock.pendingPurchaseSale || 0, unresolved: 0 };
  if (workbooks.has('purchasePortfolio')) { clearPortfolio(products); portfolio = applyPortfolio(workbooks.get('purchasePortfolio')!.rows, products, cadastro, priceList); }
  if (portfolio.unresolved > 0) warnings.push(`${portfolio.unresolved} linha(s) da carteira não puderam ser valorizadas a preço de venda.`);

  if (launchRows) {
    const launchResult = applyLaunchList(launchRows, products, priceList);
    if (launchResult.unresolved > 0) warnings.push(`${launchResult.unresolved} lançamento(s) único(s) da lista oficial não foram encontrados no estoque nem na Lista de Preço.`);
    const launchSource = sources.find(source => source.note === 'Lista oficial de lançamentos.');
    if (launchSource) launchSource.note = `Lista oficial de lançamentos: ${launchResult.unique} item(ns) único(s), ${launchResult.matched} conciliado(s).`;
  } else {
    // Sem nova lista, reaproveitamos a classificação oficial persistida da carga anterior.
    products.forEach(product => {
      const master = (product.ean ? priceList.byEan.get(cleanDigits(product.ean)) : undefined) || (product.factoryCode ? priceList.bySku.get(cleanCode(product.factoryCode)) : undefined);
      if (master?.isLaunch) product.isLancamento = true;
    });
  }

  const productArray = Array.from(products.values());
  const stockCost = productArray.reduce((s, p) => s + p.quantidade * p.custoUnitario, 0); const stockSale = productArray.reduce((s, p) => s + p.quantidade * p.vendaUnitario, 0);
  const physicalUnits = productArray.reduce((s, p) => s + (p.physicalUnits ?? p.quantidade), 0); const physicalCases = productArray.reduce((s, p) => s + (p.physicalCases ?? 0), 0); const grossKg = productArray.reduce((s, p) => s + (p.grossKg ?? 0), 0);
  const invoiced = transactions.filter(t => t.status === 'FATURADO').reduce((s, t) => s + t.value, 0); const toInvoice = transactions.filter(t => t.status === 'A FATURAR').reduce((s, t) => s + t.value, 0); const total = invoiced + toInvoice;
  const invClients = new Set(transactions.filter(t => t.status === 'FATURADO').map(t => t.cnpj)); const allClients = new Set(transactions.map(t => t.cnpj)); const futurePositivation = Math.max(allClients.size - invClients.size, 0);
  const invDailyAverage = business.elapsed > 0 ? invoiced / business.elapsed : 0; const totalDailyAverage = business.elapsed > 0 ? total / business.elapsed : 0;
  const coverageCurrent = 0; const coverageProjected = 0;
  if (stockSale > 0 || stockCost > 0) warnings.push('Cobertura de estoque aguardando histórico: a regra validada é Estoque ÷ Sell Out médio dos 3 meses fechados × 30. O 8022 parcial não substitui essa base.');

  const support: CanonicalSupportData = { rcas: rcas.map(r => ({ ...r })), vendorTargets: targets.map(t => ({ ...t })), clients: premises.map(p => ({ ...p })), activeRoute: routeStores.map(r => ({ ...r })), legacyNetworkTargets: Object.fromEntries(detectedNetworkTargets.entries()), products: Array.from(priceList.bySku.values()).map(p => ({ ...p })), itemCodes: Array.from(cadastro.byInternal.entries()).map(([internalCode, item]) => ({ internalCode, ...item })) };
  const sellOutTarget = Math.max(config.sellOutTarget || 0, 0);
  const canonical: CanonicalState = {
    schemaVersion: 2, generatedAt: new Date().toISOString(), referenceDate: maxDate, periodStart, periodEnd, sources, support,
    transactions: transactions.map(tx => ({ ...tx })), inventory: inventoryToCanonical(products), daily, industryTarget, industryPositivityTarget,
    sellOut: { invoiced, toInvoice, total, sellOutTarget, attainment: sellOutTarget > 0 ? total / sellOutTarget : 0, invoicedPositivation: invClients.size, futurePositivation, totalPositivation: invClients.size + futurePositivation, industryPositivityTarget, positivityAttainment: industryPositivityTarget > 0 ? (invClients.size + futurePositivation) / industryPositivityTarget : 0, ticketAverage: invClients.size > 0 ? invoiced / invClients.size : 0, businessDaysTotal: business.total, businessDaysElapsed: business.elapsed, businessDaysRemaining: business.remaining, invoicedDailyAverage: invDailyAverage, totalDailyAverage: totalDailyAverage, neededDailyAverage: business.remaining > 0 ? Math.max(sellOutTarget - total, 0) / business.remaining : Math.max(sellOutTarget - total, 0), invoicedTrend: business.elapsed > 0 ? invDailyAverage * business.total : 0, totalTrend: business.elapsed > 0 ? totalDailyAverage * business.total : 0 },
    stock: { costValue: stockCost, saleValue: stockSale, pendingPurchaseCost: portfolio.cost, pendingPurchaseSale: portfolio.sale, projectedCostValue: stockCost + portfolio.cost, projectedSaleValue: stockSale + portfolio.sale, physicalUnits, physicalCases, grossKg, coverageCurrentDays: Math.round(coverageCurrent), coverageProjectedDays: Math.round(coverageProjected), coverageTargetDays: config.coverageTargetDays },
    vendors, coordinators, clients,
    networks: networks.map(n => { const manual = config.networkTargets[n.key]; const target = Number.isFinite(manual) ? Math.max(manual, 0) : n.detectedNetworkTarget; return { ...n, networkTarget: target, networkAttainment: target > 0 ? n.total / target : 0, gapToNetworkTarget: Math.max(target - n.total, 0) }; }),
    lines: lines.map(line => { const share = config.lineShares[line.name] ?? line.share; const target = sellOutTarget * share; return { ...line, share, target, attainment: target > 0 ? line.total / target : 0 }; }), warnings,
  };
  const legacy = legacySellOut(transactions, vendors, clients);
  const metricas: MetricasEstoque = { valorEstoqueCompra: stockCost, valorEstoqueVenda: stockSale, saldoPedidoCusto: portfolio.cost, saldoPedidoVenda: portfolio.sale, coberturaDiasAtual: canonical.stock.coverageCurrentDays, coberturaEstoqueMaisSaldo: canonical.stock.coverageProjectedDays, produtosRuptura: productArray.filter(p => p.quantidade <= 0).length, metaCobertura: config.coverageTargetDays };
  return { canonical, sellOut: legacy, produtos: productArray, metricas };
}
