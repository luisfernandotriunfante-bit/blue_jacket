import { useEffect, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { exportTopNetworksExcel, exportTopNetworksJson } from '../canonical/operationalExporters';
import { networkTargetFor, sellOutTargets } from '../canonical/reportSettings';
import { buildTopRetailNetworksViewModel } from '../canonical/topRetailNetworksModel';
import type { CanonicalList } from '../canonical/types';
import { useData } from '../store/DataContext';
import { PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const number = new Intl.NumberFormat('pt-BR');
const percentValue = (input: number | null) => input === null ? '—' : percent.format(input);
const textValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

function InfoHint({ text }: { text: string }) {
  return <span className="sellout-info" tabIndex={0} aria-label={text}><span aria-hidden="true">i</span><span className="sellout-info-tooltip" role="tooltip">{text}</span></span>;
}

function MetricCard({ label, value, progress, progressLabel, info }: { label: string; value: string; progress: number | null; progressLabel: string; info: string }) {
  const safeProgress = progress === null ? null : Math.max(0, Math.min(1, progress));
  return <div className="sellout-metric-card">
    <div className="sellout-metric-head"><span>{label}</span><InfoHint text={info} /></div>
    <div className="sellout-metric-value">{value}</div>
    <div className="sellout-progress-copy">{progressLabel}</div>
    <div className={`sellout-progress${safeProgress === null ? ' is-empty' : ''}`} aria-label={safeProgress === null ? 'Sem referência definida' : progressLabel}>
      <span style={{ width: safeProgress === null ? '0%' : `${safeProgress * 100}%` }} />
    </div>
  </div>;
}

export function TopRetailNetworksPage() {
  const { activeCanonical } = useData();
  const [lists, setLists] = useState<{ m2: CanonicalList; m3: CanonicalList } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeCanonical) { setLists(null); return; }
    let live = true;
    setLists(null);
    setError('');
    Promise.all([loadCandidateList('M2_CLIENTE_RCA'), loadCandidateList('M3_MOVIMENTO_VENDAS')])
      .then(([m2, m3]) => { if (live) setLists({ m2, m3 }); })
      .catch(reason => { if (live) setError(String(reason)); });
    return () => { live = false; };
  }, [activeCanonical]);

  if (!activeCanonical) return <PanelPage title="Sell Out"><PanelEmptyState variant="page" title="Sem bundle canônico ativo" description="Não existe fallback legado para esta tela." /></PanelPage>;
  if (error) return <PanelPage title="Sell Out"><PanelEmptyState variant="page" title="Erro ao carregar Redes" description={error} /></PanelPage>;
  if (!lists) return <PanelPage title="Sell Out"><PanelEmptyState variant="page" title="Carregando Redes" description="Leitura passiva de M2 e M3; nenhum parser ou motor é acionado pela aba." /></PanelPage>;

  const hasTopRoute = lists.m2.records.some(row => textValue(row.top_network));
  if (!hasTopRoute) return <PanelPage title="Sell Out"><PanelEmptyState variant="page" title="Roteiro Top ainda não materializado neste build" description="Vá em Atualizar Bases, selecione somente o Roteiro Top e processe. As outras 18 fontes válidas serão reutilizadas; a aba Redes não lê o arquivo original diretamente." /></PanelPage>;

  const targets = sellOutTargets();
  const manualNetworkTarget = networkTargetFor(lists.m3.competence);
  const built = buildTopRetailNetworksViewModel({
    m2: lists.m2,
    m3: lists.m3,
    sellOutTarget: targets.sellOutTarget,
    networkTargetTotal: manualNetworkTarget,
    generatedAt: new Date().toISOString(),
  });
  const model = { ...built, motorBuildId: activeCanonical.motorBuildId, stagingManifestHash: activeCanonical.stagingManifestHash };
  const metaAchievement = model.totals.networkTarget && model.totals.networkTarget > 0 ? model.totals.realized / model.totals.networkTarget : null;
  const clientAchievement = model.totals.customers > 0 ? model.totals.customersWithSales / model.totals.customers : null;
  const sellOutShare = model.totals.overallSellOut > 0 ? model.totals.realized / model.totals.overallSellOut : null;
  const gapShare = model.totals.networkTarget && model.totals.networkTarget > 0 && model.totals.gap !== null
    ? Math.max(model.totals.gap, 0) / model.totals.networkTarget
    : null;

  return <PanelPage title="Sell Out"><div className="panel-stack sellout-page-stack">
    <div className="sellout-metric-grid" style={{ width: '100%', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
      <MetricCard
        label="Meta Redes"
        value={model.totals.networkTarget === null ? 'Definir em Metas' : currency.format(model.totals.networkTarget)}
        progress={metaAchievement}
        progressLabel={metaAchievement === null ? 'Meta Redes não definida' : `${percent.format(metaAchievement)} atingido`}
        info="Meta Redes Geral definida manualmente na aba Metas. As metas individuais são distribuídas pela representatividade mensal dos clientes do Roteiro Ativo, usando Meta T&C e Meta Indústria como referência de peso."
      />
      <MetricCard
        label="Realizado"
        value={currency.format(model.totals.realized)}
        progress={sellOutShare}
        progressLabel={sellOutShare === null ? 'Sem Sell Out realizado' : `${percent.format(sellOutShare)} do Sell Out`}
        info="Somente SALE do M3 para CNPJs presentes no Roteiro Ativo Top Varejistas do M2."
      />
      <MetricCard
        label="Clientes × com venda"
        value={`${number.format(model.totals.customers)} × ${number.format(model.totals.customersWithSales)}`}
        progress={clientAchievement}
        progressLabel={clientAchievement === null ? 'Sem clientes no roteiro' : `${percent.format(clientAchievement)} com venda`}
        info="Primeiro número: CNPJs do Roteiro Ativo. Segundo: quantos desses CNPJs tiveram venda no 8022/M3."
      />
      <MetricCard
        label="Gap de valor"
        value={model.totals.gap === null ? '—' : currency.format(model.totals.gap)}
        progress={gapShare}
        progressLabel={model.totals.gap === null ? 'Meta Redes não definida' : model.totals.gap <= 0 ? 'Meta Redes atingida' : `${percent.format(gapShare ?? 0)} restante`}
        info="Diferença entre a Meta Redes Geral e o realizado dos clientes que pertencem ao Roteiro Ativo."
      />
    </div>

    <PanelCard>
      <PanelSectionHeader
        eyebrow="TOP VAREJISTAS"
        title="Redes do Roteiro Ativo"
        description="Somente CNPJs do Roteiro Ativo mensal, agrupados pelo CNPJ gestor/COD AGRUPAMENTO do próprio roteiro — nunca pelo texto do nome da rede. As metas Top dos CNPJs do mesmo gestor são somadas; Faturado/A faturar vêm do M3. A Meta da Rede preserva a Meta Redes Geral e usa como peso a representatividade da Meta Top agregada convertida pela relação Meta T&C ÷ Meta Indústria."
        action={<div className="panel-inline-actions"><button className="panel-secondary-button" onClick={() => exportTopNetworksExcel(model)}>Exportar Excel</button><button className="panel-secondary-button" onClick={() => exportTopNetworksJson(model)}>Exportar JSON</button></div>}
      />
      <div className="panel-table-wrap">
        <table className="panel-table" style={{ minWidth: 1540 }}>
          <thead><tr>
            <th>Rede</th>
            <th className="is-right">Clientes</th>
            <th className="is-right">Meta da rede</th>
            <th className="is-right">Meta Top Varejista</th>
            <th className="is-right">Ating. Meta Rede</th>
            <th className="is-right">Ating. Meta Top</th>
            <th className="is-right">Faturado</th>
            <th className="is-right">A faturar</th>
            <th className="is-right">Total</th>
            <th className="is-right">Participação</th>
          </tr></thead>
          <tbody>{model.rows.map(row => <tr key={row.groupKey}>
            <td className="is-strong">{row.network}</td>
            <td className="is-right">{number.format(row.customers)}</td>
            <td className="is-right">{row.networkTarget === null ? '—' : currency.format(row.networkTarget)}</td>
            <td className="is-right">{row.topTarget === null ? '—' : currency.format(row.topTarget)}</td>
            <td className="is-right">{percentValue(row.achievement)}</td>
            <td className="is-right">{percentValue(row.topAchievement)}</td>
            <td className="is-right is-blue">{currency.format(row.invoiced)}</td>
            <td className="is-right is-green">{currency.format(row.toInvoice)}</td>
            <td className="is-right is-strong">{currency.format(row.realized)}</td>
            <td className="is-right">{percent.format(row.share)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </PanelCard>
  </div></PanelPage>;
}
