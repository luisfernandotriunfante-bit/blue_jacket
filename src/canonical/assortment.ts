export const ASSORTMENT_CHANNELS = [
  { field: 'hiper', headers: ['Hiper'], label: 'Hiper', range: 'Faixa 1' },
  { field: 'super_g', headers: ['Super G'], label: 'Super G', range: 'Faixa 2' },
  { field: 'super_p', headers: ['Super P'], label: 'Super P', range: 'Faixa 3' },
  { field: 'clubs', headers: ['Clubs'], label: 'Clubs', range: '' },
  { field: 'c_c', headers: ['C&C'], label: 'C&C', range: '' },
  { field: 'drogaria', headers: ['Drogaria'], label: 'Drogaria', range: '' },
  { field: 'farma_bairro_1_a_4', headers: ['Farma Bairro 1 a 4'], label: 'Farma Bairro 1 a 4', range: '' },
  { field: 'farma_bairro_5_a_8', headers: ['Farma Bairro 5 a 8'], label: 'Farma Bairro 5 a 8', range: '' },
  { field: 'e_commerce_pure_players_1p_3p', headers: ['E-commerce Pure Players 1P + 3P'], label: 'E-commerce 1P + 3P', range: '' },
  { field: 'e_commerce_pure_players_indireto', headers: ['E-commerce Pure Players Indireto'], label: 'E-commerce indireto', range: '' },
  { field: 'vizinhan_a_gde', headers: ['Vizinhança GDE'], label: 'Vizinhança GDE', range: 'Faixa 4' },
  { field: 'vizinhan_a_peq', headers: ['Vizinhança PEQ'], label: 'Vizinhança PEQ', range: 'Faixa 5' },
  { field: 'tradicional_independente', headers: ['Tradicional Independente'], label: 'Tradicional', range: 'Faixa 6' },
  { field: 'sortimento_atacados', headers: ['Sortimento Atacados'], label: 'Atacados', range: '' },
  { field: 'sortimento_distribuidores', headers: ['Sortimento Distribuidores'], label: 'Distribuidores', range: '' },
] as const;

export type AssortmentPresence = { field: string; label: string; range: string; classification: 'Mandatório' | 'Importante' | 'Recomendado' };

export const ASSORTMENT_RANGES = ASSORTMENT_CHANNELS
  .filter(channel => Boolean(channel.range))
  .map(channel => channel.range) as Array<`Faixa ${number}`>;

export function parseAssortmentPresence(raw: unknown): AssortmentPresence[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const values = JSON.parse(raw) as Record<string, unknown>;
    return ASSORTMENT_CHANNELS.flatMap(channel => {
      const classification = Number(values[channel.field]);
      if (!Number.isFinite(classification) || classification === 0) return [];
      return [{ field: channel.field, label: channel.label, range: channel.range, classification: classification === 1 ? 'Mandatório' : classification === 2 ? 'Importante' : 'Recomendado' }];
    });
  } catch {
    return [];
  }
}

/** Recorte operacional usado quando o cliente é atendido exclusivamente por faixa. */
export function parseRangeAssortmentPresence(raw: unknown): AssortmentPresence[] {
  return parseAssortmentPresence(raw).filter(channel => Boolean(channel.range));
}

export function matchesAssortmentRanges(assortment: AssortmentPresence[], selectedRanges: string[]) {
  return selectedRanges.length === 0 || assortment.some(channel => selectedRanges.includes(channel.range));
}
