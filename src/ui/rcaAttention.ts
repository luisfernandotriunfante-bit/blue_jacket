import type { SellOutViewModel } from '../canonical/operationalViewModels';

export function rcaAttention(model: Pick<SellOutViewModel, 'audits' | 'rcaDiagnostics'>) {
  const unresolvedCount = model.audits.find(a => a.code === 'UNRESOLVED_RCA_IN_VIEW')?.count ?? 0;
  const links = model.rcaDiagnostics.filter(item => item.kind === 'NOVOS RCAS');
  const targets = model.rcaDiagnostics.filter(item => item.kind === 'BÚSSOLA');
  const otherCount = model.audits.filter(a => a.code !== 'UNRESOLVED_RCA_IN_VIEW').length;
  const label = [
    unresolvedCount ? `${unresolvedCount} RCA(s) sem vínculo` : null,
    targets.length ? `${targets.length} RCA(s) sem meta positiva` : null,
    otherCount ? `${otherCount} outro(s) aviso(s)` : null,
    !unresolvedCount && links.length ? `${links.length} pendência(s) de vínculo` : null,
  ].filter(Boolean).join(' · ');
  return { unresolvedCount, links, targets, label };
}
