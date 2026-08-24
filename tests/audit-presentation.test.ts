import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditNotices, summarizeQualityIssues } from '../src/domain/auditPresentation.ts';

test('auditoria considera fonte unificada obrigatória mesmo sem SourceAudit legado',()=>{
  const notices=buildAuditNotices({sources:[{id:'officialAssortment',label:'Sortimento Oficial',required:true,loaded:false}]});
  assert.equal(notices.length,1); assert.equal(notices[0].severity,'BLOCKED'); assert.match(notices[0].text,/Sortimento Oficial/);
});

test('auditoria centraliza divergências e erros de qualidade com ação',()=>{
  const notices=buildAuditNotices({sources:[],checks:[{id:'x',level:'SOURCE',label:'Identidade 105 × 286',expected:0,calculated:2,difference:2,tolerance:0,status:'BLOCKED',source:'105 × 286',note:'2 itens sem identidade'}],qualityIssues:[{id:'q',domain:'ITEM',severity:'ERROR',code:'STOCK_105_CODE_NOT_IN_ITEM_MASTER',message:'Código não localizado',source:'Estoque 105',entityKey:'123'}]});
  assert.equal(notices.length,2); assert.equal(notices[0].severity,'BLOCKED'); assert.equal(notices[1].severity,'ERROR'); assert.match(notices[1].action,/Estoque 105/);
});

test('resumo de qualidade preserva exemplos de entidades afetadas',()=>{
  const rows=summarizeQualityIssues([{id:'1',domain:'SALES',severity:'WARNING',code:'X',message:'Falha',source:'8022',entityKey:'A'},{id:'2',domain:'SALES',severity:'WARNING',code:'X',message:'Falha',source:'8022',entityKey:'B'}]);
  assert.equal(rows[0].count,2); assert.deepEqual(rows[0].entities,['A','B']);
});
