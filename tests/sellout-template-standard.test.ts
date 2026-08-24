import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

test('Painel Sell Out mantém o padrão julho para todas as gerações', () => {
  const templatePath = 'public/templates/painel-sell-out-padrao.xlsx';
  assert.equal(existsSync(templatePath), true);
  const workbook = XLSX.read(readFileSync(templatePath), { type: 'buffer', cellFormula: true });
  assert.deepEqual(workbook.SheetNames, ['SELL OUT - Milenio 2026', 'EQUIPES']);
  const panel = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['SELL OUT - Milenio 2026'], { header: 1, defval: '' });
  const teams = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.EQUIPES, { header: 1, defval: '' });
  assert.equal(panel[6]?.[2], 'REFERENCIA DIAS:');
  assert.equal(panel[6]?.[4], 'SELL OUT / VENDA (R$)');
  assert.equal(panel[6]?.[5], 'SELL OUT / FATURADO (R$)');
  assert.equal(panel[6]?.[6], 'POSITIVAÇÃO');
  assert.deepEqual(teams[2]?.slice(0, 20), ['COORD', 'NOME COORD', 'COD', 'NOME', 'META', 'VLR VDA', '% VDA', 'A FATURAR', 'REALIZADO  +                   A FATURAR', '% VDA+ A FAT', 'IDEAL PARA HOJE', 'DIFERENÇA DO IDEAL', 'FALTA VDA TOTAL', 'META POSITIVAÇÃO', 'POSITIVAÇÃO', '% POS', 'POSITIVAÇÃO A FATURAR', 'POSITIVADOS + A FATURAR', '% POS+A FAT', 'IDEAL HOJE POSITIVAÇÕES']);
});

test('gerador usa o template padrão e não troca a ordem da aba EQUIPES', () => {
  const source = readFileSync('src/services/documentGenerator.ts', 'utf8');
  assert.match(source, /const PANEL_TEMPLATE = '\.\/templates\/painel-sell-out-padrao-v2\.xlsx'/);
  assert.match(source, /values\[ref\('A',row\)\] = vendor\.coordinatorCode/);
  assert.match(source, /values\[ref\('B',row\)\] = vendor\.coordinatorName/);
  assert.match(source, /values\[ref\('C',row\)\] = vendor\.newCode/);
  assert.match(source, /values\[ref\('D',row\)\] = vendor\.name/);
});
