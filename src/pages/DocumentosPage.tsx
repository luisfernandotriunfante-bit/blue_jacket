import { useState } from 'react';
import { useData } from '../store/DataContext';
import { downloadSellOutDocument, downloadTopNetworksDocument } from '../services/documentGenerator';
import { downloadCanonicalStockWorkbook, summarizeCanonicalStockWorkbook } from '../services/stockWorkbook';
import { PanelAlert, PanelCard, PanelEmptyState, PanelInfoRow, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const fmtBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInt = (value: number) => Math.round(value || 0).toLocaleString('pt-BR');

export function DocumentosPage() {
  const { canonical } = useData();
  const [generating, setGenerating] = useState<'painel' | 'redes' | 'estoque' | null>(null);
  const [error, setError] = useState('');

  if (!canonical) {
    return (
      <PanelPage title="Documentos">
        <PanelEmptyState
          variant="page"
          title="Base ainda não processada"
          description="Carregue as fontes em Configurações. Os documentos serão gerados pela mesma base canônica usada no sistema."
        />
      </PanelPage>
    );
  }

  const sourceCount = canonical.sources.filter(source => source.loaded).length;
  const officialNetworks = canonical.networks.filter(network => network.key !== 'SEM REDE');
  const networkCount = officialNetworks.filter(network => network.networkTarget > 0 || network.topTarget > 0 || network.total > 0).length;
  const stockSummary = summarizeCanonicalStockWorkbook(canonical);

  const generate = async (kind: 'painel' | 'redes' | 'estoque') => {
    setGenerating(kind);
    setError('');
    try {
      if (kind === 'painel') await downloadSellOutDocument(canonical);
      else if (kind === 'redes') await downloadTopNetworksDocument(canonical);
      else downloadCanonicalStockWorkbook(canonical);
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
      <div className="panel-stack">
        <div className="panel-grid panel-grid-3">
          <PanelCard>
            <PanelSectionHeader
              eyebrow="ENTREGA DIÁRIA"
              title="Painel Sell Out MILENIO"
              description="Consolida Sell Out, metas, positivação, movimento diário, linhas, equipe e estoque usando a base canônica atual."
            />
            <div>
              <PanelInfoRow label="Sell Out total" value={fmtBRL(canonical.sellOut.total)} />
              <PanelInfoRow label="Meta T&C" value={fmtBRL(canonical.sellOut.sellOutTarget)} />
              <PanelInfoRow label="Meta indústria" value={fmtBRL(canonical.industryTarget)} />
              <PanelInfoRow label="Carteira / estoque em trânsito" value={fmtBRL(canonical.stock.pendingPurchaseCost)} />
            </div>
            <button className="panel-primary-button" disabled={generating !== null} onClick={() => void generate('painel')} style={{ marginTop: 20 }}>
              {generating === 'painel' ? 'Gerando documento...' : 'Gerar Painel Sell Out'}
            </button>
          </PanelCard>

          <PanelCard>
            <PanelSectionHeader
              eyebrow="REDES"
              title="Relatório de Redes"
              description="Gera a visão de redes a partir das metas configuradas, Roteiro Ativo e Sell Out canônico, sem reler arquivos de origem."
            />
            <div>
              <PanelInfoRow label="Redes apuradas" value={networkCount.toLocaleString('pt-BR')} />
              <PanelInfoRow label="Meta Tops" value={fmtBRL(officialNetworks.reduce((sum, network) => sum + network.topTarget, 0))} />
              <PanelInfoRow label="Realizado + A faturar" value={fmtBRL(officialNetworks.reduce((sum, network) => sum + network.total, 0))} />
              <PanelInfoRow label="Fontes válidas na base" value={sourceCount.toLocaleString('pt-BR')} />
            </div>
            <button className="panel-primary-button" disabled={generating !== null} onClick={() => void generate('redes')} style={{ marginTop: 20 }}>
              {generating === 'redes' ? 'Gerando documento...' : 'Gerar Relatório de Redes'}
            </button>
          </PanelCard>

          <PanelCard>
            <PanelSectionHeader
              eyebrow="ESTOQUE"
              title="Relatório de Estoque"
              description="Exporta a mesma posição canônica exibida no módulo Estoque, incluindo físico, Carteira, projetado, custo, PVENDA1 e lançamentos."
            />
            <div>
              <PanelInfoRow label="SKUs na posição" value={fmtInt(stockSummary.skuCount)} />
              <PanelInfoRow label="Lançamentos" value={fmtInt(stockSummary.launchCount)} />
              <PanelInfoRow label="Físico" value={`${fmtInt(stockSummary.physicalUnits)} un.`} />
              <PanelInfoRow label="Projetado" value={`${fmtInt(stockSummary.projectedUnits)} un.`} />
              <PanelInfoRow label="Potencial projetado" value={fmtBRL(stockSummary.projectedSaleValue)} />
            </div>
            <button className="panel-primary-button" disabled={generating !== null} onClick={() => void generate('estoque')} style={{ marginTop: 20 }}>
              {generating === 'estoque' ? 'Gerando relatório...' : 'Gerar Relatório de Estoque'}
            </button>
          </PanelCard>
        </div>

        {error ? <PanelAlert tone="error">{error}</PanelAlert> : null}

        {canonical.warnings.length > 0 ? (
          <PanelCard>
            <PanelSectionHeader
              eyebrow="CONFERÊNCIA"
              title="Pendências antes do fechamento"
              description="Os arquivos podem ser gerados, mas estes pontos continuam sinalizados pelos motores para não mascarar divergências."
            />
            <div className="panel-stack" style={{ gap: 8 }}>
              {canonical.warnings.map((warning, index) => <PanelAlert tone="warning" key={`${warning}-${index}`}>{warning}</PanelAlert>)}
            </div>
          </PanelCard>
        ) : null}
      </div>
    </PanelPage>
  );
}
