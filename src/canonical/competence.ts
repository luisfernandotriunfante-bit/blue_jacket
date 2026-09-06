import type { ParsedSource } from './types';

const MONTHS: Record<string, string> = {
  JANEIRO: '01', JANUARY: '01', JAN: '01',
  FEVEREIRO: '02', FEBRUARY: '02', FEV: '02', FEB: '02',
  MARCO: '03', MARCH: '03', MAR: '03',
  ABRIL: '04', APRIL: '04', ABR: '04', APR: '04',
  MAIO: '05', MAY: '05', MAI: '05',
  JUNHO: '06', JUNE: '06', JUN: '06',
  JULHO: '07', JULY: '07', JUL: '07',
  AGOSTO: '08', AUGUST: '08', AGO: '08', AUG: '08',
  SETEMBRO: '09', SEPTEMBER: '09', SET: '09', SEP: '09',
  OUTUBRO: '10', OCTOBER: '10', OUT: '10', OCT: '10',
  NOVEMBRO: '11', NOVEMBER: '11', NOV: '11',
  DEZEMBRO: '12', DECEMBER: '12', DEZ: '12', DEC: '12',
};

export type CompetenceCompatibility =
  | 'MATCH'
  | 'MISMATCH'
  | 'NO_OFFICIAL_COMPETENCE'
  | 'OBSERVED_MIXED'
  | 'OBSERVED_UNRESOLVED'
  | 'NO_OBSERVED_DATA';

/** Validação compartilhada do identificador administrativo YYYY-MM, incluindo faixa real do mês. */
export function isValidCompetenceId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function formatCompetenceId(value: string | null | undefined) {
  return isValidCompetenceId(value) ? `${value.slice(5, 7)}/${value.slice(0, 4)}` : value ?? '—';
}

export function compareOfficialCompetence(
  official: string | null,
  observed: string | null | undefined,
): CompetenceCompatibility {
  if (!official) return 'NO_OFFICIAL_COMPETENCE';
  if (observed === null || observed === undefined || observed === '') return 'NO_OBSERVED_DATA';
  if (observed === 'MIXED') return 'OBSERVED_MIXED';
  if (observed === 'UNRESOLVED' || !isValidCompetenceId(observed)) return 'OBSERVED_UNRESOLVED';
  return observed === official ? 'MATCH' : 'MISMATCH';
}

/** Extrai competência somente de evidência explícita no nome da fonte. */
export function competenceFromFileName(fileName: string | null | undefined) {
  if (!fileName) return null;
  const name = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const numeric = name.match(/(?:^|[^0-9])(0?[1-9]|1[0-2])[._\-/ ](20\d{2}|\d{2})(?:[^0-9]|$)/);
  if (numeric) return `${numeric[2].length === 2 ? `20${numeric[2]}` : numeric[2]}-${numeric[1].padStart(2, '0')}`;
  const monthToken = Object.keys(MONTHS).find(token => new RegExp(`(^|[^A-Z])${token}([^A-Z]|$)`).test(name));
  const year = name.match(/20\d{2}/)?.[0]
    ?? (monthToken ? name.match(new RegExp(`${monthToken}[^0-9]*(\\d{2})(?:[^0-9]|$)`))?.[1]?.replace(/^(\d{2})$/, '20$1') : null);
  if (year && monthToken) return `${year}-${MONTHS[monthToken]}`;
  return null;
}

export function competenceFromParsedSource(source: ParsedSource | undefined) {
  return competenceFromFileName(source?.fileName);
}
