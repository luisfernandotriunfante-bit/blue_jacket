export * from './supportCore';

import type { Row } from './runtime';
import { parseCadastro286 as parseCadastro286Core } from './supportCore';

/**
 * O campo Master do Cadastro 286 é identificador/código de master, não fator de
 * embalagem. A heurística antiga que aceitava inteiros entre 1 e 500 podia
 * transformar códigos como 200 em "200 Un/CX". O 286 continua sendo usado para
 * Winthor ↔ fábrica ↔ EAN, mas nunca como fonte de unitsPerCase.
 */
export function parseCadastro286(rows: Row[]) {
  const result = parseCadastro286Core(rows);
  result.byInternal.forEach(item => { delete item.unitsPerCase; });
  return result;
}
