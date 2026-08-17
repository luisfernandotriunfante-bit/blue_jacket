import React, { useRef, useState } from 'react';
import { useData } from '../store/DataContext';
import { processExcelFiles, processSellOutFile } from '../services/excelParser';
import { PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const FILE_TYPES: { key: string; label: string; color: string }[] = [
  { key: 'posicao', label: 'Posição de Estoque', color: '#3b82f6' },
  { key: 'cadastro', label: 'Cadastro de Itens', color: '#8b5cf6' },
  { key: 'carteira', label: 'Carteira de Pedidos', color: '#f59e0b' },
  { key: 'lista', label: 'Lista de Preços', color: '#10b981' },
  { key: 'lançamento', label: 'Lançamentos', color: '#ec4899' },
  { key: 'vendas', label: 'Relatório de Vendas (8022)', color: '#ef4444' },
];

function getFileType(name: string): { label: string; color: string } {
  const lower = name.toLowerCase();
  if (lower.includes('posicao') || lower.includes('posição')) return { label: 'Posição de Estoque', color: '#3b82f6' };
  if (lower.includes('cadastro')) return { label: 'Cadastro de Itens', color: '#8b5cf6' };
  if (lower.includes('carteira')) return { label: 'Carteira de Pedidos', color: '#f59e0b' };
  if (lower.includes('lista')) return { label: 'Lista de Preços', color: '#10b981' };
  if ((lower.includes('lan') && lower.includes('amento')) || lower.includes('lançamento')) return { label: 'Lançamentos', color: '#ec4899' };
  if (lower.includes('vendas') || lower.includes('8022')) return { label: 'Relatório de Vendas', color: '#ef4444' };
  return { label: 'Não Identificado', color: '#6b7280' };
}

export function ConfiguracoesPage() {
  const { setProdutos, setMetricas, setSellOut } = useData();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFiles(Array.from(e.target.files));
  };

  const addFiles = (newFiles: File[]) => {
    setSuccess(false);
    setSelectedFiles(prev => {
      const prevFiltered = prev.filter(p => !newFiles.some(n => n.name === p.name));
      return [...prevFiltered, ...newFiles];
    });
  };

  const removeFile = (fileName: string) => {
    setSelectedFiles(prev => prev.filter(f => f.name !== fileName));
  };

  const handleProcess = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);
    setSuccess(false);

    try {
      const vendasFiles = selectedFiles.filter(f => {
        const lower = f.name.toLowerCase();
        return lower.includes('vendas') || lower.includes('8022');
      });
      const estoqueFiles = selectedFiles.filter(f => {
        const lower = f.name.toLowerCase();
        return !lower.includes('vendas') && !lower.includes('8022');
      });

      if (estoqueFiles.length > 0) {
        const { produtos, metricas } = await processExcelFiles(estoqueFiles);
        setProdutos(produtos);
        setMetricas(metricas);
      }

      if (vendasFiles.length > 0) {
        const sellOutData = await processSellOutFile(vendasFiles[0]);
        setSellOut(sellOutData);
      }

      setSuccess(true);
    } catch (error) {
      console.error('Erro ao processar planilhas:', error);
      alert('Houve um erro ao ler os arquivos. Verifique o console.');
    } finally {
      setIsProcessing(false);
    }
  };

  const estoqueFiles = selectedFiles.filter(f => !f.name.toLowerCase().includes('vendas') && !f.name.toLowerCase().includes('8022'));
  const vendasFiles = selectedFiles.filter(f => f.name.toLowerCase().includes('vendas') || f.name.toLowerCase().includes('8022'));

  return (
    <PanelPage
      title="Configurações"
      metricLabel="Arquivos na fila"
      metricValue={selectedFiles.length.toLocaleString('pt-BR')}
    >
      <div className="panel-grid panel-grid-2">
        <PanelCard className={`panel-dropzone${isDragging ? ' is-dragging' : ''}`}>
          <input
            type="file"
            multiple
            accept=".xls,.xlsx"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{ width: '100%', minHeight: '190px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          >
            <div className="panel-dropzone-icon">⬆</div>
            <h2>Arraste os arquivos Excel aqui</h2>
            <p>Ou clique para selecionar os relatórios que deseja processar.</p>
            <div className="panel-badges" style={{ justifyContent: 'center', marginTop: '18px' }}>
              {FILE_TYPES.map(ft => (
                <span
                  key={ft.key}
                  className="panel-badge"
                  style={{ color: ft.color, borderColor: `${ft.color}44`, background: `${ft.color}12` }}
                >
                  {ft.label}
                </span>
              ))}
            </div>
          </div>
        </PanelCard>

        <PanelCard style={undefined as never}>
          <PanelSectionHeader
            eyebrow="IMPORTAÇÃO"
            title={`Arquivos na Fila (${selectedFiles.length})`}
            description="Os arquivos permanecem separados por módulo até o processamento."
          />

          <div className="panel-stack" style={{ gap: '18px' }}>
            {estoqueFiles.length > 0 && (
              <div>
                <div className="panel-eyebrow" style={{ color: '#60a5fa', marginBottom: '9px' }}>
                  ESTOQUE · {estoqueFiles.length}
                </div>
                <div className="panel-file-list">
                  {estoqueFiles.map(f => {
                    const { label, color } = getFileType(f.name);
                    return <FileRow key={f.name} file={f} label={label} color={color} onRemove={removeFile} />;
                  })}
                </div>
              </div>
            )}

            {vendasFiles.length > 0 && (
              <div>
                <div className="panel-eyebrow" style={{ marginBottom: '9px' }}>
                  SELL OUT · {vendasFiles.length}
                </div>
                <div className="panel-file-list">
                  {vendasFiles.map(f => {
                    const { label, color } = getFileType(f.name);
                    return <FileRow key={f.name} file={f} label={label} color={color} onRemove={removeFile} />;
                  })}
                </div>
              </div>
            )}

            {selectedFiles.length === 0 && (
              <div style={{ color: 'var(--panel-muted)', fontStyle: 'italic', minHeight: '82px', display: 'flex', alignItems: 'center' }}>
                Nenhum arquivo adicionado.
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="panel-primary-button"
                onClick={handleProcess}
                disabled={selectedFiles.length === 0 || isProcessing}
              >
                {isProcessing ? 'Processando dados...' : 'Processar dados e atualizar painéis'}
              </button>
              {success && <div className="panel-success">Painéis atualizados com sucesso.</div>}
            </div>
          </div>
        </PanelCard>
      </div>
    </PanelPage>
  );
}

function FileRow({ file, label, color, onRemove }: { file: File; label: string; color: string; onRemove: (name: string) => void }) {
  return (
    <div className="panel-file-row" style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ minWidth: 0 }}>
        <div className="panel-file-title" style={{ color }}>{label}</div>
        <div className="panel-file-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
        <div className="panel-file-date">Atualizado: {new Date(file.lastModified).toLocaleDateString('pt-BR')}</div>
      </div>
      <button
        className="panel-icon-button"
        onClick={(e) => { e.stopPropagation(); onRemove(file.name); }}
        title="Remover"
        aria-label={`Remover ${file.name}`}
      >
        ✕
      </button>
    </div>
  );
}
