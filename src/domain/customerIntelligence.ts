import type { CanonicalInventoryProduct, CanonicalState } from './canonical';
import { buildStockPresentation, DEFAULT_STOCK_ALERT_CONFIGURATION } from './stockModel';
import type { StockProductView } from './stockModel';
import type {
  AssortmentClassification,
  AssortmentCompetence,
  CommercialPackagingSource,
  CustomerIntelligenceAuditCheck,
  CustomerIntelligenceResult,
  CustomerIntelligenceSupport,
  CustomerResolvedProfile,
  CustomerSourceTrace,
  HistoricalPurchaseRecord,
  OfficialAssortmentSku,
  OpportunityPriority,
  ProductCommercialView,
  PromotionRule,
  SkuLineageRecord,
} from './customerIntelligenceTypes';
import { normalizeCnpj, normalizeText } from '../services/canonical/utils';
import { channelFromTier } from '../services/customerIntelligenceSources';

const cleanCode = (value: unknown) => String(value ?? '').trim().replace(/^0+/, '');
const cleanDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
const positive = (value: unknown) => Math.max(Number(value) || 0, 0);
const unique = (values:string[]) => Array.from(new Set(values.filter(Boolean)));
const isUnifiedState = (state:CanonicalState) => Boolean((state as CanonicalState & { unifiedSchemaVersion?:number }).unifiedSchemaVersion === 1);

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
    const li = precedence.indexOf(left.source);
    const ri = precedence.indexOf(right.source);
    return (li < 0 ? 999 : li) - (ri < 0 ? 999 : ri);
  });
  const chosen = sorted[0]?.value || '';
  const distinct = new Set(normalized.map(item => normalizeText(item.value)));
  return { field, chosen, precedence: precedence.join(' > '), values: normalized, divergent: distinct.size > 1 };
}

function historicalForYear(state:CanonicalState, support:CustomerIntelligenceSupport, cnpj:string, referenceDate:string):HistoricalPurchaseRecord[] {
  const year=referenceDate.slice(0,4);
  const canonical=support.historicalPurchases.filter(item=>item.cnpj===cnpj && (!item.period || item.period===year || item.period==='YTD'));
  if (canonical.length || isUnifiedState(state)) return canonical;

  // Compatibilidade exclusiva de fixtures/snapshots antigos fora da UnifiedDataLayer.
  // A rota ativa é UnifiedCanonicalState e nunca entra neste fallback do 310.
  return support.purchases.filter(item=>item.cnpj===cnpj).map(item=>{
    const legacy=item.legacyProductCode||item.winthorCode;
    const mapped=state.support.itemCodes.find(code=>cleanCode(code.internalCode)===cleanCode(item.winthorCode));
    const vendor=state.vendors.find(row=>row.newCode===item.vendorCode||row.oldCode===item.vendorCode);
    return {
      cnpj:item.cnpj,cnpjRaw:item.cnpjRaw,period:year,itemCanonicalId:'',legacyProductCode:legacy,
      ean:mapped?.ean||'',winthorCode:item.winthorCode,industrySku:mapped?.factoryCode||'',description:item.description,
      grossSaleUnits:Math.max(item.volumes+item.returnVolume,0),returnUnits:item.returnVolume,netSignedUnits:item.volumes,
      grossSalesValue:item.purchaseValue,returnValue:item.returnValue,netValue:item.netValue,purchaseInvoiceCount:item.quantity,
      legacyRcaCodes:item.vendorCode?[item.vendorCode]:[],rcaCanonicalIds:[],currentRcaCodes:vendor?.newCode?[vendor.newCode]:[],source:'379' as const,
    };
  });
}

function resolveCustomerProfile(state: CanonicalState, support: CustomerIntelligenceSupport, cnpj: string, referenceDate:string): CustomerResolvedProfile {
  const local = support.customers.filter(item => item.cnpj === cnpj);
  const premise = state.support.clients.filter(item => item.cnpj === cnpj);
  const route = state.support.activeRoute.filter(item => item.cnpj === cnpj);
  const resultClient = state.clients.filter(item => item.cnpj === cnpj);
  const transactions = state.transactions.filter(item => item.cnpj === cnpj && (!item.date || item.date <= referenceDate));
  const vendorValues = new Map<string, number>();
  transactions.forEach(item => vendorValues.set(item.vendorCode, (vendorValues.get(item.vendorCode) || 0) + Math.abs(item.value)));
  const dominantVendorCode = Array.from(vendorValues.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const vendor = state.vendors.find(item => item.newCode === dominantVendorCode || item.oldCode === dominantVendorCode);

  const historicalVendorValues=new Map<string,number>();
  historicalForYear(state,support,cnpj,referenceDate).forEach(purchase=>{
    if(purchase.currentRcaCodes.length!==1) return;
    const code=purchase.currentRcaCodes[0];
    historicalVendorValues.set(code,(historicalVendorValues.get(code)||0)+Math.abs(purchase.grossSalesValue));
  });
  const historicalCurrentCode=Array.from(historicalVendorValues.entries()).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
  const historicalVendor=state.vendors.find(item=>item.newCode===historicalCurrentCode);

  const traces: CustomerSourceTrace[] = [];
  const pick = (field: string, values: Array<{ source: string; value: string }>, precedence: string[]) => {
    const trace = sourceValue(field, values, precedence);
    traces.push(trace);
    return trace.chosen;
  };
  const localOne = local[0];
  const premiseOne = premise[0];
  const routeOne = route[0];
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
  traces.push({ field:'Canal de sortimento',chosen:assortmentChannel,precedence:'REGRA_FAIXA_Q3_2026',values:tier?[{source:'REGRA_FAIXA_Q3_2026',value:`${tier} → ${assortmentChannel||'SEM MAPEAMENTO'}`}]:[],divergent:false });
  const city = pick('Cidade', [
    ...premise.map(item => ({ source: 'PREMISSAS', value: item.city })),
    ...route.map(item => ({ source: 'ROTEIRO', value: item.city })),
    ...local.map(item => ({ source: 'BASE_CLIENTES_SORTIMENTO', value: item.city })),
    ...resultClient.map(item => ({ source: '8022', value: item.city })),
  ], ['PREMISSAS', 'ROTEIRO', 'BASE_CLIENTES_SORTIMENTO', '8022']);
  const vendorCode = vendor?.newCode || historicalVendor?.newCode || dominantVendorCode || historicalCurrentCode || localOne?.vendorCode || '';
  const coordinatorCode = vendor?.coordinatorCode || historicalVendor?.coordinatorCode || localOne?.coordinatorCode || '';
  const coordinatorName = vendor?.coordinatorName || historicalVendor?.coordinatorName || localOne?.coordinatorName || '';
  traces.push({
    field:'Vendedor',chosen:vendorCode,precedence:'8022 dominante > 379 histórico resolvido',
    values:[dominantVendorCode?{source:'8022',value:dominantVendorCode}:null,historicalCurrentCode?{source:'379',value:historicalCurrentCode}:null].filter(Boolean) as Array<{source:string;value:string}>,
    divergent:Boolean(dominantVendorCode&&historicalCurrentCode&&dominantVendorCode!==historicalCurrentCode),
  });
  return {
    cnpj, cnpjRaw: localOne?.cnpjRaw || premiseOne?.cnpjRaw || routeOne?.cnpjRaw || cnpj,
    name, clientCode: localOne?.clientCode || transactions[0]?.clientCode || '', network, environment, profile, tier, assortmentChannel, city,
    state: localOne?.state || '', vendorCode, coordinatorCode, coordinatorName, source: 'RESOLVIDO', traces,
  };
}

function recommendationFor(product: OfficialAssortmentSku, channel: string): number | null {
  const match = product.recommendations.find(item => normalizeText(item.channel) === normalizeText(channel));
  return match ? Number(match.value) || 0 : null;
}

function buildStockIndex(state: CanonicalState) {
  const unified=state as CanonicalState & { unified?:{receiptHeaders?:any[];receiptItems?:any[]} };
  const presentation = buildStockPresentation({
    inventory: state.inventory,
    productSupport: state.support.products,
    itemCodeSupport: state.support.itemCodes,
    transactions: state.transactions,
    businessDaysElapsed: state.sellOut.businessDaysElapsed,
    stockCostValue: state.stock.costValue,
    stockSaleValue: state.stock.saleValue,
    hasStock105: state.sources.some(source => source.kind === 'stock105' && source.loaded) || state.inventory.some(item=>Boolean((item as CanonicalInventoryProduct & {physicalSource105?:boolean}).physicalSource105)),
    receiptHeaders: unified.unified?.receiptHeaders as any,
    receiptItems: unified.unified?.receiptItems as any,
    alertConfiguration: DEFAULT_STOCK_ALERT_CONFIGURATION,
  });
  const byCode = new Map<string, StockProductView>();
  const byEan = new Map<string, StockProductView>();
  const byFactory = new Map<string, StockProductView>();
  presentation.products.forEach(item => {
    if (cleanCode(item.code)) byCode.set(cleanCode(item.code), item);
    if (cleanDigits(item.ean)) byEan.set(cleanDigits(item.ean), item);
    if (cleanCode(item.factoryCode)) byFactory.set(cleanCode(item.factoryCode), item);
  });
  return { presentation, byCode, byEan, byFactory };
}

function packagingSourceFor(state: CanonicalState, stockProduct: StockProductView | undefined): CommercialPackagingSource {
  if (!stockProduct) return 'UNKNOWN';
  const raw = state.inventory.find(item => cleanCode(item.code) === cleanCode(stockProduct.code)
    || (cleanDigits(item.ean) && cleanDigits(item.ean) === cleanDigits(stockProduct.ean))
    || (cleanCode(item.factoryCode) && cleanCode(item.factoryCode) === cleanCode(stockProduct.factoryCode))) as (CanonicalInventoryProduct & { internalUnitsPerCase?:number|null }) | undefined;
  if ((raw?.internalUnitsPerCase || 0) > 0) return '105_DERIVED';
  return stockProduct.unitsPerCase > 0 ? 'PRICE_LIST' : 'UNKNOWN';
}

function currentLineage(lineage: SkuLineageRecord[], ean: string, sku: string, referenceDate: string) {
  return lineage.find(item => (cleanDigits(item.oldEan) === cleanDigits(ean) || cleanCode(item.oldSku) === cleanCode(sku)) && item.effectiveFrom <= referenceDate);
}
function predecessorForCurrent(lineage: SkuLineageRecord[], ean: string, sku: string, referenceDate: string) {
  return lineage.find(item => item.status === 'MIGRACAO_VIGENTE' && item.effectiveFrom <= referenceDate && (cleanDigits(item.newEan) === cleanDigits(ean) || cleanCode(item.newSku) === cleanCode(sku)));
}
function purchaseMatchesSku(purchase:HistoricalPurchaseRecord,sku:string){
  const target=cleanCode(sku); if(!target) return false;
  return [purchase.industrySku,purchase.winthorCode,purchase.legacyProductCode].some(value=>cleanCode(value)===target);
}

function eligiblePromotion(rule: PromotionRule, customer: CustomerResolvedProfile, product: { ean: string; winthorCode: string }, referenceDate: string) {
  if (rule.status !== 'ATIVA') return false;
  if (rule.validFrom && referenceDate < rule.validFrom) return false;
  if (rule.validTo && referenceDate > rule.validTo) return false;
  const allows = (values: string[], actual: string) => !values.length || values.some(value => normalizeText(value) === normalizeText(actual));
  if (!allows(rule.environments, customer.environment) || !allows(rule.tiers, customer.tier) || !allows(rule.profiles, customer.profile) || !allows(rule.networks, customer.network)) return false;
  if (rule.cnpjs.length && !rule.cnpjs.includes(customer.cnpj)) return false;
  return (!rule.eans.length && !rule.winthorCodes.length)
    || rule.eans.some(ean => cleanDigits(ean) === cleanDigits(product.ean))
    || rule.winthorCodes.some(sku => cleanCode(sku) === cleanCode(product.winthorCode));
}

function opportunityFor(input: { classification: AssortmentClassification; bought: boolean; isLaunch: boolean; hasWinthor: boolean; availableUnits: number; hasPortfolio: boolean; hasPromotion: boolean; lineageStatus: string; isDiscontinued: boolean; predecessorBought?: boolean; }): { priority: OpportunityPriority; reason: string; action: string } {
  const { classification, bought, isLaunch, hasWinthor, availableUnits, hasPortfolio, hasPromotion, lineageStatus, isDiscontinued, predecessorBought } = input;
  if (lineageStatus === 'MIGRACAO_VIGENTE' && bought) return { priority: 'MIGRACAO', reason: 'Cliente possui compra do SKU anterior e o sucessor já está vigente.', action: 'Migrar a oferta para o SKU atual.' };
  if (predecessorBought && !bought) return { priority: 'MIGRACAO', reason: 'Cliente já comprou o SKU anterior; o sucessor atual ainda não foi adotado.', action: 'Migrar a compra para o SKU atual.' };
  if (isDiscontinued && bought) return { priority: 'DIAGNOSTICO', reason: 'Cliente possui histórico de produto descontinuado.', action: 'Não recomprar automaticamente; avaliar substituto vigente.' };
  if (classification === 'FORA_DO_SORTIMENTO' && bought) return { priority: 'DIAGNOSTICO', reason: 'Produto comprado não pertence ao sortimento vigente do cliente.', action: 'Revisar recorrência e necessidade comercial.' };
  if (!isRecommended(classification) || bought) return { priority: 'SEM_ACAO', reason: '', action: '' };
  if (!hasWinthor) return { priority: 'BLOQUEIO_CADASTRO', reason: 'Produto recomendado ainda sem cadastro Winthor conciliado.', action: 'Regularizar cadastro antes de cobrar execução do vendedor.' };
  if (availableUnits > 0 && isLaunch) return { priority: 'MAXIMA', reason: 'Lançamento recomendado, nunca comprado e disponível agora.', action: 'Ofertar agora.' };
  if (availableUnits > 0 && classification === 'MANDATORIO') return { priority: 'MAXIMA', reason: 'Mandatório, nunca comprado e disponível agora.', action: 'Fechar lacuna prioritária do sortimento.' };
  if (hasPortfolio && isLaunch) return { priority: 'MUITO_ALTA', reason: 'Lançamento recomendado e ainda não comprado, com entrada prevista em Carteira.', action: 'Preparar oferta e acompanhar entrada.' };
  if (hasPromotion) return { priority: 'MUITO_ALTA', reason: 'Produto recomendado nunca comprado com promoção estruturada elegível.', action: 'Usar a promoção na abordagem comercial.' };
  if (availableUnits <= 0 && !hasPortfolio) return { priority: 'BLOQUEIO_DISPONIBILIDADE', reason: 'Produto recomendado sem estoque disponível e sem Carteira.', action: 'Aguardar disponibilidade; não tratar como falha do vendedor.' };
  if (classification === 'IMPORTANTE') return { priority: 'ALTA', reason: 'Produto importante ainda não comprado.', action: 'Priorizar inclusão no próximo pedido.' };
  return { priority: 'MEDIA', reason: 'Produto recomendado ainda não comprado.', action: 'Trabalhar expansão de mix.' };
}

function auditCheck(id: string, label: string, expected: number | string | null, calculated: number | string | null, note = ''): CustomerIntelligenceAuditCheck {
  if (expected === null) return { id, label, expected, calculated, status: 'BLOCKED', note };
  const equal = typeof expected === 'number' && typeof calculated === 'number' ? Math.abs(expected - calculated) < 0.0001 : expected === calculated;
  return { id, label, expected, calculated, status: equal ? 'OK' : 'DIVERGENT', note };
}

function mergePurchase(target:Map<string,HistoricalPurchaseRecord>,ean:string,purchase:HistoricalPurchaseRecord){
  const current=target.get(ean);
  if(!current){target.set(ean,{...purchase,legacyRcaCodes:[...purchase.legacyRcaCodes],rcaCanonicalIds:[...purchase.rcaCanonicalIds],currentRcaCodes:[...purchase.currentRcaCodes]});return;}
  current.grossSaleUnits+=purchase.grossSaleUnits;current.returnUnits+=purchase.returnUnits;current.netSignedUnits+=purchase.netSignedUnits;
  current.grossSalesValue+=purchase.grossSalesValue;current.returnValue+=purchase.returnValue;current.netValue+=purchase.netValue;current.purchaseInvoiceCount+=purchase.purchaseInvoiceCount;
  current.legacyRcaCodes=unique([...current.legacyRcaCodes,...purchase.legacyRcaCodes]);current.rcaCanonicalIds=unique([...current.rcaCanonicalIds,...purchase.rcaCanonicalIds]);current.currentRcaCodes=unique([...current.currentRcaCodes,...purchase.currentRcaCodes]);
}

function currentSalesForCustomer(state:CanonicalState,cnpj:string,referenceDate:string){
  const year=referenceDate.slice(0,4);
  return state.transactions.filter(item=>item.cnpj===cnpj && (!item.date || (item.date>=`${year}-01-01`&&item.date<=referenceDate)));
}

function emptyResult(customer: CustomerResolvedProfile, referenceDate: string, support: CustomerIntelligenceSupport, state:CanonicalState): CustomerIntelligenceResult {
  const historical=historicalForYear(state,support,customer.cnpj,referenceDate).reduce((sum,item)=>sum+item.netValue,0);
  const current=currentSalesForCustomer(state,customer.cnpj,referenceDate).reduce((sum,item)=>sum+item.value,0);
  return {
    referenceDate, competenceKey: '', competenceLabel: 'Sem competência oficial carregada', customer,
    officialAssortment: 0, executableAssortment: 0, assortmentBought: 0, assortmentPercent: 0, mandatoryRecommended: 0, mandatoryBought: 0,
    importantRecommended: 0, importantBought: 0, recommendedMissing: 0, boughtOutside: 0, boughtUnresolved: 0, ytdNetValue:historical+current,
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
  const customer = resolveCustomerProfile(state, support, cnpj,referenceDate);
  const competence = selectCompetence(support, referenceDate);
  if (!competence || !customer.assortmentChannel) {
    const base = emptyResult(customer, referenceDate, support,state);
    if (!customer.assortmentChannel) {
      base.audit.push(auditCheck('customer.channel', 'Faixa → canal de sortimento', null, customer.tier || '', 'Faixa ausente ou sem mapeamento de domínio; nenhuma classificação de SKU foi inventada.'));
      base.limitations.push('Canal de sortimento do cliente não pôde ser determinado.');
    }
    return base;
  }

  const stock = buildStockIndex(state);
  const officialByEan = new Map(competence.products.map(item => [cleanDigits(item.ean), item]));
  const officialByWinthor = new Map(competence.products.filter(item => cleanCode(item.winthorCode)).map(item => [cleanCode(item.winthorCode), item]));
  const itemByInternal = new Map(state.support.itemCodes.map(item => [cleanCode(item.internalCode), item]));
  const itemByEan = new Map(state.support.itemCodes.filter(item => cleanDigits(item.ean)).map(item => [cleanDigits(item.ean), item]));
  const masterByEan = new Map(state.support.products.map(item => [cleanDigits(item.ean), item]));
  const masterBySku = new Map(state.support.products.map(item => [cleanCode(item.sku), item]));
  const customerPurchases = historicalForYear(state,support,cnpj,referenceDate);
  const purchasesByEan = new Map<string, HistoricalPurchaseRecord>();
  const unmatchedPurchases: HistoricalPurchaseRecord[] = [];
  let mappedPurchaseRecords = 0;
  customerPurchases.forEach(purchase => {
    const itemCode = purchase.winthorCode ? itemByInternal.get(cleanCode(purchase.winthorCode)) : undefined;
    const officialDirect = purchase.winthorCode ? officialByWinthor.get(cleanCode(purchase.winthorCode)) : undefined;
    const ean = cleanDigits(purchase.ean || itemCode?.ean || officialDirect?.ean || '');
    if (ean) { mergePurchase(purchasesByEan, ean, purchase); mappedPurchaseRecords += 1; }
    else unmatchedPurchases.push(purchase);
  });

  const currentByEan = new Map<string, { value: number; units: number; winthorCode: string; description: string }>();
  const unmatchedCurrent = new Map<string, { value: number; units: number; winthorCode: string; description: string }>();
  currentSalesForCustomer(state,cnpj,referenceDate).forEach(transaction => {
    const mappedItem = itemByInternal.get(cleanCode(transaction.internalProductCode));
    const mappedMaster = masterBySku.get(cleanCode(transaction.manufacturerCode));
    const ean = cleanDigits(transaction.ean || mappedItem?.ean || mappedMaster?.ean || '');
    const winthorCode = cleanCode(transaction.internalProductCode || mappedItem?.internalCode || '');
    if (ean) {
      const current = currentByEan.get(ean) || { value: 0, units: 0, winthorCode, description: transaction.productDescription };
      current.value += transaction.value; current.units += transaction.units; if (!current.winthorCode) current.winthorCode = winthorCode;
      currentByEan.set(ean, current);
    } else {
      const key = winthorCode || cleanCode(transaction.manufacturerCode) || transaction.productDescription;
      const current = unmatchedCurrent.get(key) || { value: 0, units: 0, winthorCode, description: transaction.productDescription };
      current.value += transaction.value; current.units += transaction.units;
      unmatchedCurrent.set(key, current);
    }
  });

  const predecessorPurchases = new Set<string>();
  support.lineage.filter(item => item.status === 'MIGRACAO_VIGENTE' && item.effectiveFrom <= referenceDate).forEach(item => {
    const oldEan = cleanDigits(item.oldEan);
    const oldSku = cleanCode(item.oldSku);
    if ((oldEan && purchasesByEan.has(oldEan)) || customerPurchases.some(purchase => purchaseMatchesSku(purchase,oldSku)) || (oldEan && currentByEan.has(oldEan))) predecessorPurchases.add(cleanDigits(item.newEan) || cleanCode(item.newSku));
  });

  const allEans = new Set<string>();
  competence.products.forEach(item => {const ean=cleanDigits(item.ean);if(ean)allEans.add(ean)});
  purchasesByEan.forEach((_value, ean) => allEans.add(ean));
  currentByEan.forEach((_value, ean) => allEans.add(ean));
  const products: ProductCommercialView[] = [];

  allEans.forEach(ean => {
    const official = officialByEan.get(ean);
    const purchase = purchasesByEan.get(ean);
    const currentSale = currentByEan.get(ean);
    const itemCode = itemByEan.get(ean) || (purchase?.winthorCode?itemByInternal.get(cleanCode(purchase.winthorCode)):undefined) || (currentSale?.winthorCode ? itemByInternal.get(cleanCode(currentSale.winthorCode)) : undefined);
    const candidateSku = purchase?.industrySku || currentSale?.winthorCode || official?.colgateSku || official?.winthorCode || itemCode?.factoryCode || itemCode?.internalCode || '';
    const lineage = currentLineage(support.lineage, ean, candidateSku, referenceDate);
    const predecessor = predecessorForCurrent(support.lineage, ean, official?.colgateSku || candidateSku, referenceDate);
    const isOldMigratedSku = lineage?.status === 'MIGRACAO_VIGENTE';
    const isDiscontinued = lineage?.status === 'DESCONTINUADO';
    const activeOfficial = isOldMigratedSku || isDiscontinued ? undefined : official;
    const assortmentValue = activeOfficial ? recommendationFor(activeOfficial, customer.assortmentChannel) : null;
    let classification = classificationFromValue(assortmentValue, Boolean(activeOfficial));
    if (isOldMigratedSku || isDiscontinued) classification = 'FORA_DO_SORTIMENTO';

    const correspondenceWinthor = cleanCode(itemCode?.internalCode || purchase?.winthorCode || currentSale?.winthorCode || activeOfficial?.winthorCode || '');
    const stockProduct = stock.byEan.get(ean) || (correspondenceWinthor ? stock.byCode.get(correspondenceWinthor) : undefined) || (activeOfficial?.colgateSku ? stock.byFactory.get(cleanCode(activeOfficial.colgateSku)) : undefined);
    const factualWinthor = cleanCode(itemCode?.internalCode || purchase?.winthorCode || currentSale?.winthorCode || (stockProduct?.hasWinthor ? stockProduct.code : ''));
    const preferredWinthor = factualWinthor || cleanCode(activeOfficial?.winthorCode || '');
    const hasWinthor = Boolean(factualWinthor) || Boolean(stockProduct?.hasWinthor);
    const availableUnits = positive(stockProduct?.availableUnits);
    const portfolioCases = positive(stockProduct?.pendingCases);
    const portfolioUnits = positive(stockProduct?.pendingUnits);
    const hasPortfolio = portfolioCases > 0 || portfolioUnits > 0;
    const unitsPerCaseSource = packagingSourceFor(state, stockProduct);
    const isLaunch = Boolean(activeOfficial?.launchLabel && normalizeText(activeOfficial.launchLabel).includes('LANCAMENTO'));
    const boughtHistorical = Boolean(purchase && (purchase.purchaseInvoiceCount > 0 || purchase.grossSalesValue > 0));
    const boughtCurrent = Boolean(currentSale && (currentSale.value !== 0 || currentSale.units > 0));
    const bought = boughtHistorical || boughtCurrent;
    const predecessorKey = cleanDigits(activeOfficial?.ean || ean) || cleanCode(activeOfficial?.colgateSku || preferredWinthor);
    const predecessorBought = predecessorPurchases.has(predecessorKey) || Boolean(predecessor && (purchasesByEan.has(cleanDigits(predecessor.oldEan)) || customerPurchases.some(row=>purchaseMatchesSku(row,predecessor.oldSku)) || currentByEan.has(cleanDigits(predecessor.oldEan))));
    const matchingPromotions = support.promotions.filter(rule => eligiblePromotion(rule, customer, { ean: activeOfficial?.ean || ean, winthorCode: preferredWinthor }, referenceDate));
    const opportunity = opportunityFor({ classification, bought, isLaunch, hasWinthor, availableUnits, hasPortfolio, hasPromotion: matchingPromotions.length > 0, lineageStatus: lineage?.status || '', isDiscontinued: Boolean(isDiscontinued), predecessorBought });
    const master = masterByEan.get(ean) || (activeOfficial?.colgateSku ? masterBySku.get(cleanCode(activeOfficial.colgateSku)) : undefined);
    const basePrice = stockProduct?.saleUnit && stockProduct.saleUnit > 0 ? stockProduct.saleUnit : master?.unitPrice && master.unitPrice > 0 ? master.unitPrice : null;
    const availability = isDiscontinued ? 'DESCONTINUADO' : isOldMigratedSku ? 'MIGRACAO' : !hasWinthor ? 'SEM_WINTHOR' : availableUnits > 0 ? 'DISPONIVEL' : hasPortfolio ? 'SOMENTE_CARTEIRA' : 'SEM_ESTOQUE';
    products.push({
      ean: activeOfficial?.ean || ean, winthorCode: preferredWinthor, colgateSku: activeOfficial?.colgateSku || official?.colgateSku || purchase?.industrySku || '',
      description: activeOfficial?.description || official?.description || purchase?.description || currentSale?.description || stockProduct?.description || 'Produto sem correspondência completa',
      category: activeOfficial?.category || official?.category || '', subcategory: activeOfficial?.subcategory || official?.subcategory || '', brand: activeOfficial?.brand || official?.brand || '',
      assortmentValue, classification, isRecommended: isRecommended(classification), isLaunch, launchLabel: activeOfficial?.launchLabel || '',
      lineageStatus: lineage?.status || (predecessor ? 'MIGRACAO_VIGENTE' : ''), predecessorEan: lineage?.oldEan || predecessor?.oldEan || '', successorEan: lineage?.newEan || predecessor?.newEan || '', isDiscontinued: Boolean(isDiscontinued),
      bought, purchaseQuantity: purchase?.netSignedUnits || 0, purchaseValue: purchase?.grossSalesValue || 0, returnValue: purchase?.returnValue || 0, netValue: purchase?.netValue || 0,
      currentPeriodValue: currentSale?.value || 0,
      physicalUnits: positive(stockProduct?.physicalTotalUnits), reservedUnits: positive(stockProduct?.reservedUnits), availableUnits, portfolioCases, portfolioUnits, projectedUnits: positive(stockProduct?.projectedUnits), unitsPerCase: positive(stockProduct?.unitsPerCase), unitsPerCaseSource,
      availability, hasWinthor, promotionIds: matchingPromotions.map(rule => rule.id), basePrice, finalPrice: null, priceStatus: basePrice ? 'COMPOSICAO_FINAL_PENDENTE' : 'SEM_PRECO',
      opportunityPriority: opportunity.priority, opportunityReason: opportunity.reason, recommendedAction: opportunity.action,
      auditNotes: [
        stockProduct ? 'Estoque consumido diretamente do motor canônico de Estoque.' : 'Sem correspondência no motor canônico de Estoque.',
        boughtHistorical ? 'Compra histórica confirmada pelo HISTORICAL_SALES_FACT (379).' : '',
        boughtCurrent ? 'Adoção/compra também confirmada pelo SALES_FACT (8022) do período atual.' : '',
        lineage ? `${lineage.status}: ${lineage.oldEan || lineage.oldSku} → ${lineage.newEan || lineage.newSku || 'sem sucessor'}` : predecessor ? `SUCESSOR VIGENTE de ${predecessor.oldEan || predecessor.oldSku}.` : '',
      ].filter(Boolean),
    });
  });

  unmatchedPurchases.forEach(purchase => {
    const lineage = currentLineage(support.lineage, '', purchase.industrySku || purchase.winthorCode || purchase.legacyProductCode, referenceDate);
    const classification: AssortmentClassification = lineage?.status === 'DESCONTINUADO' || lineage?.status === 'MIGRACAO_VIGENTE' ? 'FORA_DO_SORTIMENTO' : 'PENDENCIA_CORRESPONDENCIA';
    const hasWinthor=Boolean(purchase.winthorCode);
    const opportunity = opportunityFor({ classification, bought: true, isLaunch: false, hasWinthor, availableUnits: 0, hasPortfolio: false, hasPromotion: false, lineageStatus: lineage?.status || '', isDiscontinued: lineage?.status === 'DESCONTINUADO' });
    products.push({
      ean: '', winthorCode: purchase.winthorCode, colgateSku: purchase.industrySku, description: purchase.description || `Produto legado ${purchase.legacyProductCode}`, category: '', subcategory: '', brand: '', assortmentValue: null,
      classification, isRecommended: false, isLaunch: false, launchLabel: '', lineageStatus: lineage?.status || '', predecessorEan: lineage?.oldEan || '', successorEan: lineage?.newEan || '', isDiscontinued: lineage?.status === 'DESCONTINUADO',
      bought: true, purchaseQuantity: purchase.netSignedUnits, purchaseValue: purchase.grossSalesValue, returnValue: purchase.returnValue, netValue: purchase.netValue, currentPeriodValue: 0,
      physicalUnits: 0, reservedUnits: 0, availableUnits: 0, portfolioCases: 0, portfolioUnits: 0, projectedUnits: 0, unitsPerCase: 0, unitsPerCaseSource: 'UNKNOWN',
      availability: lineage?.status === 'DESCONTINUADO' ? 'DESCONTINUADO' : lineage?.status === 'MIGRACAO_VIGENTE' ? 'MIGRACAO' : hasWinthor?'SEM_ESTOQUE':'SEM_WINTHOR',
      hasWinthor, promotionIds: [], basePrice: null, finalPrice: null, priceStatus: 'SEM_PRECO',
      opportunityPriority: opportunity.priority, opportunityReason: opportunity.reason, recommendedAction: opportunity.action,
      auditNotes: [lineage ? `Compra histórica 379 relacionada a ${lineage.status}.` : 'HISTORICAL_SALES_FACT preservado sem correspondência canônica suficiente para EAN/sortimento vigente.'],
    });
  });

  unmatchedCurrent.forEach((currentSale, key) => {
    products.push({
      ean: '', winthorCode: currentSale.winthorCode, colgateSku: '', description: currentSale.description || `Movimento 8022 ${key}`, category: '', subcategory: '', brand: '', assortmentValue: null,
      classification: 'PENDENCIA_CORRESPONDENCIA', isRecommended: false, isLaunch: false, launchLabel: '', lineageStatus: '', predecessorEan: '', successorEan: '', isDiscontinued: false,
      bought: true, purchaseQuantity: 0, purchaseValue: 0, returnValue: 0, netValue: 0, currentPeriodValue: currentSale.value,
      physicalUnits: 0, reservedUnits: 0, availableUnits: 0, portfolioCases: 0, portfolioUnits: 0, projectedUnits: 0, unitsPerCase: 0, unitsPerCaseSource: 'UNKNOWN', availability: 'SEM_ESTOQUE', hasWinthor: Boolean(currentSale.winthorCode),
      promotionIds: [], basePrice: null, finalPrice: null, priceStatus: 'SEM_PRECO', opportunityPriority: 'DIAGNOSTICO', opportunityReason: 'Compra do período atual sem correspondência confiável com EAN/sortimento oficial.', recommendedAction: 'Reconciliar cadastro antes de classificar a compra como dentro ou fora do sortimento.', auditNotes: ['SALES_FACT 8022 preservado; não foi classificado silenciosamente como fora do sortimento.'],
    });
  });

  const recommended = products.filter(item => item.isRecommended);
  const officialAssortment = recommended.length;
  const executableAssortment = recommended.filter(item => item.hasWinthor && item.availableUnits > 0 && !item.isDiscontinued && item.lineageStatus !== 'MIGRACAO_VIGENTE').length;
  const assortmentBought = recommended.filter(item => item.bought).length;
  const mandatory = recommended.filter(item => item.classification === 'MANDATORIO');
  const important = recommended.filter(item => item.classification === 'IMPORTANTE');
  const launchesProducts = recommended.filter(item => item.isLaunch);
  const rank: Record<OpportunityPriority, number> = { MAXIMA: 0, MUITO_ALTA: 1, ALTA: 2, MEDIA: 3, MIGRACAO: 4, DIAGNOSTICO: 5, BLOQUEIO_CADASTRO: 6, BLOQUEIO_DISPONIBILIDADE: 7, SEM_ACAO: 8 };
  const opportunities = products.filter(item => item.opportunityPriority !== 'SEM_ACAO').sort((a, b) => rank[a.opportunityPriority] - rank[b.opportunityPriority] || b.netValue - a.netValue || a.description.localeCompare(b.description));
  const boughtOutsideProducts = products.filter(item => item.bought && (item.classification === 'FORA_DO_SORTIMENTO' || item.classification === 'PENDENCIA_CORRESPONDENCIA'));
  const applicablePromotions = support.promotions.filter(rule => {
    if (rule.status !== 'ATIVA') return false;
    if (rule.validFrom && referenceDate < rule.validFrom) return false;
    if (rule.validTo && referenceDate > rule.validTo) return false;
    if (rule.cnpjs.length && !rule.cnpjs.includes(cnpj)) return false;
    const allows = (values: string[], actual: string) => !values.length || values.some(value => normalizeText(value) === normalizeText(actual));
    return allows(rule.environments, customer.environment) && allows(rule.tiers, customer.tier) && allows(rule.profiles, customer.profile) && allows(rule.networks, customer.network);
  });
  const expected = competence.expectedTotalsByChannel[customer.assortmentChannel];
  const actualMandatory = mandatory.length;
  const actualImportant = important.length;
  const otherRecommended = recommended.filter(item => item.classification === 'RECOMENDADO').length;
  const launchesWithWinthor = launchesProducts.filter(item => item.hasWinthor).length;
  const historyGross=customerPurchases.reduce((sum,item)=>sum+item.grossSalesValue,0);
  const historyReturns=customerPurchases.reduce((sum,item)=>sum+item.returnValue,0);
  const historyNet=customerPurchases.reduce((sum,item)=>sum+item.netValue,0);
  const reconciliation310=support.purchases.filter(item=>item.cnpj===cnpj);
  const reconciliation310Net=reconciliation310.reduce((sum,item)=>sum+item.netValue,0);
  const currentYtd=currentSalesForCustomer(state,cnpj,referenceDate).reduce((sum,item)=>sum+item.value,0);
  const audit: CustomerIntelligenceAuditCheck[] = [
    auditCheck('cnpj.normalized', 'CNPJ normalizado em 14 dígitos', 14, cnpj.length, normalized.note),
    auditCheck('competence.selected', 'Competência oficial selecionada pela data', competence.key, competence.key, `${referenceDate} está entre ${competence.validFrom} e ${competence.validTo}.`),
    auditCheck('assortment.total', `SKUs recomendados · ${customer.assortmentChannel}`, expected?.total ?? null, officialAssortment, expected ? 'A regra confirmada considera qualquer valor diferente de zero como recomendado. Se a própria planilha declarar um total menor, a divergência permanece explícita.' : 'Canal sem total de controle na base.'),
    auditCheck('assortment.mandatory', `Mandatórios · ${customer.assortmentChannel}`, expected?.mandatory ?? null, actualMandatory, ''),
    auditCheck('assortment.important', `Importantes · ${customer.assortmentChannel}`, expected?.important ?? null, actualImportant, ''),
    auditCheck('assortment.decomposition', 'Mandatórios + Importantes + demais recomendados = total recomendado', officialAssortment, actualMandatory + actualImportant + otherRecommended, ''),
    auditCheck('assortment.unique-ean', 'EANs únicos no sortimento vigente', competence.products.length, new Set(competence.products.map(item => cleanDigits(item.ean))).size, 'Migrações vigentes são sobrepostas no parser oficial; EAN antigo não entra no denominador atual apenas por existir no histórico.'),
    auditCheck('history.mapping', 'Registros históricos 379 preservados como mapeados + pendentes', customerPurchases.length, mappedPurchaseRecords + unmatchedPurchases.length, 'Nenhum fato histórico é descartado por falta de EAN atual.'),
    auditCheck('history.net', '379 líquido = vendas brutas - devoluções', historyGross-historyReturns, historyNet, 'Devoluções recebem sinal no Motor Histórico; desconto permanece campo separado.'),
    auditCheck('reconciliation.310', '310 reconcilia o valor histórico 379', reconciliation310.length?reconciliation310Net:null, historyNet, reconciliation310.length?'310 usado somente como referência de reconciliação; ele não alimenta compra, vendedor ou adoção.':'310 não carregado para esta fotografia; cálculo 379 permanece válido.'),
    auditCheck('launches.registration', 'Lançamentos recomendados = com Winthor + sem Winthor', launchesProducts.length, launchesWithWinthor + launchesProducts.filter(item => !item.hasWinthor).length, 'Produto sem Winthor permanece bloqueio de cadastro, não falha do vendedor.'),
    auditCheck('stock.canonical', 'Estoque exibido vem do motor canônico de Estoque', 'CANONICAL_STOCK_PRESENTATION', 'CANONICAL_STOCK_PRESENTATION', `${stock.presentation.products.length} SKU(s) no resultado canônico; Clientes & Sortimento não recalcula reserva/disponível/Carteira.`),
    auditCheck('historical.conformity', 'Conformidade histórica por data da compra', null, '379 POSSUI DATA TRANSACIONAL', 'O 379 já preserva a data de cada venda/devolução. A conformidade histórica completa fica bloqueada somente enquanto não houver classificação de sortimento/cliente versionada cobrindo cada data histórica.'),
  ];
  customer.traces.filter(trace => trace.divergent).forEach((trace, index) => audit.push({ id: `customer.conflict.${index}`, label: `Divergência de cliente · ${trace.field}`, expected: trace.chosen, calculated: trace.values.map(item => `${item.source}: ${item.value}`).join(' | '), status: 'DIVERGENT', note: `Precedência aplicada: ${trace.precedence}. A divergência permanece explícita.` }));

  const limitations: string[] = [];
  if (!support.promotions.length) limitations.push('Promoções: arquitetura pronta, mas não há fonte oficial estruturada carregada; nenhuma elegibilidade foi inventada.');
  if (!support.pricingRules.length) limitations.push('Preço final: preço-base pode ser exibido, mas acréscimo, rappel e ordem de composição ainda não possuem fonte/regra validada.');
  limitations.push('Conformidade histórica completa depende de classificação de cliente/sortimento versionada para cada data do 379; a ausência dessa dimensão não altera o histórico financeiro canônico.');
  limitations.push('Duração definitiva do status de lançamento ainda não foi definida; o motor usa exclusivamente o rótulo oficial da competência carregada.');

  return {
    referenceDate, competenceKey: competence.key, competenceLabel: competence.label, customer,
    officialAssortment, executableAssortment, assortmentBought, assortmentPercent: officialAssortment > 0 ? assortmentBought / officialAssortment : 0,
    mandatoryRecommended: mandatory.length, mandatoryBought: mandatory.filter(item => item.bought).length,
    importantRecommended: important.length, importantBought: important.filter(item => item.bought).length,
    recommendedMissing: recommended.filter(item => !item.bought).length,
    boughtOutside: products.filter(item => item.bought && item.classification === 'FORA_DO_SORTIMENTO').length,
    boughtUnresolved: products.filter(item => item.bought && item.classification === 'PENDENCIA_CORRESPONDENCIA').length,
    ytdNetValue: historyNet+currentYtd,
    opportunitiesAvailableNow: opportunities.filter(item => item.availableUnits > 0 && ['MAXIMA', 'MUITO_ALTA', 'ALTA', 'MEDIA', 'MIGRACAO'].includes(item.opportunityPriority)).length,
    opportunitiesPortfolioOnly: opportunities.filter(item => item.availableUnits <= 0 && item.availability === 'SOMENTE_CARTEIRA').length,
    blockedByStock: opportunities.filter(item => item.opportunityPriority === 'BLOQUEIO_DISPONIBILIDADE').length,
    blockedByRegistration: opportunities.filter(item => item.opportunityPriority === 'BLOQUEIO_CADASTRO').length,
    launches: {
      totalRecommended: launchesProducts.length, adopted: launchesProducts.filter(item => item.bought).length, missing: launchesProducts.filter(item => !item.bought).length,
      availableNow: launchesProducts.filter(item => !item.bought && item.availableUnits > 0).length,
      portfolioOnly: launchesProducts.filter(item => !item.bought && item.availableUnits <= 0 && item.availability === 'SOMENTE_CARTEIRA').length,
      withoutWinthor: launchesProducts.filter(item => !item.hasWinthor).length,
      withoutStockAndPortfolio: launchesProducts.filter(item => item.hasWinthor && item.availability === 'SEM_ESTOQUE').length,
    },
    products: products.sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended) || Number(b.isLaunch) - Number(a.isLaunch) || a.description.localeCompare(b.description)),
    opportunities, launchesProducts, boughtOutsideProducts, promotions: applicablePromotions, audit, limitations,
  };
}

export function listCustomerOptions(state: CanonicalState, support: CustomerIntelligenceSupport) {
  const values = new Map<string, { cnpj: string; name: string; network: string; tier: string; city: string }>();
  support.customers.forEach(item => values.set(item.cnpj, { cnpj: item.cnpj, name: item.name, network: item.network, tier: item.tier, city: item.city }));
  state.support.clients.forEach(item => { const current = values.get(item.cnpj); values.set(item.cnpj, { cnpj: item.cnpj, name: item.name || current?.name || '', network: item.network || current?.network || '', tier: current?.tier || '', city: item.city || current?.city || '' }); });
  state.clients.forEach(item => { const current = values.get(item.cnpj); values.set(item.cnpj, { cnpj: item.cnpj, name: current?.name || item.name, network: current?.network || item.network, tier: current?.tier || '', city: current?.city || item.city }); });
  support.historicalPurchases.forEach(item => { if (!values.has(item.cnpj)) values.set(item.cnpj, { cnpj: item.cnpj, name: '', network: '', tier: '', city: '' }); });
  if(!isUnifiedState(state)) support.purchases.forEach(item => { if (!values.has(item.cnpj)) values.set(item.cnpj, { cnpj: item.cnpj, name: '', network: '', tier: '', city: '' }); });
  return Array.from(values.values()).sort((a, b) => (a.name || a.cnpj).localeCompare(b.name || b.cnpj));
}
