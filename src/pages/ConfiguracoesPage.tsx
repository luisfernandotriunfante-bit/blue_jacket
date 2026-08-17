import React, { useState, useRef } from 'react';
import { useData } from '../store/DataContext';
import { processExcelFiles, processSellOutFile } from '../services/excelParser';

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
      console.error("Erro ao processar planilhas:", error);
      alert("Houve um erro ao ler os arquivos. Verifique o console.");
    } finally {
      setIsProcessing(false);
    }
  };

  const estoqueFiles = selectedFiles.filter(f => !f.name.toLowerCase().includes('vendas') && !f.name.toLowerCase().includes('8022'));
  const vendasFiles = selectedFiles.filter(f => f.name.toLowerCase().includes('vendas') || f.name.toLowerCase().includes('8022'));

  return (
    <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'white', margin: 0 }}>Configurações</h1>
        <p style={{ color: 'var(--bj-muted)', fontSize: '1.1rem', marginTop: '8px' }}>
          Upload dos relatórios diários. Adicione os arquivos e clique em processar.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div
          className="bj-glass-card"
          style={{
            border: isDragging ? '2px dashed #3b82f6' : '1px solid rgba(255,255,255,0.1)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: '200px', cursor: 'pointer', transition: 'all 0.2s ease',
            backgroundColor: isDragging ? 'rgba(59,130,246,0.1)' : 'rgba(15,23,42,0.25)'
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input type="file" multiple accept=".xls,.xlsx" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileChange} />
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📂</div>
          <h2 style={{ color: 'white', marginBottom: '8px', textAlign: 'center' }}>Arraste os arquivos Excel aqui</h2>
          <p style={{ color: 'var(--bj-muted)', textAlign: 'center' }}>
            Ou clique para selecionar.
          </p>
          <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
            {FILE_TYPES.map(ft => (
              <span key={ft.key} style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '12px', background: `${ft.color}22`, color: ft.color, border: `1px solid ${ft.color}44` }}>
                {ft.label}
              </span>
            ))}
          </div>
        </div>

        <div className="bj-glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ color: 'white', fontSize: '1.2rem', marginBottom: '16px' }}>
            Arquivos na Fila ({selectedFiles.length})
          </h2>

          {estoqueFiles.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                📦 Módulo de Estoque ({estoqueFiles.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {estoqueFiles.map(f => {
                  const { label, color } = getFileType(f.name);
                  return (
                    <FileRow key={f.name} file={f} label={label} color={color} onRemove={removeFile} />
                  );
                })}
              </div>
            </div>
          )}

          {vendasFiles.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                📊 Módulo Sell-Out / Vendas ({vendasFiles.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {vendasFiles.map(f => {
                  const { label, color } = getFileType(f.name);
                  return (
                    <FileRow key={f.name} file={f} label={label} color={color} onRemove={removeFile} />
                  );
                })}
              </div>
            </div>
          )}

          {selectedFiles.length === 0 && (
            <div style={{ color: 'var(--bj-muted)', fontStyle: 'italic', flex: 1, display: 'flex', alignItems: 'center' }}>
              Nenhum arquivo adicionado.
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={handleProcess}
              disabled={selectedFiles.length === 0 || isProcessing}
              style={{
                background: selectedFiles.length > 0
                  ? 'linear-gradient(135deg, #3b82f6, #6366f1)'
                  : 'rgba(255,255,255,0.1)',
                color: 'white', border: 'none', padding: '14px 24px', borderRadius: '10px',
                fontWeight: 'bold', fontSize: '1rem', cursor: selectedFiles.length > 0 ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease', boxShadow: selectedFiles.length > 0 ? '0 4px 20px rgba(99,102,241,0.4)' : 'none'
              }}
            >
              {isProcessing ? '⚙️ Processando...' : '🚀 Processar Dados e Gerar Painéis'}
            </button>
            {success && (
              <div style={{ color: '#10b981', textAlign: 'center', fontWeight: 'bold', padding: '10px', background: 'rgba(16,185,129,0.1)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.3)' }}>
                ✓ Painéis atualizados com sucesso!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FileRow({ file, label, color, onRemove }: { file: File; label: string; color: string; onRemove: (name: string) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: `1px solid ${color}33` }}>
      <div>
        <div style={{ color, fontWeight: 'bold', fontSize: '0.85rem' }}>{label}</div>
        <div style={{ color: 'var(--bj-muted)', fontSize: '0.75rem', marginTop: '2px' }}>{file.name}</div>
        <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '2px' }}>
          Atualizado: {new Date(file.lastModified).toLocaleDateString('pt-BR')}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(file.name); }}
        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '8px', fontSize: '1rem' }}
        title="Remover"
      >✕</button>
    </div>
  );
}
