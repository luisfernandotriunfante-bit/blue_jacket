import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rcaAttention } from '../src/ui/rcaAttention.ts';
import type { RcaDiagnostic } from '../src/canonical/operationalViewModels.ts';

const item = (code: string, kind: RcaDiagnostic['kind']): RcaDiagnostic => ({ code, kind, rca: null, supervisor: null, reason: '', salesTarget: 0, positivityTarget: 0, saleLines: 0, realized: 0, action: '', samples: [] });
test('contador distingue dois vínculos pendentes de três metas ausentes', () => {
  const result = rcaAttention({ audits: [{ code: 'UNRESOLVED_RCA_IN_VIEW', count: 2, message: '', action: '' }], rcaDiagnostics: [item('1061','NOVOS RCAS'),item('2','NOVOS RCAS'),item('1065','BÚSSOLA'),item('10','BÚSSOLA'),item('20','BÚSSOLA')] });
  assert.equal(result.label, '2 RCA(s) sem vínculo · 3 RCA(s) sem meta positiva');
  assert.deepEqual(result.links.map(x=>x.code), ['1061','2']);
  assert.equal(result.targets.length,3);
});
test('metas pendentes continuam visíveis sem auditoria de vínculo', () => {
  assert.equal(rcaAttention({audits:[],rcaDiagnostics:[item('1065','BÚSSOLA')]}).label,'1 RCA(s) sem meta positiva');
  assert.equal(rcaAttention({audits:[],rcaDiagnostics:[]}).label,'');
});
