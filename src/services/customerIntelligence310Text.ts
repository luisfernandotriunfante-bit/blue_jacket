import type { PurchaseHistory310 } from '../domain/customerIntelligenceTypes';
import { cleanCode, normalizeCnpj, normalizeText, parseNumber } from './canonical/utils';

const PT_BR_NUMBER = '(?:-?(?:\\d{1,3}(?:\\.\\d{3})*|\\d+),\\d+-?)';
const PRODUCT_LINE = new RegExp(
  `^\\s*(111\\d{5})\\s+(.+?)\\s+(${PT_BR_NUMBER})\\s+(${PT_BR_NUMBER})\\s+(${PT_BR_NUMBER})\\s+(${PT_BR_NUMBER})\\s+(${PT_BR_NUMBER})\\s+(${PT_BR_NUMBER})\\s+(${PT_BR_NUMBER})\\s+(${PT_BR_NUMBER})\\s+(${PT_BR_NUMBER})\\s+(\\d{11,14})\\s+(\\d+)\\s+(\\d+)\\s+(.+?)\\s*$`,
);

export interface Purchase310TextParseResult {
  purchases: PurchaseHistory310[];
  parsedLines: number;
  rejectedIdentifiers: number;
}

export function isPurchase310Text(text: string, fileName = ''): boolean {
  const name = normalizeText(fileName);
  const signature = normalizeText(text.slice(0, 160_000));
  const bodyLooksLike310 = signature.includes('COMPRAS POR CLIENTE')
    && signature.includes('VALOR COMPRAS')
    && signature.includes('V.DEVOLUCOES');
  return bodyLooksLike310 || (name.includes('310') && signature.includes('COMPRAS POR CLIENTE'));
}

export function parsePurchase310Text(text: string): Purchase310TextParseResult {
  const aggregate = new Map<string, PurchaseHistory310>();
  let parsedLines = 0;
  let rejectedIdentifiers = 0;

  for (const rawLine of text.split(/\r\n|\n|\r/g)) {
    const match = rawLine.match(PRODUCT_LINE);
    if (!match) continue;

    const rawIdentifier = match[12];
    const identifierDigits = rawIdentifier.replace(/\D/g, '');
    // O 310 declara CGC/CPF. Só autorizamos recomposição quando o valor possui
    // 12-14 dígitos, faixa compatível com CNPJ que perdeu zero(s) no Excel.
    // CPF de 11 dígitos permanece fora da inteligência por CNPJ.
    const normalized = normalizeCnpj(rawIdentifier, { declaredCnpj: identifierDigits.length >= 12 });
    const cnpj = normalized.canonical;
    if (!cnpj || cnpj.length !== 14) {
      rejectedIdentifiers += 1;
      continue;
    }

    const winthorCode = cleanCode(match[1]);
    const key = `${cnpj}:${winthorCode}`;
    const current = aggregate.get(key) || {
      cnpj,
      cnpjRaw: normalized.raw,
      winthorCode,
      description: match[2].trim(),
      volumes: 0,
      quantity: 0,
      purchaseValue: 0,
      returnVolume: 0,
      returnValue: 0,
      netValue: 0,
      vendorCode: cleanCode(match[13]),
      groupingCode: cleanCode(match[14]),
      groupingDescription: match[15].trim(),
    };

    current.volumes += parseNumber(match[3]);
    current.quantity += parseNumber(match[4]);
    current.purchaseValue += parseNumber(match[6]);
    current.returnVolume += parseNumber(match[9]);
    current.returnValue += parseNumber(match[11]);
    current.netValue = current.purchaseValue - current.returnValue;
    aggregate.set(key, current);
    parsedLines += 1;
  }

  if (parsedLines === 0) {
    throw new Error('Compras 310 TXT: o relatório foi identificado, mas nenhuma linha de produto válida foi encontrada. O layout pode ter mudado.');
  }

  return { purchases: Array.from(aggregate.values()), parsedLines, rejectedIdentifiers };
}

export type ExternalCustomerSourceKind =
  | 'HISTORICO_379'
  | 'ROTEIRO'
  | 'CARTEIRA_CLIENTES'
  | 'SOM_DIARIO'
  | 'PREMISSAS'
  | 'VENDAS_8022'
  | 'ESTOQUE_105'
  | 'CADASTRO_286'
  | 'ESTOQUE_8013'
  | 'CARTEIRA_ESTOQUE'
  | 'LANCAMENTOS';

export function classifyExternalCustomerSource(fileName: string): ExternalCustomerSourceKind | '' {
  const name = normalizeText(fileName);
  if (name.includes('CARTEIRA') && name.includes('CLIENT')) return 'CARTEIRA_CLIENTES';
  if (name.includes('ROTEIRO')) return 'ROTEIRO';
  if (name.includes('SOM DIARIO')) return 'SOM_DIARIO';
  if (name.includes('379')) return 'HISTORICO_379';
  if (name.includes('PREMISSAS')) return 'PREMISSAS';
  if (name.includes('8022')) return 'VENDAS_8022';
  if (name.includes('POSICAO') || /(^|\D)105(\D|$)/.test(name)) return 'ESTOQUE_105';
  if (name.includes('CADASTRO') || /(^|\D)286(\D|$)/.test(name)) return 'CADASTRO_286';
  if (/(^|\D)8013(\D|$)/.test(name)) return 'ESTOQUE_8013';
  if (name.includes('LANCAMENTO')) return 'LANCAMENTOS';
  if (name.includes('CARTEIRA')) return 'CARTEIRA_ESTOQUE';
  return '';
}

export function externalCustomerSourceNote(kind: ExternalCustomerSourceKind): string {
  const labels: Record<ExternalCustomerSourceKind, string> = {
    HISTORICO_379: 'Histórico 379',
    ROTEIRO: 'Roteiro',
    CARTEIRA_CLIENTES: 'Carteira de Clientes',
    SOM_DIARIO: 'SOM Diário',
    PREMISSAS: 'Premissas',
    VENDAS_8022: 'Vendas 8022',
    ESTOQUE_105: 'Posição 105',
    CADASTRO_286: 'Cadastro 286',
    ESTOQUE_8013: 'Estoque 8013',
    CARTEIRA_ESTOQUE: 'Carteira de estoque',
    LANCAMENTOS: 'Lançamentos',
  };
  return `${labels[kind]} reconhecido. Essa base pertence ao motor canônico global e deve ser carregada em Configurações; Clientes & Sortimento a consome de lá, sem duplicar o parser neste módulo.`;
}
