import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyExternalCustomerSource } from '../src/services/customerIntelligence310Text.ts';

test('arquivos auxiliares reais do módulo são reconhecidos pelo papel correto em vez de UNKNOWN', () => {
  const files = [
    ['379 25.txt', 'HISTORICO_379'],
    ['379 26.txt', 'HISTORICO_379'],
    ['relatorio_carteira_clientes.xls', 'CARTEIRA_CLIENTES'],
    ['carteira_cliente (2).csv', 'CARTEIRA_CLIENTES'],
    ['$SOM DIARIO.xlsx', 'SOM_DIARIO'],
    ['relatorio_roteiro_consolidado_geral.xlsx', 'ROTEIRO'],
  ] as const;
  for (const [name, expected] of files) assert.equal(classifyExternalCustomerSource(name), expected, name);
});
