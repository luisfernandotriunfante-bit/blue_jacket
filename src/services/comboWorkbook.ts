import * as XLSX from 'xlsx';
import { comboDiscount } from '../domain/comboPricing';

export type ComboWorkbookProduct = {
  codigo: string;
  descricao: string;
  tablePrice: number;
  practicedPrice: number;
};

export type ComboWorkbookClient = {
  cnpj: string;
  clientCode: string;
};

export function buildComboWorkbook(products: ComboWorkbookProduct[], clients: ComboWorkbookClient[]): XLSX.WorkBook {
  const productRows: Array<Array<string | number>> = [
    ['Código do Item Winthor', 'Descrição Produto', 'Preço de Tabela', 'Preço Praticado', '% de Desconto'],
    ...products.map(product => [
      product.codigo,
      product.descricao,
      product.tablePrice,
      product.practicedPrice,
      comboDiscount(product.tablePrice, product.practicedPrice) ?? 0,
    ]),
  ];

  const productSheet = XLSX.utils.aoa_to_sheet(productRows);
  productSheet['!cols'] = [
    { wch: 20 },
    { wch: 52 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
  ];
  productSheet['!autofilter'] = { ref: `A1:E${productRows.length}` };
  for (let row = 2; row <= productRows.length; row += 1) {
    const codeCell = productSheet[`A${row}`];
    const tableCell = productSheet[`C${row}`];
    const practicedCell = productSheet[`D${row}`];
    const discountCell = productSheet[`E${row}`];
    if (codeCell) codeCell.z = '@';
    if (tableCell) tableCell.z = 'R$ #,##0.00';
    if (practicedCell) practicedCell.z = 'R$ #,##0.00';
    if (discountCell) discountCell.z = '0.00%';
  }

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

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, productSheet, 'Produtos');
  XLSX.utils.book_append_sheet(workbook, clientSheet, 'Clientes');
  return workbook;
}
