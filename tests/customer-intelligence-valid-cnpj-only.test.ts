import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePremises } from '../src/services/canonical/supportCore.ts';

test('Premissas aceita CNPJ declarado com zero inicial perdido e rejeita código curto', () => {
  const header = Array(16).fill('');
  const valid = Array(16).fill(''); valid[2] = 4757459000519; valid[3] = 'ABV'; valid[10] = 'MILENIO'; valid[12] = 'VAREJO'; valid[13] = 'CNPJ'; valid[15] = 'REDE ABV';
  const invalid = Array(16).fill(''); invalid[2] = 11846; invalid[3] = 'CODIGO'; invalid[10] = 'MILENIO'; invalid[12] = 'REPASSE VAREJO'; invalid[13] = 'CNPJ';
  const parsed = parsePremises([header, valid, invalid]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].cnpj, '04757459000519');
});
