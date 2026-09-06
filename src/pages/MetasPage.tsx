import { useEffect, useState } from 'react';
import { formatCompetenceId, isValidCompetenceId } from '../canonical/competence';
import { competenceRecord, loadCompetenceState, subscribeCompetenceState, type CompetenceState } from '../canonical/competenceStore';
import { legacyTargetsPendingFor, migrateLegacyTargetsToCompetence, networkTargetFor, sellOutTargetsFor, setNetworkTargetFor, setSellOutTargetsFor } from '../canonical/reportSettings';
import { PanelAlert, PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const numberValue = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function MetasPage() {
  const [competenceState, setCompetenceState] = useState<CompetenceState | null>(() => {
    try { return loadCompetenceState(); } catch { return null; }
  });
  const [competence, setCompetence] = useState('');
  const [sellOutTarget, setSellOutTarget] = useState('');
  const [positivityTarget, setPositivityTarget] = useState('');
  const [networkTarget, setNetworkTarget] = useState('');
  const [saved, setSaved] = useState(false);
  const [, setLegacyVersion] = useState(0);
  const [migrationError, setMigrationError] = useState('');

  useEffect(() => {
    try { return subscribeCompetenceState(setCompetenceState); }
    catch (reason) { setMigrationError(`Estado de Competências inválido: ${String(reason)}`); return undefined; }
  }, []);

  useEffect(() => {
    if (!competenceState) { setCompetence(''); return; }
    setCompetence(current => competenceState.records.some(record => record.id === current)
      ? current
      : competenceState.currentCompetence ?? '');
  }, [competenceState?.updatedAt]);

  useEffect(() => {
    if (!competence) { setSellOutTarget(''); setPositivityTarget(''); setNetworkTarget(''); return; }
    const targets = sellOutTargetsFor(competence);
    setSellOutTarget(targets.sellOutTarget?.toString() ?? '');
    setPositivityTarget(targets.positivityTarget?.toString() ?? '');
    setNetworkTarget(networkTargetFor(competence)?.toString() ?? '');
    setSaved(false);
  }, [competence]);

  const selectedRecord = competenceRecord(competenceState, competence);
  const editable = Boolean(selectedRecord && selectedRecord.status === 'OPEN');
  const save = () => {
    if (!editable || !isValidCompetenceId(competence)) return;
    setSellOutTargetsFor(competence, numberValue(sellOutTarget), numberValue(positivityTarget));
    setNetworkTargetFor(competence, numberValue(networkTarget));
    setSaved(true);
  };
  const pendingLegacy = editable && isValidCompetenceId(competence) ? legacyTargetsPendingFor(competence) : { sellOutTarget: null, positivityTarget: null };
  const hasPendingLegacy = pendingLegacy.sellOutTarget !== null || pendingLegacy.positivityTarget !== null;
  const migrateLegacy = () => {
    if (!editable) return;
    try {
      migrateLegacyTargetsToCompetence(competence);
      const targets = sellOutTargetsFor(competence);
      setSellOutTarget(targets.sellOutTarget?.toString() ?? '');
      setPositivityTarget(targets.positivityTarget?.toString() ?? '');
      setMigrationError(''); setSaved(true); setLegacyVersion(version => version + 1);
    } catch (reason) { setMigrationError(String(reason)); }
  };

  const knownCompetences = competenceState?.records ?? [];

  return <PanelPage title="Metas">
    <PanelCard>
      <PanelSectionHeader eyebrow="SELL OUT" title="Metas manuais" description="A lista e a seleção temporal vêm exclusivamente do registry oficial de Competências. Os valores realizados continuam vindo das tabelas canônicas e os valores já salvos em ReportSettings são preservados." />
      {!competenceState?.currentCompetence ? <PanelAlert tone="warning">Nenhuma competência oficial corrente está definida. Cadastre ou selecione uma em Administração → Competências.</PanelAlert> : null}
      <label className="panel-field" style={{ maxWidth: 320, marginBottom: 16 }}><span className="panel-mini-label">Competência editada</span><select value={competence} onChange={event => setCompetence(event.target.value)}><option value="">Selecione uma competência</option>{knownCompetences.map(record => <option key={record.id} value={record.id}>{formatCompetenceId(record.id)} · {record.status === 'OPEN' ? 'ABERTA' : 'FECHADA'}</option>)}</select></label>
      {selectedRecord?.status === 'CLOSED' ? <PanelAlert tone="warning">A competência {formatCompetenceId(selectedRecord.id)} está FECHADA. As metas são exibidas somente para leitura e não podem ser alteradas.</PanelAlert> : null}
      {hasPendingLegacy ? <PanelAlert tone="warning"><strong>Existe uma meta anterior ainda não vinculada a uma competência.</strong><br />{pendingLegacy.sellOutTarget !== null ? `Meta T&C legada: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pendingLegacy.sellOutTarget)}. ` : ''}{pendingLegacy.positivityTarget !== null ? `Meta Positivação legada: ${new Intl.NumberFormat('pt-BR').format(pendingLegacy.positivityTarget)}. ` : ''}<button type="button" className="panel-secondary-button" onClick={migrateLegacy}>Migrar para {formatCompetenceId(competence)}</button></PanelAlert> : null}
      {migrationError ? <PanelAlert tone="error">Não foi possível operar a meta: {migrationError}</PanelAlert> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <label className="panel-field">
          <span className="panel-mini-label">Meta T&C (R$)</span>
          <input disabled={!editable} type="number" min="0" step="0.01" value={sellOutTarget} onChange={event => { setSellOutTarget(event.target.value); setSaved(false); }} placeholder="Ex.: 5000000" />
        </label>
        <label className="panel-field">
          <span className="panel-mini-label">Meta positivação</span>
          <input disabled={!editable} type="number" min="0" step="1" value={positivityTarget} onChange={event => { setPositivityTarget(event.target.value); setSaved(false); }} placeholder="Ex.: 902" />
        </label>
        <label className="panel-field">
          <span className="panel-mini-label">Meta Redes Geral (R$) · {competence || '—'}</span>
          <input disabled={!editable} type="number" min="0" step="0.01" value={networkTarget} onChange={event => { setNetworkTarget(event.target.value); setSaved(false); }} placeholder="Ex.: 3000000" />
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <button type="button" className="panel-button" onClick={save} disabled={!editable || !isValidCompetenceId(competence)}>Salvar metas</button>
        {saved ? <span className="panel-muted">Metas salvas neste navegador para {formatCompetenceId(competence)}.</span> : null}
      </div>
    </PanelCard>
  </PanelPage>;
}
