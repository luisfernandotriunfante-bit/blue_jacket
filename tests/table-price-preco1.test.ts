import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWinthorTablePrices } from '../src/services/operationalSources';

test('PCTABPR usa Preço 1 (PVENDA1 / coluna S), prioriza sobre PTABELA e normaliza para 2 casas', () => {
  const rows = [
    ['CODPROD', 'NUMREGIAO', 'REGIAO', 'UF', 'CODFILIAL', 'STATUSREGIAO', 'CODICM', 'CODICMTAB', 'PTABELA', 'PVENDA', 'MARGEM', 'PTABELA1', 'PTABELA2', 'PTABELA3', 'PTABELA4', 'PTABELA5', 'PTABELA6', 'PTABELA7', 'PVENDA1'],
    [645, 95, 'TABELA CAMPO GRANDE - MCD 2', 'MS', 11, 'A', 17, 17, 21.53, 21.53, 22, 21.891252, 21.891252, 22.001252, 22.321252, 22.941252, 23.681252, 24.571252, 21.891252],
    [999, 12, 'OUTRA REGIAO', 'SP', 12, 'A', 17, 17, 10, 10, 22, 15, 15, 15, 15, 15, 15, 15, 15],
  ];

  assert.deepEqual(parseWinthorTablePrices(rows), { '645': 21.89 });
});
