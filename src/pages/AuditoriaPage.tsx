import { useEffect, useMemo, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { buildStockOverviewModel } from '../canonical/stockOverviewModel';
import { HealthPanel } from './EstoquePage';
import type { CanonicalList } from '../canonical/types';
import { PanelEmptyState, PanelPage, PanelCard, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import { useData } from '../store/DataContext';
import { inboundForecasts } from '../canonical/reportSettings';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function AuditoriaPage() {
  const { activeCanonical } = useData();
  const [lists, setLists] = useState<{ m1: CanonicalList; m3: CanonicalList; m4: CanonicalList } | null>(null);
  useEffect(() => {
    if (!activeCanonical) { setLists(null); return; }
    let live = true;
    Promise.all([loadCandidateList('M1_ITEM_ESTOQUE'), loadCandidateList('M3_MOVIMENTO_VENDAS'), loadCandidateList('M4_HISTORICO_TRANSICAO')])
      .then(([m1, m3, m4]) => { if (live) setLists({ m1, m3, m4 }); })
      .catch(() => { if (live) setLists(null); });
    return () => { live = false; };
  }, [activeCanonical]);
  const model = useMemo(() => lists ? buildStockOverviewModel({ ...lists, forecasts: inboundForecasts() }) : null, [lists]);
  if (!activeCanonical) return <PanelPage title="Auditoria"><PanelEmptyState variant="page" title="Sem bundle canônico ativo" description="Atualize as bases para materializar as auditorias do Estoque." /></PanelPage>;
  if (!model) return <PanelPage title="Auditoria"><PanelEmptyState variant="page" title="Carregando auditoria" description="Leitura das listas canônicas materializadas." /></PanelPage>;
  return <PanelPage title="Auditoria"><div className="panel-stack">
    <PanelCard>
      <PanelSectionHeader eyebrow="CONCILIAÇÃO DA CARTEIRA" title="Da Carteira bruta ao saldo em aberto" description="Detalhamento técnico da baixa por NF. Primeiro o sistema procura no 12.322; depois no 218. Uma mesma NF nunca é abatida duas vezes." />
      <div className="stock-analysis-note">
        <span>Carteira bruta: <strong>{currency.format(model.totals.grossInboundValue)}</strong></span>
        <span>12.322: {number.format(model.totals.receiptInvoices12322Read)} NF(s) lidas · <strong>{currency.format(model.totals.deductedBy12322Value)}</strong> baixados</span>
        <span>218: {number.format(model.totals.receiptInvoices218Read)} NF(s) lidas · <strong>{currency.format(model.totals.deductedBy218Value)}</strong> baixados</span>
        <span>Sobreposição: {number.format(model.totals.receiptOverlapInvoices)} NF(s)</span>
        <span>Sem recebimento encontrado: {number.format(model.totals.unmatchedBilledInvoices)} NF(s)</span>
        <span>Saldo final: <strong>{currency.format(model.totals.inboundValue)}</strong></span>
      </div>
    </PanelCard>
    <HealthPanel model={model} />
    <PanelCard>
      <PanelSectionHeader eyebrow="LEITURA TÉCNICA" title="Qualidade e cobertura da análise" description="Informações de suporte para conferir o cálculo sem ocupar a Visão Geral." />
      <div className="stock-analysis-note">
        <span>SKUs com giro mapeado: {number.format(model.totals.mappedDemandItems)}</span>
        <span>Linhas da Carteira com item + Un/CX: {number.format(model.totals.mappedInboundRows)} de {number.format(model.totals.totalInboundRows)}</span>
        <span>Lançamentos reconhecidos: {number.format(model.totals.launchItems)}</span>
      </div>
    </PanelCard>
  </div></PanelPage>;
}
