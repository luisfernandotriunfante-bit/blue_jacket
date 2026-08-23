import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../src/domain/customerIntelligenceTypes.ts';
import { buildCustomerIntelligence } from '../src/domain/customerIntelligence.ts';
import { processCustomerIntelligenceFiles } from '../src/services/customerIntelligenceRepository.ts';
import { hasStandaloneCustomerProfile, parseStandaloneCustomerProfiles } from '../src/services/customerIntelligenceProfiles.ts';
import { normalizeOfficialAssortmentWorkbook, officialAssortmentCoverage } from '../src/services/customerIntelligenceOfficialWorkbook.ts';
import { parseActiveRoute, parsePremises } from '../src/services/canonical/supportCore.ts';

function workbookFile(name: string, workbook: XLSX.WorkBook): File {
  const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return { name, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', arrayBuffer: async () => data } as File;
}

function textFile(name: string, text: string): File {
  return { name, type: 'text/plain', text: async () => text } as File;
}

function customerProfileWorkbook(): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['SEMESTRE_PREMISSA','AMBIENTE','COD CLIENTE','NOME_CLIENTE','FAIXAS','ESTADO','CIDADE','IND_CLUSTER_COD','IND_CLUSTER_DESC','AVG 12 MESES','AREA DISTRIBUIDOR','AREA NIELSEN','PERFIL','TIPO','CHECK PDV','REDE'],
    ['2SEM26 - Q3','H&S',4757459000519,'CD-00 ABV COMERCIO DE ALIMENTOS LTDA','FAIXA 1','MS','DOURADOS','','',0,'MILENIO','Area VII','TOP VAREJISTA','CNPJ','PDV EXISTENTE','REDE ABV'],
    ['2SEM26 - Q3','REPASSE',11846,'REGISTRO INVALIDO','FAIXA 5','MS','CAMPO GRANDE','','',0,'MILENIO','Area VII','REPASSE VAREJO','CNPJ','PDV EXISTENTE',''],
  ]);
  return { SheetNames: ['Exportação PDVs (9)'], Sheets: { 'Exportação PDVs (9)': sheet } } as XLSX.WorkBook;
}

function officialWorkbookWithRealNameVariants(): XLSX.WorkBook {
  const header = ['STATUS','COD','','EAN','CATEGORIA MASTER','CATEGORIA','SUBCATEGORIA','MARCA','SUBMARCA','SEGMENTO','SUBSEGMENTO','CONTENTS','AMOUNT','PROMO','LANÇAMENTO','DESCRIÇÃO','Hiper'];
  const controls = [
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL SKUs', 1],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL SKUs MANDATÓRIOS (1)', 1],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL SKUs IMPORTANTES (2)', 0],
  ];
  const july = XLSX.utils.aoa_to_sheet([...controls, header,
    ['ATIVO','61000001','11100001','7891000000011','ORAL CARE','HIGIENE ORAL','CREME DENTAL','COLGATE','','','','','','INDIVIDUAL','','Produto 1',1],
  ]);
  const aug = XLSX.utils.aoa_to_sheet([...controls, header,
    ['ATIVO','61000001','11100001','7891000000011','ORAL CARE','HIGIENE ORAL','CREME DENTAL','COLGATE','','','','','','INDIVIDUAL','','Produto 1',1],
  ]);
  return {
    SheetNames: ['Jul26 - Base Comercial', 'Ago Set26 - Base Comercial'],
    Sheets: { 'Jul26 - Base Comercial': july, 'Ago Set26 - Base Comercial': aug },
  } as XLSX.WorkBook;
}

const purchase310Text = `COMPRAS POR CLIENTE\nVALOR COMPRAS                         V.DEVOLUCOES\n11100001 PRODUTO TESTE 2,0 2,0 1,0 100,00 0,00 30,00 1,0 0,5 10,00 4757459000519 721 2 COLGATE - CREME DENTAL\n`;

test('Exportação PDVs isolada fornece Ambiente, Perfil, Faixa, Rede e canal por CNPJ', () => {
  const workbook = customerProfileWorkbook();
  assert.equal(hasStandaloneCustomerProfile(workbook), true);
  const parsed = parseStandaloneCustomerProfiles(workbook);
  assert.equal(parsed.customers.length, 1);
  assert.equal(parsed.customers[0].cnpj, '04757459000519');
  assert.equal(parsed.customers[0].environment, 'H&S');
  assert.equal(parsed.customers[0].profile, 'TOP VAREJISTA');
  assert.equal(parsed.customers[0].tier, 'FAIXA 1');
  assert.equal(parsed.customers[0].assortmentChannel, 'Hiper');
  assert.equal(parsed.customers[0].network, 'REDE ABV');
  assert.equal(parsed.rejectedIdentifiers, 1);
});

test('Premissas não deixa código de cliente curto como 11846 virar CNPJ selecionável', () => {
  const row = Array(16).fill('');
  row[2] = '11846'; row[3] = 'CLIENTE INVALIDO'; row[6] = 'CAMPO GRANDE'; row[10] = 'MILENIO'; row[12] = 'REPASSE VAREJO'; row[13] = 'CNPJ';
  assert.equal(parsePremises([Array(16).fill(''), row]).length, 0);
});

test('Roteiro rejeita identificador curto e não interpreta OURO como faixa', () => {
  const header = Array(19).fill('');
  const invalid = Array(19).fill(''); invalid[1] = 'MILENIO'; invalid[2] = '11846'; invalid[10] = 'OURO';
  const valid = Array(19).fill(''); valid[1] = 'MILENIO'; valid[2] = '4757459000519'; valid[3] = 'ABV'; valid[5] = 'REDE ABV'; valid[10] = 'OURO'; valid[15] = 'ABV'; valid[16] = 'DOURADOS';
  const workbook = { SheetNames: ['Roteiro Ativo'], Sheets: { 'Roteiro Ativo': XLSX.utils.aoa_to_sheet([header, invalid, valid]) } } as XLSX.WorkBook;
  const parsed = parseActiveRoute(workbook);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].cnpj, '04757459000519');
  assert.equal(parsed[0].tier, '');
});

test('nomes reais variantes de Julho e Agosto/Setembro são reconhecidos sem inventar competência', () => {
  const workbook = officialWorkbookWithRealNameVariants();
  const coverage = officialAssortmentCoverage(workbook);
  assert.equal(coverage.hasJuly, true);
  assert.equal(coverage.hasAugSep, true);
  const normalized = normalizeOfficialAssortmentWorkbook(workbook);
  assert.ok(normalized.SheetNames.some(name => name.includes('Jul26 - Base_Sortimento')));
  assert.ok(normalized.SheetNames.some(name => name.includes('Ago & Set26 - Base_Sortimento')));
});

test('310 TXT atualiza compras sem apagar a segmentação e mantém Valor Compras como líquido', async () => {
  const withProfiles = await processCustomerIntelligenceFiles([workbookFile('Base clientes.xlsx', customerProfileWorkbook())], EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT);
  assert.equal(withProfiles.customers.length, 1);
  const withPurchases = await processCustomerIntelligenceFiles([textFile('310 total 2026.txt', purchase310Text)], withProfiles);
  assert.equal(withPurchases.customers.length, 1);
  assert.equal(withPurchases.customers[0].tier, 'FAIXA 1');
  assert.equal(withPurchases.purchases.length, 1);
  assert.equal(withPurchases.purchases[0].returnValue, 10);
  assert.equal(withPurchases.purchases[0].netValue, 100, 'V.Devoluções permanece campo de reconciliação e não é abatido novamente');
});

test('perfil + 310 + sortimento oficial de agosto produzem ficha usando Valor Compras líquido', async () => {
  let support = await processCustomerIntelligenceFiles([workbookFile('Base clientes.xlsx', customerProfileWorkbook())], EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT);
  support = await processCustomerIntelligenceFiles([textFile('310 total 2026.txt', purchase310Text)], support);
  support = await processCustomerIntelligenceFiles([workbookFile('Sortimento Oficial Q3.xlsx', officialWorkbookWithRealNameVariants())], support);

  assert.equal(support.customers.length, 1);
  assert.equal(support.purchases.length, 1);
  assert.equal(support.assortmentCompetences.length, 2);

  const state = {
    referenceDate: '2026-08-21', sources: [],
    support: {
      products: [{ sku: '61000001', ean: '7891000000011', description: 'Produto 1', category: '', subcategory: '', brand: 'COLGATE', isLaunch: false, boxPrice: 0, unitPrice: 10, unitsPerCase: 12, line: '' }],
      itemCodes: [{ internalCode: '11100001', description: 'Produto 1', ean: '7891000000011', factoryCode: '61000001' }],
      clients: [], activeRoute: [], rcas: [], vendorTargets: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {},
    },
    clients: [], vendors: [], transactions: [], sellOut: { businessDaysElapsed: 10 }, stock: { costValue: 0, saleValue: 0 },
    inventory: [{ code: '11100001', description: 'Produto 1', ean: '7891000000011', quantity: 24, costUnit: 5, saleUnit: 10, pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: false, hasWinthor: true, factoryCode: '61000001', physicalCases: 0, physicalUnits: 0, grossKg: 0 }],
  } as any;

  const result = buildCustomerIntelligence(state, support, '04757459000519', '2026-08-21');
  assert.equal(result.customer.network, 'REDE ABV');
  assert.equal(result.customer.environment, 'H&S');
  assert.equal(result.customer.tier, 'FAIXA 1');
  assert.equal(result.customer.assortmentChannel, 'Hiper');
  assert.equal(result.competenceKey, '2026-08_09');
  assert.equal(result.officialAssortment, 1);
  assert.equal(result.assortmentBought, 1);
  assert.equal(result.ytdNetValue, 100);
});