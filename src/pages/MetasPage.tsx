import { useEffect, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { networkTargetFor, reportSettingsCompetences, sellOutTargetsFor, setNetworkTargetFor, setSellOutTargetsFor } from '../canonical/reportSettings';
import { canonicalSellOutCompetence } from '../canonical/sellOutRules';
import { useData } from '../store/DataContext';
import { PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const numberValue = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function MetasPage() {
  const { activeCanonical } = useData();
  const [competence, setCompetence] = useState('');
  const [knownCompetences, setKnownCompetences] = useState(reportSettingsCompetences());
  const [sellOutTarget, setSellOutTarget] = useState('');
  const [positivityTarget, setPositivityTarget] = useState('');
  const [networkTarget, setNetworkTarget] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!activeCanonical) return;
    let live = true;
    loadCandidateList('M3_MOVIMENTO_VENDAS').then(m3 => {
      if (!live) return;
      const next = canonicalSellOutCompetence(m3.records, m3.competence);
      setCompetence(next);
      setKnownCompetences(current => [...new Set([next, ...current])].sort().reverse());
    }).catch(() => undefined);
    return () => { live = false; };
  }, [activeCanonical]);

  useEffect(() => {
    if (!competence) { setSellOutTarget(''); setPositivityTarget(''); setNetworkTarget(''); return; }
    const targets = sellOutTargetsFor(competence);
    setSellOutTarget(targets.sellOutTarget?.toString() ?? '');
    setPositivityTarget(targets.positivityTarget?.toString() ?? '');
    setNetworkTarget(networkTargetFor(competence)?.toString() ?? '');
    setSaved(false);
  }, [competence]);

  const save = () => {
    if (!/^\d{4}-\d{2}$/.test(competence)) return;
    setSellOutTargetsFor(competence, numberValue(sellOutTarget), numberValue(positivityTarget));
    setNetworkTargetFor(competence, numberValue(networkTarget));
    setSaved(true);
  };

  return <PanelPage title="Metas">
    <PanelCard>
      <PanelSectionHeader eyebrow="SELL OUT" title="Metas manuais" description="Defina aqui as metas gerais controladas pelo usuário. Os valores realizados continuam vindo das tabelas canônicas. A Meta Redes é um total separado da Meta T&C e sua distribuição por rede usa a representatividade dos clientes do Roteiro Ativo." />
      <label className="panel-field" style={{ maxWidth: 320, marginBottom: 16 }}><span className="panel-mini-label">Competência editada</span><select value={competence} onChange={event => setCompetence(event.target.value)}><option value="">Selecione uma competência</option>{knownCompetences.map(value => <option key={value} value={value}>{value.slice(5, 7)}/{value.slice(0, 4)}</option>)}</select></label>
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
        <button type="button" className="panel-button" onClick={save} disabled={!/^\d{4}-\d{2}$/.test(competence)}>Salvar metas</button>
        {saved ? <span className="panel-muted">Metas salvas neste navegador para {competence}.</span> : null}
      </div>
    </PanelCard>
  </PanelPage>;
}
