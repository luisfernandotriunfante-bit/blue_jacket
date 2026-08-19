import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('estoque deixa explícito que venda e cobertura por produto usam somente faturado',()=>{
  const source=readFileSync('src/pages/EstoquePage.tsx','utf8');
  assert.match(source,/tx\.status !== 'FATURADO'/);
  assert.match(source,/Faturado mês \(Un\)/);
  assert.match(source,/Cobertura ritmo faturado/);
  assert.doesNotMatch(source,/>Venda mês \(Un\)</);
});
