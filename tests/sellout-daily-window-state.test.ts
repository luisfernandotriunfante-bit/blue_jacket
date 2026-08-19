import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync('src/ui/charts/DailyMovementWindow.tsx','utf8');

test('janela diária preserva a data selecionada ao desmontar e remontar a aba',()=>{
  assert.match(source,/WINDOW_STORAGE_KEY='bj_sellout_daily_window_end'/);
  assert.match(source,/window\.sessionStorage\.getItem\(WINDOW_STORAGE_KEY\)/);
  assert.match(source,/window\.sessionStorage\.setItem\(WINDOW_STORAGE_KEY,date\)/);
  assert.match(source,/useState\(readStoredEndDate\)/);
  assert.doesNotMatch(source,/useEffect\(\(\)=>\{setEndIndex\(maxEnd\)\}/);
});

test('botão Atual seleciona explicitamente o último dia da carga',()=>{
  assert.match(source,/const goCurrent=\(\)=>setSelectedEndDate\(latestDate\)/);
  assert.match(source,/onClick=\{goCurrent\}/);
  assert.match(source,/const move=\(direction:number\)=>selectEnd\(safeEnd\+direction\)/);
});
