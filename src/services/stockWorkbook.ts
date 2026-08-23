import * as XLSX from 'xlsx';
import type { CanonicalState } from '../domain/canonical';

export interface CanonicalStockWorkbookSummary {
  skuCount: number;
  launchCount: number;
  physicalUnits: number;
  pendingUnits: number;
  projectedUnits: number;
  saleValue: number;
  projectedSaleValue: number;
}

export function summarizeCanonicalStockWorkbook(state: CanonicalState): CanonicalStockWorkbookSummary {
  return state.inventory.reduce<CanonicalStockWorkbookSummary>((summary, item) => {
    summary.skuCount += 1;
    if (item.isLaunch) summary.launchCount += 1;
    summary.physicalUnits += Number(item.quantity) || 0;
    summary.pendingUnits += Number(item.pendingQty) || 0;
    summary.projectedUnits += (Number(item.quantity) || 0) + (Number(item.pendingQty) || 0);
    summary.saleValue += (Number(item.quantity) || 0) * (Number(item.saleUnit) || 0);
    summary.projectedSaleValue += ((Number(item.quantity) || 0) * (Number(item.saleUnit) || 0)) + (Number(item.pendingSale) || 0);
    return summary;
  }, { skuCount: 0, launchCount: 0, physicalUnits: 0, pendingUnits: 0, projectedUnits: 0, saleValue: 0, projectedSaleValue: 0 });
}

export function buildCanonicalStockWorkbook(state: CanonicalState): XLSX.WorkBook {
  const rows = state.inventory.map(item => ({
    'Código Winthor': item.hasWinthor && !item.code.startsWith('EAN-') ? item.code : '',
    'Código Fabricante': item.factoryCode || '',
    EAN: item.ean || '',
    Produto: item.description || '',
    'Un/CX': item.physicalCases && item.physicalCases > 0 && item.physicalUnits && item.physicalUnits > 0
      ? item.physicalUnits / item.physicalCases
      : '',
    'Estoque Físico (un.)': Number(item.quantity) || 0,
    'Estoque Físico (cx)': Number(item.physicalCases) || 0,
    'Carteira (un.)': Number(item.pendingQty) || 0,
    'Carteira (cx)': Number(item.pendingCases) || 0,
    'Estoque Projetado (un.)': (Number(item.quantity) || 0) + (Number(item.pendingQty) || 0),
    'Custo Unitário': Number(item.costUnit) || 0,
    'PVENDA1': Number(item.saleUnit) || 0,
    'Valor Estoque a Venda': (Number(item.quantity) || 0) * (Number(item.saleUnit) || 0),
    'Valor Carteira a Venda': Number(item.pendingSale) || 0,
    'Potencial Projetado': ((Number(item.quantity) || 0) * (Number(item.saleUnit) || 0)) + (Number(item.pendingSale) || 0),
    Lançamento: item.isLaunch ? 'SIM' : 'NÃO',
    'Possui Winthor': item.hasWinthor ? 'SIM' : 'NÃO',
  }));

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!autofilter'] = { ref: sheet['!ref'] || 'A1:Q1' };
  sheet['!cols'] = [
    { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 52 }, { wch: 10 },
    { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 22 },
    { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
    { wch: 12 }, { wch: 14 },
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
