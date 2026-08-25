import { useEffect, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { loadReportSettings, networkTargetFor, setNetworkTargetFor, setSellOutTargets } from '../canonical/reportSettings';
import { useData } from '../store/DataContext';
import { PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const numberValue = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function MetasPage() {
  const { activeCanonical } = useData();
  const initial = loadReportSettings();
  const [competence, setCompetence] = useState(new Date().toISOString().slice(0, 7));
  const [sellOutTarget, setSellOutTarget] = useState(initial.sellOutTarget?.toString() ?? '');
  const [positivityTarget, setPositivityTarget] = useState(initial.positivityTarget?.toString() ?? '');
  const [networkTarget, setNetworkTarget] = useState(networkTargetFor(competence)?.toString() ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!activeCanonical) return;
    let live = true;
    loadCandidateList('M3_MOVIMENTO_VENDAS').then(m3 => {
      if (!live) return;
      setCompetence(m3.competence);
      setNetworkTarget(networkTargetFor(m3.competence)?.toString() ?? '');
    }).catch(() => undefined);
    return () => { live = false; };
  }, [activeCanonical]);

  const save = () => {
    setSellOutTargets(numberValue(sellOutTarget), numberValue(positivityTarget));
    setNetworkTargetFor(competence, numberValue(networkTarget));
    setSaved(true);
  };

  return <PanelPage title="Metas">
    <PanelCard>
      <PanelSectionHeader eyebrow="SELL OUT" title="Metas manuais" description="Defina aqui as metas gerais controladas pelo usuário. Os valores realizados continuam vindo das tabelas canônicas. A Meta Redes é um total separado da Meta T&C e sua distribuição por rede usa a representatividade dos clientes do Roteiro Ativo." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <label className="panel-field">
          <span className="panel-mini-label">Meta T&C (R$)</span>
          <input type="number" min="0" step="0.01" value={sellOutTarget} onChange={event => { setSellOutTarget(event.target.value); setSaved(false); }} placeholder="Ex.: 5000000" />
        </label>
        <label className="panel-field">
          <span className="panel-mini-label">Meta positivação</span>
          <input type="number" min="0" step="1" value={positivityTarget} onChange={event => { setPositivityTarget(event.target.value); setSaved(false); }} placeholder="Ex.: 902" />
        </label>
        <label className="panel-field">
          <span className="panel-mini-label">Meta Redes Geral (R$) · {competence}</span>
          <input type="number" min="0" step="0.01" value={networkTarget} onChange={event => { setNetworkTarget(event.target.value); setSaved(false); }} placeholder="Ex.: 3000000" />
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <button type="button" className="panel-button" onClick={save}>Salvar metas</button>
        {saved ? <span className="panel-muted">Metas salvas neste navegador para {competence}.</span> : null}
      </div>
    </PanelCard>
  </PanelPage>;
}
