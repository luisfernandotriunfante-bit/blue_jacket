import { useState } from 'react';
import { useData } from '../store/DataContext';
import { downloadSellOutDocument, downloadTopNetworksDocument } from '../services/documentGenerator';
import { PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const fmtBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function DocumentosPage() {
  const { canonical } = useData();
  const [generating, setGenerating] = useState<'painel'|'redes'|null>(null);
  const [error, setError] = useState('');

  if (!canonical) {
    return (
      <PanelPage title="Documentos">
        <PanelEmptyState
          icon="▤"
          title="Base ainda não processada"
          description="Carregue os relatórios em Configurações. Os dois documentos serão gerados pela mesma base usada no painel."
        />
      </PanelPage>
    );
  }

  const sourceCount = canonical.sources.filter(source => source.loaded).length;
  const networkCount = canonical.networks.filter(network => network.networkTarget > 0 || network.topTarget > 0 || network.total > 0).length;
  const generate = async (kind:'painel'|'redes') => {
    setGenerating(kind); setError('');
    try {
      if (kind === 'painel') await downloadSellOutDocument(canonical);
      else await downloadTopNetworksDocument(canonical);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Não foi possível gerar o arquivo.');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <PanelPage
      title="Documentos"
      metricLabel="Referência"
      metricValue={new Date(`${canonical.referenceDate}T12:00:00`).toLocaleDateString('pt-BR')}
    >
      <div className="panel-grid panel-grid-2">
        <PanelCard>
          <PanelSectionHeader
            eyebrow="ENTREGA DIÁRIA"
            title="Painel Sell Out MILENIO"
            description="Consolida Sell Out, metas, positivação, movimento diário, linhas, equipe e estoque usando a base canônica atual."
          />
          <div style={{ display: 'grid', gap: '8px', margin: '20px 0' }}>
            <Info label="Sell Out total" value={fmtBRL(canonical.sellOut.total)} />
            <Info label="Meta T&C" value={fmtBRL(canonical.sellOut.sellOutTarget)} />
            <Info label="Meta indústria" value={fmtBRL(canonical.industryTarget)} />
            <Info label="Carteira / estoque em trânsito" value={fmtBRL(canonical.stock.pendingPurchaseCost)} />
          </div>
          <button className="panel-primary-button" disabled={generating!==null} onClick={() => void generate('painel')}>
            {generating==='painel'?'Gerando modelo padrão...':'Gerar Painel Sell Out'}
          </button>
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader
            eyebrow="ENTREGA DIÁRIA"
            title="TOP REDES"
            description="Preenche o modelo oficial com Top Redes, Loja a Loja, Equipe e abas auxiliares usando a mesma base do painel."
          />
          <div style={{ display: 'grid', gap: '8px', margin: '20px 0' }}>
            <Info label="Redes apuradas" value={networkCount.toLocaleString('pt-BR')} />
            <Info label="Meta Tops" value={fmtBRL(canonical.networks.reduce((sum, network) => sum + network.topTarget, 0))} />
            <Info label="Realizado + A faturar" value={fmtBRL(canonical.networks.reduce((sum, network) => sum + network.total, 0))} />
            <Info label="Arquivos válidos na base" value={sourceCount.toLocaleString('pt-BR')} />
          </div>
          <button className="panel-primary-button" disabled={generating!==null} onClick={() => void generate('redes')}>
            {generating==='redes'?'Gerando modelo padrão...':'Gerar TOP REDES'}
          </button>
        </PanelCard>
      </div>

      {error ? <div style={{color:'#fca5a5',padding:'12px 14px',border:'1px solid rgba(248,113,113,.22)',borderRadius:'10px',background:'rgba(248,113,113,.06)'}}>{error}</div> : null}

      {canonical.warnings.length > 0 ? (
        <PanelCard>
          <PanelSectionHeader
            eyebrow="CONFERÊNCIA"
            title="Pendências antes do fechamento"
            description="Os arquivos podem ser gerados, mas estes pontos continuam sinalizados pelo motor para não mascarar divergências."
          />
          <div style={{ display: 'grid', gap: '8px', marginTop: '14px' }}>
            {canonical.warnings.map((warning, index) => (
              <div key={`${warning}-${index}`} style={{ color: '#fcd34d', padding: '10px 12px', border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.06)', borderRadius: '10px', fontSize: '0.82rem' }}>
                {warning}
              </div>
            ))}
          </div>
        </PanelCard>
      ) : null}
    </PanelPage>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <span style={{ color: 'var(--panel-muted)', fontSize: '0.8rem' }}>{label}</span>
      <strong style={{ color: 'white', fontSize: '0.84rem', textAlign: 'right' }}>{value}</strong>
    </div>
  );
}
