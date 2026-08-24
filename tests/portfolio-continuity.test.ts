import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyPortfolioContinuity, APPROVED_PORTFOLIO_2026_08_17, portfolioContinuityWarning } from '../src/domain/portfolioContinuity.ts';

function row(orderDate:string,orderNumber:string,costValue:number,orderQty=1,billQty=0) {
  return { orderDate, orderNumber, orderQty, billQty, costValue, sourceRow:1 };
}

test('extrai a data do snapshot pelo nome da Carteira mesmo quando o maior Order Date é anterior',()=>{
  const result=applyPortfolioContinuity([row('2026-08-10','1',100)],'CARTEIRA 20.08.xlsx',null);
  assert.equal(result.snapshot.snapshotDate,'2026-08-20');
});

test('roll-forward mantém pedidos acompanhados, inclui pedidos novos e elimina histórico retroativo',()=>{
  const initial=applyPortfolioContinuity([
    row('2026-08-01','100',100),
    row('2026-08-02','200',200),
  ],'CARTEIRA 17.08.xlsx',null);
  const next=applyPortfolioContinuity([
    row('2026-08-01','100',80),
    row('2026-08-02','200',150),
    row('2026-07-01','300',300),
    row('2026-08-18','400',400),
  ],'CARTEIRA 20.08.xlsx',initial.snapshot);
  assert.deepEqual(next.snapshot.orderNumbers,['100','200','400']);
  assert.equal(next.snapshot.validatedCost,630);
  assert.equal(next.snapshot.excludedHistoricalCost,300);
});

test('checkpoint aprovado 17/08 reproduz a leitura comparável da Carteira 20/08',()=>{
  const previousOrder=APPROVED_PORTFOLIO_2026_08_17.orderNumbers[0];
  const result=applyPortfolioContinuity([
    row('2026-08-17',previousOrder,100),
    row('2026-07-01','9999999999',500),
    row('2026-08-18','1160110441',50),
  ],'CARTEIRA 20.08.xlsx',APPROVED_PORTFOLIO_2026_08_17);
  assert.equal(result.snapshot.validatedCost,150);
  assert.equal(result.snapshot.excludedHistoricalCost,500);
  assert.match(portfolioContinuityWarning(result.snapshot),/Carteira comparável/);
});

test('sem snapshot persistido, uma Carteira posterior a 17/08 usa o checkpoint aprovado como âncora de migração',()=>{
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
  assert.match(page, /applyPortfolioContinuityToPreparedState\(selectedFiles, prepared\.state, staged\.storage\)/);
  assert.match(page, /saveOperationalSourceState\(operationalState, staged\.storage\)/);
  assert.match(page, /processUnifiedFiles/);
  assert.ok(page.indexOf('applyPortfolioContinuityToPreparedState') < page.indexOf('const result = await processUnifiedFiles'));
  assert.ok(page.indexOf('const result = await processUnifiedFiles') < page.indexOf('staged.commit()'));
  assert.match(page, /Carteira comparável/);
});
