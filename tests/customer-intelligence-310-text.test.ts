import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyExternalCustomerSource,
  isPurchase310Text,
  parsePurchase310Text,
} from '../src/services/customerIntelligence310Text.ts';
import { processCustomerIntelligenceFiles } from '../src/services/customerIntelligenceRepository.ts';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../src/domain/customerIntelligenceTypes.ts';

const HEADER = `MCD - TRIUNFANTE BRASIL DIST. ALIM. S.A.
COMPRAS POR CLIENTE(S) DE 01/JAN/2026 A 31/DEZ/2026
Produto Descricao                                 Volumes   Qtd Cpa P.Liquido   Valor Compras     Bonificacao      Desconto    Vol Dev P.Liquido   V.Devolucoes        Cnpj/CPF  Ven.  Agp.`;

const REAL_LINE = '        11100506 LAVA ROUPA OLA ORIGINAL.........01X 01LT      3,0       1,0       3,0           68,47            0,00          0,00        0,0       0,0           0,00   4594132000140  721   16 COLGATE - OLA';

function textFile(name: string, content: string) {
  return new File([content], name, { type: 'text/plain' });
}

test('310 TXT real é reconhecido pelo conteúdo e recompõe CNPJ de 13 para 14 dígitos', () => {
  const text = `${HEADER}\n${REAL_LINE}`;
  assert.equal(isPurchase310Text(text, '310 total 2026.txt'), true);
  const parsed = parsePurchase310Text(text);
  assert.equal(parsed.parsedLines, 1);
  assert.equal(parsed.purchases.length, 1);
  const row = parsed.purchases[0];
  assert.equal(row.cnpj, '04594132000140');
  assert.equal(row.winthorCode, '11100506');
  assert.equal(row.volumes, 3);
  assert.equal(row.quantity, 1);
  assert.equal(row.purchaseValue, 68.47);
  assert.equal(row.returnValue, 0);
  assert.equal(row.netValue, 68.47);
  assert.equal(row.vendorCode, '721');
  assert.equal(row.groupingCode, '16');
});

test('310 TXT mantém regra Valor líquido = Compras - Devoluções e não subtrai desconto', () => {
  const line = '        11100001 PRODUTO TESTE....................01X 01UN      2,0       1,0       1,0          100,00            0,00         30,00        1,0       0,0          10,00  12345678000199  721    2 COLGATE - TESTE';
  const row = parsePurchase310Text(`${HEADER}\n${line}`).purchases[0];
  assert.equal(row.purchaseValue, 100);
  assert.equal(row.returnValue, 10);
  assert.equal(row.netValue, 90);
});

test('310 TXT não transforma identificador de 11 dígitos em CNPJ positivável', () => {
  const cpfLine = '        11100001 PRODUTO CPF......................01X 01UN      2,0       1,0       1,0          100,00            0,00          0,00        0,0       0,0           0,00     12345678901  721    2 COLGATE - TESTE';
  const validLine = REAL_LINE;
  const parsed = parsePurchase310Text(`${HEADER}\n${cpfLine}\n${validLine}`);
  assert.equal(parsed.rejectedIdentifiers, 1);
  assert.equal(parsed.purchases.length, 1);
  assert.equal(parsed.purchases[0].cnpj, '04594132000140');
});

test('fontes globais conhecidas deixam de aparecer como UNKNOWN', () => {
  assert.equal(classifyExternalCustomerSource('379 25.txt'), 'HISTORICO_379');
  assert.equal(classifyExternalCustomerSource('relatorio_carteira_clientes.xls'), 'CARTEIRA_CLIENTES');
  assert.equal(classifyExternalCustomerSource('$SOM DIARIO.xlsx'), 'SOM_DIARIO');
  assert.equal(classifyExternalCustomerSource('carteira_cliente (2).csv'), 'CARTEIRA_CLIENTES');
  assert.equal(classifyExternalCustomerSource('relatorio_roteiro_consolidado_geral.xlsx'), 'ROTEIRO');
});

test('um único upload aceita vários documentos e processa cada arquivo independentemente', async () => {
  const valid310 = textFile('310 total 2026.txt', `${HEADER}\n${REAL_LINE}`);
  const history = textFile('379 25.txt', 'conteúdo histórico fora do módulo local');
  const unknown = textFile('arquivo_sem_assinatura.txt', 'qualquer conteúdo');

  const result = await processCustomerIntelligenceFiles([valid310, history, unknown], EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT);
  assert.equal(result.purchases.length, 1);
  assert.ok(result.sources.some(source => source.kind === 'PURCHASE_310'));
  assert.ok(result.sources.some(source => source.kind.startsWith('GLOBAL:HISTORICO_379:')));
  assert.ok(result.sources.some(source => source.kind === 'UNKNOWN:arquivo_sem_assinatura.txt'));
});

test('erro em um arquivo não bloqueia os documentos seguintes do mesmo lote', async () => {
  const broken = textFile('310 quebrado.txt', HEADER);
  const valid = textFile('310 total 2026.txt', `${HEADER}\n${REAL_LINE}`);
  const result = await processCustomerIntelligenceFiles([broken, valid], EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT);

  assert.ok(result.sources.some(source => source.kind === 'ERROR:310 quebrado.txt'));
  assert.ok(result.sources.some(source => source.kind === 'PURCHASE_310'));
  assert.equal(result.purchases.length, 1);
});
