import { useEffect, useMemo, useState } from 'react';
import { loadCandidateList, loadCandidateManifest } from '../canonical/candidateLists';
import {
  backfillCanonicalHistoryForClose,
  canonicalHistoryStatusForClose,
  indexedDbCanonicalHistoryRepository,
  loadCanonicalHistoryArchive,
  loadHistoricalCanonicalList,
  type CanonicalHistoryArchive,
  type CanonicalHistoryCloseStatus,
} from '../canonical/canonicalHistory';
import { indexedDbCanonicalBundleRepository } from '../canonical/bundleStore';
import { exportExcel, exportJson } from '../canonical/exporters';
import {
  loadMonthlyClosingState,
  subscribeMonthlyClosingState,
  type MonthlyClosingCloseEvent,
  type MonthlyClosingReopenEvent,
} from '../canonical/monthlyClosingState';
import { hasGeneratedCanonicalBuild } from '../canonical/sourceImport';
import type { CanonicalList } from '../canonical/types';
import { useData } from '../store/DataContext';
import { PanelAlert, PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const labels: Record<CanonicalList['id'], string> = {
  M1_ITEM_ESTOQUE: 'M1 — Item / Estoque',
  M2_CLIENTE_RCA: 'M2 — Cliente / RCA',
  M3_MOVIMENTO_VENDAS: 'M3 — Movimentação / Vendas',
  M4_HISTORICO_TRANSICAO: 'M4 — Histórico / Transição',
};
const ids = Object.keys(labels) as CanonicalList['id'][];
const statusLabel: Record<CanonicalHistoryCloseStatus, string> = {
  AVAILABLE: 'DISPONÍVEL',
  MISSING_LOCAL: 'NÃO ARQUIVADO NESTE APARELHO',
  CORRUPT: 'CORROMPIDO',
};

type HistoryRow = {
  close: MonthlyClosingCloseEvent;
  reopen: MonthlyClosingReopenEvent | null;
  status: CanonicalHistoryCloseStatus;
  sourceAvailable: boolean;
};

async function sourceAvailable(close: MonthlyClosingCloseEvent) {
  const id = close.evidence.activeBuildIdentity.motorBuildId;
  if (await hasGeneratedCanonicalBuild(id)) return true;
  return Boolean(await indexedDbCanonicalBundleRepository.get(id));
}

export function ListasCanonicasPage() {
  const { activeCanonical } = useData();
  const [manifest, setManifest] = useState<any>(null);
  const [loaded, setLoaded] = useState<Partial<Record<CanonicalList['id'], CanonicalList>>>({});
  const [open, setOpen] = useState<CanonicalList['id'] | null>(null);
  const [error, setError] = useState('');
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [selectedArchive, setSelectedArchive] = useState<CanonicalHistoryArchive | null>(null);
  const [historicalLists, setHistoricalLists] = useState<Partial<Record<CanonicalList['id'], CanonicalList>>>({});
  const [historicalOpen, setHistoricalOpen] = useState<CanonicalList['id'] | null>(null);
  const [historyFilter, setHistoryFilter] = useState({ competence: '', revision: '', cycle: 'ALL', availability: 'ALL' });

  useEffect(() => {
    setManifest(null); setLoaded({}); setOpen(null); setError('');
    if (activeCanonical) loadCandidateManifest().then(setManifest).catch(reason => setError(String(reason)));
  }, [activeCanonical]);

  const refreshHistory = async () => {
    setHistoryError('');
    try {
      const closing = loadMonthlyClosingState();
      const events = closing?.events ?? [];
      const closes = events.filter((event): event is MonthlyClosingCloseEvent => event.type === 'CLOSE');
      const rows = await Promise.all(closes.map(async close => ({
        close,
        reopen: events.find((event): event is MonthlyClosingReopenEvent => event.type === 'REOPEN' && event.competence === close.competence && event.revision === close.revision) ?? null,
        status: await canonicalHistoryStatusForClose(close),
        sourceAvailable: await sourceAvailable(close),
      })));
      setHistoryRows(rows.sort((a, b) => b.close.occurredAt.localeCompare(a.close.occurredAt)));
    } catch (reason) { setHistoryError(reason instanceof Error ? reason.message : String(reason)); }
  };
  useEffect(() => { void refreshHistory(); return subscribeMonthlyClosingState(() => { void refreshHistory(); }); }, []);

  const get = async (id: CanonicalList['id']) => {
    if (loaded[id]) return loaded[id]!;
    const list = await loadCandidateList(id);
    setLoaded(current => ({ ...current, [id]: list }));
    return list;
  };
  const getHistorical = async (archiveId: string, id: CanonicalList['id']) => {
    if (historicalLists[id] && selectedArchive?.archiveId === archiveId) return historicalLists[id]!;
    const list = await loadHistoricalCanonicalList(archiveId, id);
    setHistoricalLists(current => ({ ...current, [id]: list }));
    return list;
  };

  const filteredHistory = useMemo(() => historyRows.filter(row => {
    if (historyFilter.competence && !row.close.competence.includes(historyFilter.competence.trim())) return false;
    if (historyFilter.revision && String(row.close.revision) !== historyFilter.revision.trim()) return false;
    if (historyFilter.cycle !== 'ALL' && (historyFilter.cycle === 'REOPENED') !== Boolean(row.reopen)) return false;
    if (historyFilter.availability !== 'ALL' && row.status !== historyFilter.availability) return false;
    return true;
  }), [historyRows, historyFilter]);

  const activeProvenance = activeCanonical ? {
    motorBuildId: activeCanonical.motorBuildId,
    stagingManifestHash: activeCanonical.stagingManifestHash,
    adminRegistryHash: activeCanonical.adminRegistryHash,
    rcaTargetRegistryHash: activeCanonical.rcaTargetRegistryHash,
    sourceContractVersion: activeCanonical.sourceContractVersion,
    sourceReplacementProofHash: activeCanonical.sourceReplacementProofHash,
    sourceReplacements: activeCanonical.sourceReplacements,
    canonicalInputHash: activeCanonical.canonicalInputHash,
    schemaVersion: activeCanonical.schemaVersion,
    engineVersion: activeCanonical.engineVersion,
  } : null;

  return <PanelPage title="Listas Canônicas" metricLabel="Arquivo local" metricValue={`${historyRows.filter(row => row.status === 'AVAILABLE').length} históricos`}>
    <PanelSectionHeader eyebrow="DADOS CANÔNICOS" title="Build ativo" description="Build operacional atual. Preview e exportação continuam lendo somente a autoridade canônica ativa." />
    {!activeCanonical && <PanelEmptyState variant="page" title="Sem build canônico ativo" description="Não há fallback para dados legados. O histórico fechado local continua disponível abaixo quando existir." />}
    {activeCanonical && error && <PanelAlert tone="warning">Erro de bundle ativo: {error}</PanelAlert>}
    {activeCanonical && !error && !manifest && <PanelEmptyState variant="page" title="Carregando build ativo" description="Leitura passiva das listas materializadas; nenhum parser ou motor será acionado." />}
    {activeCanonical && manifest && activeProvenance && <>
      <PanelAlert tone="success">
        BUILD ATIVO: {activeCanonical.motorBuildId}<br />
        stagingManifestHash: {activeCanonical.stagingManifestHash}<br />
        adminRegistryHash: {activeCanonical.adminRegistryHash ?? '—'}<br />
        rcaTargetRegistryHash: {activeCanonical.rcaTargetRegistryHash ?? '—'}<br />
        sourceContractVersion: {activeCanonical.sourceContractVersion ?? '—'}<br />
        sourceReplacementProofHash: {activeCanonical.sourceReplacementProofHash ?? '—'}<br />
        sourceReplacements: {JSON.stringify(activeCanonical.sourceReplacements ?? [])}<br />
        canonicalInputHash: {activeCanonical.canonicalInputHash ?? '—'}
      </PanelAlert>
      <div className="panel-stack">{ids.map(id => {
        const stat = manifest.lists[id]; const list = loaded[id]; const fields = list?.records[0] ? Object.keys(list.records[0]) : [];
        return <PanelCard key={id}>
          <PanelSectionHeader eyebrow={id} title={labels[id]} description={`${stat.rowCount} registros · status ${manifest.status} · gerado em ${manifest.generatedAt}`} />
          <p className="panel-muted">Warnings: {stat.warnings} · Erros: {stat.errors}{id === 'M3_MOVIMENTO_VENDAS' && <><br />SALE {activeCanonical.factTypeCounts.SALE} · INBOUND_ORDER {activeCanonical.factTypeCounts.INBOUND_ORDER} · RECEIPT {activeCanonical.factTypeCounts.RECEIPT} · TARGET {activeCanonical.factTypeCounts.TARGET}</>}</p>
          <button className="panel-button" onClick={async () => { await get(id); setOpen(open === id ? null : id); }}>Preview</button>{' '}
          <button className="panel-button" onClick={async () => exportExcel(await get(id), activeProvenance)}>Exportar Excel</button>{' '}
          <button className="panel-button" onClick={async () => exportJson(await get(id), activeProvenance)}>Exportar JSON</button>
          {open === id && list && <div style={{ overflow: 'auto', maxHeight: 360, marginTop: 12 }}><table><thead><tr>{fields.map(field => <th key={field}>{field}</th>)}</tr></thead><tbody>{list.records.slice(0, 50).map((record, index) => <tr key={index}>{fields.map(field => <td key={field}>{String(record[field] ?? '')}</td>)}</tr>)}</tbody></table><p className="panel-muted">Página 1 de preview (50 registros); o dataset e a exportação permanecem integrais.</p></div>}
        </PanelCard>;
      })}</div>
    </>}

    <PanelSectionHeader eyebrow="FASE 8" title="Histórico de fechamentos" description="Arquivo canônico local e imutável dos builds referenciados por eventos CLOSE. O histórico não altera o build operacional atual." />
    <PanelAlert tone="warning">O histórico canônico é local nesta fase. A sincronização/backup desses arquivos será tratada na próxima fase.</PanelAlert>
    {historyError && <PanelAlert tone="warning">Falha ao ler histórico: {historyError}</PanelAlert>}
    <PanelCard>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Competência" value={historyFilter.competence} onChange={event => setHistoryFilter(current => ({ ...current, competence: event.target.value }))} />
        <input placeholder="Revision" value={historyFilter.revision} onChange={event => setHistoryFilter(current => ({ ...current, revision: event.target.value }))} />
        <select value={historyFilter.cycle} onChange={event => setHistoryFilter(current => ({ ...current, cycle: event.target.value }))}><option value="ALL">Todos os ciclos</option><option value="CLOSED">Fechado</option><option value="REOPENED">Reaberto</option></select>
        <select value={historyFilter.availability} onChange={event => setHistoryFilter(current => ({ ...current, availability: event.target.value }))}><option value="ALL">Toda disponibilidade</option><option value="AVAILABLE">Disponível</option><option value="MISSING_LOCAL">Não arquivado</option><option value="CORRUPT">Corrompido</option></select>
        <button className="panel-button" onClick={() => void refreshHistory()}>Atualizar</button>
      </div>
    </PanelCard>
    {filteredHistory.length === 0 ? <PanelEmptyState title="Nenhum fechamento encontrado" description="Eventos CLOSE da Fase 7 aparecerão aqui. Archives órfãos nunca são apresentados como fechamentos oficiais." /> : <div style={{ overflow: 'auto' }}><table><thead><tr><th>Competência</th><th>Revision</th><th>Situação do ciclo</th><th>Data do fechamento</th><th>Build</th><th>Engine</th><th>Auditoria</th><th>Arquivo canônico local</th><th>Ações</th></tr></thead><tbody>{filteredHistory.map(row => <tr key={row.close.eventId}>
      <td>{row.close.competence}</td><td>r{row.close.revision}</td><td>{row.reopen ? 'REABERTO' : 'FECHADO'}</td><td>{row.close.occurredAt}</td><td>{row.close.evidence.activeBuildIdentity.motorBuildId.slice(0, 18)}</td><td>{row.close.evidence.activeBuildIdentity.engineVersion}</td><td>{row.close.evidence.auditOverallStatus}</td><td>{statusLabel[row.status]}</td>
      <td>{row.status === 'AVAILABLE' && <button className="panel-button" onClick={async () => { const archive = await loadCanonicalHistoryArchive(row.close.evidence.activeBuildIdentity.motorBuildId); setSelectedArchive(archive); setHistoricalLists({}); setHistoricalOpen(null); }}>Ver histórico</button>}
        {row.status === 'MISSING_LOCAL' && row.sourceAvailable && <button className="panel-button" onClick={async () => { try { await backfillCanonicalHistoryForClose(row.close); await refreshHistory(); } catch (reason) { setHistoryError(reason instanceof Error ? reason.message : String(reason)); } }}>Arquivar dados disponíveis</button>}
        {row.status === 'MISSING_LOCAL' && !row.sourceAvailable && <span className="panel-muted">Build não disponível localmente para arquivamento.</span>}
        {row.status === 'CORRUPT' && <span className="panel-muted">Integridade inválida. Nenhum fallback será usado.</span>}
      </td>
    </tr>)}</tbody></table></div>}

    {selectedArchive && <PanelCard>
      <PanelAlert tone="warning"><strong>VISUALIZAÇÃO HISTÓRICA</strong><br />Este conteúdo pertence ao build fechado e não altera o build operacional atual.</PanelAlert>
      {(() => {
        const closeRow = historyRows.find(row => row.close.evidence.activeBuildIdentity.motorBuildId === selectedArchive.archiveId);
        return <><PanelSectionHeader eyebrow="ARQUIVO CANÔNICO" title={selectedArchive.archiveId} description={`archiveHash ${selectedArchive.archiveHash}`} />
          <p className="panel-muted">Competência: {closeRow?.close.competence ?? '—'} · Revision: {closeRow ? `r${closeRow.close.revision}` : '—'} · Fechado em: {closeRow?.close.occurredAt ?? '—'} · Reaberto em: {closeRow?.reopen?.occurredAt ?? '—'}<br />Engine: {selectedArchive.buildIdentity.engineVersion}<br />canonicalInputHash: {selectedArchive.buildIdentity.canonicalInputHash}<br />Auditoria: {closeRow?.close.evidence.auditOverallStatus ?? '—'}<br />sourceReplacements: {JSON.stringify(selectedArchive.buildIdentity.sourceReplacements)}<br />Fact types: SALE {selectedArchive.factTypeCounts.SALE} · INBOUND_ORDER {selectedArchive.factTypeCounts.INBOUND_ORDER} · RECEIPT {selectedArchive.factTypeCounts.RECEIPT} · TARGET {selectedArchive.factTypeCounts.TARGET}</p></>;
      })()}
      <div className="panel-stack">{ids.map(id => {
        const list = historicalLists[id]; const fields = list?.records[0] ? Object.keys(list.records[0]) : [];
        const provenance = selectedArchive.buildIdentity;
        return <PanelCard key={`historical-${id}`}>
          <PanelSectionHeader eyebrow={id} title={labels[id]} description={`${selectedArchive.rowCounts[id]} registros · hash ${selectedArchive.listHashes[id].slice(0, 12)}…`} />
          <button className="panel-button" onClick={async () => { await getHistorical(selectedArchive.archiveId, id); setHistoricalOpen(historicalOpen === id ? null : id); }}>Preview</button>{' '}
          <button className="panel-button" onClick={async () => exportExcel(await getHistorical(selectedArchive.archiveId, id), provenance)}>Exportar {id.slice(0, 2)} Excel</button>{' '}
          <button className="panel-button" onClick={async () => exportJson(await getHistorical(selectedArchive.archiveId, id), provenance)}>Exportar {id.slice(0, 2)} JSON</button>
          {historicalOpen === id && list && <div style={{ overflow: 'auto', maxHeight: 360, marginTop: 12 }}><table><thead><tr>{fields.map(field => <th key={field}>{field}</th>)}</tr></thead><tbody>{list.records.slice(0, 50).map((record, index) => <tr key={index}>{fields.map(field => <td key={field}>{String(record[field] ?? '')}</td>)}</tr>)}</tbody></table><p className="panel-muted">Preview histórico limitado a 50 registros; exportação permanece integral.</p></div>}
        </PanelCard>;
      })}</div>
    </PanelCard>}
  </PanelPage>;
}
