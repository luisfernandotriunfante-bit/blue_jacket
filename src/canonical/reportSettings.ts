import { isValidCompetenceId } from './competence';

export type ReportSettings = {
  networkTargetByCompetence: Record<string, number>;
  networkAllocationByCompetence: Record<string, Record<string, number>>;
  sellOutTargetByCompetence: Record<string, number>;
  positivityTargetByCompetence: Record<string, number>;
  legacySellOutTarget: number | null;
  legacyPositivityTarget: number | null;
  /** Datas manuais de chegada por NF da Carteira, no formato ISO. */
  inboundForecastByInvoice: Record<string, string>;
};

const KEY = 'blue-jacket-v3-report-settings';
const validTarget = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const empty = (): ReportSettings => ({ networkTargetByCompetence: {}, networkAllocationByCompetence: {}, sellOutTargetByCompetence: {}, positivityTargetByCompetence: {}, legacySellOutTarget: null, legacyPositivityTarget: null, inboundForecastByInvoice: {} });
const invoiceKey = (value: unknown) => {
  const raw = String(value ?? '').trim().replace(/\.0$/, '').replace(/\s+/g, '');
  const first = raw.match(/\d+/)?.[0];
  if (first) return first.replace(/^0+(?=\d)/, '');
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
};
const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

function validAllocation(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([network, target]) => {
    const parsed = validTarget(target);
    return parsed === null ? [] : [[network, parsed]];
  }));
}

function normalizedSettings(value: unknown): ReportSettings {
  try {
    const parsed = value as Partial<ReportSettings> | null;
    if (!parsed) return empty();
    const allocations = parsed.networkAllocationByCompetence && typeof parsed.networkAllocationByCompetence === 'object'
      ? Object.fromEntries(Object.entries(parsed.networkAllocationByCompetence).flatMap(([competence, value]) => isValidCompetenceId(competence) ? [[competence, validAllocation(value)]] : []))
      : {};
    const targets = parsed.networkTargetByCompetence && typeof parsed.networkTargetByCompetence === 'object'
      ? Object.fromEntries(Object.entries(parsed.networkTargetByCompetence).flatMap(([competence, value]) => {
        const target = isValidCompetenceId(competence) ? validTarget(value) : null;
        return target === null ? [] : [[competence, target]];
      }))
      : {};
    const forecasts = parsed.inboundForecastByInvoice && typeof parsed.inboundForecastByInvoice === 'object'
      ? Object.fromEntries(Object.entries(parsed.inboundForecastByInvoice).flatMap(([invoice, date]) => {
        const key = invoiceKey(invoice);
        const valid = validDate(date);
        return key && valid ? [[key, valid]] : [];
      }))
      : {};
    const byCompetence = (candidate: unknown) => candidate && typeof candidate === 'object'
      ? Object.fromEntries(Object.entries(candidate as Record<string, unknown>).flatMap(([competence, value]) => {
        const target = isValidCompetenceId(competence) ? validTarget(value) : null;
        return target === null ? [] : [[competence, target]];
      })) : {};
    const legacy = parsed as Partial<ReportSettings> & { sellOutTarget?: unknown; positivityTarget?: unknown };
    return {
      networkTargetByCompetence: targets,
      networkAllocationByCompetence: allocations,
      sellOutTargetByCompetence: byCompetence(parsed.sellOutTargetByCompetence),
      positivityTargetByCompetence: byCompetence(parsed.positivityTargetByCompetence),
      legacySellOutTarget: validTarget(parsed.legacySellOutTarget) ?? validTarget(legacy.sellOutTarget),
      legacyPositivityTarget: validTarget(parsed.legacyPositivityTarget) ?? validTarget(legacy.positivityTarget),
      inboundForecastByInvoice: forecasts,
    };
  } catch {
    return empty();
  }
}

export function loadReportSettings(): ReportSettings {
  try { return normalizedSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null')); }
  catch { return empty(); }
}

function persist(settings: ReportSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('blue-jacket-report-settings-changed'));
  return settings;
}

/** Restores only validated manual settings received from an encrypted paired device. */
export function restoreReportSettings(value: unknown) { return persist(normalizedSettings(value)); }

export function networkTargetFor(competence: string) {
  const value = loadReportSettings().networkTargetByCompetence[competence];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function setNetworkTargetFor(competence: string, value: number | null) {
  if (!isValidCompetenceId(competence)) throw new Error('Competência inválida para Meta Redes.');
  const settings = loadReportSettings();
  if (value === null || !Number.isFinite(value) || value < 0) delete settings.networkTargetByCompetence[competence];
  else settings.networkTargetByCompetence[competence] = value;
  delete settings.networkAllocationByCompetence[competence];
  return persist(settings);
}

export function sellOutTargetsFor(competence: string) {
  const settings = loadReportSettings();
  return { sellOutTarget: settings.sellOutTargetByCompetence[competence] ?? null, positivityTarget: settings.positivityTargetByCompetence[competence] ?? null };
}

export function setSellOutTargetsFor(competence: string, sellOutTarget: number | null, positivityTarget: number | null) {
  if (!isValidCompetenceId(competence)) throw new Error('Competência inválida para metas de Sell Out.');
  const settings = loadReportSettings();
  const sales = validTarget(sellOutTarget); const positivity = validTarget(positivityTarget);
  if (sales === null) delete settings.sellOutTargetByCompetence[competence]; else settings.sellOutTargetByCompetence[competence] = sales;
  if (positivity === null) delete settings.positivityTargetByCompetence[competence]; else settings.positivityTargetByCompetence[competence] = positivity;
  return persist(settings);
}

export function legacyTargetsPendingFor(competence: string) {
  const settings = loadReportSettings();
  return {
    sellOutTarget: settings.sellOutTargetByCompetence[competence] === undefined ? settings.legacySellOutTarget : null,
    positivityTarget: settings.positivityTargetByCompetence[competence] === undefined ? settings.legacyPositivityTarget : null,
  };
}

/** Migra apenas por ação explícita e confirma a nova gravação antes de limpar o legado. */
export function migrateLegacyTargetsToCompetence(competence: string) {
  if (!isValidCompetenceId(competence)) throw new Error('Competência inválida para migração de metas legadas.');
  const settings = loadReportSettings();
  const migrateSales = settings.sellOutTargetByCompetence[competence] === undefined && settings.legacySellOutTarget !== null;
  const migratePositivity = settings.positivityTargetByCompetence[competence] === undefined && settings.legacyPositivityTarget !== null;
  if (!migrateSales && !migratePositivity) return settings;
  if (migrateSales) settings.sellOutTargetByCompetence[competence] = settings.legacySellOutTarget!;
  if (migratePositivity) settings.positivityTargetByCompetence[competence] = settings.legacyPositivityTarget!;
  persist(settings);
  const verified = loadReportSettings();
  if (migrateSales && verified.sellOutTargetByCompetence[competence] !== settings.legacySellOutTarget) throw new Error('Falha ao validar a migração da Meta T&C legada.');
  if (migratePositivity && verified.positivityTargetByCompetence[competence] !== settings.legacyPositivityTarget) throw new Error('Falha ao validar a migração da Meta Positivação legada.');
  if (migrateSales) verified.legacySellOutTarget = null;
  if (migratePositivity) verified.legacyPositivityTarget = null;
  return persist(verified);
}

export function reportSettingsCompetences() {
  const settings = loadReportSettings();
  return [...new Set([...Object.keys(settings.sellOutTargetByCompetence), ...Object.keys(settings.positivityTargetByCompetence), ...Object.keys(settings.networkTargetByCompetence)])].filter(isValidCompetenceId).sort().reverse();
}

export function inboundForecasts() {
  return loadReportSettings().inboundForecastByInvoice;
}

export function setInboundForecast(invoice: string, date: string | null) {
  const settings = loadReportSettings();
  const key = invoiceKey(invoice);
  if (!key) return settings;
  const valid = validDate(date);
  if (valid) settings.inboundForecastByInvoice[key] = valid;
  else delete settings.inboundForecastByInvoice[key];
  return persist(settings);
}

export function clearInboundForecast(invoice: string) {
  return setInboundForecast(invoice, null);
}
