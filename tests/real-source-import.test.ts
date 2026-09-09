import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseBussola } from '../src/canonical/parsers.ts';
import { detectSourceForFileName, isSourceStageCurrent, REQUIRED_SOURCE_IDS } from '../src/canonical/sourceImport.ts';
import { activateCanonicalBundleReference, resolveActiveCanonicalBundle, type ActiveCanonicalBundle } from '../src/canonical/runtime.ts';

class MemoryStorage { values=new Map<string,string>(); getItem(key:string){return this.values.get(key)??null} setItem(key:string,value:string){this.values.set(key,value)} removeItem(key:string){this.values.delete(key)} }

test('real source import exposes exactly 19 canonical source slots',()=>{assert.equal(REQUIRED_SOURCE_IDS.length,19);assert.equal(new Set(REQUIRED_SOURCE_IDS).size,19);});

test('file-name detection covers the operational source families without mixing 379 years',()=>{
  assert.equal(detectSourceForFileName('379 JAN 2025.txt'),'379 25.txt');
  assert.equal(detectSourceForFileName('379 AGO 2026.txt'),'379 26.txt');
  assert.equal(detectSourceForFileName('vendas-8022.xls'),'vendas-8022.xls');
  assert.equal(detectSourceForFileName('posicao-estoque-105.xls'),'posicao-estoque-105.xls');
  assert.equal(detectSourceForFileName('cadastro-itens-286.xls'),'cadastro-itens-286.xls');
  assert.equal(detectSourceForFileName('pctabpr 13.xlsx'),'pctabpr 13.xlsx');
  assert.equal(detectSourceForFileName("Sortimento Recomendado - Q3'26.xlsx"),"Sortimento Recomendado - Q3'26.xlsx");
  assert.equal(detectSourceForFileName('Bússola de Metas AGOSTO - 2026 DEFINITIVA.xlsx'),'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx');
  assert.equal(detectSourceForFileName('qualquer-arquivo.xlsx'),null);
});

test('Bússola setembro usa o layout real deslocado e materializa metas Colgate',async()=>{
  const matrix:unknown[][]=[[],[],['Supervisor','St','Pas.','','Nome','Cidade','CNPJ','COD WINTHOR','Indústria','Gerente','Meta PNA','Faturado','A Faturar','Real PNA','%','Meta. Pos. Ind.','Pos. % Car','Faturado','A faturar','Real Pos. Ind.','%','Carteira','Meta Global nova'],['Sup',1076,2,'MCD','ADENIS','Campo Grande','00000000000000',17770,'Colgate','Gerente',75000,0,0,0,0,34,0,0,0,0,0,50,75000]];
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(matrix),'Metas');
  const bytes=XLSX.write(workbook,{type:'array',bookType:'xlsx'}) as ArrayBuffer;
  const parsed=await parseBussola(new File([bytes],'Bussola de Metas SETEMBRO - 2026 - MCD.xlsx'));
  assert.equal(parsed.audits.length,0);assert.equal(parsed.rows.length,1);
  assert.equal(parsed.rows[0].industry_name.typed,'Colgate');assert.equal(parsed.rows[0].sales_target_pna.typed,75000);assert.equal(parsed.rows[0].positivity_target.typed,34);
});

test('staging legado da Bússola exige reimportação após correção do layout',()=>{
  assert.equal(isSourceStageCurrent({source:'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx',fileName:'Bussola.xlsx',fileHash:'x',parserVersion:'browser-v1',schemaVersion:'v1',parsedRows:1,warnings:0,errors:0,updatedAt:'2026-09-01T00:00:00.000Z',status:'VALID'}),false);
});

test('runtime accepts a validated dynamic browser build pointer instead of locking one motor id',()=>{
  const storage=new MemoryStorage();
  const dynamic:ActiveCanonicalBundle={status:'ACTIVE',motorBuildId:'motor-browser-test',stagingManifestHash:'abc123',schemaVersion:'v1',engineVersion:'browser-stage3-v1',approvedAt:'2026-08-25T13:00:00.000Z',rowCounts:{M1_ITEM_ESTOQUE:1,M2_CLIENTE_RCA:2,M3_MOVIMENTO_VENDAS:3,M4_HISTORICO_TRANSICAO:4},factTypeCounts:{SALE:1,INBOUND_ORDER:1,RECEIPT:1,TARGET:0}};
  activateCanonicalBundleReference(dynamic,storage as unknown as Storage);
  assert.deepEqual(resolveActiveCanonicalBundle(storage as unknown as Storage),dynamic);
});
