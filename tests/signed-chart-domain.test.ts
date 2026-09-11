import test from 'node:test';
import assert from 'node:assert/strict';
import { signedChartDomain } from '../src/ui/charts/signedChartDomain.ts';
test('escala inclui devoluções negativas e vendas positivas sem recortar séries', () => {
  const domain = signedChartDomain([-91701.78, -84356.34, 443674.72, 80101.8]);
  assert.ok(domain.min < -91701.78);
  assert.ok(domain.max > 443674.72);
});
test('escala de movimentos exclusivamente negativos preserva zero e inclui o mínimo', () => {
  const domain = signedChartDomain([-150, -20]);
  assert.ok(domain.min < -150);
  assert.equal(domain.max, 0);
});
test('escala permanece finita com zeros, série vazia e valores inválidos', () => {
  for (const values of [[], [0, 0], [NaN, Infinity]]) {
    const domain = signedChartDomain(values);
    assert.ok(Number.isFinite(domain.min));
    assert.ok(Number.isFinite(domain.max));
    assert.ok(domain.max > domain.min);
  }
});
