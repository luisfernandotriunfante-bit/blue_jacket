import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import type { ItemMasterRecord } from '../src/domain/unified';
import { parsePctabprRegion11, runItemMotor } from '../src/services/motors/itemMotor';

const emptyItem = (code: string, ean = ''): ItemMasterRecord => ({
  itemCanonicalId: `WINTHOR:${code}`,
  winthorCode: code,
  internalDescription: 'ITEM TESTE',
  internalEan: ean,
  manufacturerCode: '',
  industrySku: '',
  industryDescription: '',
  industryEan: '',
  industryDun14: '',
  internalUnitsPerCase: null,
  industryUnitsPerCase: null,
  casesPerPallet: null,
  physicalStockUnits: 0,
  blockedStockUnits: 0,
  reservedStockUnits: 0,
  availableStockUnits: 0,
  costUnit105: 0,
  physicalCases8013: 0,
  physicalUnits8013: 0,
  grossKg8013: 0,
  salePricePvenDa1: null,
  pVenda: null,
  vlSt: null,
  isLaunch: false,
  hasWinthor: true,
  sourceKeys: {},
});

function pctabprWorkbook() {
  const rows = [
    ['CODPROD', 'NUMREGIAO', 'REGIAO', 'CODFILIAL', 'PVENDA', 'PVENDA1', 'VLST'],
    [857, 10, 'OUTRA REGIAO', 10, 9.99, 10.99, 1.00],
    [857, 11, 'TABELA CAMPO GRANDE - MCD', 11, 10.46, 11.46, 1.00],
  ];
  return { SheetNames: ['pctabpr'], Sheets: { pctabpr: XLSX.utils.aoa_to_sheet(rows) } } as XLSX.WorkBook;
}

test('PCTABPR canônica lê aba bruta e filtra somente NUMREGIAO=11 usando PVENDA1', () => {
  const prices = parsePctabprRegion11(pctabprWorkbook());
  assert.equal(prices.size, 1);
  assert.deepEqual(prices.get('857'), { pVenda: 10.46, pVenda1: 11.46, vlSt: 1 });
});

test('Motor de Itens preserva layout compacto aprovado de 286 e 105', () => {
  const cadastro = Array(21).fill('');
  cadastro[0] = '11'; cadastro[1] = 857; cadastro[2] = 'ED COLG COLORS'; cadastro[7] = 1812; cadastro[8] = 0; cadastro[9] = 12; cadastro[10] = 1515; cadastro[17] = '7509546688091'; cadastro[18] = '61036090';
  const stock = Array(10).fill('');
  stock[0] = 857; stock[1] = 'ED COLG COLORS'; stock[4] = 1812; stock[6] = 8.864053; stock[9] = 20.27;

  const result = runItemMotor({ normalized286Rows: [cadastro], stock105Rows: [stock], stock8013Rows: [], priceListRows: [], launchRows: [], pctabprWorkbook: pctabprWorkbook(), previousItems: [] });
  const item = result.items.find(row => row.winthorCode === '857');
  assert.ok(item);
  assert.equal(item.internalEan, '7509546688091');
  assert.equal(item.manufacturerCode, '61036090');
  assert.equal(item.physicalStockUnits, 1812);
  assert.equal(item.costUnit105, 8.864053);
  assert.equal(item.availableStockUnits, 1515);
  assert.equal(item.salePricePvenDa1, 11.46, 'PVENDA1 região 11 deve prevalecer sobre P.Venda do 105');
});

test('Motor de Itens reconhece layout expandido atual do 105 com P. Venda pontuado', () => {
  const header = ['Código','Descrição','','','Emb.','','','FL','Qt.Est.','Master','Real+ICMS','','Real','Financ.','P. Venda','','Pr. Comp.'];
  const row = [893,'SAB LIQ PROTEX PRO SER HIALURON','','','01X250ML','','','N',1099,91.5833333333,8.0448,'',8.0448,8.0448,13.1,'',9.349692];
  const result = runItemMotor({ normalized286Rows: [], stock105Rows: [header,row], stock8013Rows: [], priceListRows: [], launchRows: [], pctabprWorkbook: null, previousItems: [emptyItem('893','7891024110000')] });
  const item = result.items[0];
  assert.equal(item.physicalStockUnits, 1099);
  assert.equal(item.costUnit105, 8.0448);
});

test('Lista Oficial de Lançamentos é a autoridade de isLaunch por EAN', () => {
  const previous = [emptyItem('857','7509546688091'), emptyItem('565','7501033207426')];
  previous[1].isLaunch = true;
  const launchRows = [['COD','DESCRIÇÃO','TIPO','ean','STATUS'],['X','ED COLG COLORS','NOVO','7509546688091','ATIVO']];
  const result = runItemMotor({ normalized286Rows: [], stock105Rows: [], stock8013Rows: [], priceListRows: [], launchRows, pctabprWorkbook: null, previousItems: previous });
  assert.equal(result.items.find(row=>row.winthorCode==='857')?.isLaunch, true);
  assert.equal(result.items.find(row=>row.winthorCode==='565')?.isLaunch, false, 'carga oficial substitui flags antigas em vez de acumulá-las');
});
