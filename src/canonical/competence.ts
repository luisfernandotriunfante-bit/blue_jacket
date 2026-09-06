import type { ParsedSource } from './types';

const MONTHS: Record<string, string> = {
  JAN: '01', FEV: '02', FEB: '02', MAR: '03', ABR: '04', APR: '04', MAI: '05', MAY: '05',
  JUN: '06', JUL: '07', AGO: '08', AUG: '08', SET: '09', SEP: '09', OUT: '10', OCT: '10',
  NOV: '11', DEZ: '12', DEC: '12',
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
