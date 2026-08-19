import * as XLSX from 'xlsx';
import { comboDiscount } from '../domain/comboPricing';

export type ComboWorkbookProduct = {
  codigo: string;
  descricao: string;
  tablePrice: number;
  practicedPrice: number | null;
};

export type ComboWorkbookClient = {
  cnpj: string;
  clientCode: string;
};

export type ComboWorkbookOptions = {
  includeClients: boolean;
  includeTablePrice: boolean;
  includePracticedPrice: boolean;
  includeDiscount: boolean;
};

export const DEFAULT_COMBO_WORKBOOK_OPTIONS: ComboWorkbookOptions = {
  includeClients: true,
  includeTablePrice: true,
  includePracticedPrice: true,
  includeDiscount: true,
};

export function buildComboWorkbook(
  products: ComboWorkbookProduct[],
  clients: ComboWorkbookClient[],
  options: ComboWorkbookOptions = DEFAULT_COMBO_WORKBOOK_OPTIONS,
): XLSX.WorkBook {
  const columns: Array<{
    header: string;
    width: number;
    value: (product: ComboWorkbookProduct) => string | number;
    format?: string;
  }> = [
    { header: 'Código do Item Winthor', width: 20, value: product => product.codigo, format: '@' },
    { header: 'Descrição Produto', width: 52, value: product => product.descricao },
  ];

  if (options.includeTablePrice) {
    columns.push({ header: 'Preço de Tabela', width: 18, value: product => product.tablePrice, format: 'R$ #,##0.00' });
  }
  if (options.includePracticedPrice) {
    columns.push({ header: 'Preço Praticado', width: 18, value: product => product.practicedPrice ?? 0, format: 'R$ #,##0.00' });
  }
  if (options.includeDiscount) {
    columns.push({
      header: '% de Desconto',
      width: 16,
      value: product => comboDiscount(product.tablePrice, product.practicedPrice) ?? 0,
      format: '0.00%',
    });
  }

  const productRows: Array<Array<string | number>> = [
    columns.map(column => column.header),
    ...products.map(product => columns.map(column => column.value(product))),
  ];

  const productSheet = XLSX.utils.aoa_to_sheet(productRows);
  productSheet['!cols'] = columns.map(column => ({ wch: column.width }));
  productSheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(columns.length - 1)}${productRows.length}` };
  for (let row = 2; row <= productRows.length; row += 1) {
    columns.forEach((column, index) => {
      if (!column.format) return;
      const cell = productSheet[`${XLSX.utils.encode_col(index)}${row}`];
      if (cell) cell.z = column.format;
    });
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, productSheet, 'Produtos');

  if (options.includeClients) {
    const clientRows: Array<Array<string>> = [
      ['CNPJ', 'Código Winthor'],
      ...clients.map(client => [client.cnpj, client.clientCode]),
    ];
    const clientSheet = XLSX.utils.aoa_to_sheet(clientRows);
    clientSheet['!cols'] = [{ wch: 20 }, { wch: 18 }];
    clientSheet['!autofilter'] = { ref: `A1:B${clientRows.length}` };
    for (let row = 2; row <= clientRows.length; row += 1) {
      const cnpjCell = clientSheet[`A${row}`];
      const codeCell = clientSheet[`B${row}`];
      if (cnpjCell) cnpjCell.z = '@';
      if (codeCell) codeCell.z = '@';
    }
    XLSX.utils.book_append_sheet(workbook, clientSheet, 'Clientes');
  }

  return workbook;
}
