import React, { useMemo, useRef, useState } from 'react';
import { useData } from '../store/DataContext';
import { processCanonicalFiles } from '../services/canonicalEngine';
import { detectSource } from '../services/canonical/utils';
import {
  applyOperationalOverrides,
  loadOperationalSourceState,
  operationalLegacyData,
  prepareOperationalSources,
  supplementalSourceKind,
  type OperationalSourceState,
  type SupplementalSourceKind,
} from '../services/operationalSources';
import type { SourceAudit, SourceKind } from '../domain/canonical';
import { ReconciliationAuditPanel } from '../ui/audit/ReconciliationAuditPanel';
import { PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

type SourceGroup = 'Rotina diária' | 'Mensal / competência' | 'Apoio / quando mudar' | 'Histórico';
type SourceUi = {
  id: string;
  kind?: SourceKind;
  supplementalKind?: SupplementalSourceKind;
  label: string;
  description: string;
  frequency: string;
  group: SourceGroup;
  required?: boolean;
};

const SOURCES: SourceUi[] = [
  { id: 'sales8022', kind: 'sales8022', label: 'Vendas 8022', description: 'Faturado, a faturar, clientes, vendedores e produtos.', frequency: 'Diário', group: 'Rotina diária', required: true },
  { id: 'stock105', kind: 'stock105', label: 'Posição de Estoque 105', description: 'Estoque atual e custo. O preço de tabela é priorizado pela PCTABPR quando ela estiver carregada.', frequency: 'Diário', group: 'Rotina diária', required: true },
  { id: 'purchasePortfolio', kind: 'purchasePortfolio', label: 'Carteira Colgate', description: 'Mercadoria ainda em trânsito / pendente. Alimenta estoque projetado e risco de ruptura.', frequency: 'Diário', group: 'Rotina diária', required: true },
  { id: 'stock8013', kind: 'stock8013', label: 'Estoque 8013', description: 'Caixas, unidades e peso para conferência física.', frequency: 'Diário', group: 'Rotina diária' },
  { id: 'entryNotes218', supplementalKind: 'entryNotes218', label: 'Entrada de Notas 218', description: 'Notas fiscais que efetivamente deram entrada. Alimenta Entradas e Saídas e o controle da Carteira.', frequency: 'Diário / conforme recebimento', group: 'Rotina diária', required: true },

  { id: 'compassTargets', kind: 'compassTargets', label: 'Bússola de Metas', description: 'Metas oficiais de indústria, vendedores e positivação.', frequency: 'Nova competência / mês', group: 'Mensal / competência' },
  { id: 'activeRoute', kind: 'activeRoute', label: 'Roteiro Ativo', description: 'PDVs ativos e Meta Tops oficial da competência.', frequency: 'Nova competência / mês', group: 'Mensal / competência' },
  { id: 'legacyTopNetworks', kind: 'legacyTopNetworks', label: 'TOP REDES · Referência', description: 'Referência operacional para metas e vínculos de redes que ainda dependem desse arquivo.', frequency: 'Nova competência / mês', group: 'Mensal / competência' },

  { id: 'winthorTablePrices', supplementalKind: 'winthorTablePrices', label: 'Tabela de Preços Winthor · PCTABPR', description: 'Fonte prioritária do Preço de Tabela. Onde houver divergência, PTABELA da região 11/MCD tem prioridade.', frequency: 'Quando houver alteração de preços', group: 'Apoio / quando mudar', required: true },
  { id: 'receivedNotes12322', supplementalKind: 'receivedNotes12322', label: 'Notas Recebidas 12.322', description: 'Histórico de NFs já recebidas usado para não manter na Carteira notas que já deram entrada.', frequency: 'Atualizar quando houver novas notas contabilizadas', group: 'Apoio / quando mudar', required: true },
  { id: 'items286', kind: 'items286', label: 'Cadastro de Itens 286', description: 'Código Winthor, EAN, código de fábrica e vínculos operacionais dos itens.', frequency: 'Quando o cadastro mudar', group: 'Apoio / quando mudar' },
  { id: 'priceList', kind: 'priceList', label: 'Lista de Preço Colgate', description: 'Referência Colgate → Milênio para EAN, Un/CX e classificação. Não é a fonte prioritária do Preço de Tabela.', frequency: 'Quando a indústria atualizar', group: 'Apoio / quando mudar' },
  { id: 'launchList', kind: 'launchList', label: 'Lista de Lançamentos', description: 'Lista oficial de lançamentos identificados por EAN.', frequency: 'Quando houver novos lançamentos', group: 'Apoio / quando mudar' },
  { id: 'rcaMap', kind: 'rcaMap', label: 'De-Para / Novos RCAs', description: 'Código atual, código anterior, vendedor e coordenação.', frequency: 'Quando houver alteração de equipe', group: 'Apoio / quando mudar' },
  { id: 'premises', kind: 'premises', label: 'Base de Premissas', description: 'CNPJ, rede, perfil e identificação de Top Varejista.', frequency: 'Quando a indústria atualizar', group: 'Apoio / quando mudar' },

  { id: 'history379_2025', kind: 'history379_2025', label: 'Histórico 379 · 2025', description: 'Ano anterior completo para comparativos mensais.', frequency: 'Histórico / eventual', group: 'Histórico' },
  { id: 'history379_2026', kind: 'history379_2026', label: 'Histórico 379 · 2026', description: 'Meses fechados de 2026 para média móvel e cobertura.', frequency: 'Após fechamento de mês', group: 'Histórico' },
];

const GROUPS: Array<{ key: SourceGroup; title: string; description: string }> = [
  { key: 'Rotina diária', title: 'Rotina diária', description: 'Arquivos ligados diretamente à operação do dia. Estes são os primeiros a atualizar quando você renovar a base.' },
  { key: 'Mensal / competência', title: 'Mensal / competência', description: 'Arquivos que normalmente mudam na virada da competência e não precisam ser reenviados todos os dias.' },
  { key: 'Apoio / quando mudar', title: 'Apoio / quando mudar', description: 'Cadastros, preços e controles auxiliares. Atualize somente quando houver uma versão nova ou mudança relevante.' },
  { key: 'Histórico', title: 'Histórico', description: 'Bases mantidas para comparativos, média dos meses fechados e cobertura. Não fazem parte da carga diária.' },
];

const fmtDateTime = (value?: string) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca carregado';
const fmtSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function supplementalFileName(source: SourceUi, state: OperationalSourceState) {
  if (source.supplementalKind === 'winthorTablePrices') return state.tablePriceFileName;
  if (source.supplementalKind === 'entryNotes218') return state.entry218FileName;
  if (source.supplementalKind === 'receivedNotes12322') return state.legacy12322FileName;
  return '';
}

function sourceForFile(fileName: string) {
  const supplemental = supplementalSourceKind(fileName);
  if (supplemental) return SOURCES.find(source => source.supplementalKind === supplemental);
  const kind = detectSource(fileName);
  return SOURCES.find(source => source.kind === kind);
}

export function ConfiguracoesPage() {
  const { canonical, setCanonical, manualConfig, setProdutos, setMetricas, setSellOut } = useData();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [operationalRevision, setOperationalRevision] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: File[]) => {
    setSuccess(false);
    setErrorMessage('');
    setSelectedFiles(prev => [...prev.filter(p => !newFiles.some(n => n.name === p.name)), ...newFiles]);
  };
  const removeFile = (name: string) => setSelectedFiles(prev => prev.filter(file => file.name !== name));

  const handleProcess = async () => {
    if (!selectedFiles.length) return;
    setIsProcessing(true);
    setSuccess(false);
    setErrorMessage('');
    try {
      const prepared = await prepareOperationalSources(selectedFiles);
      const result = await processCanonicalFiles(prepared.engineFiles, manualConfig, canonical);
      const adjusted = applyOperationalOverrides(result.canonical, prepared.state, manualConfig);
      const legacy = operationalLegacyData(adjusted.canonical, manualConfig.coverageTargetDays);
      setCanonical(adjusted.canonical);
      setProdutos(legacy.produtos);
      setMetricas(legacy.metricas);
      setSellOut(result.sellOut);
      setOperationalRevision(value => value + 1);
      setSuccess(true);
      setSelectedFiles([]);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível processar os arquivos.');
    } finally {
      setIsProcessing(false);
    }
  };

  const audits = useMemo(() => new Map((canonical?.sources || []).map(source => [source.kind, source])), [canonical]);
  const operationalState = useMemo(() => loadOperationalSourceState(), [operationalRevision]);
  const queued = useMemo(() => new Map(selectedFiles.map(file => [sourceForFile(file.name)?.id || `unknown:${file.name}`, file])), [selectedFiles]);
  const loadedCount = SOURCES.filter(source => source.supplementalKind ? Boolean(supplementalFileName(source, operationalState)) : Boolean(source.kind && audits.get(source.kind)?.loaded)).length;

  return <PanelPage title="Configurações" metricLabel="Fontes registradas" metricValue={`${loadedCount}/${SOURCES.length}`}>
    <PanelCard>
      <PanelSectionHeader
        eyebrow="ATUALIZAÇÃO"
        title="Atualizar arquivos"
        description="Arraste vários arquivos de uma vez ou use o botão Selecionar arquivo na própria linha de cada fonte. O sistema mantém as fontes anteriores que não forem substituídas."
        action={<span className="panel-badge">Excel + TXT</span>}
      />
      <input type="file" multiple accept=".xls,.xlsx,.xlsb,.txt" style={{ display: 'none' }} ref={fileInputRef} onChange={event => { if (event.target.files?.length) addFiles(Array.from(event.target.files)); event.target.value = ''; }} />
      <div
        className={`panel-dropzone${isDragging ? ' is-dragging' : ''}`}
        onDragOver={event => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={event => { event.preventDefault(); setIsDragging(false); }}
        onDrop={event => { event.preventDefault(); setIsDragging(false); if (event.dataTransfer.files?.length) addFiles(Array.from(event.dataTransfer.files)); }}
        onClick={() => fileInputRef.current?.click()}
        style={{ marginTop: '16px', minHeight: '96px', cursor: 'pointer', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '18px' }}
      >
        <div>
          <div className="panel-dropzone-icon" style={{ margin: '0 auto 7px' }}>⬆</div>
          <strong style={{ color: 'white' }}>Arraste arquivos aqui ou clique para selecionar vários</strong>
          <div style={{ color: 'var(--panel-muted)', fontSize: '.72rem', marginTop: '5px' }}>As listas abaixo mostram claramente quando cada arquivo deve ser atualizado.</div>
        </div>
      </div>

      {selectedFiles.length > 0 && <div style={{ marginTop: '16px' }}>
        <div className="panel-eyebrow" style={{ marginBottom: '8px' }}>NA FILA · {selectedFiles.length}</div>
        <div style={{ display: 'grid', gap: '7px' }}>
          {selectedFiles.map(file => {
            const source = sourceForFile(file.name);
            return <div key={file.name} style={{ padding: '9px 12px', border: '1px solid rgba(239,51,64,.2)', borderRadius: '10px', background: 'rgba(239,51,64,.035)', display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--panel-red)', fontSize: '.68rem', fontWeight: 800 }}>{source?.label || 'Arquivo não identificado'}</div>
                <div style={{ color: 'white', fontSize: '.76rem', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name} <span style={{ color: 'var(--panel-muted)' }}>· {fmtSize(file.size)}</span></div>
              </div>
              <button className="panel-icon-button" onClick={() => removeFile(file.name)}>✕</button>
            </div>;
          })}
        </div>
      </div>}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
        <button className="panel-primary-button" style={{ maxWidth: '420px' }} onClick={handleProcess} disabled={!selectedFiles.length || isProcessing}>{isProcessing ? 'Processando e conciliando...' : 'Processar arquivos selecionados'}</button>
        {success && <span className="panel-success">Base atualizada com sucesso.</span>}
        {errorMessage && <span style={{ color: '#fca5a5' }}>{errorMessage}</span>}
      </div>
    </PanelCard>

    {GROUPS.map(group => <PanelCard key={group.key}>
      <PanelSectionHeader eyebrow={group.key.toUpperCase()} title={group.title} description={group.description} action={<span className="panel-badge">{SOURCES.filter(source => source.group === group.key).length} arquivos</span>} />
      <div style={{ display: 'grid', gap: '8px', marginTop: '15px' }}>
        {SOURCES.filter(source => source.group === group.key).map(source => <SourceCard
          key={source.id}
          source={source}
          audit={source.kind ? audits.get(source.kind) : undefined}
          operationalState={operationalState}
          queued={queued.get(source.id)}
          onAddFile={file => addFiles([file])}
        />)}
      </div>
    </PanelCard>)}

    {canonical ? <ReconciliationAuditPanel checks={canonical.reconciliation?.checks || []} /> : null}

    {canonical?.warnings.length ? <PanelCard>
      <PanelSectionHeader eyebrow="VALIDAÇÃO" title="Pendências conhecidas" description="Somente situações que ainda precisam de dado ou conciliação." />
      <div style={{ display: 'grid', gap: '8px', marginTop: '14px' }}>
        {canonical.warnings.map((warning, index) => <div key={`${warning}-${index}`} style={{ color: '#fcd34d', fontSize: '.82rem', padding: '10px 12px', border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.06)', borderRadius: '10px' }}>{warning}</div>)}
      </div>
    </PanelCard> : null}
  </PanelPage>;
}

function SourceCard({ source, audit, operationalState, queued, onAddFile }: { source: SourceUi; audit?: SourceAudit; operationalState: OperationalSourceState; queued?: File; onAddFile: (file: File) => void }) {
  const supplementalName = supplementalFileName(source, operationalState);
  const loaded = source.supplementalKind ? Boolean(supplementalName) : Boolean(audit?.loaded);
  const status = queued ? 'NA FILA' : loaded ? 'ATUALIZADO' : 'NÃO CARREGADO';
  const fileName = queued?.name || supplementalName || audit?.fileName || '—';
  const lastUpdate = source.supplementalKind ? (loaded ? 'Base carregada' : 'Nunca carregado') : fmtDateTime(audit?.updatedAt);

  return <div style={{ padding: '12px 14px', border: `1px solid ${queued ? 'rgba(239,51,64,.3)' : loaded ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.065)'}`, borderRadius: '12px', background: queued ? 'rgba(239,51,64,.035)' : 'rgba(255,255,255,.014)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '14px', alignItems: 'center' }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <strong style={{ color: loaded || queued ? 'white' : 'var(--panel-text-dim)', fontSize: '.82rem' }}>{source.label}</strong>
        <span className="panel-badge" style={{ color: queued ? 'var(--panel-red)' : loaded ? '#86efac' : 'var(--panel-muted)' }}>{status}</span>
        {source.required && <span className="panel-badge">PRINCIPAL</span>}
      </div>
      <div style={{ color: 'var(--panel-muted)', fontSize: '.69rem', lineHeight: 1.4, marginTop: '4px' }}>{source.description}</div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px', fontSize: '.64rem' }}>
        <span style={{ color: 'var(--panel-muted)' }}><strong style={{ color: 'var(--panel-text-dim)' }}>Atualizar:</strong> {source.frequency}</span>
        <span style={{ color: 'var(--panel-muted)' }}><strong style={{ color: 'var(--panel-text-dim)' }}>Última carga:</strong> {lastUpdate}</span>
        <span title={fileName} style={{ color: 'var(--panel-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '360px' }}><strong style={{ color: 'var(--panel-text-dim)' }}>Arquivo:</strong> {fileName}</span>
      </div>
    </div>
    <label className="panel-chip" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
      Selecionar arquivo
      <input type="file" accept=".xls,.xlsx,.xlsb,.txt" style={{ display: 'none' }} onChange={event => { const file = event.target.files?.[0]; if (file) onAddFile(file); event.target.value = ''; }} />
    </label>
  </div>;
}
