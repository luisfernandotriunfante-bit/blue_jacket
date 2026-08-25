export type ReportSettings = {
  networkTargetByCompetence: Record<string, number>;
  networkAllocationByCompetence: Record<string, Record<string, number>>;
  sellOutTarget: number | null;
  positivityTarget: number | null;
};

const KEY = 'blue-jacket-v3-report-settings';
const validTarget = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const empty = (): ReportSettings => ({ networkTargetByCompetence: {}, networkAllocationByCompetence: {}, sellOutTarget: null, positivityTarget: null });

function validAllocation(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([network, target]) => {
    const parsed = validTarget(target);
    return parsed === null ? [] : [[network, parsed]];
  }));
}

export function loadReportSettings(): ReportSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ReportSettings> | null;
    if (!parsed) return empty();
    const allocations = parsed.networkAllocationByCompetence && typeof parsed.networkAllocationByCompetence === 'object'
      ? Object.fromEntries(Object.entries(parsed.networkAllocationByCompetence).map(([competence, value]) => [competence, validAllocation(value)]))
      : {};
    return {
      networkTargetByCompetence: parsed.networkTargetByCompetence && typeof parsed.networkTargetByCompetence === 'object' ? parsed.networkTargetByCompetence : {},
      networkAllocationByCompetence: allocations,
      sellOutTarget: validTarget(parsed.sellOutTarget),
      positivityTarget: validTarget(parsed.positivityTarget),
    };
  } catch {
    return empty();
  }
}

function persist(settings: ReportSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('blue-jacket-report-settings-changed'));
  return settings;
}

export function networkTargetFor(competence: string) {
  const value = loadReportSettings().networkTargetByCompetence[competence];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function networkAllocationFor(competence: string) {
  return loadReportSettings().networkAllocationByCompetence[competence] ?? {};
}

export function setNetworkTargetFor(competence: string, value: number | null) {
  const settings = loadReportSettings();
  if (value === null || !Number.isFinite(value) || value < 0) delete settings.networkTargetByCompetence[competence];
  else settings.networkTargetByCompetence[competence] = value;
  delete settings.networkAllocationByCompetence[competence];
  return persist(settings);
}

export function setNetworkAllocationFor(competence: string, allocation: Record<string, number> | null) {
  const settings = loadReportSettings();
  if (!allocation || !Object.keys(allocation).length) delete settings.networkAllocationByCompetence[competence];
  else settings.networkAllocationByCompetence[competence] = validAllocation(allocation);
  return persist(settings);
}

export function sellOutTargets() {
  const settings = loadReportSettings();
  return { sellOutTarget: settings.sellOutTarget, positivityTarget: settings.positivityTarget };
}

export function setSellOutTargets(sellOutTarget: number | null, positivityTarget: number | null) {
  const settings = loadReportSettings();
  settings.sellOutTarget = validTarget(sellOutTarget);
  settings.positivityTarget = validTarget(positivityTarget);
  return persist(settings);
}

export function proportionalNetworkTargets(total: number | null, weights: Array<{ network: string; realized: number }>) {
  if (total === null) return new Map<string, number>();
  const denominator = weights.reduce((sum, row) => sum + Math.max(0, row.realized), 0);
  return new Map(weights.map(row => [row.network, denominator ? total * Math.max(0, row.realized) / denominator : total / Math.max(1, weights.length)]));
}
