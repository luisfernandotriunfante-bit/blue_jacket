export function signedChartDomain(values: number[]) {
  const finite = values.filter(Number.isFinite);
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  const padding = (max - min || 1) * 0.12;
  return { min: min < 0 ? min - padding : 0, max: max > 0 ? max + padding : min < 0 ? 0 : 1 };
}
