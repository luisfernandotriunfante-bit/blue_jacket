import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');

test('checkpoint: configuração manual continua isolada por competência',()=>{
  const persistence=read('src/store/competencePersistence.ts');
  const context=read('src/store/DataContext.tsx');
  assert.match(persistence,/MANUAL_CONFIG_PREFIX='bj_manual_config:'/);
  assert.match(context,/loadManualConfiguration\(localStorage,competence/);
  assert.match(context,/saveManualConfiguration\(localStorage,activeCompetence/);
  assert.doesNotMatch(context,/localStorage\.setItem\('bj_manual_config'/);
});

test('checkpoint: Meta T&C continua separada da Meta Indústria',()=>{
  const engine=read('src/services/canonicalEngine.ts');
  const rules=read('src/domain/targetRules.ts');
  assert.match(engine,/resolveSellOutTarget\(config\.sellOutTarget\)/);
  assert.match(engine,/Meta Sell Out T&C não informada/);
  assert.doesNotMatch(engine,/config\.sellOutTarget > 0 \? config\.sellOutTarget : Math\.max\(industryTarget/);
  assert.match(rules,/redistributeNetworkTotal/);
  assert.match(rules,/redistributeSingleNetwork/);
});

test('checkpoint: exportação TOP REDES mantém K=REDES, L=TOPS e rede canônica',()=>{
  const generator=read('src/services/documentGenerator.ts');
  assert.match(generator,/values\[ref\('K',row\)\] = network\.networkAttainment/);
  assert.match(generator,/values\[ref\('L',row\)\] = network\.topAttainment/);
  assert.match(generator,/values\[ref\('D',row\)\] = result\?\.network \|\| client\.network/);
});

test('checkpoint: auditoria oficial é a reconciliação canônica em três níveis',()=>{
  const page=read('src/pages/ConfiguracoesPage.tsx');
  const presentation=read('src/domain/reconciliationPresentation.ts');
  assert.match(page,/canonical\.reconciliation\?\.checks\|\|\[\]/);
  assert.match(presentation,/INTERNAL:'CONSISTÊNCIA INTERNA'/);
  assert.match(presentation,/SOURCE:'RECONCILIAÇÃO DE FONTES'/);
  assert.match(presentation,/SPREADSHEET:'REGRESSÃO CONTRA PLANILHA'/);
  assert.match(presentation,/return'BLOQUEADO'/);
  assert.match(presentation,/blocked:number/);
});

test('checkpoint: CI mantém ordem typecheck → testes → build antes da publicação',()=>{
  const workflow=read('.github/workflows/pages.yml');
  const typecheck=workflow.indexOf('npm run typecheck');
  const tests=workflow.indexOf('npm run test');
  const build=workflow.indexOf('npm run build');
  const upload=workflow.indexOf('actions/upload-pages-artifact');
  assert.ok(typecheck>=0&&tests>typecheck&&build>tests&&upload>build);
});
