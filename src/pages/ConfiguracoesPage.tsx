import React, { useMemo, useRef, useState } from 'react';
import { useData } from '../store/DataContext';
import { detectSource } from '../services/canonical/utils';
import {
  loadOperationalSourceState,
  prepareOperationalSources,
  saveOperationalSourceState,
  supplementalSourceKind,
  type OperationalSourceState,
  type SupplementalSourceKind,
} from '../services/operationalSources';
import { applyPortfolioContinuityToPreparedState, loadPortfolioContinuity } from '../services/portfolioContinuityFiles';
import { isUnifiedCanonicalState, processUnifiedFiles } from '../services/motors/unifiedEngine';
import type { SourceAudit, SourceKind } from '../domain/canonical';
import { ReconciliationAuditPanel } from '../ui/audit/ReconciliationAuditPanel';
import { PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

type SourceGroup = 'Rotina diária' | 'Mensal / competência' | 'Apoio / quando mudar' | 'Histórico';
type SourceUi = {
  id: string;
  kind?: SourceKind;
  supplementalKind?: SupplementalSourceKind;
  unifiedSourceType?: string;
  label: string;
  description: string;
  frequency: string;
  group: SourceGroup;
  required?: boolean;
};

const SOURCES: SourceUi[] = [
  { id: 'sales8022', kind: 'sales8022', unifiedSourceType: '8022', label: 'Vendas 8022', description: 'Milênio → clientes. Fonte canônica de faturado, a faturar, Sell Out e positivação atual.', frequency: 'Diário', group: 'Rotina diária', required: true },
  { id: 'stock105', kind: 'stock105', unifiedSourceType: '105', label: 'Posição de Estoque 105', description: 'Autoridade do estoque físico e snapshot de custo dos itens.', frequency: 'Diário', group: 'Rotina diária', required: true },
  { id: 'purchasePortfolio', kind: 'purchasePortfolio', unifiedSourceType: 'CARTEIRA_COLGATE', label: 'Carteira Colgate', description: 'Colgate → Milênio. Pedidos e faturamento da indústria; nunca é Sell Out.', frequency: 'Diário', group: 'Rotina diária', required: true },
  { id: 'stock8013', kind: 'stock8013', unifiedSourceType: '8013', label: 'Estoque 8013', description: 'Un/CX interno e medidas logísticas para auditoria; não substitui o físico do 105.', frequency: 'Diário', group: 'Rotina diária' },
  { id: 'entryNotes218', supplementalKind: 'entryNotes218', unifiedSourceType: '218', label: 'Entrada de Notas 218', description: 'Autoridade do recebimento físico no Winthor. Dá baixa no pipeline Colgate por NF + item.', frequency: 'Diário / conforme recebimento', group: 'Rotina diária', required: true },

  { id: 'compassTargets', kind: 'compassTargets', unifiedSourceType: 'BUSSOLA', label: 'Bússola de Metas', description: 'Meta PNA e Meta. Pos. Ind. Colgate. O realizado continua vindo do 8022.', frequency: 'Nova competência / mês', group: 'Mensal / competência' },
  { id: 'activeRoute', kind: 'activeRoute', unifiedSourceType: 'ROTEIRO_TOP', label: 'Roteiro Ativo Top Varejistas', description: 'Snapshot mensal dos Top Varejistas, rede/bandeira/gestor/categoria e meta Top. Não define RCA.', frequency: 'Nova competência / mês', group: 'Mensal / competência' },

  { id: 'winthorTablePrices', supplementalKind: 'winthorTablePrices', unifiedSourceType: 'PCTABPR', label: 'Tabela de Preços Winthor · PCTABPR', description: 'Lê obrigatoriamente a aba bruta pctabpr, filtra NUMREGIAO=11 e usa PVENDA1 como preço de referência.', frequency: 'Quando houver alteração de preços', group: 'Apoio / quando mudar', required: true },
  { id: 'items286', kind: 'items286', unifiedSourceType: '286', label: 'Cadastro de Itens 286', description: 'Autoridade do Código Winthor atual, EAN interno e relações cadastrais do item.', frequency: 'Quando o cadastro mudar', group: 'Apoio / quando mudar' },
  { id: 'priceList', kind: 'priceList', unifiedSourceType: 'LISTA_PRECO_COLGATE', label: 'Lista de Preço Colgate', description: 'Autoridade dos identificadores e embalagem logística da indústria: SKU, EAN, DUN, Un/CX e CX/Pal.', frequency: 'Quando a indústria atualizar', group: 'Apoio / quando mudar' },
  { id: 'launchList', kind: 'launchList', label: 'Lista Oficial de Lançamentos', description: 'Autoridade para isLaunch por EAN.', frequency: 'Quando houver novos lançamentos', group: 'Apoio / quando mudar' },
  { id: 'rcaMap', kind: 'rcaMap', unifiedSourceType: 'NOVOS_RCAS', label: 'De-Para / Novos RCAs', description: 'População oficial Colgate, código atual, código legado e coordenação.', frequency: 'Quando houver alteração de equipe', group: 'Apoio / quando mudar' },
  { id: 'premises', kind: 'premises', unifiedSourceType: 'PREMISSAS', label: 'Base de Premissas', description: 'Autoridade de Ambiente, Faixa, Perfil, Rede Premissas, cluster e demais classificações comerciais.', frequency: 'Quando a indústria atualizar', group: 'Apoio / quando mudar' },
  { id: 'customerPortfolio', unifiedSourceType: 'CARTEIRA_CLIENTES', label: 'Carteira de Clientes', description: 'Cadastro operacional atual e relação muitos-para-muitos cliente × representante.', frequency: 'Quando houver nova fotografia', group: 'Apoio / quando mudar' },
  { id: 'officialAssortment', unifiedSourceType: 'SORTIMENTO_OFICIAL', label: 'Sortimento Oficial', description: 'Competências oficiais, migrações e descontinuações. Clientes & Sortimento consome esta fonte da base unificada.', frequency: 'Quando houver nova competência', group: 'Apoio / quando mudar', required: true },

  { id: 'history379_2025', kind: 'history379_2025', unifiedSourceType: '379', label: 'Histórico 379 · 2025', description: 'Fato transacional histórico de vendas/devoluções de 2025.', frequency: 'Histórico / eventual', group: 'Histórico' },
  { id: 'history379_2026', kind: 'history379_2026', unifiedSourceType: '379', label: 'Histórico 379 · 2026', description: 'Fato transacional histórico de 2026 antes da migração.', frequency: 'Após fechamento / histórico', group: 'Histórico' },
  { id: 'purchase310', unifiedSourceType: '310', label: '310 total 2026', description: 'Somente reconciliação/visão acumulada CNPJ × produto. Valor Compras já é líquido das devoluções.', frequency: 'Histórico / quando atualizar', group: 'Histórico' },
  { id: 'receivedNotes12322', supplementalKind: 'receivedNotes12322', unifiedSourceType: '12.322', label: 'Notas Recebidas 12.322', description: 'Histórico de notas Colgate em nível de NF no sistema anterior; não inventa quantidade por SKU.', frequency: 'Histórico encerrado no sistema anterior', group: 'Histórico', required: true },
];

const GROUPS: Array<{ key: SourceGroup; title: string; description: string }> = [
  { key: 'Rotina diária', title: 'Rotina diária', description: 'Arquivos operacionais. Cada atualização substitui somente o domínio correspondente e preserva os demais motores.' },
  { key: 'Mensal / competência', title: 'Mensal / competência', description: 'Metas e fotografias que normalmente mudam na virada da competência.' },
  { key: 'Apoio / quando mudar', title: 'Apoio / quando mudar', description: 'Cadastros e regras proprietárias. Atualize somente quando houver uma versão nova.' },
  { key: 'Histórico', title: 'Histórico', description: 'Fontes do sistema anterior e respectivas bases de reconciliação.' },
];

const fmtDateTime = (value?: string) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca carregado';
const fmtSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const fmtMoney = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const fmtNumber = (value: number, digits = 0) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value) || 0);
const normalizedName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

function supplementalFileName(source: SourceUi, state: OperationalSourceState) {
  if (source.supplementalKind === 'winthorTablePrices') return state.tablePriceFileName;
  if (source.supplementalKind === 'entryNotes218') return state.entry218FileName;
  if (source.supplementalKind === 'receivedNotes12322') return state.legacy12322FileName;
  return '';
}

function sourceForFile(fileName: string) {
  const raw=normalizedName(fileName);
  if(raw.includes('CARTEIRA')&&raw.includes('CLIENT'))return SOURCES.find(source=>source.id==='customerPortfolio');
  if(/(^|\D)310(\D|$)/.test(raw))return SOURCES.find(source=>source.id==='purchase310');
  if(raw.includes('SORTIMENTO'))return SOURCES.find(source=>source.id==='officialAssortment');
  const supplemental = supplementalSourceKind(fileName);
  if (supplemental) return SOURCES.find(source => source.supplementalKind === supplemental);
  const kind = detectSource(fileName);
  return SOURCES.find(source => source.kind === kind);
}

export function ConfiguracoesPage() {
  const { canonical, setCanonical, manualConfig } = useData();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [operationalRevision, setOperationalRevision] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: File[]) => { setSuccess(false); setErrorMessage(''); setSelectedFiles(prev => [...prev.filter(p => !newFiles.some(n => n.name === p.name)), ...newFiles]); };
  const removeFile = (name: string) => setSelectedFiles(prev => prev.filter(file => file.name !== name));

  const handleProcess = async () => {
    if (!selectedFiles.length) return;
    setIsProcessing(true); setSuccess(false); setErrorMessage('');
    try {
      const prepared = await prepareOperationalSources(selectedFiles);
      const continuity = await applyPortfolioContinuityToPreparedState(selectedFiles, prepared.state);
      const operationalState = continuity?.state || prepared.state;
      if (continuity) saveOperationalSourceState(operationalState);
      const result = await processUnifiedFiles({ allFiles:selectedFiles, engineFiles:prepared.engineFiles, operational:operationalState, config:manualConfig, previous:canonical, continuityWarning:continuity?.warning });
      setCanonical(result.canonical);
      setOperationalRevision(value => value + 1); setSuccess(true); setSelectedFiles([]);
    } catch (error) {
      console.error(error); setErrorMessage(error instanceof Error ? error.message : 'Não foi possível processar os arquivos.');
    } finally { setIsProcessing(false); }
  };

  const audits = useMemo(() => new Map((canonical?.sources || []).map(source => [source.kind, source])), [canonical]);
  const unifiedSources = useMemo(() => new Set(isUnifiedCanonicalState(canonical) ? canonical.unified.sources.map(source=>source.sourceType) : []), [canonical]);
  const operationalState = useMemo(() => loadOperationalSourceState(), [operationalRevision]);
  const portfolioContinuity = useMemo(() => loadPortfolioContinuity(), [operationalRevision]);
  const queued = useMemo(() => new Map(selectedFiles.map(file => [sourceForFile(file.name)?.id || `unknown:${file.name}`, file])), [selectedFiles]);
  const loadedCount = SOURCES.filter(source => source.unifiedSourceType ? unifiedSources.has(source.unifiedSourceType) : source.supplementalKind ? Boolean(supplementalFileName(source, operationalState)) : Boolean(source.kind && audits.get(source.kind)?.loaded)).length;

  return <PanelPage title="Configurações" metricLabel="Fontes registradas" metricValue={`${loadedCount}/${SOURCES.length}`}>
    <PanelCard>
      <PanelSectionHeader eyebrow="ATUALIZAÇÃO" title="Atualizar arquivos" description="Todas as fontes entram pelo mesmo pipeline. Arquivo bruto alimenta motor; somente a base canônica unificada alimenta cálculos, telas e exportações." action={<span className="panel-badge">MOTORES CANÔNICOS</span>} />
      <input type="file" multiple accept=".xls,.xlsx,.xlsb,.txt" style={{ display: 'none' }} ref={fileInputRef} onChange={event => { if (event.target.files?.length) addFiles(Array.from(event.target.files)); event.target.value = ''; }} />
      <div className={`panel-dropzone${isDragging ? ' is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); setIsDragging(true); }} onDragLeave={event => { event.preventDefault(); setIsDragging(false); }} onDrop={event => { event.preventDefault(); setIsDragging(false); if (event.dataTransfer.files?.length) addFiles(Array.from(event.dataTransfer.files)); }} onClick={() => fileInputRef.current?.click()} style={{ marginTop: '16px', minHeight: '96px', cursor: 'pointer', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '18px' }}>
        <div><div className="panel-dropzone-icon" style={{ margin: '0 auto 7px' }}>⬆</div><strong style={{ color: 'white' }}>Arraste arquivos aqui ou clique para selecionar vários</strong><div style={{ color: 'var(--panel-muted)', fontSize: '.72rem', marginTop: '5px' }}>As fontes que não forem substituídas permanecem na base canônica.</div></div>
      </div>

      {selectedFiles.length > 0 && <div style={{ marginTop: '16px' }}><div className="panel-eyebrow" style={{ marginBottom: '8px' }}>NA FILA · {selectedFiles.length}</div><div style={{ display: 'grid', gap: '7px' }}>{selectedFiles.map(file => { const source = sourceForFile(file.name); return <div key={file.name} style={{ padding: '9px 12px', border: '1px solid rgba(239,51,64,.2)', borderRadius: '10px', background: 'rgba(239,51,64,.035)', display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ minWidth: 0 }}><div style={{ color: 'var(--panel-red)', fontSize: '.68rem', fontWeight: 800 }}>{source?.label || 'Arquivo não identificado'}</div><div style={{ color: 'white', fontSize: '.76rem', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name} <span style={{ color: 'var(--panel-muted)' }}>· {fmtSize(file.size)}</span></div></div><button className="panel-icon-button" onClick={() => removeFile(file.name)}>✕</button></div>; })}</div></div>}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap' }}><button className="panel-primary-button" style={{ maxWidth: '420px' }} onClick={handleProcess} disabled={!selectedFiles.length || isProcessing}>{isProcessing ? 'Processando motores...' : 'Processar arquivos selecionados'}</button>{success && <span className="panel-success">Base canônica unificada atualizada.</span>}{errorMessage && <span style={{ color: '#fca5a5' }}>{errorMessage}</span>}</div>
    </PanelCard>

    {portfolioContinuity ? <PortfolioContinuityPanel snapshot={portfolioContinuity} /> : null}
    {operationalState.receiptItems.length > 0 ? <ReceiptValidationPanel key={`${operationalState.entry218FileName}:${operationalRevision}`} state={operationalState} /> : null}

    {GROUPS.map(group => <PanelCard key={group.key}><PanelSectionHeader eyebrow={group.key.toUpperCase()} title={group.title} description={group.description} action={<span className="panel-badge">{SOURCES.filter(source => source.group === group.key).length} arquivos</span>} /><div style={{ display: 'grid', gap: '8px', marginTop: '15px' }}>{SOURCES.filter(source => source.group === group.key).map(source => <SourceCard key={source.id} source={source} audit={source.kind ? audits.get(source.kind) : undefined} operationalState={operationalState} unifiedLoaded={Boolean(source.unifiedSourceType&&unifiedSources.has(source.unifiedSourceType))} queued={queued.get(source.id)} onAddFile={file => addFiles([file])} />)}</div></PanelCard>)}

    {canonical ? <ReconciliationAuditPanel checks={canonical.reconciliation?.checks||[]} /> : null}
    {isUnifiedCanonicalState(canonical) && canonical.unified.qualityIssues.length > 0 ? <PanelCard><PanelSectionHeader eyebrow="AUDITORIA DOS MOTORES" title="Qualidade da fotografia" description="Pendências cadastrais não alteram fórmulas nem apagam fatos." /><div style={{display:'grid',gap:'8px',marginTop:'14px'}}>{canonical.unified.qualityIssues.slice(0,80).map(issue=><div key={issue.id} style={{color:issue.severity==='ERROR'?'#fca5a5':issue.severity==='WARNING'?'#fcd34d':'var(--panel-muted)',fontSize:'.78rem',padding:'9px 11px',border:'1px solid rgba(255,255,255,.08)',borderRadius:'9px'}}><strong>{issue.code}</strong> · {issue.message}</div>)}</div></PanelCard> : null}
    {canonical?.warnings.length ? <PanelCard><PanelSectionHeader eyebrow="VALIDAÇÃO" title="Pendências conhecidas" description="Somente situações que ainda precisam de dado ou conciliação." /><div style={{ display: 'grid', gap: '8px', marginTop: '14px' }}>{canonical.warnings.map((warning, index) => <div key={`${warning}-${index}`} style={{ color: '#fcd34d', fontSize: '.82rem', padding: '10px 12px', border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.06)', borderRadius: '10px' }}>{warning}</div>)}</div></PanelCard> : null}
  </PanelPage>;
}

function PortfolioContinuityPanel({ snapshot }: { snapshot: ReturnType<typeof loadPortfolioContinuity> extends infer T ? NonNullable<T> : never }) {
  const mode = snapshot.mode === 'BASELINE' ? 'BASELINE INICIAL' : snapshot.mode === 'APPROVED_2026_08_17' ? 'CHECKPOINT APROVADO 17/08' : 'CONTINUIDADE AUTOMÁTICA';
  return <PanelCard><PanelSectionHeader eyebrow="CARTEIRA COMPARÁVEL" title="Continuidade entre snapshots" description="Mantém pedidos já acompanhados e acrescenta somente pedidos realmente novos. O resultado entra no Motor de Vendas/Operação, não é cálculo de tela." action={<span className="panel-badge">{mode}</span>} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '10px', marginTop: '15px' }}><div className="panel-kpi"><span>Carteira bruta do arquivo</span><strong>{fmtMoney(snapshot.rawCost)}</strong><small>{fmtNumber(snapshot.rawCases, 2)} cx · {snapshot.rawRows} linhas</small></div><div className="panel-kpi"><span>Carteira comparável</span><strong>{fmtMoney(snapshot.validatedCost)}</strong><small>{fmtNumber(snapshot.validatedCases, 2)} cx · {snapshot.validatedRows} linhas</small></div><div className="panel-kpi"><span>Histórico retroativo excluído</span><strong>{fmtMoney(snapshot.excludedHistoricalCost)}</strong><small>{fmtNumber(snapshot.excludedHistoricalCases, 2)} cx · {snapshot.excludedHistoricalRows} linhas</small></div><div className="panel-kpi"><span>Pedidos acompanhados</span><strong>{fmtNumber(snapshot.orderNumbers.length)}</strong><small>Snapshot {snapshot.snapshotDate || '—'}</small></div></div></PanelCard>;
}

function ReceiptValidationPanel({ state }: { state: OperationalSourceState }) {
  const legacyTotal = useMemo(() => state.legacyInvoices.reduce((sum, invoice) => sum + Math.max(Number(invoice.totalValue) || 0, 0), 0), [state.legacyInvoices]);
  const eligibleItems = useMemo(() => state.receiptItems.filter(item => item.entryDate >= '2026-08-01'), [state.receiptItems]);
  const eligibleValue = useMemo(() => eligibleItems.reduce((sum, item) => sum + item.units * item.unitPrice, 0), [eligibleItems]);
  return <PanelCard><PanelSectionHeader eyebrow="VALIDAÇÃO DE RECEBIMENTO" title="Auditoria item a item do 218" description="O 218 é a autoridade de recebimento. Esta tabela é somente auditoria; a baixa canônica ocorre dentro do Motor de Vendas/Operação." action={<span className="panel-badge">{eligibleItems.length} itens</span>} /><div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '14px 0' }}><span className="panel-badge">12.322 histórico · {state.legacyInvoices.length} NFs · {fmtMoney(legacyTotal)}</span><span className="panel-badge">218 atual · {eligibleItems.length} itens</span><span className="panel-badge">Valor dos itens · {fmtMoney(eligibleValue)}</span></div><div className="panel-table-wrap" style={{ maxHeight: '520px' }}><table className="panel-table"><thead><tr><th>Status</th><th>Entrada</th><th>NF</th><th>Código</th><th>Produto</th><th className="is-right">Quantidade</th><th className="is-right">Valor unit.</th><th className="is-right">Valor item</th></tr></thead><tbody>{state.receiptItems.map((item, index) => <tr key={`${item.invoice}:${item.sku}:${index}`}><td>{item.entryDate >= '2026-08-01' ? <span className="panel-badge panel-badge-green">MOTOR 218</span> : <span className="panel-badge">FORA DA VIGÊNCIA</span>}</td><td>{item.entryDate || '—'}</td><td className="is-strong">{item.invoice}</td><td>{item.sku}</td><td>{item.product}</td><td className="is-right">{fmtNumber(item.units)}</td><td className="is-right">{fmtMoney(item.unitPrice)}</td><td className="is-right is-strong">{fmtMoney(item.units * item.unitPrice)}</td></tr>)}</tbody></table></div></PanelCard>;
}

function SourceCard({ source, audit, operationalState, unifiedLoaded, queued, onAddFile }: { source: SourceUi; audit?: SourceAudit; operationalState: OperationalSourceState; unifiedLoaded:boolean; queued?: File; onAddFile: (file: File) => void }) {
  const supplementalName = supplementalFileName(source, operationalState);
  const loaded = unifiedLoaded || (source.supplementalKind ? Boolean(supplementalName) : Boolean(audit?.loaded));
  const status = queued ? 'NA FILA' : loaded ? 'ATUALIZADO' : 'NÃO CARREGADO';
  const fileName = queued?.name || supplementalName || audit?.fileName || '—';
  const lastUpdate = unifiedLoaded ? 'Base unificada' : source.supplementalKind ? (loaded ? 'Base carregada' : 'Nunca carregado') : fmtDateTime(audit?.updatedAt);
  return <div style={{ padding: '12px 14px', border: `1px solid ${queued ? 'rgba(239,51,64,.3)' : loaded ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.065)'}`, borderRadius: '12px', background: queued ? 'rgba(239,51,64,.035)' : 'rgba(255,255,255,.014)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '14px', alignItems: 'center' }}><div style={{ minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}><strong style={{ color: loaded || queued ? 'white' : 'var(--panel-text-dim)', fontSize: '.82rem' }}>{source.label}</strong><span className="panel-badge" style={{ color: queued ? 'var(--panel-red)' : loaded ? '#86efac' : 'var(--panel-muted)' }}>{status}</span>{source.required && <span className="panel-badge">PRINCIPAL</span>}</div><div style={{ color: 'var(--panel-muted)', fontSize: '.69rem', lineHeight: 1.4, marginTop: '4px' }}>{source.description}</div><div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px', fontSize: '.64rem' }}><span style={{ color: 'var(--panel-muted)' }}><strong style={{ color: 'var(--panel-text-dim)' }}>Atualizar:</strong> {source.frequency}</span><span style={{ color: 'var(--panel-muted)' }}><strong style={{ color: 'var(--panel-text-dim)' }}>Última carga:</strong> {lastUpdate}</span><span title={fileName} style={{ color: 'var(--panel-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '360px' }}><strong style={{ color: 'var(--panel-text-dim)' }}>Arquivo:</strong> {fileName}</span></div></div><label className="panel-chip" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>Selecionar arquivo<input type="file" accept=".xls,.xlsx,.xlsb,.txt" style={{ display: 'none' }} onChange={event => { const file = event.target.files?.[0]; if (file) onAddFile(file); event.target.value = ''; }} /></label></div>;
}
