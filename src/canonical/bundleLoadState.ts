export type BundleLoadState<T> = { buildId: string | null; data: T | null; error: string; loading: boolean };

export function beginBundleLoad<T>(buildId: string | null): BundleLoadState<T> {
  return { buildId, data: null, error: '', loading: Boolean(buildId) };
}

export function completeBundleLoad<T>(state: BundleLoadState<T>, buildId: string, data: T): BundleLoadState<T> {
  return state.buildId === buildId ? { buildId, data, error: '', loading: false } : state;
}

export function failBundleLoad<T>(state: BundleLoadState<T>, buildId: string, reason: unknown): BundleLoadState<T> {
  return state.buildId === buildId ? { buildId, data: null, error: String(reason), loading: false } : state;
}
