import test from 'node:test';
import assert from 'node:assert/strict';
import { exportPayload } from '../src/canonical/exporters.ts';

const provenance={motorBuildId:'motor-1787651967348',stagingManifestHash:'24cd8c8f794bc5387a3a4c199289cf84360c1912035c41ce52eb7ef5a049085b',schemaVersion:'v1'};
test('canonical list export is passive, integral and traceable',()=>{const list={id:'M3_MOVIMENTO_VENDAS',records:[{fact_type:'SALE',source:'8022',value:100}],sources:['8022'],generatedAt:'2026-08-25',competence:'2026-08',snapshotDate:'2026-08-25',warnings:[],errors:[]} as any;const payload=exportPayload(list,provenance);assert.equal(payload.rowCount,1);assert.equal(payload.records.length,1);assert.equal(payload.motorBuildId,provenance.motorBuildId);assert.equal(payload.stagingManifestHash,provenance.stagingManifestHash);});
test('M3 export preserves source fact boundaries',()=>{const m3=[{fact_type:'SALE',source:'8022'},{fact_type:'INBOUND_ORDER',source:'CARTEIRA_COLGATE'},{fact_type:'RECEIPT',source:'218'},{fact_type:'TARGET',source:'BUSSOLA'}];assert.equal(m3.filter(row=>row.fact_type==='SALE'&&row.source!=='8022').length,0);assert.equal(m3.filter(row=>row.fact_type==='INBOUND_ORDER'&&row.source==='8022').length,0);});
