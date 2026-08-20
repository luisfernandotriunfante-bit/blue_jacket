import { useState } from 'react';
import { useData } from '../store/DataContext';
import { downloadSellOutDocument, downloadTopNetworksDocument } from '../services/documentGenerator';
import { buildSellOutStockPolicy, collectPortfolioLines, resolvePortfolioPositionDate, summarizePortfolioAge } from '../domain/portfolioPolicy';
import { PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const fmtBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNumber = (value: number, digits = 0) => value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

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
  const officialNetworks = canonical.networks.filter(network => network.key !== 'SEM REDE');
  const networkCount = officialNetworks.filter(network => network.networkTarget > 0 || network.topTarget > 0 || network.total > 0).length;
  const stockPolicy = buildSellOutStockPolicy(canonical.stock);
  const portfolioSource = canonical.sources.find(source => source.kind === 'purchasePortfolio' && source.loaded);
  const portfolioLines = collectPortfolioLines(canonical.inventory);
  const portfolioPositionDate = resolvePortfolioPositionDate(portfolioSource?.fileName, canonical.referenceDate);
  const portfolioAge = summarizePortfolioAge(portfolioLines, portfolioPositionDate);
  const ageBuckets = portfolioAge.buckets.filter(bucket => bucket.key !== 'SEM_DATA' || bucket.lines > 0);

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
            description="A leitura operacional usa somente o estoque atual. A Carteira em trânsito permanece visível como cenário projetado e não altera a base principal do gerador."
          />
          <div style={{ display: 'grid', gap: '8px', margin: '20px 0' }}>
            <Info label="Sell Out total" value={fmtBRL(canonical.sellOut.total)} />
            <Info label="Meta T&C" value={fmtBRL(canonical.sellOut.sellOutTarget)} />
            <Info label="Estoque base do gerador · venda" value={fmtBRL(stockPolicy.operational.saleValue)} />
            <Info label="Cobertura base · sem Carteira" value={`${fmtNumber(stockPolicy.operational.coverageSaleDays)} dias`} />
            <Info label="Carteira em trânsito · cenário" value={fmtBRL(stockPolicy.transitScenario.portfolioCostValue)} />
            <Info label="Cobertura projetada · com Carteira" value={`${fmtNumber(stockPolicy.transitScenario.projectedCoverageSaleDays)} dias`} />
          </div>
          <div style={{ color: '#93c5fd', fontSize: '0.72rem', lineHeight: 1.45, marginBottom: '16px', padding: '10px 12px', border: '1px solid rgba(59,130,246,.18)', borderRadius: '10px', background: 'rgba(59,130,246,.05)' }}>
            Carteira não é tratada como estoque disponível nem como entrada garantida do mês. Ela aparece apenas no cenário de estoque em trânsito/projeção.
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
            <Info label="Meta Tops" value={fmtBRL(officialNetworks.reduce((sum, network) => sum + network.topTarget, 0))} />
            <Info label="Realizado + A faturar" value={fmtBRL(officialNetworks.reduce((sum, network) => sum + network.total, 0))} />
            <Info label="Arquivos válidos na base" value={sourceCount.toLocaleString('pt-BR')} />
          </div>
          <button className="panel-primary-button" disabled={generating!==null} onClick={() => void generate('redes')}>
            {generating==='redes'?'Gerando modelo padrão...':'Gerar TOP REDES'}
          </button>
        </PanelCard>
      </div>

      {portfolioAge.totalLines > 0 ? (
        <PanelCard>
          <PanelSectionHeader
            eyebrow="CARTEIRA · CENÁRIO"
            title="Idade da Carteira em aberto"
            description={`Posição considerada em ${new Date(`${portfolioAge.asOfDate}T12:00:00`).toLocaleDateString('pt-BR')}. A idade usa Order Date e, se ele não existir na linha, Billing Date. Essa leitura é informativa e não altera a recomendação-base do Sell Out.`}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '10px', marginTop: '16px' }}>
            {ageBuckets.map(bucket => (
              <div key={bucket.key} style={{ padding: '13px 14px', border: '1px solid rgba(255,255,255,.08)', borderRadius: '12px', background: 'rgba(255,255,255,.02)' }}>
                <div style={{ color: 'var(--panel-muted)', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{bucket.label}</div>
                <div style={{ color: 'white', fontSize: '1.05rem', fontWeight: 800, marginTop: '6px' }}>{fmtBRL(bucket.costValue)}</div>
                <div style={{ color: 'var(--panel-muted)', fontSize: '0.68rem', marginTop: '4px' }}>{fmtNumber(bucket.cases, 2)} cx · {bucket.lines.toLocaleString('pt-BR')} linha(s)</div>
              </div>
            ))}
          </div>
          {portfolioAge.datedLines < portfolioAge.totalLines ? <div style={{ color: '#fcd34d', fontSize: '0.7rem', marginTop: '12px' }}>{portfolioAge.totalLines - portfolioAge.datedLines} linha(s) ainda não possuem data preservada. Recarregue a Carteira atual para preencher a idade linha a linha.</div> : null}
        </PanelCard>
      ) : null}

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
