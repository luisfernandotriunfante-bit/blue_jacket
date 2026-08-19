import test from 'node:test';
import assert from 'node:assert/strict';
import type { CanonicalReconciliationCheck } from '../src/domain/canonical.ts';
import { RECONCILIATION_LEVEL_LABELS, checksByLevel, formatReconciliationValue, statusLabel, summarizeReconciliation } from '../src/domain/reconciliationPresentation.ts';

const checks:CanonicalReconciliationCheck[]=[
  {id:'a',level:'INTERNAL',label:'Interno',expected:100,calculated:100,difference:0,tolerance:.01,status:'OK',source:'Motor'},
  {id:'b',level:'SOURCE',label:'Fonte',expected:100,calculated:90,difference:-10,tolerance:.01,status:'DIVERGENT',source:'8022'},
  {id:'c',level:'SPREADSHEET',label:'Planilha',expected:null,calculated:null,difference:null,tolerance:0,status:'BLOCKED',source:'FORMULA.xlsm',note:'BLOQUEADA POR FONTE AUSENTE'},
];

test('auditoria resume OK, divergente e bloqueado separadamente',()=>{
  assert.deepEqual(summarizeReconciliation(checks),{total:3,ok:1,divergent:1,blocked:1});
  assert.equal(statusLabel('OK'),'OK');
  assert.equal(statusLabel('DIVERGENT'),'DIVERGENTE');
  assert.equal(statusLabel('BLOCKED'),'BLOQUEADO');
});

test('três níveis possuem nomenclatura exigida pela auditoria',()=>{
  assert.equal(RECONCILIATION_LEVEL_LABELS.INTERNAL,'CONSISTÊNCIA INTERNA');
  assert.equal(RECONCILIATION_LEVEL_LABELS.SOURCE,'RECONCILIAÇÃO DE FONTES');
  assert.equal(RECONCILIATION_LEVEL_LABELS.SPREADSHEET,'REGRESSÃO CONTRA PLANILHA');
  assert.equal(checksByLevel(checks,'SOURCE').length,1);
  assert.equal(checksByLevel(checks,'SPREADSHEET')[0].status,'BLOCKED');
});

test('esperado, calculado e diferença permanecem apresentáveis sem fabricar valor',()=>{
  assert.equal(formatReconciliationValue(null),'—');
  assert.equal(formatReconciliationValue('BLOQUEADO'),'BLOQUEADO');
  assert.equal(formatReconciliationValue(1234.5),'1.234,5');
  assert.equal(formatReconciliationValue(-10),'-10');
});
