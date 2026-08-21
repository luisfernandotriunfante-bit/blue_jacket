import * as XLSX from 'xlsx';
import type { CustomerIntelligenceResult, ProductCommercialView } from '../domain/customerIntelligenceTypes';

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

function addSheet(workbook: XLSX.WorkBook, name: string, rows: Array<Record<string, unknown>>) {
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Informação: 'Sem registros para esta visão.' }]);
  XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
}

function commercialRows(result: CustomerIntelligenceResult) {
  return result.products.filter(product => product.isRecommended).map(product => ({
    Produto: product.description,
    EAN: product.ean,
    'Código Winthor': product.winthorCode || '',
    Categoria: product.category,
    Subcategoria: product.subcategory,
    Marca: product.brand,
    Classificação: classificationLabel(product.classification),
    Destaque: product.isLaunch ? 'LANÇAMENTO' : '',
    'Preço-base': product.basePrice ?? '',
    'Preço final': product.finalPrice ?? '',
    'Situação do preço': product.priceStatus === 'COMPOSICAO_FINAL_PENDENTE' ? 'Composição final pendente' : product.priceStatus === 'SEM_PRECO' ? 'Sem preço' : 'Preço-base disponível',
    Promoção: product.promotionIds.length ? 'Promoção estruturada elegível' : '',
  }));
}

export function buildCustomerCommercialWorkbook(result: CustomerIntelligenceResult): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  addSheet(workbook, 'Sortimento recomendado', commercialRows(result));
  addSheet(workbook, 'Lançamentos', result.launchesProducts.map(product => ({
    Produto: product.description,
    EAN: product.ean,
    'Código Winthor': product.winthorCode || '',
    Classificação: classificationLabel(product.classification),
    'Já comprou': product.bought ? 'SIM' : 'NÃO',
    'Preço-base': product.basePrice ?? '',
    'Preço final': product.finalPrice ?? '',
    Promoção: product.promotionIds.length ? 'Promoção estruturada elegível' : '',
  })));
  addSheet(workbook, 'Promoções', result.promotions.map(rule => ({
    Promoção: rule.name,
    Validade: `${rule.validFrom || '—'} a ${rule.validTo || '—'}`,
    Benefício: rule.benefit,
    Observação: rule.note,
  })));
  return workbook;
}

export function downloadCustomerCommercialFile(result: CustomerIntelligenceResult) {
  const workbook = buildCustomerCommercialWorkbook(result);
  const safe = result.customer.cnpj || 'cliente';
  XLSX.writeFile(workbook, `Sortimento Comercial - ${safe}.xlsx`);
}

function stockColumns(product: ProductCommercialView) {
  return {
    'Estoque físico un': product.physicalUnits,
    Reservado: product.reservedUnits,
    Disponível: product.availableUnits,
    'Carteira caixas': product.portfolioCases,
    'Carteira unidades': product.portfolioUnits,
    'Un/CX': product.unitsPerCase || '',
    'Origem Un/CX': product.unitsPerCaseSource,
    Projetado: product.projectedUnits,
    Disponibilidade: availabilityLabel(product.availability),
  };
}

export function buildCustomerInternalDossierWorkbook(result: CustomerIntelligenceResult): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
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
    'Valor líquido YTD': result.ytdNetValue,
    'Lançamentos faltantes': result.launches.missing,
    'Comprados fora': result.boughtOutside,
    'Pendências de correspondência': result.boughtUnresolved,
  }]);
  addSheet(workbook, 'Sortimento completo', result.products.map(product => ({
    Produto: product.description, EAN: product.ean, Winthor: product.winthorCode, Colgate: product.colgateSku,
    Classificação: classificationLabel(product.classification), Lançamento: product.isLaunch ? 'SIM' : 'NÃO', Comprou: product.bought ? 'SIM' : 'NÃO',
    'Qtd compra': product.purchaseQuantity, 'Valor compras': product.purchaseValue, Devoluções: product.returnValue, 'Valor líquido': product.netValue,
    ...stockColumns(product), Prioridade: product.opportunityPriority, Motivo: product.opportunityReason, Ação: product.recommendedAction,
  })));
  addSheet(workbook, 'Não comprados', result.products.filter(product => product.isRecommended && !product.bought).map(product => ({ Produto: product.description, EAN: product.ean, Winthor: product.winthorCode, Classificação: classificationLabel(product.classification), Lançamento: product.isLaunch ? 'SIM' : 'NÃO', ...stockColumns(product), Prioridade: product.opportunityPriority, Ação: product.recommendedAction })));
  addSheet(workbook, 'Lançamentos faltantes', result.launchesProducts.filter(product => !product.bought).map(product => ({ Produto: product.description, EAN: product.ean, Winthor: product.winthorCode, Classificação: classificationLabel(product.classification), ...stockColumns(product), Prioridade: product.opportunityPriority, Motivo: product.opportunityReason })));
  addSheet(workbook, 'Comprados fora', result.boughtOutsideProducts.map(product => ({ Produto: product.description, EAN: product.ean, Winthor: product.winthorCode, Classificação: classificationLabel(product.classification), Linhagem: product.lineageStatus, 'EAN anterior': product.predecessorEan, 'EAN sucessor': product.successorEan, 'Valor líquido': product.netValue, Diagnóstico: product.opportunityReason })));
  addSheet(workbook, 'Oportunidades', result.opportunities.map(product => ({ Produto: product.description, EAN: product.ean, Winthor: product.winthorCode, Classificação: classificationLabel(product.classification), Lançamento: product.isLaunch ? 'SIM' : 'NÃO', Prioridade: product.opportunityPriority, Motivo: product.opportunityReason, Ação: product.recommendedAction, ...stockColumns(product) })));
  addSheet(workbook, 'Promoções elegíveis', result.promotions.map(rule => ({ Promoção: rule.name, Início: rule.validFrom, Fim: rule.validTo, Benefício: rule.benefit, Fonte: rule.source })));
  addSheet(workbook, 'Preços', result.products.filter(product => product.isRecommended).map(product => ({ Produto: product.description, EAN: product.ean, Winthor: product.winthorCode, 'Preço-base': product.basePrice ?? '', 'Preço final': product.finalPrice ?? '', Status: product.priceStatus })));
  addSheet(workbook, 'Auditoria', result.audit.map(check => ({ ID: check.id, Regra: check.label, Esperado: check.expected ?? '', Calculado: check.calculated ?? '', Status: check.status, Observação: check.note })));
  addSheet(workbook, 'Limitações', result.limitations.map(limit => ({ Limitação: limit })));
  return workbook;
}

export function downloadCustomerInternalDossier(result: CustomerIntelligenceResult) {
  XLSX.writeFile(buildCustomerInternalDossierWorkbook(result), `Dossiê Interno - ${result.customer.cnpj || 'cliente'}.xlsx`);
}
