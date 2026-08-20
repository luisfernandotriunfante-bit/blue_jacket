import type { CanonicalState } from './canonical';
import { buildStockPresentation, DEFAULT_STOCK_ALERT_CONFIGURATION } from './stockModel';
import type { StockProductView } from './stockModel';
import type {
  AssortmentClassification,
  AssortmentCompetence,
  CustomerCommercialProfile,
  CustomerIntelligenceAuditCheck,
  CustomerIntelligenceResult,
  CustomerIntelligenceSupport,
  CustomerResolvedProfile,
  CustomerSourceTrace,
  OfficialAssortmentSku,
  OpportunityPriority,
  ProductCommercialView,
  PromotionRule,
  PurchaseHistory310,
  SkuLineageRecord,
} from './customerIntelligenceTypes';
import { normalizeCnpj, normalizeText } from '../services/canonical/utils';
import { channelFromTier } from '../services/customerIntelligenceSources';

const code = (value: unknown) => String(value ?? '').trim().replace(/^0+/, '');
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
const positive = (value: unknown) => Math.max(Number(value) || 0, 0);

function classificationFromValue(value: number | null, knownProduct: boolean): AssortmentClassification {
  if (!knownProduct || value === null) return 'PENDENCIA_CORRESPONDENCIA';
  if (value === 0) return 'FORA_DO_SORTIMENTO';
  if (value === 1) return 'MANDATORIO';
  if (value === 2) return 'IMPORTANTE';
  return 'RECOMENDADO';
}

function isRecommended(classification: AssortmentClassification) {
  return classification === 'MANDATORIO' || classification === 'IMPORTANTE' || classification === 'RECOMENDADO';
}

function selectCompetence(support: CustomerIntelligenceSupport, referenceDate: string): AssortmentCompetence | null {
  return support.assortmentCompetences.find(item => referenceDate >= item.validFrom && referenceDate <= item.validTo) || null;
}

function sourceValue(field: string, candidates: Array<{ source: string; value: string }>, precedence: string[]): CustomerSourceTrace {
  const normalized = candidates.filter(item => String(item.value ?? '').trim()).map(item => ({ ...item, value: String(item.value).trim() }));
  const sorted = [...normalized].sort((left, right) => {
    const li = precedence.indexOf(left.source); const ri = precedence.indexOf(right.source);
    return (li < 0 ? 999 : li) - (ri < 0 ? 999 : ri);
  });
  const chosen = sorted[0]?.value || '';
  const distinct = new Set(normalized.map(item => normalizeText(item.value)));
  return { field, chosen, precedence: precedence.join(' > '), values: normalized, divergent: distinct.size > 1 };
}

function resolveCustomerProfile(state: CanonicalState, support: CustomerIntelligenceSupport, cnpj: string): CustomerResolvedProfile {
  const local = support.customers.filter(item => item.cnpj === cnpj);
  const premise = state.support.clients.filter(item => item.cnpj === cnpj);
  const route = state.support.activeRoute.filter(item => item.cnpj === cnpj);
  const resultClient = state.clients.filter(item => item.cnpj === cnpj);
  const tx = state.transactions.filter(item => item.cnpj === cnpj);
  const vendorValues = new Map<string, number>();
  tx.forEach(item => vendorValues.set(item.vendorCode, (vendorValues.get(item.vendorCode) || 0) + item.value));
  const dominantVendorCode = Array.from(vendorValues.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const vendor = state.vendors.find(item => item.newCode === dominantVendorCode || item.oldCode === dominantVendorCode);
  const purchaseVendor = support.purchases.find(item => item.cnpj === cnpj)?.vendorCode || '';
  const historicalVendor = state.vendors.find(item => item.newCode === purchaseVendor || item.oldCode === purchaseVendor);

  const traces: CustomerSourceTrace[] = [];
  const pick = (field: string, values: Array<{ source: string; value: string }>, precedence: string[]) => { const trace = sourceValue(field, values, precedence); traces.push(trace); return trace.chosen; };
  const localOne = local[0]; const premiseOne = premise[0]; const routeOne = route[0]; const resultOne = resultClient[0];
  const name = pick('Nome', [
    ...premise.map(item => ({ source: 'PREMISSAS', value: item.name })),
    ...route.map(item => ({ source: 'ROTEIRO', value: item.name || item.fantasyName })),
    ...local.map(item => ({ source: 'BASE_CLIENTES_SORTIMENTO', value: item.name })),
    ...resultClient.map(item => ({ source: '8022', value: item.name })),
  ], ['PREMISSAS', 'ROTEIRO', 'BASE_CLIENTES_SORTIMENTO', '8022']);
  const network = pick('Rede', [
    ...premise.map(item => ({ source: 'PREMISSAS', value: item.network })),
    ...route.map(item => ({ source: 'ROTEIRO', value: item.networkRaw })),
    ...local.map(item => ({ source: 'BASE_CLIENTES_SORTIMENTO', value: item.network })),
    ...resultClient.map(item => ({ source: '8022', value: item.network })),
  ], ['PREMISSAS', 'ROTEIRO', 'BASE_CLIENTES_SORTIMENTO', '8022']);
  const profile = pick('Perfil', [
    ...premise.map(item => ({ source: 'PREMISSAS', value: item.profile })),
    ...local.map(item => ({ source: 'BASE_CLIENTES_SORTIMENTO', value: item.profile })),
  ], ['PREMISSAS', 'BASE_CLIENTES_SORTIMENTO']);
  const environment = pick('Ambiente', local.map(item => ({ source: 'BASE_CLIENTES_SORTIMENTO', value: item.environment })), ['BASE_CLIENTES_SORTIMENTO']);
  const tier = pick('Faixa', [
    ...local.map(item => ({ source: 'BASE_CLIENTES_SORTIMENTO', value: item.tier })),
    ...route.map(item => ({ source: 'ROTEIRO', value: item.tier })),
  ], ['BASE_CLIENTES_SORTIMENTO', 'ROTEIRO']);
  const assortmentChannel = channelFromTier(tier) || localOne?.assortmentChannel || '';
  traces.push({ field: 'Canal de sortimento', chosen: assortmentChannel, precedence: 'REGRA_FAIXA_Q3_2026', values: tier ? [{ source: 'REGRA_FAIXA_Q3_2026', value: `${tier} → ${assortmentChannel || 'SEM MAPEAMENTO'}` }] : [], divergent: false });
  const city = pick('Cidade', [
    ...premise.map(item => ({ source: 'PREMISSAS', value: item.city })),
    ...route.map(item => ({ source: 'ROTEIRO', value: item.city })),
    ...local.map(item => ({ source: 'BASE_CLIENTES_SORTIMENTO', value: item.city })),
    ...resultClient.map(item => ({ source: '8022', value: item.city })),
  ], ['PREMISSAS', 'ROTEIRO', 'BASE_CLIENTES_SORTIMENTO', '8022']);
  const vendorCode = vendor?.newCode || historicalVendor?.newCode || dominantVendorCode || purchaseVendor;
  const coordinatorCode = vendor?.coordinatorCode || historicalVendor?.coordinatorCode || '';
  const coordinatorName = vendor?.coordinatorName || historicalVendor?.coordinatorName || '';
  traces.push({ field: 'Vendedor', chosen: vendorCode, precedence: '8022 dominante > 310 histórico', values: [dominantVendorCode ? { source: '8022', value: dominantVendorCode } : null, purchaseVendor ? { source: '310', value: purchaseVendor } : null].filter(Boolean) as Array<{ source: string; value: string }>, divergent: Boolean(dominantVendorCode && purchaseVendor && dominantVendorCode !== purchaseVendor) });

  return {
    cnpj,
    cnpjRaw: localOne?.cnpjRaw || premiseOne?.cnpjRaw || routeOne?.cnpjRaw || cnpj,
    name,
    clientCode: localOne?.clientCode || tx[0]?.clientCode || '',
    network,
    environment,
    profile,
    tier,
    assortmentChannel,
    city,
    state: localOne?.state || '',
    vendorCode,
    coordinatorCode,
    coordinatorName,
    source: 'RESOLVIDO',
    traces,
  };
}

function recommendationFor(product: OfficialAssortmentSku, channel: string): number | null {
  const match = product.recommendations.find(item => normalizeText(item.channel) === normalizeText(channel));
  return match ? Number(match.value) || 0 : null;
}

function stockIndex(state: CanonicalState) {
  const presentation = buildStockPresentation({
    inventory: state.inventory,
    productSupport: state.support.products,
    itemCodeSupport: state.support.itemCodes,
    transactions: state.transactions,
    businessDaysElapsed: state.sellOut.businessDaysElapsed,
    stockCostValue: state.stock.costValue,
    stockSaleValue: state.stock.saleValue,
    hasStock8013: state.sources.some(source => source.kind === 'stock8013' && source.loaded),
    alertConfiguration: DEFAULT_STOCK_ALERT_CONFIGURATION,
  });
  const byCode = new Map<string, StockProductView>(); const byEan = new Map<string, StockProductView>(); const byFactory = new Map<string, StockProductView>();
  presentation.products.forEach(item => { if (code(item.code)) byCode.set(code(item.code), item); if (digits(item.ean)) byEan.set(digits(item.ean), item); if (code(item.factoryCode)) byFactory.set(code(item.factoryCode), item); });
  return { presentation, byCode, byEan, byFactory };
}

function lineageForProduct(lineage: SkuLineageRecord[], ean: string, sku: string, referenceDate: string) {
  const current = lineage.find(item => (digits(item.oldEan) === digits(ean) || code(item.oldSku) === code(sku)) && item.effectiveFrom <= referenceDate);
  const successor = lineage.find(item => (digits(item.newEan) === digits(ean) || code(item.newSku) === code(sku)) && item.effectiveFrom <= referenceDate);
  return { current, successor };
}

function eligiblePromotion(rule: PromotionRule, customer: CustomerResolvedProfile, product: { ean: string; winthorCode: string }, referenceDate: string) {
  if (rule.status !== 'ATIVA') return false;
  if (rule.validFrom && referenceDate < rule.validFrom) return false;
  if (rule.validTo && referenceDate > rule.validTo) return false;
  const allows = (values: string[], actual: string) => !values.length || values.some(value => normalizeText(value) === normalizeText(actual));
  if (!allows(rule.environments, customer.environment) || !allows(rule.tiers, customer.tier) || !allows(rule.profiles, customer.profile) || !allows(rule.networks, customer.network)) return false;
  if (rule.cnpjs.length && !rule.cnpjs.includes(customer.cnpj)) return false;
  const targetsProduct = !rule.eans.length && !rule.winthorCodes.length || rule.eans.some(ean => digits(ean) === digits(product.ean)) || rule.winthorCodes.some(sku => code(sku) === code(product.winthorCode));
  return targetsProduct;
}

function opportunityFor(input: { classification: AssortmentClassification; bought: boolean; isLaunch: boolean; hasWinthor: boolean; availableUnits: number; portfolioUnits: number; hasPromotion: boolean; lineageStatus: string; isDiscontinued: boolean }): { priority: OpportunityPriority; reason: string; action: string } {
  const { classification, bought, isLaunch, hasWinthor, availableUnits, portfolioUnits, hasPromotion, lineageStatus, isDiscontinued } = input;
  if (lineageStatus === 'MIGRACAO_VIGENTE' && bought) return { priority: 'MIGRACAO', reason: 'Cliente possui compra do SKU anterior e o sucessor já está vigente.', action: 'Migrar a oferta para o SKU atual.' };
  if (isDiscontinued && bought) return { priority: 'DIAGNOSTICO', reason: 'Cliente possui histórico de produto descontinuado.', action: 'Não recomprar automaticamente; avaliar substituto vigente.' };
  if (classification === 'FORA_DO_SORTIMENTO' && bought) return { priority: 'DIAGNOSTICO', reason: 'Produto comprado não pertence ao sortimento vigente do cliente.', action: 'Revisar recorrência e necessidade comercial.' };
  if (!isRecommended(classification) || bought) return { priority: 'SEM_ACAO', reason: '', action: '' };
  if (!hasWinthor) return { priority: 'BLOQUEIO_CADASTRO', reason: 'Produto recomendado ainda sem cadastro Winthor conciliado.', action: 'Regularizar cadastro antes de cobrar execução do vendedor.' };
  if (availableUnits > 0 && isLaunch) return { priority: 'MAXIMA', reason: 'Lançamento recomendado, nunca comprado e disponível agora.', action: 'Ofertar agora.' };
  if (availableUnits > 0 && classification === 'MANDATORIO') return { priority: 'MAXIMA', reason: 'Mandatório, nunca comprado e disponível agora.', action: 'Fechar lacuna prioritária do sortimento.' };
  if (portfolioUnits > 0 && isLaunch) return { priority: 'MUITO_ALTA', reason: 'Lançamento recomendado e ainda não comprado, com entrada prevista em Carteira.', action: 'Preparar oferta e acompanhar entrada.' };
  if (hasPromotion) return { priority: 'MUITO_ALTA', reason: 'Produto recomendado nunca comprado com promoção estruturada elegível.', action: 'Usar a promoção na abordagem comercial.' };
  if (availableUnits <= 0 && portfolioUnits <= 0) return { priority: 'BLOQUEIO_DISPONIBILIDADE', reason: 'Produto recomendado sem estoque disponível e sem Carteira.', action: 'Aguardar disponibilidade; não tratar como falha do vendedor.' };
  if (classification === 'IMPORTANTE') return { priority: 'ALTA', reason: 'Produto importante ainda não comprado.', action: 'Priorizar inclusão no próximo pedido.' };
  return { priority: 'MEDIA', reason: 'Produto recomendado ainda não comprado.', action: 'Trabalhar expansão de mix.' };
}

function auditCheck(id: string, label: string, expected: number | string | null, calculated: number | string | null, note = ''): CustomerIntelligenceAuditCheck {
  if (expected === null) return { id, label, expected, calculated, status: 'BLOCKED', note };
  const equal = typeof expected === 'number' && typeof calculated === 'number' ? Math.abs(expected - calculated) < 0.0001 : expected === calculated;
  return { id, label, expected, calculated, status: equal ? 'OK' : 'DIVERGENT', note };
}

function emptyResult(state: CanonicalState, customer: CustomerResolvedProfile, referenceDate: string, support: CustomerIntelligenceSupport): CustomerIntelligenceResult {
  return {
    referenceDate, competenceKey: '', competenceLabel: 'Sem competência oficial carregada', customer,
    officialAssortment: 0, executableAssortment: 0, assortmentBought: 0, assortmentPercent: 0, mandatoryRecommended: 0, mandatoryBought: 0, importantRecommended: 0, importantBought: 0,
    recommendedMissing: 0, boughtOutside: 0, boughtUnresolved: 0, ytdNetValue: support.purchases.filter(item => item.cnpj === customer.cnpj).reduce((sum, item) => sum + item.netValue, 0),
    opportunitiesAvailableNow: 0, opportunitiesPortfolioOnly: 0, blockedByStock: 0, blockedByRegistration: 0,
    launches: { totalRecommended: 0, adopted: 0, missing: 0, availableNow: 0, portfolioOnly: 0, withoutWinthor: 0, withoutStockAndPortfolio: 0 },
    products: [], opportunities: [], launchesProducts: [], boughtOutsideProducts: [], promotions: [],
    audit: [auditCheck('competence.loaded', 'Competência oficial aplicável à data', null, referenceDate, 'Nenhuma base oficial carregada cobre a data selecionada; o motor não reaproveitou silenciosamente outra competência.')],
    limitations: ['Sortimento oficial aplicável à data não carregado.'],
  };
}

export function buildCustomerIntelligence(state: CanonicalState, support: CustomerIntelligenceSupport, rawCnpj: string, requestedDate?: string): CustomerIntelligenceResult {
  const normalized = normalizeCnpj(rawCnpj, { declaredCnpj: true });
  const cnpj = normalized.canonical;
  const referenceDate = requestedDate || state.referenceDate;
  const customer = resolveCustomerProfile(state, support, cnpj);
  const competence = selectCompetence(support, referenceDate);
  if (!competence || !customer.assortmentChannel) {
    const base = emptyResult(state, customer, referenceDate, support);
    if (!customer.assortmentChannel) {
      base.audit.push(auditCheck('customer.channel', 'Faixa → canal de sortimento', null, customer.tier || '', 'Faixa ausente ou ainda sem mapeamento de domínio; nenhuma classificação de SKU foi inventada.'));
      base.limitations.push('Canal de sortimento do cliente não pôde ser determinado.');
    }
    return base;
  }

  const stock = stockIndex(state);
  const officialByEan = new Map(competence.products.map(item => [digits(item.ean), item]));
  const officialByWinthor = new Map(competence.products.filter(item => code(item.winthorCode)).map(item => [code(item.winthorCode), item]));
  const itemByInternal = new Map(state.support.itemCodes.map(item => [code(item.internalCode), item]));
  const masterByEan = new Map(state.support.products.map(item => [digits(item.ean), item]));
  const masterBySku = new Map(state.support.products.map(item => [code(item.sku), item]));
  const customerPurchases = support.purchases.filter(item => item.cnpj === cnpj);
  const purchasesByEan = new Map<string, PurchaseHistory310>();
  const unmatchedPurchases: PurchaseHistory310[] = [];
  customerPurchases.forEach(purchase => {
    const officialDirect = officialByWinthor.get(code(purchase.winthorCode));
    const itemCode = itemByInternal.get(code(purchase.winthorCode));
    const ean = digits(officialDirect?.ean || itemCode?.ean || '');
    if (ean) {
      const current = purchasesByEan.get(ean);
      if (current) {
        current.volumes += purchase.volumes; current.quantity += purchase.quantity; current.purchaseValue += purchase.purchaseValue; current.returnVolume += purchase.returnVolume; current.returnValue += purchase.returnValue; current.netValue = current.purchaseValue - current.returnValue;
      } else purchasesByEan.set(ean, { ...purchase });
    } else unmatchedPurchases.push(purchase);
  });

  const currentPeriodByEan = new Map<string, number>();
  state.transactions.filter(item => item.cnpj === cnpj).forEach(transaction => {
    const ean = digits(transaction.ean || itemByInternal.get(code(transaction.internalProductCode))?.ean || '');
    if (ean) currentPeriodByEan.set(ean, (currentPeriodByEan.get(ean) || 0) + transaction.value);
  });

  const allEans = new Set<string>();
  competence.products.forEach(item => allEans.add(digits(item.ean)));
  purchasesByEan.forEach((_value, ean) => allEans.add(ean));
  const products: ProductCommercialView[] = [];

  allEans.forEach(ean => {
    const official = officialByEan.get(ean);
    const purchase = purchasesByEan.get(ean);
    const itemCode = state.support.itemCodes.find(item => digits(item.ean) === ean);
    const lineage = lineageForProduct(support.lineage, ean, purchase?.winthorCode || official?.winthorCode || itemCode?.internalCode || '', referenceDate);
    const olderLineage = lineage.current;
    const successor = olderLineage?.status === 'MIGRACAO_VIGENTE' ? officialByEan.get(digits(olderLineage.newEan)) : undefined;
    const activeOfficial = official || successor;
    const assortmentValue = activeOfficial ? recommendationFor(activeOfficial, customer.assortmentChannel) : null;
    let classification = classificationFromValue(assortmentValue, Boolean(activeOfficial));
    if (!activeOfficial && olderLineage?.status === 'DESCONTINUADO') classification = 'FORA_DO_SORTIMENTO';
    if (!activeOfficial && olderLineage?.status === 'MIGRACAO_VIGENTE') classification = 'FORA_DO_SORTIMENTO';
    const preferredWinthor = code(activeOfficial?.winthorCode || purchase?.winthorCode || itemCode?.internalCode || '');
    const stockProduct = stock.byEan.get(ean) || (preferredWinthor ? stock.byCode.get(preferredWinthor) : undefined) || (activeOfficial?.colgateSku ? stock.byFactory.get(code(activeOfficial.colgateSku)) : undefined);
    const hasWinthor = Boolean(preferredWinthor) || Boolean(stockProduct?.hasWinthor);
    const availableUnits = positive(stockProduct?.availableUnits);
    const portfolioUnits = positive(stockProduct?.pendingUnits);
    const isDiscontinued = olderLineage?.status === 'DESCONTINUADO';
    const isLaunch = Boolean(activeOfficial?.launchLabel && normalizeText(activeOfficial.launchLabel).includes('LANCAMENTO'));
    const matchingPromotions = support.promotions.filter(rule => eligiblePromotion(rule, customer, { ean: activeOfficial?.ean || ean, winthorCode: preferredWinthor }, referenceDate));
    const opportunity = opportunityFor({ classification, bought: Boolean(purchase && purchase.netValue !== 0 || purchase && purchase.quantity > 0), isLaunch, hasWinthor, availableUnits, portfolioUnits, hasPromotion: matchingPromotions.length > 0, lineageStatus: olderLineage?.status || '', isDiscontinued: Boolean(isDiscontinued) });
    const master = masterByEan.get(ean) || (activeOfficial?.colgateSku ? masterBySku.get(code(activeOfficial.colgateSku)) : undefined);
    const basePrice = master?.unitPrice && master.unitPrice > 0 ? master.unitPrice : stockProduct?.saleUnit && stockProduct.saleUnit > 0 ? stockProduct.saleUnit : null;
    const availability = isDiscontinued ? 'DESCONTINUADO' : olderLineage?.status === 'MIGRACAO_VIGENTE' ? 'MIGRACAO' : !hasWinthor ? 'SEM_WINTHOR' : availableUnits > 0 ? 'DISPONIVEL' : portfolioUnits > 0 ? 'SOMENTE_CARTEIRA' : 'SEM_ESTOQUE';
    products.push({
      ean: activeOfficial?.ean || ean,
      winthorCode: preferredWinthor,
      colgateSku: activeOfficial?.colgateSku || '',
      description: activeOfficial?.description || purchase?.description || stockProduct?.description || 'Produto sem correspondência completa',
      category: activeOfficial?.category || '', subcategory: activeOfficial?.subcategory || '', brand: activeOfficial?.brand || '',
      assortmentValue, classification, isRecommended: isRecommended(classification), isLaunch, launchLabel: activeOfficial?.launchLabel || '',
      lineageStatus: olderLineage?.status || '', predecessorEan: olderLineage?.oldEan || '', successorEan: olderLineage?.newEan || '', isDiscontinued: Boolean(isDiscontinued),
      bought: Boolean(purchase && (purchase.quantity > 0 || purchase.netValue !== 0)), purchaseQuantity: purchase?.quantity || 0, purchaseValue: purchase?.purchaseValue || 0, returnValue: purchase?.returnValue || 0, netValue: purchase?.netValue || 0,
      currentPeriodValue: currentPeriodByEan.get(ean) || 0,
      physicalUnits: positive(stockProduct?.physicalTotalUnits), reservedUnits: positive(stockProduct?.reservedUnits), availableUnits, portfolioUnits, projectedUnits: positive(stockProduct?.projectedUnits), unitsPerCase: positive(stockProduct?.unitsPerCase),
      availability, hasWinthor, promotionIds: matchingPromotions.map(rule => rule.id), basePrice, finalPrice: null, priceStatus: basePrice ? 'COMPOSICAO_FINAL_PENDENTE' : 'SEM_PRECO',
      opportunityPriority: opportunity.priority, opportunityReason: opportunity.reason, recommendedAction: opportunity.action,
      auditNotes: [stockProduct ? 'Estoque consumido diretamente do motor canônico de Estoque.' : 'Sem correspondência no motor canônico de Estoque.', olderLineage ? `${olderLineage.status}: ${olderLineage.oldEan || olderLineage.oldSku} → ${olderLineage.newEan || olderLineage.newSku || 'sem sucessor'}` : ''].filter(Boolean),
    });
  });

  unmatchedPurchases.forEach(purchase => {
    const lineage = lineageForProduct(support.lineage, '', purchase.winthorCode, referenceDate).current;
    const classification: AssortmentClassification = lineage?.status === 'DESCONTINUADO' || lineage?.status === 'MIGRACAO_VIGENTE' ? 'FORA_DO_SORTIMENTO' : 'PENDENCIA_CORRESPONDENCIA';
    const opportunity = opportunityFor({ classification, bought: true, isLaunch: false, hasWinthor: Boolean(purchase.winthorCode), availableUnits: 0, portfolioUnits: 0, hasPromotion: false, lineageStatus: lineage?.status || '', isDiscontinued: lineage?.status === 'DESCONTINUADO' });
    products.push({ ean: '', winthorCode: purchase.winthorCode, colgateSku: '', description: purchase.description, category: '', subcategory: '', brand: '', assortmentValue: null, classification, isRecommended: false, isLaunch: false, launchLabel: '', lineageStatus: lineage?.status || '', predecessorEan: lineage?.oldEan || '', successorEan: lineage?.newEan || '', isDiscontinued: lineage?.status === 'DESCONTINUADO', bought: true, purchaseQuantity: purchase.quantity, purchaseValue: purchase.purchaseValue, returnValue: purchase.returnValue, netValue: purchase.netValue, currentPeriodValue: 0, physicalUnits: 0, reservedUnits: 0, availableUnits: 0, portfolioUnits: 0, projectedUnits: 0, unitsPerCase: 0, availability: lineage?.status === 'DESCONTINUADO' ? 'DESCONTINUADO' : lineage?.status === 'MIGRACAO_VIGENTE' ? 'MIGRACAO' : 'SEM_ESTOQUE', hasWinthor: Boolean(purchase.winthorCode), promotionIds: [], basePrice: null, finalPrice: null, priceStatus: 'SEM_PRECO', opportunityPriority: opportunity.priority, opportunityReason: opportunity.reason, recommendedAction: opportunity.action, auditNotes: [lineage ? `Compra histórica relacionada a ${lineage.status}.` : 'Compra do 310 sem correspondência confiável em EAN/sortimento vigente.'] });
  });

  const recommended = products.filter(item => item.isRecommended);
  const officialAssortment = recommended.length;
  const executableAssortment = recommended.filter(item => item.hasWinthor && item.availableUnits > 0 && !item.isDiscontinued && item.lineageStatus !== 'MIGRACAO_VIGENTE').length;
  const assortmentBought = recommended.filter(item => item.bought).length;
  const mandatory = recommended.filter(item => item.classification === 'MANDATORIO');
  const important = recommended.filter(item => item.classification === 'IMPORTANTE');
  const launchesProducts = recommended.filter(item => item.isLaunch);
  const opportunities = products.filter(item => item.opportunityPriority !== 'SEM_ACAO').sort((a, b) => {
    const rank: Record<OpportunityPriority, number> = { MAXIMA: 0, MUITO_ALTA: 1, ALTA: 2, MEDIA: 3, MIGRACAO: 4, DIAGNOSTICO: 5, BLOQUEIO_CADASTRO: 6, BLOQUEIO_DISPONIBILIDADE: 7, SEM_ACAO: 8 };
    return rank[a.opportunityPriority] - rank[b.opportunityPriority] || b.netValue - a.netValue || a.description.localeCompare(b.description);
  });
  const boughtOutsideProducts = products.filter(item => item.bought && (item.classification === 'FORA_DO_SORTIMENTO' || item.classification === 'PENDENCIA_CORRESPONDENCIA'));
  const applicablePromotions = support.promotions.filter(rule => support.promotions.some(candidate => candidate.id === rule.id) && (rule.cnpjs.length === 0 || rule.cnpjs.includes(cnpj))).filter(rule => !rule.validFrom || referenceDate >= rule.validFrom).filter(rule => !rule.validTo || referenceDate <= rule.validTo);
  const expected = competence.expectedTotalsByChannel[customer.assortmentChannel];
  const actualMandatory = mandatory.length;
  const actualImportant = important.length;
  const audit: CustomerIntelligenceAuditCheck[] = [
    auditCheck('cnpj.normalized', 'CNPJ normalizado em 14 dígitos', 14, cnpj.length, normalized.note),
    auditCheck('competence.selected', 'Competência oficial selecionada pela data', competence.key, competence.key, `${referenceDate} está entre ${competence.validFrom} e ${competence.validTo}.`),
    auditCheck('assortment.total', `SKUs recomendados · ${customer.assortmentChannel}`, expected?.total ?? null, officialAssortment, expected ? 'Fecha contra o total declarado na própria base oficial.' : 'Canal sem total de controle na base.'),
    auditCheck('assortment.mandatory', `Mandatórios · ${customer.assortmentChannel}`, expected?.mandatory ?? null, actualMandatory, ''),
    auditCheck('assortment.important', `Importantes · ${customer.assortmentChannel}`, expected?.important ?? null, actualImportant, ''),
    auditCheck('assortment.decomposition', 'Mandatórios + Importantes + demais recomendados = total recomendado', officialAssortment, actualMandatory + actualImportant + recommended.filter(item => item.classification === 'RECOMENDADO').length, ''),
    auditCheck('assortment.unique-ean', 'EANs únicos no sortimento vigente', competence.products.length, new Set(competence.products.map(item => digits(item.ean))).size, 'Migrações vigentes são sobrepostas pelo EAN novo e o antigo não permanece duplicado no sortimento vigente.'),
    auditCheck('purchases.net', 'Valor líquido 310 = compras - devoluções', customerPurchases.reduce((sum, item) => sum + item.purchaseValue - item.returnValue, 0), customerPurchases.reduce((sum, item) => sum + item.netValue, 0), 'Desconto não foi subtraído.'),
    auditCheck('stock.canonical', 'Estoque exibido vem do motor canônico de Estoque', 'CANONICAL_STOCK_PRESENTATION', 'CANONICAL_STOCK_PRESENTATION', `${stock.presentation.products.length} SKU(s) disponíveis no resultado canônico; Clientes & Sortimento não recalcula reserva/disponível.`),
    auditCheck('historical.conformity', 'Conformidade histórica por data da compra', null, '310 SEM DATA TRANSACIONAL', 'A situação atual do mix é calculada; conformidade histórica completa permanece bloqueada até existir histórico transacional datado.'),
  ];
  customer.traces.filter(trace => trace.divergent).forEach((trace, index) => audit.push({ id: `customer.conflict.${index}`, label: `Divergência de cliente · ${trace.field}`, expected: trace.chosen, calculated: trace.values.map(item => `${item.source}: ${item.value}`).join(' | '), status: 'DIVERGENT', note: `Precedência aplicada: ${trace.precedence}. A divergência permanece explícita.` }));

  const limitations: string[] = [];
  if (!support.promotions.length) limitations.push('Promoções: arquitetura pronta, mas não há fonte oficial estruturada carregada; nenhuma elegibilidade foi inventada.');
  if (!support.pricingRules.length) limitations.push('Preço final: preço-base pode ser exibido, mas acréscimo, rappel e ordem de composição ainda não possuem fonte/regra validada.');
  limitations.push('Conformidade histórica completa: o 310 total 2026 é consolidado e não possui data transacional por compra.');
  limitations.push('Duração definitiva do status de lançamento ainda não foi definida; o motor usa exclusivamente o rótulo oficial da competência carregada.');

  return {
    referenceDate, competenceKey: competence.key, competenceLabel: competence.label, customer,
    officialAssortment, executableAssortment, assortmentBought, assortmentPercent: officialAssortment > 0 ? assortmentBought / officialAssortment : 0,
    mandatoryRecommended: mandatory.length, mandatoryBought: mandatory.filter(item => item.bought).length,
    importantRecommended: important.length, importantBought: important.filter(item => item.bought).length,
    recommendedMissing: recommended.filter(item => !item.bought).length,
    boughtOutside: products.filter(item => item.bought && item.classification === 'FORA_DO_SORTIMENTO').length,
    boughtUnresolved: products.filter(item => item.bought && item.classification === 'PENDENCIA_CORRESPONDENCIA').length,
    ytdNetValue: customerPurchases.reduce((sum, item) => sum + item.netValue, 0),
    opportunitiesAvailableNow: opportunities.filter(item => item.availableUnits > 0 && ['MAXIMA', 'MUITO_ALTA', 'ALTA', 'MEDIA'].includes(item.opportunityPriority)).length,
    opportunitiesPortfolioOnly: opportunities.filter(item => item.availableUnits <= 0 && item.portfolioUnits > 0).length,
    blockedByStock: opportunities.filter(item => item.opportunityPriority === 'BLOQUEIO_DISPONIBILIDADE').length,
    blockedByRegistration: opportunities.filter(item => item.opportunityPriority === 'BLOQUEIO_CADASTRO').length,
    launches: {
      totalRecommended: launchesProducts.length,
      adopted: launchesProducts.filter(item => item.bought).length,
      missing: launchesProducts.filter(item => !item.bought).length,
      availableNow: launchesProducts.filter(item => !item.bought && item.availableUnits > 0).length,
      portfolioOnly: launchesProducts.filter(item => !item.bought && item.availableUnits <= 0 && item.portfolioUnits > 0).length,
      withoutWinthor: launchesProducts.filter(item => !item.hasWinthor).length,
      withoutStockAndPortfolio: launchesProducts.filter(item => item.hasWinthor && item.availableUnits <= 0 && item.portfolioUnits <= 0).length,
    },
    products: products.sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended) || Number(b.isLaunch) - Number(a.isLaunch) || a.description.localeCompare(b.description)),
    opportunities, launchesProducts, boughtOutsideProducts, promotions: applicablePromotions, audit, limitations,
  };
}

export function listCustomerOptions(state: CanonicalState, support: CustomerIntelligenceSupport) {
  const values = new Map<string, { cnpj: string; name: string; network: string; tier: string; city: string }>();
  support.customers.forEach(item => values.set(item.cnpj, { cnpj: item.cnpj, name: item.name, network: item.network, tier: item.tier, city: item.city }));
  state.support.clients.forEach(item => {
    const current = values.get(item.cnpj);
    values.set(item.cnpj, { cnpj: item.cnpj, name: item.name || current?.name || '', network: item.network || current?.network || '', tier: current?.tier || '', city: item.city || current?.city || '' });
  });
  state.clients.forEach(item => {
    const current = values.get(item.cnpj);
    values.set(item.cnpj, { cnpj: item.cnpj, name: current?.name || item.name, network: current?.network || item.network, tier: current?.tier || '', city: current?.city || item.city });
  });
  support.purchases.forEach(item => { if (!values.has(item.cnpj)) values.set(item.cnpj, { cnpj: item.cnpj, name: '', network: '', tier: '', city: '' }); });
  return Array.from(values.values()).sort((a, b) => (a.name || a.cnpj).localeCompare(b.name || b.cnpj));
}
