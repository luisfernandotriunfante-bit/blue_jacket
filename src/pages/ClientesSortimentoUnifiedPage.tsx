import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { buildCustomerIntelligence, listCustomerOptions } from '../domain/customerIntelligence';
import type { ProductCommercialView } from '../domain/customerIntelligenceTypes';
import { customerIntelligenceFromUnified } from '../services/motors/customerIntelligenceUnifiedAdapter';
import { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';
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

function ProductTable({ products, mode = 'default' }: { products: ProductCommercialView[]; mode?: 'default' | 'opportunity' | 'outside' | 'launch' }) {
  if (!products.length) return <PanelEmptyState icon="✓" title="Nenhum item nesta visão" description="A base canônica não encontrou registros para os filtros desta aba." />;
  return <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Produto</th><th>Classificação</th><th>Comprou</th><th>Disponível</th><th>Carteira</th>{mode === 'opportunity' ? <><th>Prioridade</th><th>Ação</th></> : null}{mode === 'outside' ? <><th>Situação</th><th>Valor líquido</th></> : null}{mode === 'launch' ? <><th>Winthor</th><th>Status</th></> : null}<th>Preço-base</th></tr></thead><tbody>{products.map((product, index) => <tr key={`${product.ean || product.winthorCode}-${index}`}>
    <td><strong>{product.description}</strong><div className="panel-muted" style={{ fontSize: '.66rem', marginTop: 3 }}>EAN {product.ean || '—'} · Winthor {product.winthorCode || '—'}{product.isLaunch ? ' · LANÇAMENTO' : ''}</div></td>
    <td><span className={badgeClass(product.classification)}>{classificationLabel(product.classification)}</span></td>
    <td>{product.bought ? 'SIM' : 'NÃO'}{product.bought ? <div className="panel-muted" style={{ fontSize: '.66rem' }}>{fmtBRL(product.netValue)}</div> : null}</td>
    <td>{fmtInt(product.availableUnits)} un.</td><td>{product.portfolioUnits > 0 ? `${fmtInt(product.portfolioUnits)} un.` : product.portfolioCases > 0 ? `${fmtInt(product.portfolioCases)} cx` : '0 un.'}</td>
    {mode === 'opportunity' ? <><td><span className={badgeClass(product.opportunityPriority)}>{priorityLabel(product.opportunityPriority)}</span><div className="panel-muted" style={{ fontSize: '.66rem', marginTop: 4 }}>{product.opportunityReason}</div></td><td>{product.recommendedAction || '—'}</td></> : null}
    {mode === 'outside' ? <><td>{product.lineageStatus || classificationLabel(product.classification)}</td><td>{fmtBRL(product.netValue)}</td></> : null}
    {mode === 'launch' ? <><td>{product.hasWinthor ? product.winthorCode || 'SIM' : 'SEM WINTHOR'}</td><td>{product.bought ? 'ADOTADO' : !product.hasWinthor ? 'BLOQUEADO · CADASTRO' : product.availability === 'DISPONIVEL' ? 'DISPONÍVEL AGORA' : product.availability === 'SOMENTE_CARTEIRA' ? 'SOMENTE CARTEIRA' : 'SEM ESTOQUE'}</td></> : null}
    <td>{product.basePrice === null ? '—' : fmtBRL(product.basePrice)}</td>
  </tr>)}</tbody></table></div>;
}

export function ClientesSortimentoPage({ view = 'overview' }: { view?: ClientesSortimentoView }) {
  const { canonical } = useData();
  const [selectedCnpj, setSelectedCnpj] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { if (canonical?.referenceDate && !referenceDate) setReferenceDate(canonical.referenceDate); }, [canonical?.referenceDate, referenceDate]);

  if (!canonical || !isUnifiedCanonicalState(canonical)) return <PanelPage title="Clientes & Sortimento"><PanelEmptyState icon="◆" title="Base canônica unificada ainda não processada" description="Atualize as fontes em Configurações. Este módulo não possui mais upload ou cálculo paralelo." /></PanelPage>;

  const support = useMemo(() => customerIntelligenceFromUnified(canonical), [canonical]);
  const customers = useMemo(() => listCustomerOptions(canonical, support), [canonical, support]);
  const filteredCustomers = useMemo(() => { const query = search.trim().toLowerCase(); if (!query) return customers.slice(0, 100); return customers.filter(item => [item.cnpj, item.name, item.network, item.city, item.tier].some(value => String(value || '').toLowerCase().includes(query))).slice(0, 100); }, [customers, search]);
  const result = useMemo(() => selectedCnpj ? buildCustomerIntelligence(canonical, support, selectedCnpj, referenceDate || canonical.referenceDate) : null, [canonical, support, selectedCnpj, referenceDate]);

  const selector = <PanelCard><PanelSectionHeader eyebrow="CLIENTE" title="Inteligência Comercial por CNPJ" description="Clientes, classificação, histórico, estoque e Carteira vêm dos quatro motores canônicos. O 310 aparece apenas na auditoria de reconciliação." action={<label style={{ display: 'grid', gap: 4 }}><span className="panel-mini-label">Data de análise</span><input className="panel-input" type="date" value={referenceDate || canonical.referenceDate} onChange={event => setReferenceDate(event.target.value)} /></label>} /><div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) minmax(280px,2fr)', gap: 12, marginTop: 14 }}><input className="panel-input" placeholder="Buscar CNPJ, cliente, rede, cidade ou faixa" value={search} onChange={event => setSearch(event.target.value)} /><select className="panel-input" value={selectedCnpj} onChange={event => setSelectedCnpj(event.target.value)}><option value="">Selecione um CNPJ</option>{filteredCustomers.map(item => <option key={item.cnpj} value={item.cnpj}>{item.cnpj} · {item.name || 'Cliente sem nome'} · {item.network || 'Sem rede'} · {item.tier || 'Sem faixa'}</option>)}</select></div></PanelCard>;

  if (!result) return <PanelPage title="Clientes & Sortimento" metricLabel="Clientes conhecidos" metricValue={fmtInt(customers.length)}>{selector}<PanelCard><PanelSectionHeader eyebrow="FONTES" title="Base única em Configurações" description="Sortimento, Premissas, Carteira de Clientes, 310 e demais fontes só podem ser substituídos pela ingestão global. Esta página é somente consumidora." /></PanelCard><PanelEmptyState icon="◎" title="Selecione um CNPJ" description="A ficha será construída exclusivamente a partir da base canônica unificada." /></PanelPage>;

  const overview = <div className="panel-stack"><PanelCard><PanelSectionHeader eyebrow={result.competenceLabel.toUpperCase()} title={result.customer.name || result.customer.cnpj} description={`${result.customer.cnpj} · ${result.customer.city || 'Cidade não informada'} · ${result.customer.network || 'Sem rede'}`} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 16 }}>{[['Ambiente',result.customer.environment||'—'],['Perfil',result.customer.profile||'—'],['Faixa',result.customer.tier||'—'],['Canal',result.customer.assortmentChannel||'—'],['Vendedor',result.customer.vendorCode||'—'],['Coordenação',result.customer.coordinatorName||'—']].map(([label,value])=><div key={label} style={{padding:12,border:'1px solid rgba(255,255,255,.07)',borderRadius:12}}><div className="panel-mini-label">{label}</div><strong style={{color:'white',display:'block',marginTop:5}}>{value}</strong></div>)}</div></PanelCard><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}><PanelKpi label="Assortment" value={fmtPct(result.assortmentPercent)} detail={`${result.assortmentBought}/${result.officialAssortment} recomendados comprados`} /><PanelKpi label="Sortimento oficial" value={fmtInt(result.officialAssortment)} /><PanelKpi label="Executável agora" value={fmtInt(result.executableAssortment)} /><PanelKpi label="Mandatórios" value={`${result.mandatoryBought}/${result.mandatoryRecommended}`} /><PanelKpi label="Importantes" value={`${result.importantBought}/${result.importantRecommended}`} /><PanelKpi label="Valor líquido YTD" value={fmtBRL(result.ytdNetValue)} detail="379 canônico · 310 apenas reconciliação" /></div><PanelCard><PanelSectionHeader eyebrow="AÇÃO COMERCIAL" title="Próximas melhores oportunidades" /><ProductTable products={result.opportunities.slice(0,12)} mode="opportunity" /></PanelCard></div>;
  const assortment = <PanelCard><PanelSectionHeader eyebrow="SORTIMENTO VIGENTE" title={`${result.officialAssortment} SKUs oficiais · ${result.executableAssortment} executáveis agora`} /><ProductTable products={result.products.filter(product=>product.isRecommended)} /></PanelCard>;
  const opportunities = <PanelCard><PanelSectionHeader eyebrow="OPORTUNIDADES" title={`${result.opportunities.length} ações ou diagnósticos`} /><ProductTable products={result.opportunities} mode="opportunity" /></PanelCard>;
  const launches = <PanelCard><PanelSectionHeader eyebrow="LANÇAMENTOS" title={`${result.launches.totalRecommended} recomendados · ${result.launches.adopted} adotados`} /><ProductTable products={result.launchesProducts} mode="launch" /></PanelCard>;
  const outside = <PanelCard><PanelSectionHeader eyebrow="COMPRADOS FORA" title={`${result.boughtOutsideProducts.length} itens para diagnóstico`} /><ProductTable products={result.boughtOutsideProducts} mode="outside" /></PanelCard>;
  const promotions = <PanelCard><PanelSectionHeader eyebrow="PROMOÇÕES" title={support.promotions.length ? `${result.promotions.length} promoções elegíveis` : 'Fonte estruturada pendente'} />{support.promotions.length ? <div style={{display:'grid',gap:10,marginTop:14}}>{result.promotions.map(rule=><div key={rule.id} style={{padding:14,border:'1px solid rgba(255,255,255,.08)',borderRadius:12}}><strong>{rule.name}</strong><div className="panel-muted">{rule.benefit||'Benefício não informado'}</div></div>)}</div> : <PanelEmptyState icon="◇" title="Nenhuma promoção oficial estruturada" description="Nada é inventado sem fonte validada." />}</PanelCard>;
  const pricing = <PanelCard><PanelSectionHeader eyebrow="PREÇOS" title="PVENDA1 como referência operacional" description="Preço final só é composto quando existirem regras comerciais validadas." /><ProductTable products={result.products.filter(product=>product.isRecommended)} /></PanelCard>;
  const history = <div className="panel-stack"><PanelCard><PanelSectionHeader eyebrow="HISTÓRICO" title="379 como fato · 310 como reconciliação" description="O histórico acumulado usado na ficha é reconstruído das transações 379, preservando vendas e devoluções com sinal." /><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginTop:14}}><PanelKpi label="Valor líquido YTD" value={fmtBRL(result.ytdNetValue)} /><PanelKpi label="SKUs recomendados comprados" value={fmtInt(result.assortmentBought)} /><PanelKpi label="Comprados fora" value={fmtInt(result.boughtOutside)} /></div></PanelCard></div>;
  const exportView = <div className="panel-grid panel-grid-2"><PanelCard><PanelSectionHeader eyebrow="ARQUIVO EXTERNO" title="Arquivo Comercial do Cliente" description="A exportação recebe o mesmo resultado canônico exibido na tela; não relê arquivos brutos." /><button className="panel-primary-button" onClick={()=>downloadCustomerCommercialFile(result)}>Gerar arquivo comercial · {result.customer.cnpj}</button></PanelCard><PanelCard><PanelSectionHeader eyebrow="USO INTERNO" title="Dossiê Interno" description="Mesma base e mesmos cálculos da tela." /><button className="panel-primary-button" onClick={()=>downloadCustomerInternalDossier(result)}>Gerar dossiê interno · {result.customer.cnpj}</button></PanelCard></div>;

  const content:Record<ClientesSortimentoView,React.ReactNode>={overview,assortment,opportunities,launches,outside,promotions,pricing,history,export:exportView};
  return <PanelPage title="Clientes & Sortimento" metricLabel="Competência" metricValue={result.competenceLabel}>{selector}{content[view]}</PanelPage>;
}
