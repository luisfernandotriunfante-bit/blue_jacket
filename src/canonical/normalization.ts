import type { ContractType, RawTyped } from './types';

export const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
export const text = (value: unknown) => String(value ?? '').trim();
export const code = (value: unknown) => text(value).replace(/\.0+$/, '');
export function number(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = text(value).replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : null;
}
export function isoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0,10);
  const raw=text(value); const dmy=raw.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/); if(dmy) { const year=dmy[3].length===2?`20${dmy[3]}`:dmy[3]; return `${year}-${dmy[2]}-${dmy[1]}`; }
  const date=new Date(raw); return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0,10);
}
export function gtin(value: unknown): string | null {
  const raw=text(value); if (!raw) return null;
  const scientific=raw.match(/^(\d+(?:\.\d+)?)E\+(\d+)$/i);
  // The mantissa already includes its fractional scale (e.g. 7.50955E+12).
  // Subtracting the mantissa scale would corrupt an EAN into a shorter code.
  const resolved=scientific ? BigInt(Math.round(Number(scientific[1]) * 10 ** Number(scientific[2])).toString()).toString() : digits(raw);
  return /^(\d{8}|\d{12,14})$/.test(resolved) ? resolved : null;
}
export function typed(value: unknown, type: ContractType): RawTyped {
  let result: unknown = text(value);
  if (type === 'CODE_TEXT' || type === 'ENUM_TEXT') result=code(value);
  if (type === 'DOC_TEXT') result=digits(value) || null;
  if (type === 'CNPJ14_TEXT') { const d=digits(value); result=d ? d.padStart(14,'0') : null; }
  if (type === 'GTIN_TEXT') result=gtin(value);
  if (type === 'DATE') result=isoDate(value);
  if (type === 'INTEGER') { const n=number(value); result=n===null?null:Math.trunc(n); }
  if (type === 'DECIMAL' || type === 'CURRENCY_BRL') result=number(value);
  if (type === 'PERCENT_DECIMAL') { const n=number(value); result=n===null?null:(n>1?n/100:n); }
  if (type === 'BOOLEAN') result=['SIM','S','TRUE','1','X'].includes(text(value).toUpperCase());
  return { raw:value, typed:result };
}
