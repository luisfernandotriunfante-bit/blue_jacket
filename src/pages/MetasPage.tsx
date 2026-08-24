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
        <PanelEmptyState variant="page" title="Base ainda não carregada" description="Carregue as fontes em Configurações para iniciar a manutenção das metas." />
      </PanelPage>
    );
  }

  const hasCompassTargets = canonical.sources.some(source => source.kind === 'compassTargets' && source.loaded);
  const hasActiveRoute = canonical.sources.some(source => source.kind === 'activeRoute' && source.loaded);
  const hasSellOutTarget = canonical.sellOut.sellOutTarget > 0;
  // Toda rede canônica real participa da manutenção, mesmo antes de possuir Meta Rede ou Meta Tops.
  // SEM REDE é apenas agrupamento de qualidade/relacionamento e nunca recebe meta comercial de rede.
  const networkRows = canonical.networks.filter(network => network.key !== 'SEM REDE');
  const networkTotal = networkRows.reduce((sum, network) => sum + network.networkTarget, 0);
  const topTotal = canonical.networks.reduce((sum, network) => sum + network.topTarget, 0);
  const lineTotal = LINE_NAMES.reduce((sum, name) => sum + (manualConfig.lineShares[name] || 0), 0);
  const assignedSalesTarget = canonical.vendors.reduce((sum, vendor) => sum + vendor.salesTarget, 0);
  const assignedPositivityTarget = canonical.vendors.reduce((sum, vendor) => sum + vendor.positivityTarget, 0);
  const unassignedSalesTarget = Math.max(canonical.industryTarget - assignedSalesTarget, 0);
  const unassignedPositivityTarget = Math.max(canonical.industryPositivityTarget - assignedPositivityTarget, 0);
  const configurationWarning = canonical.warnings.find(warning => warning.startsWith('Configuração ') && (
    warning.includes('falha ao persistir') || warning.includes('configuração persistida está corrompida')
  ));

  const setField = (field: 'sellOutTarget' | 'coverageTargetDays', value: number) => setManualConfig({ ...manualConfig, [field]: Math.max(value || 0, 0) });
  const setShare = (name: (typeof LINE_NAMES)[number], value: number) => setManualConfig({ ...manualConfig, lineShares: { ...manualConfig.lineShares, [name]: Math.max(value || 0, 0) / 100 } });
  const setPortfolioMarkup = (value: number) => setManualConfig({ ...manualConfig, portfolioSaleMarkup: Math.max(value || 0, 0) / 100 });
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
    // A Meta Redes Geral é a autoridade do total. A edição individual só redistribui um total já definido.
    if (!networkRows.length || networkTotal <= 0) return;
    saveNetworkTargets(redistributeSingleNetwork(networkRows.map(network => ({ key: network.key, target: network.networkTarget })), key, requested));
  };

  return (
    <PanelPage title="Metas" metricLabel="Meta Sell Out T&C" metricValue={hasSellOutTarget ? brl(canonical.sellOut.sellOutTarget) : '—'}>
      <div className="panel-stack">
        {configurationWarning ? <PanelAlert tone="error">{configurationWarning} A alteração continua visível nesta sessão, mas não deve ser considerada salva até a persistência voltar a funcionar.</PanelAlert> : null}

        <PanelCard>
          <PanelSectionHeader eyebrow="REFERÊNCIAS OFICIAIS" title="Metas recebidas das fontes" description="Somente leitura. O realizado continua vindo do motor de Vendas/Operação; ausência de fonte não é convertida em meta zero." />
          <div className="panel-grid panel-grid-auto">
            <PanelStat label="Meta indústria · Bússola" value={hasCompassTargets ? brl(canonical.industryTarget) : '—'} />
            <PanelStat label="Meta positivação · Bússola" value={hasCompassTargets ? canonical.industryPositivityTarget.toLocaleString('pt-BR') : '—'} />
            <PanelStat label="Meta Tops · Roteiro Ativo" value={hasActiveRoute ? brl(topTotal) : '—'} />
            <PanelStat label="Meta vendas sem RCA resolvido" value={hasCompassTargets ? brl(unassignedSalesTarget) : '—'} />
            <PanelStat label="Meta positivação sem RCA resolvido" value={hasCompassTargets ? unassignedPositivityTarget.toLocaleString('pt-BR') : '—'} />
          </div>
          {!hasCompassTargets ? <div style={{ marginTop: 12 }}><PanelAlert tone="warning">Bússola não carregada nesta fotografia. Meta da indústria e meta de positivação permanecem indisponíveis; o sistema não assume zero.</PanelAlert></div> : null}
          {!hasActiveRoute ? <div style={{ marginTop: 12 }}><PanelAlert tone="warning">Roteiro Ativo não carregado nesta fotografia. A Meta Tops permanece indisponível; o sistema não assume zero.</PanelAlert></div> : null}
          {hasCompassTargets && (unassignedSalesTarget > 0.01 || unassignedPositivityTarget > 0) ? <div style={{ marginTop: 12 }}><PanelAlert tone="warning">Existe parcela da Bússola sem RCA oficial resolvido. Ela continua compondo a meta da indústria, mas não é redistribuída artificialmente entre vendedores.</PanelAlert></div> : null}
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader eyebrow="AJUSTÁVEIS" title="Parâmetros gerais" description="Alterações são versionadas pela competência ativa e passam a valer em todas as telas e exportações canônicas." />
          <div className="panel-grid panel-grid-auto">
            <NumberField label="Meta Sell Out (T&C)" value={manualConfig.sellOutTarget} step={1000} onChange={value => setField('sellOutTarget', value)} detail="Meta manual e independente da Meta Indústria. Zero significa meta T&C não informada." />
            <NumberField label="Meta Redes Geral" value={networkTotal} step={1000} onChange={setNetworkTotal} disabled={!networkRows.length} detail={networkRows.length ? "Total exclusivo das redes. Ao alterar, todas as redes reais são redistribuídas proporcionalmente; se ainda não houver pesos, a primeira distribuição é igualitária." : "Nenhuma rede canônica disponível. Carregue a classificação de clientes/redes antes de definir este total."} />
            <NumberField label="Meta de cobertura (dias)" value={manualConfig.coverageTargetDays} step={1} onChange={value => setField('coverageTargetDays', value)} detail="Referência usada nas visões e alertas de estoque." />
            <NumberField label="Acréscimo de venda da Carteira (%)" value={manualConfig.portfolioSaleMarkup * 100} step={0.01} onChange={setPortfolioMarkup} detail="Fallback de valorização quando não há PVENDA1 aplicável; não altera o valor bruto da Carteira." />
          </div>
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader eyebrow="CALENDÁRIO" title="Feriados e dias não trabalhados" description="Datas excluídas do cálculo de dias úteis, médias diárias, tendência e necessidade por dia." action={<span className="panel-badge">{manualConfig.holidays.length} DATA(S)</span>} />
          <div className="panel-grid panel-grid-3" style={{ marginBottom: 14 }}>
            <PanelStat label="Dias úteis do mês" value={canonical.sellOut.businessDaysTotal.toLocaleString('pt-BR')} />
            <PanelStat label="Dias úteis decorridos" value={canonical.sellOut.businessDaysElapsed.toLocaleString('pt-BR')} />
            <PanelStat label="Dias úteis restantes" value={canonical.sellOut.businessDaysRemaining.toLocaleString('pt-BR')} />
          </div>
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
                <div className="panel-stat-note">Meta atual: {hasSellOutTarget ? brl(canonical.sellOut.sellOutTarget * (manualConfig.lineShares[name] || 0)) : '—'}</div>
              </div>
            ))}
          </div>
          {Math.abs(lineTotal - 1) >= 0.0001 ? <div style={{ marginTop: 12 }}><PanelAlert tone="warning">A distribuição das linhas está em {pct(lineTotal)}. Para distribuir integralmente a Meta T&C, o total deve fechar em 100%.</PanelAlert></div> : null}
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader eyebrow="META REDES" title="Manutenção por rede" description="Editar uma rede não altera a Meta Redes Geral: o saldo é redistribuído proporcionalmente entre as outras redes. SEM REDE nunca recebe meta." action={<span className="panel-badge">TOTAL · {brl(networkTotal)}</span>} />
          {networkRows.length ? (
            <>
              {networkTotal <= 0 ? <div style={{ marginBottom: 12 }}><PanelAlert tone="warning">Defina primeiro a Meta Redes Geral. A edição individual fica bloqueada enquanto o total for zero para não criar uma meta geral por acidente.</PanelAlert></div> : null}
              <div className="panel-grid panel-grid-auto">
                {networkRows.map(network => {
                  const participation = networkTotal > 0 ? network.networkTarget / networkTotal : 0;
                  return (
                    <div key={network.key} className="panel-stat">
                      <div className="panel-toolbar">
                        <strong>{network.name}</strong>
                        <span className="panel-badge">{pct(participation)} · TOPS {brl(network.topTarget)}</span>
                      </div>
                      <input className="panel-input panel-input-full panel-input-currency" type="number" min="0" max={networkTotal || 0} step="1000" value={network.networkTarget || ''} disabled={networkTotal <= 0} onChange={event => setNetwork(network.key, Number(event.target.value) || 0)} style={{ marginTop: 10 }} />
                      <div className="panel-stat-note">Participação atual: {pct(participation)}</div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : <PanelEmptyState variant="compact" title="Nenhuma rede canônica disponível" description="A Meta Redes Geral só pode ser distribuída quando a fotografia possui redes reais resolvidas. SEM REDE não é usado como destinatário de meta." />}
        </PanelCard>
      </div>
    </PanelPage>
  );
}

function NumberField({ label, value, step, onChange, detail, disabled = false }: { label: string; value: number; step: number; onChange: (value: number) => void; detail: string; disabled?: boolean }) {
  return (
    <label className="panel-field">
      <span className="panel-field-label panel-field-label-uppercase">{label}</span>
      <input className="panel-input panel-input-full panel-input-currency" type="number" min="0" step={step} value={value > 0 ? Number(value.toFixed(2)) : ''} disabled={disabled} onChange={event => onChange(Number(event.target.value) || 0)} />
      <span className="panel-field-help">{detail}</span>
    </label>
  );
}
