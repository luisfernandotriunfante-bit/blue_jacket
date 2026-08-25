import { useState } from 'react';
import { loadReportSettings, setSellOutTargets } from '../canonical/reportSettings';
import { PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const numberValue = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function MetasPage() {
  const initial = loadReportSettings();
  const [sellOutTarget, setSellOutTarget] = useState(initial.sellOutTarget?.toString() ?? '');
  const [positivityTarget, setPositivityTarget] = useState(initial.positivityTarget?.toString() ?? '');
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSellOutTargets(numberValue(sellOutTarget), numberValue(positivityTarget));
    setSaved(true);
  };

  return <PanelPage title="Metas">
    <PanelCard>
      <PanelSectionHeader eyebrow="SELL OUT" title="Metas manuais" description="Defina aqui somente as metas gerais de T&C e positivação usadas no resumo do Sell Out. Os valores realizados continuam vindo das tabelas canônicas." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <label className="panel-field">
          <span className="panel-mini-label">Meta T&C (R$)</span>
          <input type="number" min="0" step="0.01" value={sellOutTarget} onChange={event => { setSellOutTarget(event.target.value); setSaved(false); }} placeholder="Ex.: 5000000" />
        </label>
        <label className="panel-field">
          <span className="panel-mini-label">Meta positivação</span>
          <input type="number" min="0" step="1" value={positivityTarget} onChange={event => { setPositivityTarget(event.target.value); setSaved(false); }} placeholder="Ex.: 902" />
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <button type="button" className="panel-button" onClick={save}>Salvar metas</button>
        {saved ? <span className="panel-muted">Metas salvas neste navegador.</span> : null}
      </div>
    </PanelCard>
  </PanelPage>;
}
