import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { channelFromTier, parseCustomerAndPurchaseWorkbook, parseOfficialAssortmentWorkbook } from '../src/services/customerIntelligenceSources.ts';
import { buildCustomerIntelligence } from '../src/domain/customerIntelligence.ts';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../src/domain/customerIntelligenceTypes.ts';

function assortmentSheet(rows: unknown[][]) { return XLSX.utils.aoa_to_sheet(rows); }

function officialWorkbook() {
  const header = ['STATUS','COD','','EAN','CATEGORIA MASTER','CATEGORIA','SUBCATEGORIA','MARCA','SUBMARCA','SEGMENTO','SUBSEGMENTO','CONTENTS','AMOUNT','PROMO','LANÇAMENTO','DESCRIÇÃO','Hiper','Super G'];
  const control = [
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL SKUs', 3, 2],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL SKUs MANDATÓRIOS (1)', 1, 1],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL SKUs IMPORTANTES (2)', 1, 1],
  ];
  const july = [...control, header,
    ['ATIVO','61000001','11100001','7891000000011','ORAL CARE','HIGIENE ORAL','CREME DENTAL','COLGATE','','','','','','INDIVIDUAL','SINGLE','Produto 1',1,1],
    ['ATIVO','61000002','11100002','7891000000028','ORAL CARE','HIGIENE ORAL','ESCOVA','COLGATE','','','','','','INDIVIDUAL','SINGLE','Produto 2',2,2],
    ['ATIVO','61000003','','7891000000035','ORAL CARE','HIGIENE ORAL','ENXAGUANTE','COLGATE','','','','','','INDIVIDUAL','SINGLE','Produto 3',3,0],
  ];
  const aug = [...control, header,
    ["Lançamento Q3",'61000001','11100001','7891000000011','ORAL CARE','HIGIENE ORAL','CREME DENTAL','COLGATE','','','','','','INDIVIDUAL','Lançamento Q3','Produto 1',1,1],
    ['ATIVO','61000002','11100002','7891000000028','ORAL CARE','HIGIENE ORAL','ESCOVA','COLGATE','','','','','','INDIVIDUAL','SINGLE','Produto 2',2,2],
    ['ATIVO','61000003','','7891000000035','ORAL CARE','HIGIENE ORAL','ENXAGUANTE','COLGATE','','','','','','INDIVIDUAL','SINGLE','Produto 3',3,0],
  ];
  const hairHeader = ['STATUS','COD ANTIGO','EAN ANTIGO','COD NOVO','EAN NOVO','CATEGORIA MASTER','CATEGORIA','SUBCATEGORIA','MARCA','SUBMARCA','SEGMENTO','SUBSEGMENTO','CONTENTS','AMOUNT','PROMO','LANÇAMENTO','DESCRIÇÃO','Hiper','Super G'];
  const hair = [['','','','','','','','','','','','','','','','','','',''],['','','','','','','','','','','','','','','','','','',''],['','','','','','','','','','','','','','','','','','',''],['','','','','','','','','','','','','','','','','','',''],['','','','','','','','','','','','','','','','','','',''],['','','','','','','','','','','','','','','','','','',''],hairHeader,
    ["MUDANÇA SKU Ago'26",'61009999','7891000099992','61009998','7891000099985','HIGIENE PESSOAL','CABELOS','SHAMPOO','PALMOLIVE','','','','315','1','INDIVIDUAL','SINGLE','Hair novo',1,1],
  ];
  const discontinued = [['','','','','','','','','','','','','','','TOTAL SKUs',0],['','','','','','','','','','','','','','','TOTAL SKUs MANDATÓRIOS (1)',0],['','','','','','','','','','','','','','','TOTAL SKUs IMPORTANTES (2)',0],['STATUS','COD','EAN','CATEGORIA MASTER','CATEGORIA','SUBCATEGORIA','MARCA','SUBMARCA','SEGMENTO','SUBSEGMENTO','CONTENTS','AMOUNT','PROMO','LANÇAMENTO','DESCRIÇÃO','Hiper'],['DESCONTINUADO','61007777','7891000077778','ORAL CARE','HIGIENE ORAL','CREME DENTAL','COLGATE','','','','90','1','INDIVIDUAL','SINGLE','Descontinuado',0]];
  return { SheetNames: ['Jul26 - Base_Sortimento_Naciona','Ago & Set26 - Base_Sortimento_N','SORTIMENTO HAIR CARE AGO26 &SET','Descontinuados Q326'], Sheets: {
    'Jul26 - Base_Sortimento_Naciona': assortmentSheet(july),
    'Ago & Set26 - Base_Sortimento_N': assortmentSheet(aug),
    'SORTIMENTO HAIR CARE AGO26 &SET': assortmentSheet(hair),
    'Descontinuados Q326': assortmentSheet(discontinued),
  } } as XLSX.WorkBook;
}

test('mapeamento de faixa é regra de domínio e cobre as seis faixas conhecidas', () => {
  assert.equal(channelFromTier('FAIXA 1'), 'Hiper');
  assert.equal(channelFromTier('FAIXA 2'), 'Super G');
  assert.equal(channelFromTier('FAIXA 3'), 'Super P');
  assert.equal(channelFromTier('FAIXA 4'), 'Vizinhança GDE');
  assert.equal(channelFromTier('FAIXA 5'), 'Vizinhança PEQ');
  assert.equal(channelFromTier('FAIXA 6'), 'Tradicional Independente');
});

test('sortimento oficial é versionado por competência e preserva controles da fonte', () => {
  const parsed = parseOfficialAssortmentWorkbook(officialWorkbook());
  assert.equal(parsed.competences.length, 2);
  assert.equal(parsed.competences[0].key, '2026-07');
  assert.equal(parsed.competences[1].key, '2026-08_09');
  assert.deepEqual(parsed.competences[1].expectedTotalsByChannel.Hiper, { total: 3, mandatory: 1, important: 1 });
  const migration = parsed.lineage.find(item => item.status === 'MIGRACAO_VIGENTE');
  assert.equal(migration?.oldEan, '7891000099992');
  assert.equal(migration?.newEan, '7891000099985');
  assert.ok(parsed.lineage.some(item => item.status === 'DESCONTINUADO' && item.oldEan === '7891000077778'));
});

test('310 recompõe CNPJ em 14 dígitos e valor líquido não desconta desconto', () => {
  const workbook = { SheetNames: ['310 total 2026','Exportação PDVs (9)'], Sheets: {
    '310 total 2026': assortmentSheet([
      ['Codigo','Descricao','Volumes','QtdCompra','PesoLiquido','ValorCompras','Bonificacao','Desconto','VolumeDevolucao','PesoDevolucao','ValorDevolucoes','CNPJ','Vendedor','Agrupamento','DescricaoAgrupamento'],
      [11100002,'Produto 2',2,2,0,100,0,30,1,0,10,4594132000140,721,2,'COLGATE'],
    ]),
    'Exportação PDVs (9)': assortmentSheet([
      ['SEMESTRE_PREMISSA','AMBIENTE','COD CLIENTE','NOME_CLIENTE','FAIXAS','ESTADO','CIDADE','IND_CLUSTER_COD','IND_CLUSTER_DESC','AVG 12 MESES','AREA DISTRIBUIDOR','AREA NIELSEN','PERFIL','TIPO','CHECK PDV','REDE'],
      ['2SEM26 - Q3','H&S',4594132000140,'CLIENTE TESTE','FAIXA 1','MS','CAMPO GRANDE','','',0,'MILENIO','Area VII','VAREJO','CNPJ','PDV EXISTENTE','REDE TESTE'],
    ]),
  } } as XLSX.WorkBook;
  const parsed = parseCustomerAndPurchaseWorkbook(workbook);
  assert.equal(parsed.purchases[0].cnpj, '04594132000140');
  assert.equal(parsed.purchases[0].purchaseValue, 100);
  assert.equal(parsed.purchases[0].returnValue, 10);
  assert.equal(parsed.purchases[0].netValue, 90);
  assert.equal(parsed.customers[0].assortmentChannel, 'Hiper');
});

test('motor por CNPJ separa oficial, executável, lançamento, bloqueio e compra histórica', () => {
  const assortment = parseOfficialAssortmentWorkbook(officialWorkbook());
  const cnpj = '04594132000140';
  const support = {
    ...EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT,
    assortmentCompetences: assortment.competences,
    lineage: assortment.lineage,
    customers: [{ cnpj, cnpjRaw: '4594132000140', name: 'CLIENTE TESTE', clientCode: '', network: 'REDE TESTE', environment: 'H&S', profile: 'VAREJO', tier: 'FAIXA 1', assortmentChannel: 'Hiper', city: 'CAMPO GRANDE', state: 'MS', vendorCode: '', coordinatorCode: '', coordinatorName: '', source: 'TESTE' }],
    purchases: [{ cnpj, cnpjRaw: '4594132000140', winthorCode: '11100002', description: 'Produto 2', volumes: 2, quantity: 2, purchaseValue: 100, returnVolume: 1, returnValue: 10, netValue: 90, vendorCode: '721', groupingCode: '2', groupingDescription: 'COLGATE' }],
  };
  const state = {
    referenceDate: '2026-08-17', sources: [],
    support: {
      products: [
        { sku: '61000001', ean: '7891000000011', description: 'Produto 1', category: '', subcategory: '', brand: 'COLGATE', isLaunch: false, boxPrice: 0, unitPrice: 10, unitsPerCase: 12, line: '' },
        { sku: '61000002', ean: '7891000000028', description: 'Produto 2', category: '', subcategory: '', brand: 'COLGATE', isLaunch: false, boxPrice: 0, unitPrice: 20, unitsPerCase: 12, line: '' },
      ],
      itemCodes: [
        { internalCode: '11100001', description: 'Produto 1', ean: '7891000000011', factoryCode: '61000001' },
        { internalCode: '11100002', description: 'Produto 2', ean: '7891000000028', factoryCode: '61000002' },
      ], clients: [], activeRoute: [], rcas: [], vendorTargets: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {},
    },
    clients: [], vendors: [{ newCode: '721', oldCode: '', name: 'VENDEDOR', coordinatorCode: '1', coordinatorName: 'COORD', salesTarget: 0, positivityTarget: 0, invoiced: 0, toInvoice: 0, total: 0, attainment: 0, invoicedPositivation: 0, futurePositivation: 0, totalPositivation: 0, positivityAttainment: 0, idealSalesToday: 0, salesGapToIdeal: 0, salesGapToTarget: 0, idealPositivationToday: 0, positivityGapToIdeal: 0, positivityGapToTarget: 0, positivityDailyTarget: 0 }],
    transactions: [], sellOut: { businessDaysElapsed: 10 }, stock: { costValue: 0, saleValue: 0 },
    inventory: [
      { code: '11100001', description: 'Produto 1', ean: '7891000000011', quantity: 24, costUnit: 5, saleUnit: 10, pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: false, hasWinthor: true, factoryCode: '61000001', physicalCases: 0, physicalUnits: 0, grossKg: 0 },
      { code: '11100002', description: 'Produto 2', ean: '7891000000028', quantity: 12, costUnit: 10, saleUnit: 20, pendingQty: 0, pendingCases: 0, pendingCost: 0, pendingSale: 0, isLaunch: false, hasWinthor: true, factoryCode: '61000002', physicalCases: 0, physicalUnits: 0, grossKg: 0 },
    ],
  } as any;
  const result = buildCustomerIntelligence(state, support, cnpj, '2026-08-17');
  assert.equal(result.customer.cnpj.length, 14);
  assert.equal(result.officialAssortment, 3);
  assert.equal(result.assortmentBought, 1);
  assert.equal(result.executableAssortment, 2);
  assert.equal(result.launches.totalRecommended, 1);
  assert.equal(result.launches.missing, 1);
  assert.equal(result.launches.availableNow, 1);
  assert.equal(result.blockedByRegistration, 1);
  assert.equal(result.opportunities.find(item => item.ean === '7891000000011')?.opportunityPriority, 'MAXIMA');
  assert.equal(result.audit.find(item => item.id === 'historical.conformity')?.status, 'BLOCKED');
  assert.equal(result.audit.find(item => item.id === 'purchases.net')?.status, 'OK');
});
