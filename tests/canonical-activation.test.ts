import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activateApprovedCanonicalBundle,deactivateCanonicalBundle,resolveActiveCanonicalBundle,APPROVED_CANONICAL_BUILD } from '../src/canonical/runtime.ts';

class MemoryStorage { values=new Map<string,string>(); getItem(key:string){return this.values.get(key)??null} setItem(key:string,value:string){this.values.set(key,value)} removeItem(key:string){this.values.delete(key)} }
test('approved active pointer resolves only the validated motor build',()=>{const storage=new MemoryStorage();const active=activateApprovedCanonicalBundle(storage as unknown as Storage);assert.equal(active.motorBuildId,'motor-1787651967348');assert.equal(storage.getItem('blue-jacket-v2:canonical-bundle'),null);assert.deepEqual(resolveActiveCanonicalBundle(storage as unknown as Storage),APPROVED_CANONICAL_BUILD);});
test('activation preserves approved counts and does not invoke parser or motor modules',()=>{assert.deepEqual(APPROVED_CANONICAL_BUILD.rowCounts,{M1_ITEM_ESTOQUE:744,M2_CLIENTE_RCA:8748,M3_MOVIMENTO_VENDAS:4291,M4_HISTORICO_TRANSICAO:316772});assert.deepEqual(APPROVED_CANONICAL_BUILD.factTypeCounts,{SALE:3652,INBOUND_ORDER:542,RECEIPT:69,TARGET:28});const runtime=readFileSync('src/canonical/runtime.ts','utf8');assert.doesNotMatch(runtime,/parseSource|buildCanonicalBundle/);});
test('rollback explicitly leaves no active bundle and never resolves legacy data',()=>{const storage=new MemoryStorage();activateApprovedCanonicalBundle(storage as unknown as Storage);deactivateCanonicalBundle(storage as unknown as Storage);assert.equal(resolveActiveCanonicalBundle(storage as unknown as Storage),null);});
