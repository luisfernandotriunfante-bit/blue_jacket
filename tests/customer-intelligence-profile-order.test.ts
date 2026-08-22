import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../src/domain/customerIntelligenceTypes.ts';
import { processCustomerIntelligenceFiles } from '../src/services/customerIntelligenceRepository.ts';

function workbookFile(name: string, workbook: XLSX.WorkBook): File {
  const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return { name, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', arrayBuffer: async () => data } as File;
}
function textFile(name: string, text: string): File { return { name, type: 'text/plain', text: async () => text } as File; }
const txt = `COMPRAS POR CLIENTE\nVALOR COMPRAS V.DEVOLUCOES\n11100001 PRODUTO TESTE 1,0 1,0 1,0 50,00 0,00 0,00 0,0 0,0 0,00 4757459000519 721 2 COLGATE\n`;
function profile(): XLSX.WorkBook {
  const rows = [['AMBIENTE','COD CLIENTE','NOME_CLIENTE','FAIXAS','ESTADO','CIDADE','PERFIL','TIPO','REDE'],['H&S',4757459000519,'ABV','FAIXA 1','MS','DOURADOS','VAREJO','CNPJ','REDE ABV']];
  return { SheetNames:['Exportação PDVs'], Sheets:{'Exportação PDVs': XLSX.utils.aoa_to_sheet(rows)} } as XLSX.WorkBook;
}

test('310 primeiro e perfil depois mantém compras e segmentação', async () => {
  let support = await processCustomerIntelligenceFiles([textFile('310 total 2026.txt', txt)], EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT);
  support = await processCustomerIntelligenceFiles([workbookFile('clientes.xlsx', profile())], support);
  assert.equal(support.purchases.length, 1);
  assert.equal(support.customers.length, 1);
  assert.equal(support.customers[0].network, 'REDE ABV');
});
