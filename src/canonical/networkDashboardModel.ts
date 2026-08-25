import type { NetworkRow, TopNetworksViewModel } from './operationalViewModels';

export type NetworkAllocation = Record<string, number>;
export type NetworkDashboardModel = {
  operationalModel: TopNetworksViewModel;
  allocation: NetworkAllocation;
  allocationSource: 'NONE' | 'PROPORTIONAL' | 'MANUAL';
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const valid = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function proportional(total: number, rows: Array<Pick<NetworkRow, 'network' | 'realized'>>) {
  const denominator = rows.reduce((sum, row) => sum + Math.max(0, row.realized), 0);
  const output: NetworkAllocation = {};
  rows.forEach(row => { output[row.network] = denominator > 0 ? total * Math.max(0, row.realized) / denominator : total / Math.max(1, rows.length); });
  return normalizeTotal(total, rows.map(row => row.network), output);
}

function normalizeTotal(total: number, networks: string[], allocation: NetworkAllocation) {
  if (!networks.length) return {};
  const output = Object.fromEntries(networks.map(network => [network, round(allocation[network] ?? 0)]));
  const current = round(Object.values(output).reduce((sum, value) => sum + value, 0));
  const correction = round(total - current);
  const last = networks.at(-1)!;
  output[last] = round(Math.max(0, output[last] + correction));
  return output;
}

function storedAllocationIsValid(total: number, rows: Array<Pick<NetworkRow, 'network'>>, allocation: NetworkAllocation) {
  if (!rows.length) return false;
  if (rows.some(row => !valid(allocation[row.network]))) return false;
  const sum = rows.reduce((value, row) => value + allocation[row.network], 0);
  return Math.abs(sum - total) <= 0.02;
}

export function resolveNetworkAllocation(total: number | null, rows: Array<Pick<NetworkRow, 'network' | 'realized'>>, allocation: NetworkAllocation = {}) {
  if (total === null || !Number.isFinite(total) || total < 0) return { allocation: {} as NetworkAllocation, source: 'NONE' as const };
  if (storedAllocationIsValid(total, rows, allocation)) return { allocation: normalizeTotal(total, rows.map(row => row.network), allocation), source: 'MANUAL' as const };
  return { allocation: proportional(total, rows), source: 'PROPORTIONAL' as const };
}

export function redistributeNetworkAllocation(total: number, rows: Array<Pick<NetworkRow, 'network' | 'realized'>>, editedNetwork: string, editedTarget: number) {
  const safeTotal = Math.max(0, total);
  const target = Math.min(safeTotal, Math.max(0, editedTarget));
  const others = rows.filter(row => row.network !== editedNetwork);
  const remaining = Math.max(0, safeTotal - target);
  const denominator = others.reduce((sum, row) => sum + Math.max(0, row.realized), 0);
  const output: NetworkAllocation = { [editedNetwork]: target };
  others.forEach(row => { output[row.network] = denominator > 0 ? remaining * Math.max(0, row.realized) / denominator : remaining / Math.max(1, others.length); });
  return normalizeTotal(safeTotal, rows.map(row => row.network), output);
}

export function buildNetworkDashboardModel({ base, networkTarget, allocation = {} }: { base: TopNetworksViewModel; networkTarget: number | null; allocation?: NetworkAllocation }): NetworkDashboardModel {
  const resolved = resolveNetworkAllocation(networkTarget, base.rows, allocation);
  const rows = base.rows.map(row => {
    const target = networkTarget === null ? null : resolved.allocation[row.network] ?? 0;
    return {
      ...row,
      networkTarget: target,
      gap: target === null ? null : round(target - row.realized),
      achievement: target && target > 0 ? row.realized / target : null,
    };
  });
  return {
    operationalModel: {
      ...base,
      rows,
      totals: { ...base.totals, networkTarget },
    },
    allocation: resolved.allocation,
    allocationSource: resolved.source,
  };
}
