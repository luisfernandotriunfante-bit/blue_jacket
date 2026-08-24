import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Configurações usa checks canônicos da reconciliação',()=>{
  const page=readFileSync('src/pages/ConfiguracoesPage.tsx','utf8');
  assert.match(page,/ReconciliationAuditPanel checks=\{canonical\.reconciliation\?\.checks\s*\|\|\s*\[\]\}/);
  assert.doesNotMatch(page,/type ConsistencyCheck/);
  assert.doesNotMatch(page,/consistency\.map/);
});

test('painel exibe nível, esperado, calculado, diferença e status',()=>{
  const panel=readFileSync('src/ui/audit/ReconciliationAuditPanel.tsx','utf8');
  assert.match(panel,/CONSISTÊNCIA INTERNA|RECONCILIATION_LEVEL_LABELS/);
  assert.match(panel,/>Esperado</);
  assert.match(panel,/>Calculado</);
  assert.match(panel,/>Diferença</);
  assert.match(panel,/>Status</);
  assert.match(panel,/statusLabel\(check\.status\)/);
  assert.match(panel,/check\.status==='BLOCKED'/);
  assert.match(panel,/Um teste bloqueado nunca é apresentado como OK/);
});
