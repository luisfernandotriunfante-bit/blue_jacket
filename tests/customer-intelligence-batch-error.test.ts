import test from 'node:test';
import assert from 'node:assert/strict';
import { processCustomerIntelligenceFiles } from '../src/services/customerIntelligenceRepository.ts';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../src/domain/customerIntelligenceTypes.ts';

const HEADER = `COMPRAS POR CLIENTE(S) DE 01/JAN/2026 A 31/DEZ/2026\nProduto Descricao Volumes Qtd Cpa P.Liquido Valor Compras Bonificacao Desconto Vol Dev P.Liquido V.Devolucoes Cnpj/CPF Ven. Agp.`;
const LINE = '11100506 LAVA ROUPA OLA ORIGINAL.........01X 01LT      3,0       1,0       3,0           68,47            0,00          0,00        0,0       0,0           0,00   4594132000140  721   16 COLGATE - OLA';

test('falha de um documento não deixa o botão preso nem impede o restante do lote de ser processado', async () => {
  const broken = new File([HEADER], '310 quebrado.txt', { type: 'text/plain' });
  const valid = new File([`${HEADER}\n${LINE}`], '310 total 2026.txt', { type: 'text/plain' });
  const result = await processCustomerIntelligenceFiles([broken, valid], EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT);
  assert.ok(result.sources.some(source => source.kind === 'ERROR:310 quebrado.txt'));
  assert.ok(result.sources.some(source => source.kind === 'PURCHASE_310'));
  assert.equal(result.purchases.length, 1);
});
