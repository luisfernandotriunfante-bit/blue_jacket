import { useState } from 'react';
import { useData } from '../store/DataContext';
import { LINE_NAMES } from '../domain/canonical';
import { redistributeNetworkTotal, redistributeSingleNetwork } from '../domain/targetRules';
import { PanelAlert, PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader, PanelStat } from '../ui/pattern/PanelVisual';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export function MetasPage() {
  const { canonical, manualConfig, setManualConfig } = useData();
  const [holidayDate, setHolidayDate] = useState('');

  if (!canonical) {
    return (
      <PanelPage title="Metas">
        <PanelEmptyState variant="page" title="Base ainda não carregada" description="Carregue Bússola e Roteiro em Configurações para iniciar a manutenção das metas." />
      </PanelPage>
    );
  }

  const networkRows = canonical.networks.filter(network => network.topTarget > 0 || network.networkTarget > 0);
  const networkTotal = networkRows.reduce((sum, network) => sum + network.networkTarget, 0);
  const topTotal = canonical.networks.reduce((sum, network) => sum + network.topTarget, 0);
  const lineTotal = LINE_NAMES.reduce((sum, name) => sum + (manualConfig.lineShares[name] || 0), 0);

  const setField = (field: 'sellOutTarget' | 'coverageTargetDays', value: number) => setManualConfig({ ...manualConfig, [field]: Math.max(value || 0, 0) });
  const setShare = (name: (typeof LINE_NAMES)[number], value: number) => setManualConfig({ ...manualConfig, lineShares: { ...manualConfig.lineShares, [name]: Math.max(value || 0, 0) / 100 } });
  const addHoliday = () => {
    if (!holidayDate) return;
    setManualConfig({ ...manualConfig, holidays: Array.from(new Set([...manualConfig.holidays, holidayDate])).sort() });
    setHolidayDate('');
  };
  const removeHoliday = (date: string) => setManualConfig({ ...manualConfig, holidays: manualConfig.holidays.filter(item => item !== date) });
  const saveNetworkTargets = (targets: Record<string, number>) => setManualConfig({ ...manualConfig, networkTargets: { ...manualConfig.networkTargets, ...targets } });

  const setNetworkTotal = (requested: number) => {
    if (!networkRows.length) return;
    saveNetworkTargets(redistributeNetworkTotal(networkRows.map(network => ({ key: network.key, target: network.networkTarget })), requested));
  };

  const setNetwork = (key: string, requested: number) => {
    if (!networkRows.length) return;
    saveNetworkTargets(redistributeSingleNetwork(networkRows.map(network => ({ key: network.key, target: network.networkTarget })), key, requested));
  };

  return (
    <PanelPage title="Metas" metricLabel="Meta Sell Out T&C" metricValue={brl(canonical.sellOut.sellOutTarget)}>
      <div className="panel-stack">
        <PanelCard>
          <PanelSectionHeader eyebrow="REFERÊNCIAS OFICIAIS" title="Metas recebidas das fontes" description="Somente leitura. O realizado continua vindo do motor de Vendas/Operação." />
          <div className="panel-grid panel-grid-3">
            <PanelStat label="Meta indústria · Bússola" value={brl(canonical.industryTarget)} />
            <PanelStat label="Meta positivação · Bússola" value={canonical.industryPositivityTarget.toLocaleString('pt-BR')} />
            <PanelStat label="Meta Tops · Roteiro Ativo" value={brl(topTotal)} />
          </div>
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader eyebrow="AJUSTÁVEIS" title="Parâmetros gerais" description="Alterações são salvas automaticamente e passam a valer em todas as telas e exportações canônicas." />
          <div className="panel-grid panel-grid-auto">
            <NumberField label="Meta Sell Out (T&C)" value={manualConfig.sellOutTarget} step={1000} onChange={value => setField('sellOutTarget', value)} detail="Meta manual e independente da Meta Indústria. Zero significa meta T&C não informada." />
            <NumberField label="Meta Redes Geral" value={networkTotal} step={1000} onChange={setNetworkTotal} detail="Total exclusivo das redes. Ao alterar, as metas são redistribuídas proporcionalmente." />
            <NumberField label="Meta de cobertura (dias)" value={manualConfig.coverageTargetDays} step={1} onChange={value => setField('coverageTargetDays', value)} detail="Referência usada nas visões e alertas de estoque." />
          </div>
          <div className="panel-mini-note" style={{ marginTop: 12 }}>Carteira a venda não possui parâmetro de acréscimo: a valorização do Estoque usa exclusivamente unidades comprovadas × PVENDA1 da Região 11.</div>
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader eyebrow="CALENDÁRIO" title="Feriados e dias não trabalhados" description="Datas excluídas do cálculo de dias úteis, médias diárias, tendência e necessidade por dia." action={<span className="panel-badge">{manualConfig.holidays.length} DATA(S)</span>} />
          <div className="panel-inline-actions">
            <label className="panel-field" style={{ minWidth: 220 }}>
              <span className="panel-field-label panel-field-label-uppercase">Nova data</span>
              <input className="panel-input" type="date" value={holidayDate} onChange={event => setHolidayDate(event.target.value)} />
            </label>
            <button className="panel-secondary-button" type="button" onClick={addHoliday} disabled={!holidayDate}>Adicionar data</button>
          </div>
          <div className="panel-chips" style={{ marginTop: 14 }}>
            {manualConfig.holidays.map(date => <button type="button" className="panel-chip" key={date} onClick={() => removeHoliday(date)} title="Clique para remover">{new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')} ×</button>)}
          </div>
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader eyebrow="LINHAS COMERCIAIS" title="Distribuição da Meta T&C" description="Percentuais editáveis usados para calcular a meta das cinco linhas." action={<span className={`panel-badge ${Math.abs(lineTotal - 1) < 0.0001 ? 'panel-badge-green' : 'panel-badge-amber'}`}>TOTAL · {pct(lineTotal)}</span>} />
          <div className="panel-grid panel-grid-auto">
            {LINE_NAMES.map(name => (
              <div key={name} className="panel-stat">
                <div className="panel-mini-label">{name}</div>
                <div className="panel-inline-actions">
                  <input className="panel-input panel-input-full panel-input-currency" type="number" min="0" step="0.5" value={(manualConfig.lineShares[name] * 100) || ''} onChange={event => setShare(name, Number(event.target.value) || 0)} />
                  <span className="panel-muted">%</span>
                </div>
                <div className="panel-stat-note">Meta atual: {brl(canonical.sellOut.sellOutTarget * (manualConfig.lineShares[name] || 0))}</div>
              </div>
            ))}
          </div>
          {Math.abs(lineTotal - 1) >= 0.0001 ? <div style={{ marginTop: 12 }}><PanelAlert tone="warning">A distribuição das linhas está em {pct(lineTotal)}. Para distribuir integralmente a Meta T&C, o total deve fechar em 100%.</PanelAlert></div> : null}
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader eyebrow="META REDES" title="Manutenção por rede" description="Editar uma rede não altera a Meta Redes Geral: o saldo é redistribuído proporcionalmente entre as outras redes." action={<span className="panel-badge">TOTAL · {brl(networkTotal)}</span>} />
          {networkRows.length ? (
            <div className="panel-grid panel-grid-auto">
              {networkRows.map(network => {
                const participation = networkTotal > 0 ? network.networkTarget / networkTotal : 0;
                return (
                  <div key={network.key} className="panel-stat">
                    <div className="panel-toolbar">
                      <strong>{network.name}</strong>
                      <span className="panel-badge">{pct(participation)} · TOPS {brl(network.topTarget)}</span>
                    </div>
                    <input className="panel-input panel-input-full panel-input-currency" type="number" min="0" max={networkTotal || undefined} step="1000" value={network.networkTarget || ''} onChange={event => setNetwork(network.key, Number(event.target.value) || 0)} style={{ marginTop: 10 }} />
                    <div className="panel-stat-note">Participação atual: {pct(participation)}</div>
                  </div>
                );
              })}
            </div>
          ) : <PanelEmptyState variant="compact" title="Nenhuma meta de rede configurada" description="Defina a Meta Redes Geral quando houver redes canônicas disponíveis para distribuição." />}
        </PanelCard>
      </div>
    </PanelPage>
  );
}

function NumberField({ label, value, step, onChange, detail }: { label: string; value: number; step: number; onChange: (value: number) => void; detail: string }) {
  return (
    <label className="panel-field">
      <span className="panel-field-label panel-field-label-uppercase">{label}</span>
      <input className="panel-input panel-input-full panel-input-currency" type="number" min="0" step={step} value={value || ''} onChange={event => onChange(Number(event.target.value) || 0)} />
      <span className="panel-field-help">{detail}</span>
    </label>
  );
}
