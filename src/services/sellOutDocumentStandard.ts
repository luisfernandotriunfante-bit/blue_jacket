export const SELL_OUT_DOCUMENT_STANDARD = {
  version: 'julho-v2',
  templateFile: 'painel-sell-out-padrao-v2.xlsx',
  sheets: ['SELL OUT - Milenio 2026', 'EQUIPES'] as const,
  teamsHeaders: [
    'COORD', 'NOME COORD', 'COD', 'NOME', 'META', 'VLR VDA', '% VDA',
    'A FATURAR', 'REALIZADO  +                   A FATURAR', '% VDA+ A FAT',
    'IDEAL PARA HOJE', 'DIFERENÇA DO IDEAL', 'FALTA VDA TOTAL', 'META POSITIVAÇÃO',
    'POSITIVAÇÃO', '% POS', 'POSITIVAÇÃO A FATURAR', 'POSITIVADOS + A FATURAR',
    '% POS+A FAT', 'IDEAL HOJE POSITIVAÇÕES', 'DIFERENÇA IDEAL VS REALIZADO',
    'FALTA POSITIVAÇÃO TOTAL', 'TARGET DIA',
  ] as const,
} as const;
