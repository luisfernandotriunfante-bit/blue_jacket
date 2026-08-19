import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('arquivo Sell Out usa RCA atual na aba EQUIPES',()=>{
  const source=readFileSync('src/services/documentGenerator.ts','utf8');
  const start=source.indexOf('function fillPanelTeam');
  const end=source.indexOf('export async function downloadSellOutDocument',start);
  assert.ok(start>=0&&end>start,'fillPanelTeam não localizado');
  const block=source.slice(start,end);
  assert.match(block,/values\[ref\('C',row\)\] = vendor\.newCode/);
  assert.doesNotMatch(block,/vendor\.oldCode/);
});
