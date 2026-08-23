import * as XLSX from 'xlsx';
import type { CanonicalInventoryProduct, CanonicalState } from '../domain/canonical';
import { buildStockPresentation } from '../domain/stockModel';

export interface CanonicalStockWorkbookSummary {
  skuCount: number;
  launchCount: number;
  physicalUnits: number;
  reservedUnits: number;
  availableUnits: number;
  pendingUnits: number;
  projectedUnits: number;
  saleValue: number;
  availableSaleValue: number;
  projectedSaleValue: number;
}

function stockPresentationFromState(state: CanonicalState) {
  return buildStockPresentation({
    inventory: state.inventory,
    productSupport: state.support.products,
    itemCodeSupport: state.support.itemCodes,
    transactions: state.transactions,
    businessDaysElapsed: state.sellOut.businessDaysElapsed,
    stockCostValue: state.stock.costValue,
    stockSaleValue: state.stock.saleValue,
    hasStock105: state.sources.some(source => source.kind === 'stock105' && source.loaded)
      || state.inventory.some(item => Boolean((item as CanonicalInventoryProduct & { physicalSource105?: boolean }).physicalSource105)),
  });
}

function inventoryIndex(state: CanonicalState) {
  return new Map(state.inventory.map(item => [item.code, item]));
}

export function summarizeCanonicalStockWorkbook(state: CanonicalState): CanonicalStockWorkbookSummary {
  const presentation = stockPresentationFromState(state);
  const rawByCode = inventoryIndex(state);
  let availableSaleValue = 0;
  let projectedSaleValue = 0;
  for (const product of presentation.products) {
    const raw = rawByCode.get(product.code);
    const availableSale = product.availableUnits * product.saleUnit;
    const pendingSale = Number(raw?.pendingSale) || 0;
    availableSaleValue += availableSale;
    projectedSaleValue += availableSale + pendingSale;
  }
  return {
    skuCount: presentation.summary.skuCount,
    launchCount: presentation.summary.launchCount,
    physicalUnits: presentation.summary.physicalUnits,
    reservedUnits: presentation.summary.reservedUnits,
    availableUnits: presentation.summary.availableUnits,
    pendingUnits: presentation.summary.pendingUnits,
    projectedUnits: presentation.summary.projectedUnits,
    saleValue: presentation.summary.saleValue,
    availableSaleValue,
    projectedSaleValue,
  };
}

export function buildCanonicalStockWorkbook(state: CanonicalState): XLSX.WorkBook {
  const presentation = stockPresentationFromState(state);
  const rawByCode = inventoryIndex(state);
  const rows = presentation.products.map(product => {
    const raw = rawByCode.get(product.code);
    const pendingSale = Number(raw?.pendingSale) || 0;
    const pendingCost = Number(raw?.pendingCost) || 0;
    const availableSale = product.availableUnits * product.saleUnit;
    const availableCost = product.availableUnits * product.costUnit;
    return {
      'Código Winthor': product.hasWinthor && !product.code.startsWith('EAN-') ? product.code : '',
      'Código Fabricante': product.factoryCode || '',
      EAN: product.ean || '',
      Produto: product.description || '',
      'Un/CX Interno · 8013': product.unitsPerCase > 0 ? product.unitsPerCase : '',
      'Un/CX Indústria · Lista Colgate': product.industryUnitsPerCase > 0 ? product.industryUnitsPerCase : '',
      'Estoque Físico 105 (un.)': product.physicalTotalUnits,
      'Estoque Físico (cx completas)': product.physicalCases,
      'Unidades Avulsas': product.looseUnits,
      'Reservado · 8022 A Faturar': product.reservedUnits,
      'Disponível (un.)': product.availableUnits,
      'Carteira (un.)': product.pendingUnits,
      'Carteira (cx)': product.pendingCases,
      'Estoque Projetado (un.)': product.projectedUnits,
      'Custo Unitário': product.costUnit,
      PVENDA1: product.saleUnit,
      'Valor Estoque Físico a Venda': product.positionSaleValue,
      'Valor Disponível a Venda': availableSale,
      'Valor Disponível a Custo': availableCost,
      'Valor Carteira a Venda': pendingSale,
      'Valor Carteira a Custo': pendingCost,
      'Potencial Projetado a Venda': availableSale + pendingSale,
      'Potencial Projetado a Custo': availableCost + pendingCost,
      Lançamento: product.isLaunch ? 'SIM' : 'NÃO',
      'Possui Winthor': product.hasWinthor ? 'SIM' : 'NÃO',
    };
  });

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!autofilter'] = { ref: sheet['!ref'] || 'A1:Y1' };
  sheet['!cols'] = [
    { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 52 }, { wch: 20 },
    { wch: 24 }, { wch: 22 }, { wch: 24 }, { wch: 16 }, { wch: 24 },
    { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 16 },
    { wch: 14 }, { wch: 26 }, { wch: 24 }, { wch: 24 }, { wch: 22 },
    { wch: 22 }, { wch: 26 }, { wch: 26 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Estoque');

  const auditRows = state.sources.filter(source => source.loaded).map(source => ({
    Fonte: source.kind,
    Arquivo: source.fileName,
    Linhas: source.rows,
    Atualizado: source.updatedAt,
    Observação: source.note || '',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(auditRows), 'Fontes');
  return workbook;
}

export function downloadCanonicalStockWorkbook(state: CanonicalState) {
  const workbook = buildCanonicalStockWorkbook(state);
  const date = state.referenceDate || new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `Blue-Jacket-Estoque-${date}.xlsx`);
}
