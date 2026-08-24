import * as XLSX from 'xlsx';
import type { CustomerIntelligenceResult, ProductCommercialView, PromotionRule } from '../domain/customerIntelligenceTypes';

function classificationLabel(value: ProductCommercialView['classification']) {
  if (value === 'MANDATORIO') return 'MANDATÓRIO';
  if (value === 'IMPORTANTE') return 'IMPORTANTE';
  if (value === 'RECOMENDADO') return 'RECOMENDADO';
  if (value === 'FORA_DO_SORTIMENTO') return 'FORA DO SORTIMENTO';
  return 'PENDÊNCIA DE CORRESPONDÊNCIA';
}

function availabilityLabel(value: ProductCommercialView['availability']) {
  if (value === 'DISPONIVEL') return 'DISPONÍVEL';
  if (value === 'SOMENTE_CARTEIRA') return 'SOMENTE EM CARTEIRA';
  if (value === 'SEM_WINTHOR') return 'SEM WINTHOR';
  if (value === 'DESCONTINUADO') return 'DESCONTINUADO';
  if (value === 'MIGRACAO') return 'MIGRAÇÃO';
  return 'SEM ESTOQUE';
}

function priceStatusLabel(value: ProductCommercialView['priceStatus']) {
  if (value === 'BASE_DISPONIVEL') return 'Preço-base disponível';
  if (value === 'COMPOSICAO_FINAL_PENDENTE') return 'Composição final pendente';
  return 'Sem preço';
}

function addSheet(workbook: XLSX.WorkBook, name: string, rows: Array<Record<string, unknown>>) {
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Informação: 'Sem registros para esta visão.' }]);
  XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
}

function promotionNames(product: ProductCommercialView, result: CustomerIntelligenceResult) {
  if (!product.promotionIds.length) return '';
  const byId = new Map(result.promotions.map(rule => [rule.id, rule.name]));
  return product.promotionIds.map(id => byId.get(id) || id).join(' | ');
}

function stockColumns(product: ProductCommercialView) {
  return {
    'Estoque físico un': product.physicalUnits,
    Reservado: product.reservedUnits,
    Disponível: product.availableUnits,
    'Carteira caixas': product.portfolioCases,
    'Carteira unidades': product.portfolioUnits,
    'Un/CX interno': product.unitsPerCase || '',
    'Origem Un/CX interno': product.unitsPerCaseSource,
    Projetado: product.projectedUnits,
    Disponibilidade: availabilityLabel(product.availability),
  };
}

function priceColumns(product: ProductCommercialView) {
  return {
    'Preço-base': product.basePrice ?? '',
    'Preço final': product.finalPrice ?? '',
    'Situação do preço': priceStatusLabel(product.priceStatus),
  };
}

function activityColumns(product: ProductCommercialView) {
  return {
    'Já comprou': product.bought ? 'SIM' : 'NÃO',
    '379 valor bruto': product.purchaseValue,
    '379 devoluções': product.returnValue,
    '379 valor líquido': product.netValue,
    '8022 período atual': product.currentPeriodValue,
  };
}

function commercialRows(result: CustomerIntelligenceResult) {
  return result.products.filter(product => product.isRecommended).map(product => ({
    Produto: product.description,
    EAN: product.ean,
    'Código Winthor': product.winthorCode || '',
    'Código Colgate': product.colgateSku || '',
    Categoria: product.category,
    Subcategoria: product.subcategory,
    Marca: product.brand,
    Classificação: classificationLabel(product.classification),
    Destaque: product.isLaunch ? 'LANÇAMENTO' : '',
    ...activityColumns(product),
    ...stockColumns(product),
    Prioridade: product.opportunityPriority,
    Motivo: product.opportunityReason,
    'Ação recomendada': product.recommendedAction,
    Promoções: promotionNames(product, result),
    ...priceColumns(product),
  }));
}

function promotionRows(rules: PromotionRule[]) {
  return rules.map(rule => ({
    Promoção: rule.name,
    Início: rule.validFrom,
    Fim: rule.validTo,
    Benefício: rule.benefit,
    'Mínimo quantidade': rule.minimumQuantity ?? '',
    'Mínimo valor': rule.minimumValue ?? '',
    'Famílias exigidas': rule.requiredFamilies.join(' | '),
    Observação: rule.note,
    Fonte: rule.source,
  }));
}

function outsideRows(result: CustomerIntelligenceResult, classification: ProductCommercialView['classification']) {
  return result.products.filter(product => product.bought && product.classification === classification).map(product => ({
    Produto: product.description,
    EAN: product.ean,
    Winthor: product.winthorCode,
    Classificação: classificationLabel(product.classification),
    Linhagem: product.lineageStatus,
    'EAN anterior': product.predecessorEan,
    'EAN sucessor': product.successorEan,
    ...activityColumns(product),
    Diagnóstico: product.opportunityReason,
    Ação: product.recommendedAction,
  }));
}

export function buildCustomerCommercialWorkbook(result: CustomerIntelligenceResult): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  addSheet(workbook, 'Sortimento recomendado', commercialRows(result));
  addSheet(workbook, 'Oportunidades', result.opportunities.map(product => ({
    Produto: product.description,
    EAN: product.ean,
    Winthor: product.winthorCode,
    Classificação: classificationLabel(product.classification),
    Lançamento: product.isLaunch ? 'SIM' : 'NÃO',
    Prioridade: product.opportunityPriority,
    Motivo: product.opportunityReason,
    Ação: product.recommendedAction,
    ...activityColumns(product),
    ...stockColumns(product),
    Promoções: promotionNames(product, result),
    ...priceColumns(product),
  })));
  addSheet(workbook, 'Lançamentos', result.launchesProducts.map(product => ({
    Produto: product.description,
    EAN: product.ean,
    'Código Winthor': product.winthorCode || '',
    Classificação: classificationLabel(product.classification),
    ...activityColumns(product),
    ...stockColumns(product),
    Prioridade: product.opportunityPriority,
    Promoções: promotionNames(product, result),
    ...priceColumns(product),
  })));
  addSheet(workbook, 'Comprados fora', outsideRows(result, 'FORA_DO_SORTIMENTO'));
  addSheet(workbook, 'Pendências correspondência', outsideRows(result, 'PENDENCIA_CORRESPONDENCIA'));
  addSheet(workbook, 'Promoções', promotionRows(result.promotions));
  addSheet(workbook, 'Preços', result.products.filter(product => product.isRecommended).map(product => ({
    Produto: product.description,
    EAN: product.ean,
    Winthor: product.winthorCode,
    ...priceColumns(product),
  })));
  return workbook;
}

export function downloadCustomerCommercialFile(result: CustomerIntelligenceResult) {
  const workbook = buildCustomerCommercialWorkbook(result);
  const safe = result.customer.cnpj || 'cliente';
  XLSX.writeFile(workbook, `Sortimento Comercial - ${safe}.xlsx`);
}

export function buildCustomerInternalDossierWorkbook(result: CustomerIntelligenceResult): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const history379 = result.products.reduce((sum, product) => sum + product.netValue, 0);
  const current8022 = result.products.reduce((sum, product) => sum + product.currentPeriodValue, 0);
  addSheet(workbook, 'Resumo', [{
    CNPJ: result.customer.cnpj,
    Cliente: result.customer.name,
    Rede: result.customer.network,
    Ambiente: result.customer.environment,
    Perfil: result.customer.profile,
    Faixa: result.customer.tier,
    Canal: result.customer.assortmentChannel,
    Competência: result.competenceLabel,
    'Sortimento oficial': result.officialAssortment,
    'Sortimento executável': result.executableAssortment,
    'Assortment %': result.assortmentPercent,
    '379 valor líquido': history379,
    '8022 período atual': current8022,
    'YTD soma bruta das fontes': result.ytdNetValue,
    'Nota YTD': 'Se a auditoria apontar sobreposição 379 × 8022, validar antes de usar a soma bruta como consolidado.',
    'Lançamentos faltantes': result.launches.missing,
    'Comprados fora': result.boughtOutside,
    'Pendências de correspondência': result.boughtUnresolved,
  }]);
  addSheet(workbook, 'Sortimento completo', result.products.map(product => ({
    Produto: product.description, EAN: product.ean, Winthor: product.winthorCode, Colgate: product.colgateSku,
    Classificação: classificationLabel(product.classification), Lançamento: product.isLaunch ? 'SIM' : 'NÃO',
    ...activityColumns(product), ...stockColumns(product), ...priceColumns(product), Promoções: promotionNames(product, result),
    Prioridade: product.opportunityPriority, Motivo: product.opportunityReason, Ação: product.recommendedAction,
  })));
  addSheet(workbook, 'Não comprados', result.products.filter(product => product.isRecommended && !product.bought).map(product => ({ Produto: product.description, EAN: product.ean, Winthor: product.winthorCode, Classificação: classificationLabel(product.classification), Lançamento: product.isLaunch ? 'SIM' : 'NÃO', ...stockColumns(product), ...priceColumns(product), Prioridade: product.opportunityPriority, Ação: product.recommendedAction })));
  addSheet(workbook, 'Lançamentos faltantes', result.launchesProducts.filter(product => !product.bought).map(product => ({ Produto: product.description, EAN: product.ean, Winthor: product.winthorCode, Classificação: classificationLabel(product.classification), ...stockColumns(product), ...priceColumns(product), Prioridade: product.opportunityPriority, Motivo: product.opportunityReason })));
  addSheet(workbook, 'Comprados fora', outsideRows(result, 'FORA_DO_SORTIMENTO'));
  addSheet(workbook, 'Pendências correspondência', outsideRows(result, 'PENDENCIA_CORRESPONDENCIA'));
  addSheet(workbook, 'Oportunidades', result.opportunities.map(product => ({ Produto: product.description, EAN: product.ean, Winthor: product.winthorCode, Classificação: classificationLabel(product.classification), Lançamento: product.isLaunch ? 'SIM' : 'NÃO', Prioridade: product.opportunityPriority, Motivo: product.opportunityReason, Ação: product.recommendedAction, ...activityColumns(product), ...stockColumns(product), ...priceColumns(product) })));
  addSheet(workbook, 'Promoções elegíveis', promotionRows(result.promotions));
  addSheet(workbook, 'Preços', result.products.filter(product => product.isRecommended).map(product => ({ Produto: product.description, EAN: product.ean, Winthor: product.winthorCode, ...priceColumns(product) })));
  addSheet(workbook, 'Histórico por produto', result.products.filter(product => product.bought).map(product => ({ Produto: product.description, EAN: product.ean, Winthor: product.winthorCode, Classificação: classificationLabel(product.classification), ...activityColumns(product) })));
  addSheet(workbook, 'Auditoria', result.audit.map(check => ({ ID: check.id, Regra: check.label, Esperado: check.expected ?? '', Calculado: check.calculated ?? '', Status: check.status, Observação: check.note })));
  addSheet(workbook, 'Limitações', result.limitations.map(limit => ({ Limitação: limit })));
  return workbook;
}

export function downloadCustomerInternalDossier(result: CustomerIntelligenceResult) {
  XLSX.writeFile(buildCustomerInternalDossierWorkbook(result), `Dossiê Interno - ${result.customer.cnpj || 'cliente'}.xlsx`);
}
