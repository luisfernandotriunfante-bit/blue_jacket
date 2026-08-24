import { useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { buildCustomerIntelligence, listCustomerOptions } from '../domain/customerIntelligence';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../domain/customerIntelligenceTypes';
import { downloadSellOutDocument } from '../services/documentGenerator';
import { downloadCanonicalNetworkWorkbook } from '../services/networkWorkbook';
import { downloadCanonicalStockWorkbook, summarizeCanonicalStockWorkbook } from '../services/stockWorkbook';
import { downloadCustomerCommercialFile, downloadCustomerInternalDossier } from '../services/customerIntelligenceExport';
import { customerIntelligenceFromUnified } from '../services/motors/customerIntelligenceUnifiedAdapter';
import { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';
import { PanelAlert, PanelCard, PanelEmptyState, PanelInfoRow, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const fmtBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInt = (value: number) => Math.round(value || 0).toLocaleString('pt-BR');
const fmtDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
type GenerationKind = 'painel' | 'redes' | 'estoque' | 'cliente-comercial' | 'cliente-dossie';

export function DocumentosPage() {
  const { canonical } = useData();
  const [generating, setGenerating] = useState<GenerationKind | null>(null);
  const [error, setError] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerCnpj, setSelectedCustomerCnpj] = useState('');

  const unifiedCanonical = canonical && isUnifiedCanonicalState(canonical) ? canonical : null;
  const customerSupport = useMemo(() => unifiedCanonical ? customerIntelligenceFromUnified(unifiedCanonical) : EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT, [unifiedCanonical]);
  const customerOptions = useMemo(() => unifiedCanonical ? listCustomerOptions(unifiedCanonical, customerSupport) : [], [unifiedCanonical, customerSupport]);
  const filteredCustomerOptions = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return customerOptions.slice(0, 100);
    return customerOptions.filter(item => [item.cnpj, item.name, item.network, item.city, item.tier].some(value => String(value || '').toLowerCase().includes(query))).slice(0, 100);
  }, [customerOptions, customerSearch]);
  const customerResult = useMemo(() => unifiedCanonical && selectedCustomerCnpj
    ? buildCustomerIntelligence(unifiedCanonical, customerSupport, selectedCustomerCnpj, unifiedCanonical.referenceDate)
    : null, [unifiedCanonical, customerSupport, selectedCustomerCnpj]);

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

  const generate = async (kind: GenerationKind) => {
    setGenerating(kind);
    setError('');
    try {
      if (kind === 'painel') await downloadSellOutDocument(canonical);
      else if (kind === 'redes') downloadCanonicalNetworkWorkbook(canonical);
      else if (kind === 'estoque') downloadCanonicalStockWorkbook(canonical);
      else {
        if (!customerResult) throw new Error('Selecione um CNPJ válido antes de gerar o documento do cliente.');
        if (kind === 'cliente-comercial') downloadCustomerCommercialFile(customerResult);
        else downloadCustomerInternalDossier(customerResult);
      }
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
      metricValue={fmtDate(canonical.referenceDate)}
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

        <PanelCard>
          <PanelSectionHeader
            eyebrow="CLIENTES & SORTIMENTO"
            title="Documentos por CNPJ"
            description="Arquivo Comercial e Dossiê Interno usam a mesma fotografia canônica da tela Clientes & Sortimento. A referência não é editável porque estoque, Carteira, preço e classificação operacional não são snapshots históricos completos."
            action={unifiedCanonical ? <div style={{ display: 'grid', gap: 4 }}><span className="panel-mini-label">Referência operacional</span><strong>{fmtDate(unifiedCanonical.referenceDate)}</strong></div> : undefined}
          />
          {!unifiedCanonical ? <PanelAlert tone="warning">A fotografia atual ainda não está no contrato UnifiedDataLayer necessário para os documentos por CNPJ.</PanelAlert> : <>
            <div className="panel-grid panel-grid-2" style={{ marginTop: 14 }}>
              <input className="panel-input panel-input-full" placeholder="Buscar CNPJ, cliente, rede, cidade ou faixa" value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} />
              <select className="panel-select panel-input-full" value={selectedCustomerCnpj} onChange={event => setSelectedCustomerCnpj(event.target.value)}>
                <option value="">Selecione um CNPJ</option>
                {filteredCustomerOptions.map(item => <option key={item.cnpj} value={item.cnpj}>{item.cnpj} · {item.name || 'Cliente sem nome'} · {item.network || 'Sem rede'} · {item.tier || 'Sem faixa'}</option>)}
              </select>
            </div>
            {customerResult ? <div className="panel-grid panel-grid-2" style={{ marginTop: 18 }}>
              <PanelCard compact>
                <PanelSectionHeader eyebrow="ARQUIVO COMERCIAL" title={customerResult.customer.name || customerResult.customer.cnpj} description="Sortimento, adoção, oportunidades, lançamentos, comprado fora, pendências, promoções e preços." />
                <div>
                  <PanelInfoRow label="CNPJ" value={customerResult.customer.cnpj} />
                  <PanelInfoRow label="Assortment" value={`${(customerResult.assortmentPercent * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} />
                  <PanelInfoRow label="Não comprados" value={fmtInt(customerResult.recommendedMissing)} />
                  <PanelInfoRow label="Lançamentos faltantes" value={fmtInt(customerResult.launches.missing)} />
                </div>
                <button className="panel-primary-button" disabled={generating !== null} onClick={() => void generate('cliente-comercial')} style={{ marginTop: 16 }}>
                  {generating === 'cliente-comercial' ? 'Gerando arquivo...' : 'Gerar Arquivo Comercial'}
                </button>
              </PanelCard>
              <PanelCard compact>
                <PanelSectionHeader eyebrow="USO INTERNO" title="Dossiê Interno" description="Inclui a mesma ficha comercial, fontes 379/8022 separadas, estoque, auditoria e limitações." />
                <div>
                  <PanelInfoRow label="Sortimento oficial" value={fmtInt(customerResult.officialAssortment)} />
                  <PanelInfoRow label="Executável agora" value={fmtInt(customerResult.executableAssortment)} />
                  <PanelInfoRow label="Comprados fora" value={fmtInt(customerResult.boughtOutside)} />
                  <PanelInfoRow label="Pendências" value={fmtInt(customerResult.boughtUnresolved)} />
                </div>
                <button className="panel-primary-button" disabled={generating !== null} onClick={() => void generate('cliente-dossie')} style={{ marginTop: 16 }}>
                  {generating === 'cliente-dossie' ? 'Gerando dossiê...' : 'Gerar Dossiê Interno'}
                </button>
              </PanelCard>
            </div> : <PanelEmptyState variant="section" title="Selecione um CNPJ" description="Os documentos do cliente serão materializados a partir da mesma ficha canônica usada no módulo Clientes & Sortimento." />}
          </>}
        </PanelCard>

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
