import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSourceForFileName, REQUIRED_SOURCE_IDS } from '../src/canonical/sourceImport.ts';
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

test('runtime accepts a validated dynamic browser build pointer instead of locking one motor id',()=>{
  const storage=new MemoryStorage();
  const dynamic:ActiveCanonicalBundle={status:'ACTIVE',motorBuildId:'motor-browser-test',stagingManifestHash:'abc123',schemaVersion:'v1',engineVersion:'browser-stage3-v1',approvedAt:'2026-08-25T13:00:00.000Z',rowCounts:{M1_ITEM_ESTOQUE:1,M2_CLIENTE_RCA:2,M3_MOVIMENTO_VENDAS:3,M4_HISTORICO_TRANSICAO:4},factTypeCounts:{SALE:1,INBOUND_ORDER:1,RECEIPT:1,TARGET:0}};
  activateCanonicalBundleReference(dynamic,storage as unknown as Storage);
  assert.deepEqual(resolveActiveCanonicalBundle(storage as unknown as Storage),dynamic);
});
