import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  APPROVED_PORTFOLIO_2026_08_17,
  applyPortfolioContinuity,
  portfolioSnapshotDate,
} from '../src/domain/portfolioContinuity.ts';

type Row = { orderDate: string; orderNumber: string; orderQty: number; billQty: number; costValue: number };

const row = (orderDate: string, orderNumber: string, costValue: number, orderQty = 0, billQty = 1): Row => ({ orderDate, orderNumber, orderQty, billQty, costValue });

test('extrai a data do snapshot pelo nome da Carteira mesmo quando o maior Order Date é anterior', () => {
  assert.equal(portfolioSnapshotDate('CARTEIRA 20.08.xlsx', [row('2026-08-18', '1', 10)]), '2026-08-20');
});

test('roll-forward mantém pedidos acompanhados, inclui pedidos novos e elimina histórico retroativo', () => {
  const base = applyPortfolioContinuity([
    row('2026-07-30', '100', 100),
    row('2026-08-08', '200', 200),
  ], 'CARTEIRA 08.08.xlsx', null);

  const next = applyPortfolioContinuity([
    row('2026-07-30', '100', 90),
    row('2026-08-08', '200', 180),
    row('2026-08-10', '300', 50),
    row('2026-06-01', '999', 1000),
  ], 'CARTEIRA 17.08.xlsx', base.snapshot);

  assert.deepEqual(next.snapshot.orderNumbers, ['100', '200', '300']);
  assert.equal(next.snapshot.validatedCost, 320);
  assert.equal(next.snapshot.excludedHistoricalCost, 1000);
  assert.equal(next.snapshot.mode, 'ROLL_FORWARD');
});

test('checkpoint aprovado 17/08 reproduz a leitura comparável da Carteira 20/08', () => {
  const previousOrder = APPROVED_PORTFOLIO_2026_08_17.orderNumbers[0];
  const rows: Row[] = [
    row('2026-08-17', previousOrder, 3_235_441.00, 0, 29_000),
    row('2026-08-18', '1160110441', 743.19, 20, 0),
    row('2026-08-18', '1160110442', 7_877.84, 105, 0),
    row('2026-08-18', '1160110443', 7_369.55, 200, 0),
    row('2026-07-10', '9990000001', 4_952_359.08, 0, 50_068),
  ];

  const result = applyPortfolioContinuity(rows, 'CARTEIRA 20.08.xlsx', APPROVED_PORTFOLIO_2026_08_17);
  assert.equal(result.snapshot.validatedCost, 3_251_431.58);
  assert.equal(result.snapshot.excludedHistoricalCost, 4_952_359.08);
  assert.equal(result.snapshot.orderNumbers.length, 4);
  assert.equal(result.rows.some(item => item.orderNumber === '9990000001'), false);
});

test('sem snapshot persistido, uma Carteira posterior a 17/08 usa o checkpoint aprovado como âncora de migração', () => {
  const previousOrder = APPROVED_PORTFOLIO_2026_08_17.orderNumbers[0];
  const result = applyPortfolioContinuity([
    row('2026-08-17', previousOrder, 100),
    row('2026-07-01', '9999999999', 500),
    row('2026-08-18', '1160110441', 50),
  ], 'CARTEIRA 20.08.xlsx', null);

  assert.equal(result.snapshot.validatedCost, 150);
  assert.equal(result.snapshot.excludedHistoricalCost, 500);
  assert.equal(result.snapshot.mode, 'APPROVED_2026_08_17');
});

test('Configurações aplica a continuidade antes de recalcular Estoque e persiste a Carteira filtrada', () => {
  const page = fs.readFileSync(new URL('../src/pages/ConfiguracoesPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /applyPortfolioContinuityToPreparedState\(selectedFiles, prepared\.state\)/);
  assert.match(page, /saveOperationalSourceState\(operationalState\)/);
  assert.match(page, /Carteira comparável/);
});
