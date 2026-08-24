import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { buildCustomerCommercialWorkbook, buildCustomerInternalDossierWorkbook } from '../src/services/customerIntelligenceExport.ts';

const page = () => readFileSync('src/pages/ClientesSortimentoUnifiedPage.tsx', 'utf8');
const main = () => readFileSync('src/main.tsx', 'utf8');

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

function resultFixture() {
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

test('Clientes & Sortimento mantém hooks estáveis durante a hidratação da base', () => {
  const source = page();
  const memoIndex = source.indexOf('const support = useMemo');
  const emptyIndex = source.indexOf('if (!unifiedCanonical)');
  assert.ok(memoIndex >= 0 && emptyIndex > memoIndex, 'useMemo precisa executar antes do retorno de estado vazio');
  assert.match(source, /const unifiedCanonical = canonical && isUnifiedCanonicalState\(canonical\) \? canonical : null/);
});

test('navegação preserva exatamente as nove abas de Clientes & Sortimento', () => {
  const source = main();
  for (const label of ['Visão Geral','Sortimento','Oportunidades','Lançamentos','Comprado Fora','Promoções','Preços','Histórico','Exportar']) assert.match(source, new RegExp(label));
});

test('Comprado Fora não mistura pendência de correspondência com fora confirmado', () => {
  const source = page();
  assert.match(source, /confirmedOutside = result\.products\.filter\(product => product\.bought && product\.classification === 'FORA_DO_SORTIMENTO'\)/);
  assert.match(source, /unresolvedBought = result\.products\.filter\(product => product\.bought && product\.classification === 'PENDENCIA_CORRESPONDENCIA'\)/);
  assert.match(source, /não são chamados de fora do sortimento até a correspondência ser resolvida/);
});

test('tela separa valores 379 e 8022 e bloqueia YTD combinado quando há sobreposição', () => {
  const source = page();
  assert.match(source, /Valor 379/);
  assert.match(source, /Valor 8022/);
  assert.match(source, /HISTORICAL_CURRENT_SALES_OVERLAP/);
  assert.match(source, /YTD consolidado/);
  assert.match(source, /BLOQUEADO/);
});

test('Preços e Promoções não fingem composição ou elegibilidade já cumprida', () => {
  const source = page();
  assert.match(source, /mode === 'pricing'/);
  assert.match(source, /Preço final/);
  assert.match(source, /COMPOSIÇÃO FINAL PENDENTE/);
  assert.match(source, /Mín\. quantidade/);
  assert.match(source, /Mín\. valor/);
  assert.match(source, /Mínimos de pedido continuam exibidos como condição/);
});

test('arquivo comercial separa fora, pendência e valores das duas fontes', () => {
  const workbook = buildCustomerCommercialWorkbook(resultFixture());
  assert.deepEqual(workbook.SheetNames, ['Sortimento recomendado','Oportunidades','Lançamentos','Comprados fora','Pendências correspondência','Promoções','Preços']);
  const recommended = XLSX.utils.sheet_to_json<any>(workbook.Sheets['Sortimento recomendado']);
  assert.equal(recommended[0]['379 valor líquido'], 70);
  assert.equal(recommended[0]['8022 período atual'], 30);
  assert.equal(recommended[0]['Situação do preço'], 'Composição final pendente');
  const outside = XLSX.utils.sheet_to_json<any>(workbook.Sheets['Comprados fora']);
  const unresolved = XLSX.utils.sheet_to_json<any>(workbook.Sheets['Pendências correspondência']);
  assert.deepEqual(outside.map(row=>row.Produto), ['Fora confirmado']);
  assert.deepEqual(unresolved.map(row=>row.Produto), ['Pendente cadastro']);
});

test('dossiê interno não mascara a origem financeira do histórico', () => {
  const workbook = buildCustomerInternalDossierWorkbook(resultFixture());
  const summary = XLSX.utils.sheet_to_json<any>(workbook.Sheets.Resumo)[0];
  assert.equal(summary['379 valor líquido'], 110);
  assert.equal(summary['8022 período atual'], 90);
  assert.match(String(summary['Nota YTD']), /sobreposição 379 × 8022/);
  assert.ok(workbook.SheetNames.includes('Histórico por produto'));
  assert.ok(workbook.SheetNames.includes('Pendências correspondência'));
});
