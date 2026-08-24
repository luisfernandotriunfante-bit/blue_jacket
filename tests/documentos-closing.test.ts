import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { buildSellOutNetworkPanel, buildSellOutTargetPresentation } from '../src/services/documentGenerator.ts';
import { buildCustomerInternalDossierWorkbook } from '../src/services/customerIntelligenceExport.ts';

const documentsSource = () => readFileSync('src/pages/DocumentosPage.tsx', 'utf8');
const mainSource = () => readFileSync('src/main.tsx', 'utf8');

function sellOutState(overrides:any={}) {
  const base = {
    sellOut: {
      businessDaysElapsed: 10,
      businessDaysTotal: 20,
      businessDaysRemaining: 10,
      sellOutTarget: 2000,
      neededDailyAverage: 125,
      attainment: 0.5,
      positivityAttainment: 0.4,
    },
    industryPositivityTarget: 100,
    networks: [
      { key:'REDE A', name:'REDE A', networkTarget:1000, topTarget:600, invoiced:500, toInvoice:250, total:750, clients:2 },
      { key:'REDE B', name:'REDE B', networkTarget:0, topTarget:900, invoiced:900, toInvoice:100, total:1000, clients:5 },
      { key:'SEM REDE', name:'SEM REDE', networkTarget:800, topTarget:0, invoiced:700, toInvoice:50, total:750, clients:3 },
    ],
  };
  return { ...base, ...overrides, sellOut: { ...base.sellOut, ...(overrides.sellOut || {}) } } as any;
}

function product(overrides:any={}) {
  return {
    ean:'7891000000011',winthorCode:'1001',colgateSku:'C1',description:'Produto teste',category:'',subcategory:'',brand:'',assortmentValue:1,
    classification:'MANDATORIO',isRecommended:true,isLaunch:false,launchLabel:'',lineageStatus:'',predecessorEan:'',successorEan:'',isDiscontinued:false,
    bought:true,purchaseQuantity:1,purchaseValue:80,returnValue:10,netValue:70,currentPeriodValue:30,
    physicalUnits:20,reservedUnits:2,availableUnits:18,portfolioCases:0,portfolioUnits:0,projectedUnits:18,unitsPerCase:12,unitsPerCaseSource:'8013',availability:'DISPONIVEL',hasWinthor:true,
    promotionIds:[],basePrice:5,finalPrice:null,priceStatus:'COMPOSICAO_FINAL_PENDENTE',opportunityPriority:'SEM_ACAO',opportunityReason:'',recommendedAction:'',auditNotes:[],
    ...overrides,
  };
}

function customerResult() {
  const recommended = product();
  const outside = product({ ean:'7891000000028', winthorCode:'1002', description:'Fora confirmado', classification:'FORA_DO_SORTIMENTO', isRecommended:false, netValue:40, currentPeriodValue:10, opportunityPriority:'DIAGNOSTICO' });
  const unresolved = product({ ean:'', winthorCode:'1003', description:'Pendente cadastro', classification:'PENDENCIA_CORRESPONDENCIA', isRecommended:false, netValue:0, currentPeriodValue:50, opportunityPriority:'DIAGNOSTICO' });
  return {
    referenceDate:'2026-08-23',competenceKey:'2026-08_09',competenceLabel:'Ago/Set 2026',
    customer:{cnpj:'04594132000140',name:'CLIENTE',network:'REDE',environment:'H&S',profile:'VAREJO',tier:'FAIXA 1',assortmentChannel:'Hiper',city:'CAMPO GRANDE'},
    officialAssortment:1,executableAssortment:1,assortmentBought:1,assortmentPercent:1,mandatoryRecommended:1,mandatoryBought:1,importantRecommended:0,importantBought:0,recommendedMissing:0,boughtOutside:1,boughtUnresolved:1,ytdNetValue:200,
    opportunitiesAvailableNow:0,opportunitiesPortfolioOnly:0,blockedByStock:0,blockedByRegistration:0,
    launches:{totalRecommended:0,adopted:0,missing:0,availableNow:0,portfolioOnly:0,withoutWinthor:0,withoutStockAndPortfolio:0},
    products:[recommended,outside,unresolved],opportunities:[],launchesProducts:[],boughtOutsideProducts:[outside,unresolved],promotions:[],audit:[],limitations:[],
  } as any;
}

test('Documentos é seção funcional própria e não cria uma navegação paralela de abas', () => {
  const main = mainSource();
  assert.match(main, /\{ id: 'relatorios', label: 'Documentos'/);
  assert.match(main, /activeTab === 'relatorios' \? <DocumentosPage \/>/);
  assert.doesNotMatch(main, /documentosTopTabs|relatoriosTopTabs/);
});

test('Painel Sell Out exportado usa exatamente a população da Meta Rede no Top 5', () => {
  const result = buildSellOutNetworkPanel(sellOutState());
  assert.equal(result.networks.length, 1);
  assert.equal(result.networks[0].name, 'REDE A');
  assert.equal(result.networks[0].target, 1000);
  assert.equal(result.networks[0].invoiced, 500);
  assert.equal(result.networks[0].total, 750);
  assert.equal(result.networks[0].invoicedTrend, 1000);
  assert.equal(result.networks[0].totalTrend, 1500);
  assert.equal(result.consolidated.target, 1000);
  assert.equal(result.consolidated.total, 750);
});

test('Meta Tops isolada e SEM REDE não contaminam o Top 5 de Redes do Painel', () => {
  const result = buildSellOutNetworkPanel(sellOutState());
  assert.deepEqual(result.networks.map(network => network.key), ['REDE A']);
  assert.equal(result.networks.some(network => network.key === 'REDE B'), false);
  assert.equal(result.networks.some(network => network.key === 'SEM REDE'), false);
});

test('documento não fabrica meta, percentual ou necessidade diária quando a regra está indisponível', () => {
  const absent = buildSellOutTargetPresentation(sellOutState({
    industryPositivityTarget: 0,
    sellOut: { sellOutTarget: 0, businessDaysRemaining: 0, neededDailyAverage: 0, attainment: 0, positivityAttainment: 0 },
  }));
  assert.equal(absent.hasSellOutTarget, false);
  assert.equal(absent.hasPositivityTarget, false);
  assert.equal(absent.dailyTarget, null);
  assert.equal(absent.neededDailyAverage, null);
  assert.equal(absent.attainment, null);
  assert.equal(absent.positivityAttainment, null);

  const closedCalendar = buildSellOutTargetPresentation(sellOutState({ sellOut: { businessDaysRemaining: 0, neededDailyAverage: 500 } }));
  assert.equal(closedCalendar.dailyTarget, 100);
  assert.equal(closedCalendar.neededDailyAverage, null);
});

test('Documentos bloqueia exportações operacionais quando a fonte primária não existe', () => {
  const source = documentsSource();
  assert.match(source, /hasSalesSource = canonical\.sources\.some\(source => source\.kind === 'sales8022' && source\.loaded\)/);
  assert.match(source, /hasStock105 = canonical\.sources\.some\(source => source\.kind === 'stock105' && source\.loaded\)/);
  assert.match(source, /disabled=\{generating !== null \|\| !hasSalesSource\}/);
  assert.match(source, /disabled=\{generating !== null \|\| !hasStock105\}/);
  assert.match(source, /Carregue o Vendas 8022 antes de gerar o Painel Sell Out/);
  assert.match(source, /Carregue a Posição 105 antes de gerar o Relatório de Estoque/);
});

test('Dossiê bloqueia YTD consolidado quando 379 e 8022 se sobrepõem', () => {
  const workbook = buildCustomerInternalDossierWorkbook(customerResult(), { hasSalesOverlap: true });
  const summary = XLSX.utils.sheet_to_json<any>(workbook.Sheets.Resumo)[0];
  assert.equal(summary['379 valor líquido'], 110);
  assert.equal(summary['8022 período atual'], 90);
  assert.equal(summary['YTD consolidado'], 'BLOQUEADO');
  assert.match(String(summary['Nota YTD']), /nenhuma soma consolidada foi materializada/i);
  assert.ok(workbook.SheetNames.includes('Promoções aplicáveis'));
  assert.equal(workbook.SheetNames.includes('Promoções elegíveis'), false);
});

test('Dossiê só materializa o YTD quando a fotografia canônica não acusa sobreposição', () => {
  const workbook = buildCustomerInternalDossierWorkbook(customerResult(), { hasSalesOverlap: false });
  const summary = XLSX.utils.sheet_to_json<any>(workbook.Sheets.Resumo)[0];
  assert.equal(summary['YTD consolidado'], 200);
  assert.match(String(summary['Nota YTD']), /Sem sobreposição 379 × 8022/);
});

test('Documentos passa o diagnóstico canônico de sobreposição ao Dossiê e não relê arquivos brutos', () => {
  const source = documentsSource();
  assert.match(source, /HISTORICAL_CURRENT_SALES_OVERLAP/);
  assert.match(source, /downloadCustomerInternalDossier\(customerResult, \{ hasSalesOverlap \}\)/);
  assert.doesNotMatch(source, /XLSX\.read|FileReader|arrayBuffer\(\)|\.text\(\)/);
});
