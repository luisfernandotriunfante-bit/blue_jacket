export * from './supportCore';

import type { Row } from './runtime';
import { parseCadastro286 as parseCadastro286Core } from './supportCore';

/**
 * O formato compacto do 286 normaliza o campo Master para a posição 24.
 * No formato antigo essa posição também já apareceu ocupada por identificadores longos,
 * portanto só aceitamos Master como fator Un/CX quando ele é um inteiro operacional
 * plausível. Valores longos (EAN/códigos) continuam apenas como identificadores.
 */
export function parseCadastro286(rows: Row[]) {
  const result = parseCadastro286Core(rows);
  result.byInternal.forEach(item => {
    const factor = Number(item.unitsPerCase) || 0;
    if (!Number.isInteger(factor) || factor <= 0 || factor > 500) delete item.unitsPerCase;
  });
  return result;
}
