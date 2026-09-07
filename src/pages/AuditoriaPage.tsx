import { useCallback, useEffect, useMemo, useState } from 'react';
import { exportGlobalAuditJson, filterGlobalAuditFindings, type GlobalAuditDomain, type GlobalAuditFindingStatus, type GlobalAuditReport } from '../canonical/globalAudit';
import { loadGlobalAuditReport } from '../canonical/globalAuditInputs';
import { useData } from '../store/DataContext';
import { PanelAlert, PanelCard, PanelPage, PanelSectionHeader, PanelStat } from '../ui/pattern/PanelVisual';

const STATUS_LABEL: Record<GlobalAuditFindingStatus, string> = { PASS: 'PASS', BLOCKER: 'BLOCKER', WARNING: 'WARNING', INFO: 'INFO' };
const DOMAIN_LABEL: Record<GlobalAuditDomain, string> = {
  SYSTEM: 'Sistema', SOURCES: 'Fontes', CANONICAL: 'Canônico', REGISTRIES: 'Cadastros', TARGETS: 'Metas', COMPETENCE: 'Competência', SELL_OUT: 'Sell Out', NETWORKS: 'Redes', STOCK: 'Estoque', PRODUCTS: 'Produtos',
};
const OVERALL_TEXT = {
  HEALTHY: 'Auditoria sem bloqueios ou alertas relevantes.',
  ATTENTION: 'Auditoria concluída com pontos de atenção.',
  BLOCKED: 'Existem inconsistências que impedem considerar o estado atual integralmente confiável.',
} as const;
const toneForOverall = (status: GlobalAuditReport['overallStatus']) => status === 'BLOCKED' ? 'error' : status === 'ATTENTION' ? 'warning' : 'success';
const toneForCount = (status: GlobalAuditFindingStatus) => status === 'BLOCKER' ? 'red' : status === 'WARNING' ? 'amber' : status === 'PASS' ? 'green' : 'blue';
const displayValue = (value: unknown) => Array.isArray(value) ? value.length ? value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(' · ') : '—' : value === null || value === undefined || value === '' ? '—' : String(value);

export function AuditoriaPage() {
  const { activeCanonical } = useData();
  const [report, setReport] = useState<GlobalAuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | GlobalAuditFindingStatus>('ALL');
  const [domainFilter, setDomainFilter] = useState<'ALL' | GlobalAuditDomain>('ALL');
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setPageError('');
    try { setReport(await loadGlobalAuditReport()); }
    catch (reason) { setPageError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, activeCanonical?.motorBuildId]);
  useEffect(() => {
    const rerun = () => { void refresh(); };
    const events = ['blue-jacket-competence-changed', 'blue-jacket-target-state-changed', 'blue-jacket-report-settings-changed'];
    for (const event of events) window.addEventListener(event, rerun);
    return () => { for (const event of events) window.removeEventListener(event, rerun); };
  }, [refresh]);

  const visible = useMemo(() => report ? filterGlobalAuditFindings(report.findings, { status: statusFilter, domain: domainFilter, query }) : [], [report, statusFilter, domainFilter, query]);
  const exportJson = () => {
    if (!report) return;
    const blob = new Blob([exportGlobalAuditJson(report)], { type: 'application/json;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `blue-jacket-auditoria-${report.generatedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  };

  return <PanelPage title="Auditoria" eyebrow="ADMINISTRAÇÃO">
    <div className="panel-stack">
      {pageError ? <PanelAlert tone="error">Não foi possível concluir uma leitura consistente da Auditoria Global: {pageError}. Nenhum dado foi alterado.</PanelAlert> : null}
      {report?.partial ? <PanelAlert tone="warning">Auditoria parcial — um ou mais subsistemas não puderam ser carregados. As demais verificações foram mantidas e o erro de leitura aparece como BLOCKER.</PanelAlert> : null}
      {loading && !report ? <PanelAlert>Carregando os inputs atuais sem reprocessar M1–M4…</PanelAlert> : null}

      {report ? <>
        <PanelCard>
          <PanelSectionHeader
            eyebrow="STATUS GERAL"
            title={report.overallStatus}
            description={OVERALL_TEXT[report.overallStatus]}
            action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'ATUALIZANDO…' : 'ATUALIZAR AUDITORIA'}</button><button type="button" onClick={exportJson}>EXPORTAR AUDITORIA JSON</button></div>}
          />
          <PanelAlert tone={toneForOverall(report.overallStatus)}>{OVERALL_TEXT[report.overallStatus]} A leitura é derivada e não executa correções automáticas.</PanelAlert>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 16 }}>
            <PanelStat label="BLOCKERS" value={report.summary.blockers} tone="red" />
            <PanelStat label="WARNINGS" value={report.summary.warnings} tone="amber" />
            <PanelStat label="INFORMAÇÕES" value={report.summary.info} tone="blue" />
            <PanelStat label="VERIFICAÇÕES APROVADAS" value={report.summary.pass} tone="green" />
          </div>
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader eyebrow="FILTROS" title="Diagnósticos consolidados" description={`${visible.length} de ${report.findings.length} findings exibidos. Filtros não alteram o relatório.`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,220px) minmax(180px,240px) minmax(240px,1fr)', gap: 12, alignItems: 'end' }}>
            <label><span className="panel-mini-label">Status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} style={{ width: '100%' }}><option value="ALL">Todos</option><option value="BLOCKER">Blockers</option><option value="WARNING">Warnings</option><option value="INFO">Info</option><option value="PASS">Pass</option></select></label>
            <label><span className="panel-mini-label">Domínio</span><select value={domainFilter} onChange={event => setDomainFilter(event.target.value as typeof domainFilter)} style={{ width: '100%' }}><option value="ALL">Todos</option>{Object.entries(DOMAIN_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className="panel-mini-label">Pesquisa</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="código, fonte, mensagem, ação, competência" style={{ width: '100%' }} /></label>
          </div>
        </PanelCard>

        <PanelCard flush>
          <div style={{ padding: 20 }}><PanelSectionHeader eyebrow="FINDINGS" title="Verificações do estado atual" description="PASS também é exibido para deixar explícito o que foi conferido." /></div>
          <div style={{ display: 'grid' }}>
            {visible.map(item => <details key={item.id} style={{ borderTop: '1px solid var(--panel-border, #dbe2ea)', padding: '14px 20px' }}>
              <summary style={{ cursor: 'pointer', display: 'grid', gridTemplateColumns: '110px 130px minmax(180px,1fr) 80px', gap: 12, alignItems: 'center' }}>
                <strong>{STATUS_LABEL[item.status]}</strong><span>{DOMAIN_LABEL[item.domain]}</span><span><strong>{item.code}</strong><br /><small>{item.message}</small></span><span>{item.count}</span>
              </summary>
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                <div><strong>Ação sugerida:</strong> {item.action}</div>
                {item.source ? <div><strong>Fonte:</strong> {item.source}</div> : null}
                {item.listId ? <div><strong>Lista:</strong> {item.listId}</div> : null}
                {item.competence ? <div><strong>Competência:</strong> {item.competence}</div> : null}
                {item.scope ? <div><strong>Escopo:</strong> {item.scope}</div> : null}
                {item.samples?.length ? <div><strong>Amostras:</strong><ul>{item.samples.map((sample, index) => <li key={`${item.id}-sample-${index}`}>{[sample.source, sample.file, sample.row ? `linha ${sample.row}` : '', sample.value].filter(Boolean).join(' · ')}</li>)}</ul></div> : null}
                {item.technicalDetails ? <details><summary>Detalhes do finding</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(item.technicalDetails, null, 2)}</pre></details> : null}
              </div>
            </details>)}
            {!visible.length ? <div style={{ padding: 20 }}>Nenhum finding corresponde aos filtros atuais.</div> : null}
          </div>
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader eyebrow="DETALHES TÉCNICOS" title="Proveniência do build ativo" description="Hashes ficam fora do resumo operacional e permanecem disponíveis para rastreabilidade." />
          <div style={{ display: 'grid', gap: 8 }}>
            {Object.entries(report.technicalDetails).map(([key, value]) => <div key={key} style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 12 }}><span>{key}</span><code style={{ overflowWrap: 'anywhere' }}>{displayValue(value)}</code></div>)}
          </div>
        </PanelCard>
      </> : null}
    </div>
  </PanelPage>;
}
