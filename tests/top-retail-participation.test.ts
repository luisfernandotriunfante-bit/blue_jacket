import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopRetailNetworksViewModel } from '../src/canonical/topRetailNetworksModel.ts';
const base={sources:[],generatedAt:'',competence:'2026-08',snapshotDate:'',warnings:[],errors:[]};
const m2={...base,id:'M2_CLIENTE_RCA' as const,records:[{cnpj:'001',top_network:'A',top_target:100},{cnpj:'002',premise_network:'FORA'}]};
const m3={...base,id:'M3_MOVIMENTO_VENDAS' as const,records:[{fact_type:'SALE',cnpj:'001',value:100},{fact_type:'SALE',cnpj:'002',value:300},{fact_type:'TARGET',sales_target:1000}]};
test('participação da rede é sobre o Sell Out total, mantendo universo Top separado',()=>{const view=buildTopRetailNetworksViewModel({m2,m3,sellOutTarget:1000,networkTargetTotal:500});assert.equal(view.rows[0]?.share,0.25);});
