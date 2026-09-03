import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHierarchicalTreemap } from '../src/ui/charts/hierarchicalTreemapLayout.ts';

const area = (rect: { width: number; height: number }) => rect.width * rect.height;

test('layout hierárquico entrega áreas proporcionais e sem sobreposição', () => {
  const layout = buildHierarchicalTreemap([
    { id: 'TOTAL', value: 600, data: 'Total' },
    { id: 'LUMOS', value: 300, data: 'Lumos' },
    { id: 'OUTRA', value: 100, data: 'Outra' },
  ], { x: 0, y: 0, width: 1000, height: 600 });
  const total = layout.get('TOTAL')!;
  const lumos = layout.get('LUMOS')!;
  const outra = layout.get('OUTRA')!;

  assert.equal(area(total), 360000);
  assert.equal(area(lumos), 180000);
  assert.equal(area(outra), 60000);
  assert.equal(area(total) + area(lumos) + area(outra), 600000);
  for (const rect of [total, lumos, outra]) {
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.x + rect.width <= 1000 && rect.y + rect.height <= 600);
  }
});
