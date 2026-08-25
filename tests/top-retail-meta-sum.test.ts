import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopRetailNetworksViewModel } from '../src/canonical/topRetailNetworksModel.ts';
const base={sources:[],generatedAt:'',competence:'2026-08',snapshotDate:'',warnings:[],errors:[]};
const m2={...base,id:'M2_CLIENTE_RCA' as const,records:[{cnpj:'1',top_network:'A',top_target:1},{cnpj:'2',top_network:'B',top_target:2},{cnpj:'3',top_network:'C',top_target:3}]};
const m3={...base,id:'M3_MOVIMENTO_VENDAS' as const,records:[{fact_type:'TARGET',sales_target:10}]};
test('soma das metas por rede fecha exatamente a Meta Redes Geral',()=>{const view=buildTopRetailNetworksViewModel({m2,m3,sellOutTarget:10,networkTargetTotal:100});assert.equal(view.rows.reduce((sum,row)=>sum+(row.networkTarget??0),0),100);});
