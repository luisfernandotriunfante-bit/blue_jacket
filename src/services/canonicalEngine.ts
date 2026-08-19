import type * as XLSX from 'xlsx';
import type { MetricasEstoque, ProdutoEstoque, SellOutData } from '../store/DataContext';
import type { CanonicalHistoryMonth, CanonicalState, CanonicalSupportData, ManualConfiguration, SourceAudit, SourceKind } from '../domain/canonical';
import { DEFAULT_MANUAL_CONFIGURATION, EMPTY_CANONICAL_SUPPORT } from '../domain/canonical';
import type { CompassTarget, PremiseClient, ProductMaster, RcaMap, ReferenceClientNetwork, RouteStore, Row, SalesTransaction } from './canonical/runtime';
import { detectSource, readWorkbook, sheetRows } from './canonical/utils';
import { parseActiveRoute, parseCadastro286, parseCompassTargets, parseLegacyClientNetworkRecords, parseLegacyClientOwners, parseLegacyNetworkOwners, parseLegacyNetworkTargets, parsePremises, parsePriceList, parseRcaMap } from './canonical/support';
import { applyLaunchList, applyPortfolio, canonicalToInventory, clearPortfolio, inventoryToCanonical, mergePriorPhysical, mergeStock8013, parseSales, parseStock105, refreshTransactionLines } from './canonical/operations';
import { buildClients, buildCoordinators, buildDaily, buildLines, buildNetworks, businessDayStats, legacySellOut, periodBounds } from './canonical/aggregate';
import { buildHistorySummary, mergeHistoryMonths, parse379History } from './canonical/history';
import { blockedCheck, numericCheck, reconcileNetworkAssignments } from './canonical/reconciliation';
import { buildRelationshipContext } from './canonical/relationships';
import { auditRawSales8022, buildVendorResultsWithValidatedPositivity, summarizeTransactionPositivity } from './canonical/salesAudit';

export interface CanonicalProcessResult { canonical: CanonicalState; sellOut: SellOutData; produtos: ProdutoEstoque[]; metricas: MetricasEstoque; }

function auditKey(source: SourceAudit): string { return source.kind === 'unknown' ? `unknown:${source.fileName}` : source.kind; }
function mergeSourceAudits(previous: SourceAudit[] = [], incoming: SourceAudit[] = []): SourceAudit[] {
  const merged = new Map(previous.map(source => [auditKey(source), source]));
  incoming.forEach(source => merged.set(auditKey(source), source));
  return Array.from(merged.values());
}

async function readTextFile(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  try { return new TextDecoder('windows-1252').decode(data); } catch { return new TextDecoder().decode(data); }
}

export async function processCanonicalFiles(files: File[], config: ManualConfiguration = DEFAULT_MANUAL_CONFIGURATION, previousState: CanonicalState | null = null): Promise<CanonicalProcessResult> {
  const warnings: string[] = [];
  const currentSources: SourceAudit[] = [];
  const workbooks = new Map<SourceKind, { file: File; workbook: XLSX.WorkBook; rows: Row[] }>();
  let launchRows: Row[] | null = null;
  let incomingHistory: CanonicalHistoryMonth[] = [];
  const processedAt = new Date().toISOString();

  for (const file of files) {
    const kind = detectSource(file.name);
    const auditBase: SourceAudit = { kind, fileName: file.name, loaded: true, rows: 0, updatedAt: processedAt, fileModifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined };
    try {
      if (kind === 'history379_2025' || kind === 'history379_2026') {
        const text = await readTextFile(file);
        const parsed = parse379History(text);
        incomingHistory = mergeHistoryMonths(incomingHistory, parsed);
        currentSources.push({ ...auditBase, rows: parsed.length, note: `Histórico 379: ${parsed.length} mês(es) fechado(s) identificado(s).` });
        continue;
      }

      const workbook = await readWorkbook(file, kind);
      const rows = sheetRows(workbook);
      if (kind === 'launchList') {
        launchRows = rows;
        currentSources.push({ ...auditBase, rows: rows.length, note: 'Lista oficial de lançamentos por EAN.' });
      } else {
        currentSources.push({ ...auditBase, rows: rows.length, ...(kind === 'unknown' ? { note: 'Arquivo não utilizado pelo motor canônico.' } : {}) });
        if (kind !== 'unknown') workbooks.set(kind, { file, workbook, rows });
      }
    } catch (error) {
      currentSources.push({ ...auditBase, loaded: false, rows: 0, note: error instanceof Error ? error.message : 'Falha de leitura' });
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
  const routeStores = workbooks.has('activeRoute') ? parseActiveRoute(workbooks.get('activeRoute')!.workbook) : (previousSupport.activeRoute || []) as RouteStore[];
  const detectedNetworkTargets = workbooks.has('legacyTopNetworks') ? parseLegacyNetworkTargets(workbooks.get('legacyTopNetworks')!.workbook) : new Map<string, number>(Object.entries(previousSupport.legacyNetworkTargets || {}));
  const detectedNetworkOwners = workbooks.has('legacyTopNetworks') ? parseLegacyNetworkOwners(workbooks.get('legacyTopNetworks')!.workbook) : new Map<string, {teamCode:string;vendorCode:string}>(Object.entries(previousSupport.legacyNetworkOwners || {}));
  const referenceNetworkRecords:ReferenceClientNetwork[] = workbooks.has('legacyTopNetworks') ? parseLegacyClientNetworkRecords(workbooks.get('legacyTopNetworks')!.workbook) : Object.entries(previousSupport.legacyClientNetworks || {}).map(([cnpj,network])=>({cnpj,cnpjRaw:cnpj,network}));
  const detectedClientOwners = workbooks.has('legacyTopNetworks') ? parseLegacyClientOwners(workbooks.get('legacyTopNetworks')!.workbook) : new Map<string, {teamCode:string;vendorCode:string}>(Object.entries(previousSupport.legacyClientOwners || {}));
  if (!detectedNetworkTargets.size && routeStores.some(store => store.target > 0)) warnings.push('TOP REDES de referência não carregado; a Meta Redes foi preenchida provisoriamente com a Meta Tops do Roteiro Ativo.');

  const priorTransactions = (previousState?.transactions || []) as SalesTransaction[];
  const transactions = refreshTransactionLines(workbooks.has('sales8022') ? parseSales(workbooks.get('sales8022')!.rows, priceList) : priorTransactions, priceList);
  const relationships=buildRelationshipContext(transactions,premises,routeStores,referenceNetworkRecords);
  const premisesByCnpj=relationships.premisesByCnpj;
  const resolvedRouteStores=Array.from(relationships.routeByCnpj.values());
  const detectedClientNetworks=relationships.referenceNetworks;
  const resolvedPremises=Array.from(premisesByCnpj.values());
  if (!transactions.length) warnings.push('Vendas 8022 não carregadas ou sem movimentos válidos; Sell Out ficará zerado.');
  if (!targets.length) warnings.push('Bússola de Metas não carregada; metas de indústria, vendedores e positivação ficarão zeradas.');
  if (!premises.length) warnings.push('Base de Premissas não carregada; consolidação por rede ficará limitada.');
  if (!rcas.length) warnings.push('NOVOS RCAS não carregado; o de-para entre códigos novos e antigos não será aplicado.');

  const maxDate = transactions.map(t => t.date).filter(Boolean).sort().at(-1) || previousState?.referenceDate || new Date().toISOString().slice(0, 10);
  const { start: periodStart, end: periodEnd } = periodBounds(maxDate); const business = businessDayStats(maxDate, config.holidays);
  const industryTarget = targets.reduce((s, t) => s + t.salesTarget, 0); const industryPositivityTarget = targets.reduce((s, t) => s + t.positivityTarget, 0);
  const clients = buildClients(transactions, premisesByCnpj, resolvedRouteStores, detectedClientNetworks);
  const vendors = buildVendorResultsWithValidatedPositivity(transactions, rcaByNew, rcaByOld, targets, business);
  const coordinators = buildCoordinators(vendors);
  const networks = buildNetworks(transactions, premisesByCnpj, resolvedRouteStores, detectedNetworkTargets, detectedNetworkOwners, detectedClientOwners, detectedClientNetworks);
  const lines = buildLines(transactions);
  const daily = buildDaily(transactions,periodStart,periodEnd);

  const priorInventory = canonicalToInventory(previousState?.inventory);
  let products = workbooks.has('stock105') ? parseStock105(workbooks.get('stock105')!.rows, cadastro) : canonicalToInventory(previousState?.inventory);

  // Uma carga conjunta 105 + 8013 é um snapshot novo do estoque. Nesse cenário
  // não podemos recolocar produtos antigos do localStorage depois de reconstruir a
  // base, pois isso perpetua duplicidades e classificações corrompidas.
  if (workbooks.has('stock105') && !workbooks.has('stock8013')) mergePriorPhysical(products, priorInventory);
  if (workbooks.has('stock8013')) mergeStock8013(workbooks.get('stock8013')!.rows, products, priceList);

  let portfolio = { cost: previousState?.stock.pendingPurchaseCost || 0, sale: previousState?.stock.pendingPurchaseSale || 0, unresolved: 0 };
  if (workbooks.has('purchasePortfolio')) { clearPortfolio(products); portfolio = applyPortfolio(workbooks.get('purchasePortfolio')!.rows, products, cadastro, priceList, config.portfolioSaleMarkup); }
  if (portfolio.unresolved > 0) warnings.push(`${portfolio.unresolved} linha(s) da carteira não possuem fator Un/CX na Lista de Preços e ficaram sem conversão de caixas para unidades.`);

  if (launchRows) {
    const launchResult = applyLaunchList(launchRows, products, priceList);
    if (launchResult.unresolved > 0) warnings.push(`${launchResult.unresolved} EAN(s) da lista oficial de lançamentos ainda não possuem conciliação completa no Winthor/estoque.`);
    const launchSource = currentSources.find(source => source.kind === 'launchList');
    if (launchSource) launchSource.note = `Lista oficial por EAN: ${launchResult.unique} EAN(s) único(s), ${launchResult.matched} conciliado(s), ${launchResult.unresolved} pendente(s).`;
  }

  const historyMonths = mergeHistoryMonths(previousState?.history?.months || [], incomingHistory);
  const history = buildHistorySummary(maxDate, historyMonths);

  const productArray = Array.from(products.values());
  const stockCost = productArray.reduce((s, p) => s + p.quantidade * p.custoUnitario, 0); const stockSale = productArray.reduce((s, p) => s + p.quantidade * p.vendaUnitario, 0);
  const physicalUnits = productArray.reduce((s, p) => s + (p.physicalUnits ?? p.quantidade), 0); const physicalCases = productArray.reduce((s, p) => s + (p.physicalCases ?? 0), 0); const grossKg = productArray.reduce((s, p) => s + (p.grossKg ?? 0), 0);
  const invoiced = transactions.filter(t => t.status === 'FATURADO').reduce((s, t) => s + t.value, 0); const toInvoice = transactions.filter(t => t.status === 'A FATURAR').reduce((s, t) => s + t.value, 0); const total = invoiced + toInvoice;
  const transactionIdentifiers = new Set(transactions.map(t => t.cnpj));
  const positivity = summarizeTransactionPositivity(transactions);
  const invDailyAverage = business.elapsed > 0 ? invoiced / business.elapsed : 0; const totalDailyAverage = business.elapsed > 0 ? total / business.elapsed : 0;

  const networkAssignments = reconcileNetworkAssignments(transactions,premisesByCnpj,resolvedRouteStores,detectedClientNetworks,relationships.referenceByCnpj);
  const sourceSales = workbooks.has('sales8022') ? auditRawSales8022(workbooks.get('sales8022')!.rows) : null;
  const networkTotal = networks.reduce((sum,network)=>sum+network.total,0);
  const vendorTotal = vendors.reduce((sum,vendor)=>sum+vendor.total,0);
  const coordinatorTotal = coordinators.reduce((sum,coordinator)=>sum+coordinator.total,0);
  const clientTotal = clients.reduce((sum,client)=>sum+client.total,0);
  const classifiedLineTotal = lines.reduce((sum,line)=>sum+line.total,0);
  const unclassifiedLineTotal = transactions.filter(transaction=>!transaction.line).reduce((sum,transaction)=>sum+transaction.value,0);
  const transactionCases = transactions.reduce((sum,transaction)=>sum+transaction.cases,0);
  const transactionUnits = transactions.reduce((sum,transaction)=>sum+transaction.units,0);
  const reconciliationChecks = [
    numericCheck({id:'sellout.internal',level:'INTERNAL',label:'Sell Out = Faturado + A Faturar',expected:invoiced+toInvoice,calculated:total,source:'Base canônica',tolerance:0.005}),
    ...(sourceSales ? [
      numericCheck({id:'sellout.source.invoiced',level:'SOURCE',label:'Faturado 8022 → motor',expected:sourceSales.invoiced,calculated:invoiced,source:'Vendas 8022',tolerance:0.005,note:`${sourceSales.validRows} linha(s) válida(s); ${sourceSales.ignoredRows} ignorada(s): ${sourceSales.ignoredStatus} status, ${sourceSales.ignoredSaleType} tipo de venda, ${sourceSales.ignoredZeroValue} valor zero.`}),
      numericCheck({id:'sellout.source.toInvoice',level:'SOURCE',label:'A Faturar 8022 → motor',expected:sourceSales.toInvoice,calculated:toInvoice,source:'Vendas 8022',tolerance:0.005}),
      numericCheck({id:'sellout.source.total',level:'SOURCE',label:'Sell Out 8022 → motor',expected:sourceSales.total,calculated:total,source:'Vendas 8022',tolerance:0.005}),
      numericCheck({id:'sellout.source.cases',level:'SOURCE',label:'Caixas 8022 → motor',expected:sourceSales.cases,calculated:transactionCases,source:'Vendas 8022',tolerance:0.000001}),
      numericCheck({id:'sellout.source.units',level:'SOURCE',label:'Unidades 8022 → motor',expected:sourceSales.units,calculated:transactionUnits,source:'Vendas 8022',tolerance:0.000001}),
      numericCheck({id:'sellout.source.valid-cnpjs',level:'SOURCE',label:'CNPJs válidos únicos 8022 → positivação',expected:sourceSales.validCnpjs,calculated:positivity.validCnpjs,source:'Vendas 8022',tolerance:0}),
      numericCheck({id:'positivity.source.invoiced',level:'SOURCE',label:'Positivação faturada 8022 → motor',expected:sourceSales.invoicedPositivation,calculated:positivity.invoiced,source:'Vendas 8022',tolerance:0}),
      numericCheck({id:'positivity.source.future',level:'SOURCE',label:'Positivação adicional a faturar 8022 → motor',expected:sourceSales.futurePositivation,calculated:positivity.future,source:'Vendas 8022',tolerance:0}),
      numericCheck({id:'sellout.source.invalid-cnpj',level:'SOURCE',label:'Linhas de venda com CNPJ inválido/ambíguo',expected:0,calculated:sourceSales.invalidOrAmbiguousCnpjRows,source:'Vendas 8022',tolerance:0,note:'O valor continua no Sell Out, mas identificadores inválidos/CPF não entram em positivação.'}),
    ] : []),
    numericCheck({id:'sellout.networks',level:'INTERNAL',label:'Sell Out = soma das redes + Sem Rede',expected:total,calculated:networkTotal,source:'Atribuição CNPJ → rede',tolerance:0.005}),
    numericCheck({id:'sellout.clients',level:'INTERNAL',label:'Sell Out = soma dos clientes',expected:total,calculated:clientTotal,source:'Clientes canônicos',tolerance:0.005}),
    numericCheck({id:'relationships.sales-cnpjs',level:'SOURCE',label:'Identificadores únicos do 8022 = relacionamentos auditados',expected:transactionIdentifiers.size,calculated:networkAssignments.length,source:'8022 × Premissas × Roteiro × referência',tolerance:0}),
    numericCheck({id:'relationships.ambiguous-cnpjs',level:'SOURCE',label:'CNPJs inválidos ou ambíguos nas fontes de relacionamento',expected:0,calculated:relationships.audit.sourceSummaries.reduce((sum,item)=>sum+item.cpfOrAmbiguous+item.invalidLength,0),source:'8022 / Premissas / Roteiro / referência',tolerance:0}),
    numericCheck({id:'relationships.network-conflicts',level:'SOURCE',label:'Conflitos de rede dentro da mesma fonte',expected:0,calculated:relationships.audit.networkConflicts.length,source:'Premissas / Roteiro / referência',tolerance:0}),
    numericCheck({id:'sellout.vendors',level:'INTERNAL',label:'Sell Out = soma dos vendedores + Não Classificado',expected:total,calculated:vendorTotal,source:'Vendas por RCA',tolerance:0.005}),
    numericCheck({id:'sellout.coordinators',level:'INTERNAL',label:'Vendedores = soma das coordenações',expected:vendorTotal,calculated:coordinatorTotal,source:'De-para RCA',tolerance:0.005}),
    numericCheck({id:'sellout.lines',level:'INTERNAL',label:'Sell Out = linhas classificadas + Não Classificado',expected:total,calculated:classifiedLineTotal+unclassifiedLineTotal,source:'Classificação de produtos',tolerance:0.005,note:`Não Classificado: R$ ${unclassifiedLineTotal.toFixed(2)}.`}),
    numericCheck({id:'sellout.lines.unclassified',level:'INTERNAL',label:'Venda sem linha comercial classificada',expected:0,calculated:unclassifiedLineTotal,source:'Classificação de produtos',tolerance:0.005,note:'Qualquer valor não classificado permanece explícito e não é descartado.'}),
    numericCheck({id:'positivity.internal',level:'INTERNAL',label:'Positivação = faturada + adicional a faturar',expected:positivity.total,calculated:positivity.invoiced+positivity.future,source:'CNPJs válidos únicos do 8022',tolerance:0}),
    blockedCheck('portfolio.order-bill','Carteira: regra Order Qty versus Bill Qty','Planilha com fórmulas','BLOQUEADA POR REGRA NÃO CONFIRMADA: a precedência entre Order Qty e Bill Qty ainda precisa ser demonstrada na planilha.'),
    numericCheck({id:'portfolio.sale-markup',level:'SPREADSHEET',label:'Carteira: acréscimo custo → venda',expected:0.31530488350705,calculated:config.portfolioSaleMarkup,source:"Painel fórmula · '2026-MILENIO'!L24",tolerance:1e-12,note:'L24 é uma entrada numérica fixa na referência; L21 aplica L28*(1+L24). Alterações manuais permanecem visíveis como divergência de regressão.'}),
    blockedCheck('stock.coverage','Cobertura de estoque por produto','Planilha com fórmulas','BLOQUEADA POR REGRA NÃO CONFIRMADA: a cobertura financeira total já está mapeada nas células L20/L27/L30; ainda falta localizar e confirmar a regra por produto e a coluna de estoque mínimo para Ruptura/Risco de Ruptura.'),
  ];
  reconciliationChecks.filter(check=>check.status==='DIVERGENT').forEach(check=>warnings.push(`Reconciliação divergente: ${check.label}. Diferença ${check.difference}.`));
  const divergentNetworks=networkAssignments.filter(item=>item.divergentSources.length>0);
  if(divergentNetworks.length)warnings.push(`${divergentNetworks.length} CNPJ(s) possuem divergência de rede entre Premissas, Roteiro ou referência; Premissas foi mantida como fonte principal.`);
  const withoutNetwork=networkAssignments.filter(item=>item.source==='SEM_REDE');
  if(withoutNetwork.length){const value=withoutNetwork.reduce((sum,item)=>sum+item.value,0);warnings.push(`${withoutNetwork.length} CNPJ(s), somando R$ ${value.toFixed(2)}, permanecem explicitamente em SEM REDE; nenhuma venda foi descartada.`)}
  const paddedCnpjs=relationships.audit.sourceSummaries.reduce((sum,item)=>sum+item.paddedExcel,0);
  if(paddedCnpjs)warnings.push(`${paddedCnpjs} ocorrência(s) de CNPJ perderam zero inicial no Excel e foram recompostas para 14 dígitos com o valor original preservado na auditoria.`);
  if(relationships.audit.networkConflicts.length)warnings.push(`${relationships.audit.networkConflicts.length} CNPJ(s) possuem mais de uma rede dentro da mesma fonte; o conflito permanece explícito na auditoria.`);
  if(sourceSales?.invalidOrAmbiguousCnpjRows)warnings.push(`${sourceSales.invalidOrAmbiguousCnpjRows} linha(s) de venda do 8022 possuem CNPJ inválido, vazio ou ambíguo; os valores permanecem no Sell Out, mas não contam como positivação.`);
  const unassignedVendorValue=vendors.find(vendor=>vendor.newCode==='SEM_VENDEDOR')?.total||0;
  if(unassignedVendorValue)warnings.push(`R$ ${unassignedVendorValue.toFixed(2)} de Sell Out estão em vendedor NÃO CLASSIFICADO; o valor não foi descartado.`);
  if(Math.abs(unclassifiedLineTotal)>0.005)warnings.push(`R$ ${unclassifiedLineTotal.toFixed(2)} de Sell Out permanecem em linha comercial NÃO CLASSIFICADA; o valor não foi descartado.`);

  const historyAverage = history.average3ClosedMonths || 0;
  const coverageSaleCurrent = historyAverage > 0 ? (stockSale / historyAverage) * 30 : 0;
  const coverageSaleProjected = historyAverage > 0 ? ((stockSale + portfolio.sale) / historyAverage) * 30 : 0;
  const coverageCostCurrent = historyAverage > 0 ? (stockCost / historyAverage) * 30 : 0;
  const coverageCostProjected = historyAverage > 0 ? ((stockCost + portfolio.cost) / historyAverage) * 30 : 0;
  if (!historyAverage && (stockSale > 0 || stockCost > 0)) warnings.push('Cobertura de estoque aguardando os três meses fechados anteriores no histórico 379.');

  const support: CanonicalSupportData = { rcas: rcas.map(r => ({ ...r })), vendorTargets: targets.map(t => ({ ...t })), clients: resolvedPremises.map(p => ({ ...p })), activeRoute: resolvedRouteStores.map(r => ({ ...r })), legacyNetworkTargets: Object.fromEntries(detectedNetworkTargets.entries()), legacyNetworkOwners: Object.fromEntries(detectedNetworkOwners.entries()), legacyClientNetworks: Object.fromEntries(detectedClientNetworks.entries()), legacyClientOwners: Object.fromEntries(detectedClientOwners.entries()), products: Array.from(priceList.bySku.values()).map(p => ({ ...p })), itemCodes: Array.from(cadastro.byInternal.entries()).map(([internalCode, item]) => ({ internalCode, ...item })) };
  // Na operação Milênio a meta global do painel é a Meta PNA Colgate da
  // Bússola. A configuração manual continua prevalecendo quando informada.
  const sellOutTarget = config.sellOutTarget > 0 ? config.sellOutTarget : Math.max(industryTarget, 0);
  const sources = mergeSourceAudits(previousState?.sources || [], currentSources);
  const canonical: CanonicalState = {
    schemaVersion: 2, generatedAt: processedAt, referenceDate: maxDate, periodStart, periodEnd, sources, support,
    transactions: transactions.map(tx => ({ ...tx })), inventory: inventoryToCanonical(products), daily, history, industryTarget, industryPositivityTarget,
    sellOut: { invoiced, toInvoice, total, sellOutTarget, attainment: sellOutTarget > 0 ? total / sellOutTarget : 0, invoicedPositivation: positivity.invoiced, futurePositivation: positivity.future, totalPositivation: positivity.total, industryPositivityTarget, positivityAttainment: industryPositivityTarget > 0 ? positivity.total / industryPositivityTarget : 0, ticketAverage: positivity.invoiced > 0 ? invoiced / positivity.invoiced : 0, businessDaysTotal: business.total, businessDaysElapsed: business.elapsed, businessDaysRemaining: business.remaining, invoicedDailyAverage: invDailyAverage, totalDailyAverage, neededDailyAverage: business.remaining > 0 ? Math.max(sellOutTarget - total, 0) / business.remaining : Math.max(sellOutTarget - total, 0), invoicedTrend: business.elapsed > 0 ? invDailyAverage * business.total : 0, totalTrend: business.elapsed > 0 ? totalDailyAverage * business.total : 0 },
    stock: { costValue: stockCost, saleValue: stockSale, pendingPurchaseCost: portfolio.cost, pendingPurchaseSale: portfolio.sale, projectedCostValue: stockCost + portfolio.cost, projectedSaleValue: stockSale + portfolio.sale, physicalUnits, physicalCases, grossKg, coverageCurrentDays: Math.round(coverageSaleCurrent), coverageProjectedDays: Math.round(coverageSaleProjected), coverageCostCurrentDays: Math.round(coverageCostCurrent), coverageCostProjectedDays: Math.round(coverageCostProjected), coverageTargetDays: config.coverageTargetDays },
    vendors, coordinators, clients,
    networks: networks.map(n => { const manual = config.networkTargets[n.key]; const target = Number.isFinite(manual) ? Math.max(manual, 0) : n.detectedNetworkTarget; return { ...n, networkTarget: target, networkAttainment: target > 0 ? n.total / target : 0, gapToNetworkTarget: Math.max(target - n.total, 0) }; }),
    lines: lines.map(line => { const share = config.lineShares[line.name] ?? line.share; const target = sellOutTarget * share; return { ...line, share, target, attainment: target > 0 ? line.total / target : 0 }; }), warnings,
    reconciliation:{checks:reconciliationChecks,networkAssignments,relationships:relationships.audit,blockedRules:reconciliationChecks.filter(check=>check.status==='BLOCKED').map(check=>check.note||check.label)},
  };

  const legacy = legacySellOut(transactions, vendors, clients);
  const metricas: MetricasEstoque = { valorEstoqueCompra: stockCost, valorEstoqueVenda: stockSale, saldoPedidoCusto: portfolio.cost, saldoPedidoVenda: portfolio.sale, coberturaDiasAtual: canonical.stock.coverageCurrentDays, coberturaEstoqueMaisSaldo: canonical.stock.coverageProjectedDays, coberturaDiasAtualCusto: canonical.stock.coverageCostCurrentDays, coberturaEstoqueMaisSaldoCusto: canonical.stock.coverageCostProjectedDays, produtosRuptura: productArray.filter(p => p.hasWinthor !== false && p.quantidade <= 0).length, metaCobertura: config.coverageTargetDays };
  return { canonical, sellOut: legacy, produtos: productArray, metricas };
}
