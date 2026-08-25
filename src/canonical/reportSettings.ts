export type ReportSettings = {
  networkTargetByCompetence: Record<string, number>;
  sellOutTarget: number | null;
  positivityTarget: number | null;
};

const KEY = 'blue-jacket-v3-report-settings';
const validTarget = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const empty = (): ReportSettings => ({ networkTargetByCompetence: {}, sellOutTarget: null, positivityTarget: null });

export function loadReportSettings(): ReportSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ReportSettings> | null;
    if (!parsed) return empty();
    return {
      networkTargetByCompetence: parsed.networkTargetByCompetence && typeof parsed.networkTargetByCompetence === 'object' ? parsed.networkTargetByCompetence : {},
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

export function setNetworkTargetFor(competence: string, value: number | null) {
  const settings = loadReportSettings();
  if (value === null || !Number.isFinite(value) || value < 0) delete settings.networkTargetByCompetence[competence];
  else settings.networkTargetByCompetence[competence] = value;
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
