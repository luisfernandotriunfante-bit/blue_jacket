import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { buildCustomerIntelligence, listCustomerOptions } from '../domain/customerIntelligence';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT, type ProductCommercialView } from '../domain/customerIntelligenceTypes';
import { customerIntelligenceFromUnified } from '../services/motors/customerIntelligenceUnifiedAdapter';
import { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';
import { downloadCustomerCommercialFile, downloadCustomerInternalDossier } from '../services/customerIntelligenceExport';
import { PanelAlert, PanelCard, PanelEmptyState, PanelKpi, PanelPage, PanelSectionHeader, PanelStat } from '../ui/pattern/PanelVisual';

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

function priceStatusLabel(value: ProductCommercialView['priceStatus']) {
  if (value === 'BASE_DISPONIVEL') return 'PREÇO-BASE DISPONÍVEL';
  if (value === 'COMPOSICAO_FINAL_PENDENTE') return 'COMPOSIÇÃO FINAL PENDENTE';
  return 'SEM PREÇO';
}

function badgeClass(value: string) {
  if (value.includes('MAXIMA') || value.includes('BLOQUEIO') || value.includes('FORA')) return 'panel-badge panel-badge-red';
  if (value.includes('MUITO') || value.includes('ALTA') || value.includes('PEND')) return 'panel-badge panel-badge-amber';
  if (value.includes('MANDATORIO') || value.includes('DISPONIVEL')) return 'panel-badge panel-badge-green';
  return 'panel-badge';
}

function PurchaseSourceDetail({ product }: { product: ProductCommercialView }) {
  if (!product.bought) return <>NÃO</>;
  return <><strong>SIM</strong><div className="panel-muted" style={{ fontSize: '.66rem', marginTop: 3 }}>379: {fmtBRL(product.netValue)} · 8022: {fmtBRL(product.currentPeriodValue)}</div></>;
}

function ProductTable({ products, mode = 'default' }: { products: ProductCommercialView[]; mode?: 'default' | 'opportunity' | 'outside' | 'launch' | 'pricing' }) {
  if (!products.length) return <PanelEmptyState variant="compact" title="Nenhum item nesta visão" description="A base canônica não encontrou registros para os filtros desta aba." />;
  return <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Produto</th><th>Classificação</th><th>Comprou</th>{mode !== 'pricing' ? <><th>Disponível</th><th>Carteira</th></> : null}{mode === 'opportunity' ? <><th>Prioridade</th><th>Ação</th></> : null}{mode === 'outside' ? <><th>Situação</th><th>379 líquido</th><th>8022 atual</th></> : null}{mode === 'launch' ? <><th>Winthor</th><th>Status</th></> : null}{mode === 'pricing' ? <><th>Preço-base</th><th>Preço final</th><th>Status</th></> : <th>Preço-base</th>}</tr></thead><tbody>{products.map((product, index) => <tr key={`${product.ean || product.winthorCode}-${index}`}>
    <td><strong>{product.description}</strong><div className="panel-muted" style={{ fontSize: '.66rem', marginTop: 3 }}>EAN {product.ean || '—'} · Winthor {product.winthorCode || '—'}{product.isLaunch ? ' · LANÇAMENTO' : ''}</div></td>
    <td><span className={badgeClass(product.classification)}>{classificationLabel(product.classification)}</span></td>
    <td><PurchaseSourceDetail product={product} /></td>
    {mode !== 'pricing' ? <><td>{fmtInt(product.availableUnits)} un.</td><td>{product.portfolioUnits > 0 ? `${fmtInt(product.portfolioUnits)} un.` : product.portfolioCases > 0 ? `${fmtInt(product.portfolioCases)} cx` : '0 un.'}</td></> : null}
    {mode === 'opportunity' ? <><td><span className={badgeClass(product.opportunityPriority)}>{priorityLabel(product.opportunityPriority)}</span><div className="panel-muted" style={{ fontSize: '.66rem', marginTop: 4 }}>{product.opportunityReason}</div></td><td>{product.recommendedAction || '—'}</td></> : null}
    {mode === 'outside' ? <><td>{product.lineageStatus || classificationLabel(product.classification)}</td><td>{fmtBRL(product.netValue)}</td><td>{fmtBRL(product.currentPeriodValue)}</td></> : null}
    {mode === 'launch' ? <><td>{product.hasWinthor ? product.winthorCode || 'SIM' : 'SEM WINTHOR'}</td><td>{product.bought ? 'ADOTADO' : !product.hasWinthor ? 'BLOQUEADO · CADASTRO' : product.availability === 'DISPONIVEL' ? 'DISPONÍVEL AGORA' : product.availability === 'SOMENTE_CARTEIRA' ? 'SOMENTE CARTEIRA' : 'SEM ESTOQUE'}</td></> : null}
    {mode === 'pricing' ? <><td>{product.basePrice === null ? '—' : fmtBRL(product.basePrice)}</td><td>{product.finalPrice === null ? '—' : fmtBRL(product.finalPrice)}</td><td><span className={badgeClass(product.priceStatus)}>{priceStatusLabel(product.priceStatus)}</span></td></> : <td>{product.basePrice === null ? '—' : fmtBRL(product.basePrice)}</td>}
  </tr>)}</tbody></table></div>;
}

function HistoryTable({ products }: { products: ProductCommercialView[] }) {
  const bought = products.filter(product => product.bought);
  if (!bought.length) return <PanelEmptyState variant="compact" title="Sem compras registradas" description="Nenhuma compra 379 ou 8022 foi encontrada para este CNPJ até a data selecionada." />;
  return <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Produto</th><th>Classificação atual</th><th className="is-right">379 bruto</th><th className="is-right">Devoluções 379</th><th className="is-right">379 líquido</th><th className="is-right">8022 atual</th></tr></thead><tbody>{bought.map((product, index) => <tr key={`history-${product.ean || product.winthorCode}-${index}`}><td><strong>{product.description}</strong><div className="panel-muted" style={{ fontSize: '.66rem' }}>{product.ean || product.winthorCode || 'Sem correspondência'}</div></td><td>{classificationLabel(product.classification)}</td><td className="is-right">{fmtBRL(product.purchaseValue)}</td><td className="is-right">{fmtBRL(product.returnValue)}</td><td className="is-right">{fmtBRL(product.netValue)}</td><td className="is-right">{fmtBRL(product.currentPeriodValue)}</td></tr>)}</tbody></table></div>;
}

export function ClientesSortimentoPage({ view = 'overview' }: { view?: ClientesSortimentoView }) {
  const { canonical } = useData();
  const [selectedCnpj, setSelectedCnpj] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [search, setSearch] = useState('');

  const unifiedCanonical = canonical && isUnifiedCanonicalState(canonical) ? canonical : null;
  useEffect(() => { if (unifiedCanonical?.referenceDate && !referenceDate) setReferenceDate(unifiedCanonical.referenceDate); }, [unifiedCanonical?.referenceDate, referenceDate]);

  const support = useMemo(() => unifiedCanonical ? customerIntelligenceFromUnified(unifiedCanonical) : EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT, [unifiedCanonical]);
  const customers = useMemo(() => unifiedCanonical ? listCustomerOptions(unifiedCanonical, support) : [], [unifiedCanonical, support]);
  const filteredCustomers = useMemo(() => { const query = search.trim().toLowerCase(); if (!query) return customers.slice(0, 100); return customers.filter(item => [item.cnpj, item.name, item.network, item.city, item.tier].some(value => String(value || '').toLowerCase().includes(query))).slice(0, 100); }, [customers, search]);
  const result = useMemo(() => unifiedCanonical && selectedCnpj ? buildCustomerIntelligence(unifiedCanonical, support, selectedCnpj, referenceDate || unifiedCanonical.referenceDate) : null, [unifiedCanonical, support, selectedCnpj, referenceDate]);

  if (!unifiedCanonical) return <PanelPage title="Clientes & Sortimento"><PanelEmptyState variant="page" title="Base canônica unificada ainda não processada" description="Atualize as fontes em Configurações. Este módulo não possui mais upload ou cálculo paralelo." /></PanelPage>;

  const selector = <PanelCard><PanelSectionHeader eyebrow="CLIENTE" title="Inteligência Comercial por CNPJ" description="Clientes, classificação, histórico, estoque e Carteira vêm dos motores canônicos. O 310 aparece apenas na auditoria de reconciliação." action={<label style={{ display: 'grid', gap: 4 }}><span className="panel-mini-label">Data de análise</span><input className="panel-input" type="date" value={referenceDate || unifiedCanonical.referenceDate} onChange={event => setReferenceDate(event.target.value)} /></label>} /><div className="panel-grid panel-grid-2" style={{ marginTop: 14 }}><input className="panel-input panel-input-full" placeholder="Buscar CNPJ, cliente, rede, cidade ou faixa" value={search} onChange={event => setSearch(event.target.value)} /><select className="panel-select panel-input-full" value={selectedCnpj} onChange={event => setSelectedCnpj(event.target.value)}><option value="">Selecione um CNPJ</option>{filteredCustomers.map(item => <option key={item.cnpj} value={item.cnpj}>{item.cnpj} · {item.name || 'Cliente sem nome'} · {item.network || 'Sem rede'} · {item.tier || 'Sem faixa'}</option>)}</select></div></PanelCard>;

  if (!result) return <PanelPage title="Clientes & Sortimento" metricLabel="Clientes conhecidos" metricValue={fmtInt(customers.length)}>{selector}<PanelCard><PanelSectionHeader eyebrow="FONTES" title="Base única em Configurações" description="Sortimento, Premissas, Carteira de Clientes, 310 e demais fontes só podem ser substituídos pela ingestão global. Esta página é somente consumidora." /></PanelCard><PanelEmptyState variant="section" title="Selecione um CNPJ" description="A ficha será construída exclusivamente a partir da base canônica unificada." /></PanelPage>;

  const confirmedOutside = result.products.filter(product => product.bought && product.classification === 'FORA_DO_SORTIMENTO');
  const unresolvedBought = result.products.filter(product => product.bought && product.classification === 'PENDENCIA_CORRESPONDENCIA');
  const history379 = result.products.reduce((sum, product) => sum + product.netValue, 0);
  const current8022 = result.products.reduce((sum, product) => sum + product.currentPeriodValue, 0);
  const hasSalesOverlap = unifiedCanonical.unified.qualityIssues.some(issue => issue.code === 'HISTORICAL_CURRENT_SALES_OVERLAP');
  const divergentAudits = result.audit.filter(check => check.status === 'DIVERGENT');

  const overview = <div className="panel-stack"><PanelCard><PanelSectionHeader eyebrow={result.competenceLabel.toUpperCase()} title={result.customer.name || result.customer.cnpj} description={`${result.customer.cnpj} · ${result.customer.city || 'Cidade não informada'} · ${result.customer.network || 'Sem rede'}`} /><div className="panel-grid panel-grid-compact" style={{ marginTop: 16 }}>{[['Ambiente',result.customer.environment||'—'],['Perfil',result.customer.profile||'—'],['Faixa',result.customer.tier||'—'],['Canal',result.customer.assortmentChannel||'—'],['Vendedor',result.customer.vendorCode||'—'],['Coordenação',result.customer.coordinatorName||'—']].map(([label,value])=><PanelStat key={label} label={label} value={value} />)}</div></PanelCard><div className="panel-grid panel-grid-auto"><PanelKpi label="Assortment" value={fmtPct(result.assortmentPercent)} detail={`${result.assortmentBought}/${result.officialAssortment} recomendados comprados`} /><PanelKpi label="Sortimento oficial" value={fmtInt(result.officialAssortment)} /><PanelKpi label="Executável agora" value={fmtInt(result.executableAssortment)} /><PanelKpi label="Mandatórios" value={`${result.mandatoryBought}/${result.mandatoryRecommended}`} /><PanelKpi label="Importantes" value={`${result.importantBought}/${result.importantRecommended}`} /><PanelKpi label="Valor 379" value={fmtBRL(history379)} detail="Histórico canônico" /><PanelKpi label="Valor 8022" value={fmtBRL(current8022)} detail="Período atual" /><PanelKpi label="YTD consolidado" value={hasSalesOverlap ? 'BLOQUEADO' : fmtBRL(result.ytdNetValue)} detail={hasSalesOverlap ? '379 e 8022 possuem datas sobrepostas' : '379 histórico + 8022 atual'} /></div>{hasSalesOverlap ? <PanelAlert tone="error">O valor YTD combinado não é apresentado como confiável porque 379 e 8022 possuem datas sobrepostas. As duas fontes continuam visíveis separadamente e nenhuma deduplicação foi inventada.</PanelAlert> : null}{(divergentAudits.length || result.limitations.length) ? <PanelCard><PanelSectionHeader eyebrow="AUDITORIA DA FICHA" title={`${divergentAudits.length} divergência(s) · ${result.limitations.length} limitação(ões)`} description="Pendências permanecem visíveis e não são convertidas em cálculo válido." />{divergentAudits.slice(0,6).map(check => <div key={check.id} className="panel-muted" style={{ marginTop: 8 }}><strong>{check.label}</strong> · {check.note || `${check.expected} × ${check.calculated}`}</div>)}{result.limitations.map((limit, index) => <div key={`limit-${index}`} className="panel-muted" style={{ marginTop: 8 }}>• {limit}</div>)}</PanelCard> : null}<PanelCard><PanelSectionHeader eyebrow="AÇÃO COMERCIAL" title="Próximas melhores oportunidades" /><ProductTable products={result.opportunities.slice(0,12)} mode="opportunity" /></PanelCard></div>;
  const assortment = <PanelCard><PanelSectionHeader eyebrow="SORTIMENTO VIGENTE" title={`${result.officialAssortment} SKUs oficiais · ${result.executableAssortment} executáveis agora`} /><ProductTable products={result.products.filter(product=>product.isRecommended)} /></PanelCard>;
  const opportunities = <PanelCard><PanelSectionHeader eyebrow="OPORTUNIDADES" title={`${result.opportunities.length} ações ou diagnósticos`} /><ProductTable products={result.opportunities} mode="opportunity" /></PanelCard>;
  const launches = <PanelCard><PanelSectionHeader eyebrow="LANÇAMENTOS" title={`${result.launches.totalRecommended} recomendados · ${result.launches.adopted} adotados`} description={`${result.launches.availableNow} disponíveis agora · ${result.launches.portfolioOnly} somente Carteira · ${result.launches.withoutWinthor} sem Winthor`} /><ProductTable products={result.launchesProducts} mode="launch" /></PanelCard>;
  const outside = <div className="panel-stack"><PanelCard><PanelSectionHeader eyebrow="COMPRADOS FORA" title={`${confirmedOutside.length} itens confirmados fora do sortimento`} description="Somente itens cuja classificação vigente é comprovadamente FORA DO SORTIMENTO entram nesta lista." /><ProductTable products={confirmedOutside} mode="outside" /></PanelCard><PanelCard><PanelSectionHeader eyebrow="PENDÊNCIA DE CORRESPONDÊNCIA" title={`${unresolvedBought.length} compras ainda não classificáveis`} description="Esses itens foram comprados, mas não são chamados de fora do sortimento até a correspondência ser resolvida." /><ProductTable products={unresolvedBought} mode="outside" /></PanelCard></div>;
  const promotions = <PanelCard><PanelSectionHeader eyebrow="PROMOÇÕES" title={!support.promotions.length ? 'Fonte estruturada pendente' : result.promotions.length ? `${result.promotions.length} regra(s) aplicável(is) ao cliente` : 'Nenhuma regra aplicável ao cliente'} description="Aplicabilidade considera validade e perfil/CNPJ. Mínimos de pedido continuam exibidos como condição e não são tratados como atingidos sem evidência." />{!support.promotions.length ? <PanelEmptyState variant="section" title="Nenhuma promoção oficial estruturada" description="Nada é inventado sem fonte validada." /> : !result.promotions.length ? <PanelEmptyState variant="section" title="Nenhuma promoção aplicável" description="Há fonte de promoções carregada, mas nenhuma regra ativa atende ao perfil deste CNPJ na data selecionada." /> : <div className="panel-grid panel-grid-auto" style={{marginTop:14}}>{result.promotions.map(rule=><PanelCard compact key={rule.id}><PanelStat label={rule.name} value={rule.benefit||'Benefício não informado'} note={`${rule.validFrom || '—'} a ${rule.validTo || '—'}`} /><div className="panel-muted" style={{marginTop:8,fontSize:'var(--panel-font-caption)'}}>Mín. quantidade: {rule.minimumQuantity ?? '—'} · Mín. valor: {rule.minimumValue === null ? '—' : fmtBRL(rule.minimumValue)}{rule.requiredFamilies.length ? ` · Famílias: ${rule.requiredFamilies.join(', ')}` : ''}</div>{rule.note ? <div className="panel-muted" style={{marginTop:6,fontSize:'var(--panel-font-caption)'}}>{rule.note}</div> : null}</PanelCard>)}</div>}</PanelCard>;
  const pricing = <PanelCard><PanelSectionHeader eyebrow="PREÇOS" title="PVENDA1 como referência operacional" description="Preço final só aparece quando a composição comercial estiver materializada. Ausência de regra não é convertida em preço final fictício." /><ProductTable products={result.products.filter(product=>product.isRecommended)} mode="pricing" /></PanelCard>;
  const history = <div className="panel-stack"><PanelCard><PanelSectionHeader eyebrow="HISTÓRICO" title="379 histórico · 8022 período atual · 310 reconciliação" description="As fontes são mostradas separadamente para evitar dupla contagem silenciosa." /><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginTop:14}}><PanelKpi label="379 líquido" value={fmtBRL(history379)} /><PanelKpi label="8022 atual" value={fmtBRL(current8022)} /><PanelKpi label="YTD consolidado" value={hasSalesOverlap ? 'BLOQUEADO' : fmtBRL(result.ytdNetValue)} detail={hasSalesOverlap ? 'Sobreposição de datas detectada' : 'Sem sobreposição detectada'} /><PanelKpi label="SKUs recomendados comprados" value={fmtInt(result.assortmentBought)} /><PanelKpi label="Comprados fora" value={fmtInt(result.boughtOutside)} /><PanelKpi label="Pendências" value={fmtInt(result.boughtUnresolved)} /></div></PanelCard>{hasSalesOverlap ? <PanelAlert tone="error">379 e 8022 possuem movimentos em datas sobrepostas. O sistema preserva as duas fontes e bloqueia a interpretação do total combinado; não deduplica sem chave transacional comprovada.</PanelAlert> : null}<PanelCard><PanelSectionHeader eyebrow="DETALHE" title="Compras por produto e por origem" /><HistoryTable products={result.products} /></PanelCard></div>;
  const exportView = <div className="panel-grid panel-grid-2"><PanelCard><PanelSectionHeader eyebrow="ARQUIVO EXTERNO" title="Arquivo Comercial do Cliente" description="Inclui sortimento, adoção, oportunidades, lançamentos, comprado fora, pendências, promoções e preços usando o mesmo resultado da tela." /><button className="panel-primary-button" onClick={()=>downloadCustomerCommercialFile(result)}>Gerar arquivo comercial · {result.customer.cnpj}</button></PanelCard><PanelCard><PanelSectionHeader eyebrow="USO INTERNO" title="Dossiê Interno" description="Mesma base e mesmos cálculos da tela, com fontes 379 e 8022 separadas e auditoria completa." /><button className="panel-primary-button" onClick={()=>downloadCustomerInternalDossier(result)}>Gerar dossiê interno · {result.customer.cnpj}</button></PanelCard></div>;

  const content:Record<ClientesSortimentoView,React.ReactNode>={overview,assortment,opportunities,launches,outside,promotions,pricing,history,export:exportView};
  return <PanelPage title="Clientes & Sortimento" metricLabel="Competência" metricValue={result.competenceLabel}>{selector}{content[view]}</PanelPage>;
}
