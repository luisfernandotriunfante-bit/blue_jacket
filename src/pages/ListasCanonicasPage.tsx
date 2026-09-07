import { useEffect, useState } from 'react';
import { loadCandidateList, loadCandidateManifest } from '../canonical/candidateLists';
import { exportExcel, exportJson } from '../canonical/exporters';
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

export function ListasCanonicasPage() {
  const { activeCanonical } = useData();
  const [manifest, setManifest] = useState<any>(null);
  const [loaded, setLoaded] = useState<Partial<Record<CanonicalList['id'], CanonicalList>>>({});
  const [open, setOpen] = useState<CanonicalList['id'] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setManifest(null);
    setLoaded({});
    setOpen(null);
    setError('');
    if (activeCanonical) loadCandidateManifest().then(setManifest).catch(reason => setError(String(reason)));
  }, [activeCanonical]);

  const get = async (id: CanonicalList['id']) => {
    if (loaded[id]) return loaded[id]!;
    const list = await loadCandidateList(id);
    setLoaded(current => ({ ...current, [id]: list }));
    return list;
  };

  if (!activeCanonical) return <PanelPage title="Listas Canônicas"><PanelEmptyState variant="page" title="Sem build canônico ativo" description="Não há fallback para dados legados. Atualize as bases ou restaure um bundle técnico." /></PanelPage>;
  if (error) return <PanelPage title="Listas Canônicas"><PanelAlert tone="warning">Erro de bundle ativo: {error}</PanelAlert></PanelPage>;
  if (!manifest) return <PanelPage title="Listas Canônicas"><PanelEmptyState variant="page" title="Carregando build ativo" description="Leitura passiva das listas materializadas; nenhum parser ou motor será acionado." /></PanelPage>;

  const provenance = {
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
  };

  return <PanelPage title="Listas Canônicas" metricLabel="Build ativo" metricValue="4/4">
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
      const stat = manifest.lists[id];
      const list = loaded[id];
      const fields = list?.records[0] ? Object.keys(list.records[0]) : [];
      return <PanelCard key={id}>
        <PanelSectionHeader eyebrow={id} title={labels[id]} description={`${stat.rowCount} registros · status ${manifest.status} · gerado em ${manifest.generatedAt}`} />
        <p className="panel-muted">Warnings: {stat.warnings} · Erros: {stat.errors}{id === 'M3_MOVIMENTO_VENDAS' && <><br />SALE {activeCanonical.factTypeCounts.SALE} · INBOUND_ORDER {activeCanonical.factTypeCounts.INBOUND_ORDER} · RECEIPT {activeCanonical.factTypeCounts.RECEIPT} · TARGET {activeCanonical.factTypeCounts.TARGET}</>}</p>
        <button className="panel-button" onClick={async () => { await get(id); setOpen(open === id ? null : id); }}>Preview</button>{' '}
        <button className="panel-button" onClick={async () => exportExcel(await get(id), provenance)}>Exportar Excel</button>{' '}
        <button className="panel-button" onClick={async () => exportJson(await get(id), provenance)}>Exportar JSON</button>
        {open === id && list && <div style={{ overflow: 'auto', maxHeight: 360, marginTop: 12 }}><table><thead><tr>{fields.map(field => <th key={field}>{field}</th>)}</tr></thead><tbody>{list.records.slice(0, 50).map((record, index) => <tr key={index}>{fields.map(field => <td key={field}>{String(record[field] ?? '')}</td>)}</tr>)}</tbody></table><p className="panel-muted">Página 1 de preview (50 registros); o dataset e a exportação permanecem integrais.</p></div>}
      </PanelCard>;
    })}</div>
  </PanelPage>;
}
