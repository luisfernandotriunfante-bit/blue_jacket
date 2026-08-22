import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../store/DataContext';
import { buildCustomerIntelligence, listCustomerOptions } from '../domain/customerIntelligence';
import type { CustomerIntelligenceResult, CustomerIntelligenceSupport, ProductCommercialView } from '../domain/customerIntelligenceTypes';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT } from '../domain/customerIntelligenceTypes';
import { deleteCustomerIntelligenceSource, loadCustomerIntelligenceSupport, processCustomerIntelligenceFiles, saveCustomerIntelligenceSupport } from '../services/customerIntelligenceRepository';
import { downloadCustomerCommercialFile, downloadCustomerInternalDossier } from '../services/customerIntelligenceExport';
import { PanelCard, PanelEmptyState, PanelKpi, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

export type ClientesSortimentoView = 'overview' | 'assortment' | 'opportunities' | 'launches' | 'outside' | 'promotions' | 'pricing' | 'history' | 'export';

const fmtBRL = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const fmtInt = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value) || 0);
const fmtPct = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(Number(value) || 0);

function classificationLabel(value: ProductCommercialView['classification']) {
  if (value === 'MANDATORIO') return 'MANDATÓRIO';
  if (value === 'IMPORTANTE') return 'IMPORTANTE';
  if (value === 'RECOMENDADO') return 'RECOMENDADO';
  if (value === 'FORA_DO_SORTIMENTO') return 'FORA DO SORTIMENTO';
  return 'PENDÊNCIA';
}

function priorityLabel(value: ProductCommercialView['opportunityPriority']) {
  if (value === 'MAXIMA') return 'PRIORIDADE MÁXIMA';
  if (value === 'MUITO_ALTA') return 'MUITO ALTA';
  if (value === 'ALTA') return 'ALTA';
  if (value === 'MEDIA') return 'MÉDIA';
  if (value === 'MIGRACAO') return 'MIGRAÇÃO';
  if (value === 'DIAGNOSTICO') return 'DIAGNÓSTICO';
  if (value === 'BLOQUEIO_CADASTRO') return 'BLOQUEIO · CADASTRO';
  if (value === 'BLOQUEIO_DISPONIBILIDADE') return 'BLOQUEIO · ESTOQUE';
  return '—';
}

function badgeClass(value: string) {
  if (value.includes('MAXIMA') || value.includes('BLOQUEIO') || value.includes('FORA')) return 'panel-badge panel-badge-red';
  if (value.includes('MUITO') || value.includes('ALTA') || value.includes('PEND')) return 'panel-badge panel-badge-amber';
  if (value.includes('MANDATORIO') || value.includes('DISPONIVEL')) return 'panel-badge panel-badge-green';
  return 'panel-badge';
}

function portfolioLabel(product: ProductCommercialView) {
  if (product.portfolioUnits > 0) return `${fmtInt(product.portfolioUnits)} un.`;
  if (product.portfolioCases > 0) return `${fmtInt(product.portfolioCases)} cx`;
  return '0 un.';
}

function launchStatus(product: ProductCommercialView) {
  if (product.bought) return 'ADOTADO';
  if (!product.hasWinthor) return 'BLOQUEADO · CADASTRO';
  if (product.availability === 'DISPONIVEL') return 'DISPONÍVEL AGORA';
  if (product.availability === 'SOMENTE_CARTEIRA') return 'SOMENTE CARTEIRA';
  if (product.availability === 'DESCONTINUADO') return 'DESCONTINUADO';
  if (product.availability === 'MIGRACAO') return 'MIGRAÇÃO';
  return 'SEM ESTOQUE';
}

function ProductTable({ products, mode = 'default' }: { products: ProductCommercialView[]; mode?: 'default' | 'opportunity' | 'outside' | 'launch' }) {
  if (!products.length) return <PanelEmptyState icon="✓" title="Nenhum item nesta visão" description="Os motores não encontraram registros para os filtros desta aba." />;
  return <div className="panel-table-wrap"><table className="panel-table"><thead><tr>
    <th>Produto</th><th>Classificação</th><th>Comprou</th><th>Disponível</th><th>Carteira</th>{mode === 'opportunity' ? <><th>Prioridade</th><th>Ação</th></> : null}{mode === 'outside' ? <><th>Situação</th><th>Valor líquido</th></> : null}{mode === 'launch' ? <><th>Winthor</th><th>Status</th></> : null}<th>Preço-base</th>
  </tr></thead><tbody>{products.map((product, index) => <tr key={`${product.ean || product.winthorCode}-${index}`}>
    <td><strong>{product.description}</strong><div className="panel-muted" style={{ fontSize: '.66rem', marginTop: 3 }}>EAN {product.ean || '—'} · Winthor {product.winthorCode || '—'}{product.isLaunch ? ' · LANÇAMENTO' : ''}</div></td>
    <td><span className={badgeClass(product.classification)}>{classificationLabel(product.classification)}</span></td>
    <td>{product.bought ? 'SIM' : 'NÃO'}{product.bought ? <div className="panel-muted" style={{ fontSize: '.66rem' }}>{fmtBRL(product.netValue)}</div> : null}</td>
    <td>{fmtInt(product.availableUnits)} un.</td><td>{portfolioLabel(product)}{product.portfolioCases > 0 ? <div className="panel-muted" style={{ fontSize: '.64rem' }}>{fmtInt(product.portfolioCases)} cx · Un/CX {product.unitsPerCase > 0 ? fmtInt(product.unitsPerCase) : 'não identificado'} · {product.unitsPerCaseSource}</div> : null}</td>
    {mode === 'opportunity' ? <><td><span className={badgeClass(product.opportunityPriority)}>{priorityLabel(product.opportunityPriority)}</span><div className="panel-muted" style={{ fontSize: '.66rem', marginTop: 4 }}>{product.opportunityReason}</div></td><td>{product.recommendedAction || '—'}</td></> : null}
    {mode === 'outside' ? <><td>{product.lineageStatus || classificationLabel(product.classification)}{product.successorEan ? <div className="panel-muted" style={{ fontSize: '.66rem' }}>{product.predecessorEan || product.ean} → {product.successorEan}</div> : null}</td><td>{fmtBRL(product.netValue)}</td></> : null}
    {mode === 'launch' ? <><td>{product.hasWinthor ? product.winthorCode || 'SIM' : 'SEM WINTHOR'}</td><td>{launchStatus(product)}</td></> : null}
    <td>{product.basePrice === null ? '—' : fmtBRL(product.basePrice)}{product.priceStatus === 'COMPOSICAO_FINAL_PENDENTE' ? <div className="panel-muted" style={{ fontSize: '.64rem' }}>final pendente</div> : null}</td>
  </tr>)}</tbody></table></div>;
}

function SourceUploader({ support, onChange }: { support: CustomerIntelligenceSupport; onChange: (next: CustomerIntelligenceSupport) => void }) {
  const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const process = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true); setMessage('');
    try { const next = await processCustomerIntelligenceFiles(files, support); await saveCustomerIntelligenceSupport(next); onChange(next); setMessage('Fontes de Clientes & Sortimento atualizadas e persistidas.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao processar as fontes.'); }
    finally { setBusy(false); }
  };
  const remove = async (sourceKind: string, fileName: string) => {
    if (!window.confirm(`Excluir a base "${fileName}" de Clientes & Sortimento?`)) return;
    setBusy(true); setMessage('');
    try {
      const next = await deleteCustomerIntelligenceSource(support, sourceKind);
      onChange(next);
      setMessage(`Base ${fileName} excluída e removida da persistência.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao excluir a base.');
    } finally {
      setBusy(false);
    }
  };
  return <PanelCard>
    <PanelSectionHeader eyebrow="BASE DO MÓDULO" title="Fontes de inteligência por CNPJ" description="Carregue Sortimento Oficial Colgate e a análise com 310 total 2026. A planilha recomendado por CNPJ é aceita apenas como referência funcional, nunca como fonte oficial vigente." action={<button className="panel-secondary-button" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Processando...' : 'Adicionar arquivos'}</button>} />
    <input ref={input} type="file" accept=".xlsx,.xls,.xlsb" multiple style={{ display: 'none' }} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void process(files); }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10, marginTop: 14 }}>{support.sources.map(source => <div key={`${source.kind}:${source.fileName}`} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}><div style={{ color: 'white', fontWeight: 750, overflowWrap: 'anywhere' }}>{source.kind}</div><div className="panel-muted" style={{ fontSize: '.7rem', marginTop: 4, overflowWrap: 'anywhere' }}>{source.fileName}</div></div>
        <button className="panel-icon-button" title={`Excluir ${source.fileName}`} aria-label={`Excluir base ${source.fileName}`} onClick={() => void remove(source.kind, source.fileName)} disabled={busy} style={{ flex: '0 0 auto', color: '#fca5a5' }}>✕</button>
      </div>
      <div className="panel-muted" style={{ fontSize: '.66rem', marginTop: 6 }}>{source.note}</div>
    </div>)}</div>
    {message ? <div style={{ marginTop: 12, color: message.includes('Falha') ? '#fca5a5' : '#86efac', fontSize: '.78rem' }}>{message}</div> : null}
  </PanelCard>;
}

export function ClientesSortimentoPage({ view = 'overview' }: { view?: ClientesSortimentoView }) {
  const { canonical } = useData();
  const [support, setSupport] = useState<CustomerIntelligenceSupport>(EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT);
  const [supportLoaded, setSupportLoaded] = useState(false);
  const [selectedCnpj, setSelectedCnpj] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { void loadCustomerIntelligenceSupport().then(value => { setSupport(value); setSupportLoaded(true); }); }, []);
  useEffect(() => { if (canonical?.referenceDate && !referenceDate) setReferenceDate(canonical.referenceDate); }, [canonical?.referenceDate, referenceDate]);
  const customers = useMemo(() => canonical ? listCustomerOptions(canonical, support) : [], [canonical, support]);
  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase(); if (!query) return customers.slice(0, 100);
    return customers.filter(item => [item.cnpj, item.name, item.network, item.city, item.tier].some(value => String(value || '').toLowerCase().includes(query))).slice(0, 100);
  }, [customers, search]);
  const result = useMemo(() => canonical && selectedCnpj ? buildCustomerIntelligence(canonical, support, selectedCnpj, referenceDate || canonical.referenceDate) : null, [canonical, support, selectedCnpj, referenceDate]);

  if (!canonical) return <PanelPage title="Clientes & Sortimento"><PanelEmptyState icon="◆" title="Base operacional ainda não processada" description="Carregue primeiro as fontes operacionais em Configurações para que o módulo consuma clientes, vendas, produtos e o motor canônico de Estoque." /></PanelPage>;

  const selector = <PanelCard>
    <PanelSectionHeader eyebrow="CLIENTE" title="Inteligência Comercial por CNPJ" description="A competência é escolhida pela data no motor de domínio. O CNPJ permanece canônico em 14 dígitos e conflitos entre fontes aparecem na auditoria." action={<label style={{ display: 'grid', gap: 4 }}><span className="panel-mini-label">Data de análise</span><input className="panel-input" type="date" value={referenceDate || canonical.referenceDate} onChange={event => setReferenceDate(event.target.value)} /></label>} />
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) minmax(280px,2fr)', gap: 12, marginTop: 14 }}><input className="panel-input" placeholder="Buscar CNPJ, cliente, rede, cidade ou faixa" value={search} onChange={event => setSearch(event.target.value)} /><select className="panel-input" value={selectedCnpj} onChange={event => setSelectedCnpj(event.target.value)}><option value="">Selecione um CNPJ</option>{filteredCustomers.map(item => <option key={item.cnpj} value={item.cnpj}>{item.cnpj} · {item.name || 'Cliente sem nome'} · {item.network || 'Sem rede'} · {item.tier || 'Sem faixa'}</option>)}</select></div>
  </PanelCard>;

  if (!supportLoaded) return <PanelPage title="Clientes & Sortimento">{selector}<PanelEmptyState icon="…" title="Carregando a base do módulo" description="Lendo as fontes persistidas de sortimento e compras." /></PanelPage>;

  if (!result) return <PanelPage title="Clientes & Sortimento" metricLabel="Clientes conhecidos" metricValue={fmtInt(customers.length)}>{selector}<SourceUploader support={support} onChange={setSupport} /><PanelEmptyState icon="◎" title="Selecione um CNPJ" description="A ficha comercial será montada pelos motores de sortimento, compras, lançamentos, oportunidades, estoque, promoções e pricing." /></PanelPage>;

  const renderOverview = () => <div className="panel-stack">
    <PanelCard><PanelSectionHeader eyebrow={result.competenceLabel.toUpperCase()} title={result.customer.name || result.customer.cnpj} description={`${result.customer.cnpj} · ${result.customer.city || 'Cidade não informada'} · ${result.customer.network || 'Sem rede'}`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 16 }}>{[
        ['Ambiente', result.customer.environment || '—'], ['Perfil', result.customer.profile || '—'], ['Faixa', result.customer.tier || '—'], ['Canal', result.customer.assortmentChannel || '—'], ['Vendedor', result.customer.vendorCode || '—'], ['Coordenação', result.customer.coordinatorName || '—'],
      ].map(([label, value]) => <div key={label} style={{ padding: 12, border: '1px solid rgba(255,255,255,.07)', borderRadius: 12 }}><div className="panel-mini-label">{label}</div><strong style={{ color: 'white', display: 'block', marginTop: 5 }}>{value}</strong></div>)}</div>
    </PanelCard>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
      <PanelKpi label="Assortment" value={fmtPct(result.assortmentPercent)} detail={`${result.assortmentBought}/${result.officialAssortment} recomendados comprados`} />
      <PanelKpi label="Sortimento oficial" value={fmtInt(result.officialAssortment)} detail="Colgate · competência vigente" />
      <PanelKpi label="Executável agora" value={fmtInt(result.executableAssortment)} detail="Com Winthor e estoque disponível" />
      <PanelKpi label="Mandatórios" value={`${result.mandatoryBought}/${result.mandatoryRecommended}`} detail="comprados / recomendados" />
      <PanelKpi label="Importantes" value={`${result.importantBought}/${result.importantRecommended}`} detail="comprados / recomendados" />
      <PanelKpi label="Faltantes" value={fmtInt(result.recommendedMissing)} detail="recomendados nunca comprados" />
      <PanelKpi label="Lançamentos faltantes" value={fmtInt(result.launches.missing)} detail={`${result.launches.adopted}/${result.launches.totalRecommended} adotados`} />
      <PanelKpi label="Comprados fora" value={fmtInt(result.boughtOutside)} detail={`${result.boughtUnresolved} pendência(s) de correspondência`} />
      <PanelKpi label="Valor líquido YTD" value={fmtBRL(result.ytdNetValue)} detail="Compras - devoluções · 310" />
      <PanelKpi label="Oportunidades agora" value={fmtInt(result.opportunitiesAvailableNow)} detail="estoque disponível" />
      <PanelKpi label="Somente Carteira" value={fmtInt(result.opportunitiesPortfolioOnly)} detail="não entra como disponível agora" />
      <PanelKpi label="Bloqueadas" value={fmtInt(result.blockedByRegistration + result.blockedByStock)} detail={`${result.blockedByRegistration} cadastro · ${result.blockedByStock} estoque`} />
    </div>
    <PanelCard><PanelSectionHeader eyebrow="AÇÃO COMERCIAL" title="Próximas melhores oportunidades" description="Prioridades explícitas do motor; nenhum score oculto ou IA opaca." />
      <ProductTable products={result.opportunities.slice(0, 12)} mode="opportunity" />
    </PanelCard>
    <PanelCard><PanelSectionHeader eyebrow="AUDITORIA" title="Reconciliação da ficha" description="Divergências não são resolvidas silenciosamente." /><div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{result.audit.map(check => <div key={check.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(240px,2fr) 120px minmax(220px,2fr)', gap: 12, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.06)' }}><span>{check.label}</span><span className={check.status === 'OK' ? 'panel-badge panel-badge-green' : check.status === 'DIVERGENT' ? 'panel-badge panel-badge-red' : 'panel-badge panel-badge-amber'}>{check.status}</span><span className="panel-muted" style={{ fontSize: '.72rem' }}>{check.note || `${check.expected} → ${check.calculated}`}</span></div>)}</div></PanelCard>
  </div>;

  const renderAssortment = () => <PanelCard><PanelSectionHeader eyebrow="SORTIMENTO VIGENTE" title={`${result.officialAssortment} SKUs oficiais · ${result.executableAssortment} executáveis agora`} description="O denominador oficial não é reduzido silenciosamente por falta de cadastro ou estoque." /><ProductTable products={result.products.filter(product => product.isRecommended)} /></PanelCard>;
  const renderOpportunities = () => <PanelCard><PanelSectionHeader eyebrow="OPORTUNIDADES" title={`${result.opportunities.length} ações ou diagnósticos`} description="Lançamentos e mandatórios disponíveis lideram; bloqueios ficam separados de falhas de execução." /><ProductTable products={result.opportunities} mode="opportunity" /></PanelCard>;
  const renderLaunches = () => <div className="panel-stack"><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}><PanelKpi label="Recomendados" value={fmtInt(result.launches.totalRecommended)} /><PanelKpi label="Adotados" value={fmtInt(result.launches.adopted)} /><PanelKpi label="Faltam" value={fmtInt(result.launches.missing)} /><PanelKpi label="Disponíveis agora" value={fmtInt(result.launches.availableNow)} /><PanelKpi label="Somente Carteira" value={fmtInt(result.launches.portfolioOnly)} /><PanelKpi label="Sem Winthor" value={fmtInt(result.launches.withoutWinthor)} /><PanelKpi label="Sem estoque/previsão" value={fmtInt(result.launches.withoutStockAndPortfolio)} /></div><PanelCard><PanelSectionHeader eyebrow="ADOÇÃO DE LANÇAMENTOS" title="Lançamentos oficiais recomendados para este CNPJ" description="A base oficial da competência prevalece sobre listas antigas estáticas." /><ProductTable products={result.launchesProducts} mode="launch" /></PanelCard></div>;
  const renderOutside = () => <PanelCard><PanelSectionHeader eyebrow="COMPRADOS FORA" title={`${result.boughtOutsideProducts.length} itens para diagnóstico`} description="Fora real, migração, descontinuado e correspondência pendente permanecem categorias diferentes." /><ProductTable products={result.boughtOutsideProducts} mode="outside" /></PanelCard>;
  const renderPromotions = () => <PanelCard><PanelSectionHeader eyebrow="PROMOÇÕES" title={support.promotions.length ? `${result.promotions.length} promoções elegíveis` : 'Motor pronto · fonte oficial estruturada pendente'} description="O motor suporta ambiente, faixa, perfil, rede, CNPJ, SKU/EAN, mínimos, famílias e validade. Nada é ativado a partir da planilha auxiliar antiga sem fonte oficial validada." />{support.promotions.length ? <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>{result.promotions.map(rule => <div key={rule.id} style={{ padding: 14, border: '1px solid rgba(255,255,255,.08)', borderRadius: 12 }}><strong>{rule.name}</strong><div className="panel-muted">{rule.validFrom || '—'} a {rule.validTo || '—'} · {rule.benefit || 'Benefício não informado'}</div></div>)}</div> : <PanelEmptyState icon="◇" title="Nenhuma promoção oficial estruturada carregada" description="A arquitetura está pronta para receber regras oficiais posteriormente, sem inventar mecânicas." />}</PanelCard>;
  const renderPricing = () => <PanelCard><PanelSectionHeader eyebrow="PREÇOS" title="Preço-base disponível; composição final protegida" description="Acréscimo, rappel e ordem real de aplicação permanecem inativos até existirem regras validadas." /><ProductTable products={result.products.filter(product => product.isRecommended)} /><div style={{ marginTop: 14, color: '#fcd34d', fontSize: '.76rem' }}>Preço final não é calculado por aproximação. A composição final ficará rastreável por fonte quando as regras comerciais forem fornecidas.</div></PanelCard>;
  const renderHistory = () => <div className="panel-stack"><PanelCard><PanelSectionHeader eyebrow="HISTÓRICO" title="Situação atual do mix x conformidade histórica" description="O 310 total 2026 sustenta compra acumulada e valor líquido. Como não há data por transação, conformidade histórica completa não é simulada." /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginTop: 14 }}><PanelKpi label="Valor líquido YTD" value={fmtBRL(result.ytdNetValue)} /><PanelKpi label="SKUs comprados recomendados" value={fmtInt(result.assortmentBought)} /><PanelKpi label="Comprados fora" value={fmtInt(result.boughtOutside)} /><PanelKpi label="Pendências de correspondência" value={fmtInt(result.boughtUnresolved)} /></div></PanelCard><PanelCard><PanelSectionHeader eyebrow="LIMITAÇÕES REAIS" title="O que a fonte ainda não permite afirmar" />{result.limitations.map(limit => <div key={limit} style={{ padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.06)', color: 'var(--panel-muted)' }}>{limit}</div>)}</PanelCard></div>;
  const renderExport = () => <div className="panel-grid panel-grid-2"><PanelCard><PanelSectionHeader eyebrow="ARQUIVO EXTERNO" title="Arquivo Comercial do Cliente" description="Somente sortimento recomendado, lançamentos, promoções oficiais disponíveis e preços quando validados. Diagnósticos internos não são exportados." /><button className="panel-primary-button" onClick={() => downloadCustomerCommercialFile(result)}>Gerar arquivo comercial · {result.customer.cnpj}</button></PanelCard><PanelCard><PanelSectionHeader eyebrow="USO INTERNO" title="Dossiê Interno" description="Resumo, sortimento, não comprados, lançamentos, comprados fora, oportunidades, bloqueios, preços e auditoria." /><button className="panel-primary-button" onClick={() => downloadCustomerInternalDossier(result)}>Gerar dossiê interno · {result.customer.cnpj}</button></PanelCard></div>;

  const content: Record<ClientesSortimentoView, React.ReactNode> = { overview: renderOverview(), assortment: renderAssortment(), opportunities: renderOpportunities(), launches: renderLaunches(), outside: renderOutside(), promotions: renderPromotions(), pricing: renderPricing(), history: renderHistory(), export: renderExport() };
  return <PanelPage title="Clientes & Sortimento" metricLabel="Competência" metricValue={result.competenceLabel}>{selector}{view === 'overview' ? <SourceUploader support={support} onChange={setSupport} /> : null}{content[view]}</PanelPage>;
}
