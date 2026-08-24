import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { buildCustomerCommercialWorkbook, buildCustomerInternalDossierWorkbook } from '../src/services/customerIntelligenceExport.ts';

const page = () => readFileSync('src/pages/ClientesSortimentoUnifiedPage.tsx', 'utf8');
const main = () => readFileSync('src/main.tsx', 'utf8');
const documents = () => readFileSync('src/pages/DocumentosPage.tsx', 'utf8');

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

test('navegação de Clientes & Sortimento possui somente quatro abas funcionais', () => {
  const source = main();
  const start = source.indexOf('const clientesTopTabs');
  const end = source.indexOf('const topNavigation');
  const tabs = source.slice(start, end);
  for (const label of ['Visão Geral','Sortimento','Lançamentos','Promoções']) assert.match(tabs, new RegExp(label));
  for (const removed of ['Oportunidades','Comprado Fora','Preços','Histórico','Exportar']) assert.doesNotMatch(tabs, new RegExp(removed));
  assert.equal((tabs.match(/\{ id:/g) || []).length, 4);
});

test('Sortimento concentra comprado, não comprado, oportunidade, fora e pendência em filtros da mesma aba', () => {
  const source = page();
  assert.match(source, /type AssortmentScope = 'recommended' \| 'bought' \| 'missing' \| 'opportunities' \| 'outside' \| 'pending'/);
  assert.match(source, /Comprados no sortimento/);
  assert.match(source, /Não comprados no sortimento/);
  assert.match(source, /Oportunidades e diagnósticos/);
  assert.match(source, /Comprados fora/);
  assert.match(source, /Pendências de correspondência/);
  assert.match(source, /scopedProducts\[assortmentScope\]/);
});

test('Comprado Fora continua separado de pendência de correspondência', () => {
  const source = page();
  assert.match(source, /confirmedOutside = result\.products\.filter\(product => product\.bought && product\.classification === 'FORA_DO_SORTIMENTO'\)/);
  assert.match(source, /unresolvedBought = result\.products\.filter\(product => product\.bought && product\.classification === 'PENDENCIA_CORRESPONDENCIA'\)/);
  assert.match(source, /Pendência de correspondência não é chamada de “fora do sortimento”/);
});

test('histórico e preço ficam integrados à ficha e ao SKU, sem abas próprias', () => {
  const source = page();
  assert.match(source, /HISTÓRICO DO CLIENTE/);
  assert.match(source, /PREÇO DO CLIENTE/);
  assert.match(source, /function PriceDetail/);
  assert.match(source, /379: \{fmtBRL\(product\.netValue\)\} · 8022:/);
  assert.doesNotMatch(source, /const pricing =/);
  assert.doesNotMatch(source, /const history =/);
  assert.doesNotMatch(source, /exportView/);
});

test('Promoções não fingem elegibilidade já cumprida', () => {
  const source = page();
  assert.match(source, /Mín\. quantidade/);
  assert.match(source, /Mín\. valor/);
  assert.match(source, /Mínimos de pedido continuam exibidos como condição/);
});

test('exportações por CNPJ existem somente em Documentos e usam o mesmo motor canônico', () => {
  const clientPage = page();
  const docs = documents();
  assert.doesNotMatch(clientPage, /downloadCustomerCommercialFile|downloadCustomerInternalDossier/);
  assert.match(docs, /downloadCustomerCommercialFile/);
  assert.match(docs, /downloadCustomerInternalDossier/);
  assert.match(docs, /buildCustomerIntelligence\(unifiedCanonical, customerSupport, selectedCustomerCnpj/);
  assert.match(docs, /Documentos por CNPJ/);
  assert.match(docs, /Gerar Arquivo Comercial/);
  assert.match(docs, /Gerar Dossiê Interno/);
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
