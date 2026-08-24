import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { buildCustomerIntelligence, listCustomerOptions } from '../domain/customerIntelligence';
import { EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT, type ProductCommercialView } from '../domain/customerIntelligenceTypes';
import { customerIntelligenceFromUnified } from '../services/motors/customerIntelligenceUnifiedAdapter';
import { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';
import { PanelAlert, PanelCard, PanelEmptyState, PanelKpi, PanelPage, PanelSectionHeader, PanelStat } from '../ui/pattern/PanelVisual';

export type ClientesSortimentoView = 'overview' | 'assortment' | 'launches' | 'promotions';
type AssortmentScope = 'recommended' | 'bought' | 'missing' | 'opportunities' | 'outside' | 'pending';

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

function PriceDetail({ product }: { product: ProductCommercialView }) {
  return <div><strong>{product.finalPrice === null ? (product.basePrice === null ? '—' : fmtBRL(product.basePrice)) : fmtBRL(product.finalPrice)}</strong><div className="panel-muted" style={{ fontSize: '.66rem', marginTop: 3 }}>{product.finalPrice === null ? `Base: ${product.basePrice === null ? '—' : fmtBRL(product.basePrice)}` : `Base: ${product.basePrice === null ? '—' : fmtBRL(product.basePrice)} · Final materializado`} · {priceStatusLabel(product.priceStatus)}</div></div>;
}

function CommercialProductTable({ products, launchMode = false }: { products: ProductCommercialView[]; launchMode?: boolean }) {
  if (!products.length) return <PanelEmptyState variant="compact" title="Nenhum item nesta visão" description="A base canônica não encontrou registros para o filtro selecionado." />;
  return <div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Produto</th><th>Classificação</th><th>Comprou / histórico</th><th>Disponível</th><th>Carteira</th>{launchMode ? <th>Status lançamento</th> : null}<th>Oportunidade</th><th>Ação</th><th>Preço do SKU</th></tr></thead><tbody>{products.map((product, index) => <tr key={`${product.ean || product.winthorCode}-${index}`}>
    <td><strong>{product.description}</strong><div className="panel-muted" style={{ fontSize: '.66rem', marginTop: 3 }}>EAN {product.ean || '—'} · Winthor {product.winthorCode || '—'}{product.isLaunch ? ' · LANÇAMENTO' : ''}</div></td>
    <td><span className={badgeClass(product.classification)}>{classificationLabel(product.classification)}</span></td>
    <td><PurchaseSourceDetail product={product} /></td>
    <td>{fmtInt(product.availableUnits)} un.</td>
    <td>{product.portfolioUnits > 0 ? `${fmtInt(product.portfolioUnits)} un.` : product.portfolioCases > 0 ? `${fmtInt(product.portfolioCases)} cx` : '0 un.'}</td>
    {launchMode ? <td>{product.bought ? 'ADOTADO' : !product.hasWinthor ? 'BLOQUEADO · CADASTRO' : product.availability === 'DISPONIVEL' ? 'DISPONÍVEL AGORA' : product.availability === 'SOMENTE_CARTEIRA' ? 'SOMENTE CARTEIRA' : 'SEM ESTOQUE'}</td> : null}
    <td>{product.opportunityPriority === 'SEM_ACAO' ? '—' : <><span className={badgeClass(product.opportunityPriority)}>{priorityLabel(product.opportunityPriority)}</span><div className="panel-muted" style={{ fontSize: '.66rem', marginTop: 4 }}>{product.opportunityReason}</div></>}</td>
    <td>{product.recommendedAction || '—'}</td>
    <td><PriceDetail product={product} /></td>
  </tr>)}</tbody></table></div>;
}

export function ClientesSortimentoPage({ view = 'overview' }: { view?: ClientesSortimentoView }) {
  const { canonical } = useData();
  const [selectedCnpj, setSelectedCnpj] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [search, setSearch] = useState('');
  const [assortmentScope, setAssortmentScope] = useState<AssortmentScope>('recommended');

  const unifiedCanonical = canonical && isUnifiedCanonicalState(canonical) ? canonical : null;
  useEffect(() => { if (unifiedCanonical?.referenceDate && !referenceDate) setReferenceDate(unifiedCanonical.referenceDate); }, [unifiedCanonical?.referenceDate, referenceDate]);

  const support = useMemo(() => unifiedCanonical ? customerIntelligenceFromUnified(unifiedCanonical) : EMPTY_CUSTOMER_INTELLIGENCE_SUPPORT, [unifiedCanonical]);
  const customers = useMemo(() => unifiedCanonical ? listCustomerOptions(unifiedCanonical, support) : [], [unifiedCanonical, support]);
  const filteredCustomers = useMemo(() => { const query = search.trim().toLowerCase(); if (!query) return customers.slice(0, 100); return customers.filter(item => [item.cnpj, item.name, item.network, item.city, item.tier].some(value => String(value || '').toLowerCase().includes(query))).slice(0, 100); }, [customers, search]);
  const result = useMemo(() => unifiedCanonical && selectedCnpj ? buildCustomerIntelligence(unifiedCanonical, support, selectedCnpj, referenceDate || unifiedCanonical.referenceDate) : null, [unifiedCanonical, support, selectedCnpj, referenceDate]);

  if (!unifiedCanonical) return <PanelPage title="Clientes & Sortimento"><PanelEmptyState variant="page" title="Base canônica unificada ainda não processada" description="Atualize as fontes em Configurações. Este módulo não possui mais upload ou cálculo paralelo." /></PanelPage>;

  const selector = <PanelCard><PanelSectionHeader eyebrow="CLIENTE" title="Inteligência Comercial por CNPJ" description="A ficha concentra perfil, sortimento, histórico, disponibilidade, preço e oportunidades do cliente usando os motores canônicos." action={<label style={{ display: 'grid', gap: 4 }}><span className="panel-mini-label">Data de análise</span><input className="panel-input" type="date" value={referenceDate || unifiedCanonical.referenceDate} onChange={event => setReferenceDate(event.target.value)} /></label>} /><div className="panel-grid panel-grid-2" style={{ marginTop: 14 }}><input className="panel-input panel-input-full" placeholder="Buscar CNPJ, cliente, rede, cidade ou faixa" value={search} onChange={event => setSearch(event.target.value)} /><select className="panel-select panel-input-full" value={selectedCnpj} onChange={event => setSelectedCnpj(event.target.value)}><option value="">Selecione um CNPJ</option>{filteredCustomers.map(item => <option key={item.cnpj} value={item.cnpj}>{item.cnpj} · {item.name || 'Cliente sem nome'} · {item.network || 'Sem rede'} · {item.tier || 'Sem faixa'}</option>)}</select></div></PanelCard>;

  if (!result) return <PanelPage title="Clientes & Sortimento" metricLabel="Clientes conhecidos" metricValue={fmtInt(customers.length)}>{selector}<PanelCard><PanelSectionHeader eyebrow="FONTES" title="Base única em Configurações" description="Sortimento, Premissas, Carteira de Clientes, 310 e demais fontes só podem ser substituídos pela ingestão global. Esta página é somente consumidora." /></PanelCard><PanelEmptyState variant="section" title="Selecione um CNPJ" description="A ficha será construída exclusivamente a partir da base canônica unificada." /></PanelPage>;

  const recommended = result.products.filter(product => product.isRecommended);
  const boughtRecommended = recommended.filter(product => product.bought);
  const missingRecommended = recommended.filter(product => !product.bought);
  const confirmedOutside = result.products.filter(product => product.bought && product.classification === 'FORA_DO_SORTIMENTO');
  const unresolvedBought = result.products.filter(product => product.bought && product.classification === 'PENDENCIA_CORRESPONDENCIA');
  const history379 = result.products.reduce((sum, product) => sum + product.netValue, 0);
  const current8022 = result.products.reduce((sum, product) => sum + product.currentPeriodValue, 0);
  const hasSalesOverlap = unifiedCanonical.unified.qualityIssues.some(issue => issue.code === 'HISTORICAL_CURRENT_SALES_OVERLAP');
  const divergentAudits = result.audit.filter(check => check.status === 'DIVERGENT');
  const basePriceCount = recommended.filter(product => product.basePrice !== null).length;
  const finalPriceCount = recommended.filter(product => product.finalPrice !== null).length;

  const scopedProducts: Record<AssortmentScope, ProductCommercialView[]> = {
    recommended,
    bought: boughtRecommended,
    missing: missingRecommended,
    opportunities: result.opportunities,
    outside: confirmedOutside,
    pending: unresolvedBought,
  };

  const overview = <div className="panel-stack">
    <PanelCard><PanelSectionHeader eyebrow={result.competenceLabel.toUpperCase()} title={result.customer.name || result.customer.cnpj} description={`${result.customer.cnpj} · ${result.customer.city || 'Cidade não informada'} · ${result.customer.network || 'Sem rede'}`} /><div className="panel-grid panel-grid-compact" style={{ marginTop: 16 }}>{[['Ambiente',result.customer.environment||'—'],['Perfil',result.customer.profile||'—'],['Faixa',result.customer.tier||'—'],['Canal',result.customer.assortmentChannel||'—'],['Vendedor',result.customer.vendorCode||'—'],['Coordenação',result.customer.coordinatorName||'—']].map(([label,value])=><PanelStat key={label} label={label} value={value} />)}</div></PanelCard>
    <div className="panel-grid panel-grid-auto"><PanelKpi label="Assortment" value={fmtPct(result.assortmentPercent)} detail={`${result.assortmentBought}/${result.officialAssortment} recomendados comprados`} /><PanelKpi label="Sortimento oficial" value={fmtInt(result.officialAssortment)} /><PanelKpi label="Executável agora" value={fmtInt(result.executableAssortment)} /><PanelKpi label="Não comprados" value={fmtInt(result.recommendedMissing)} /><PanelKpi label="Oportunidades" value={fmtInt(result.opportunities.length)} /><PanelKpi label="Comprados fora" value={fmtInt(result.boughtOutside)} /><PanelKpi label="Pendências" value={fmtInt(result.boughtUnresolved)} /><PanelKpi label="Lançamentos faltantes" value={fmtInt(result.launches.missing)} /></div>
    <div className="panel-grid panel-grid-2">
      <PanelCard><PanelSectionHeader eyebrow="HISTÓRICO DO CLIENTE" title="Compra acumulada e período atual" description="O histórico não possui mais uma aba própria; ele acompanha a ficha e cada SKU do Sortimento." /><div className="panel-grid panel-grid-2" style={{ marginTop: 14 }}><PanelKpi label="379 líquido" value={fmtBRL(history379)} /><PanelKpi label="8022 atual" value={fmtBRL(current8022)} /><PanelKpi label="YTD consolidado" value={hasSalesOverlap ? 'BLOQUEADO' : fmtBRL(result.ytdNetValue)} detail={hasSalesOverlap ? 'Sobreposição de datas detectada' : 'Sem sobreposição detectada'} /><PanelKpi label="SKUs comprados no sortimento" value={fmtInt(boughtRecommended.length)} /></div></PanelCard>
      <PanelCard><PanelSectionHeader eyebrow="PREÇO DO CLIENTE" title="Preço junto do CNPJ, não em uma aba isolada" description="PVENDA1 permanece a referência operacional. O preço final só aparece quando a composição comercial do cliente estiver materializada." /><div className="panel-grid panel-grid-2" style={{ marginTop: 14 }}><PanelKpi label="SKUs com preço-base" value={`${fmtInt(basePriceCount)}/${fmtInt(recommended.length)}`} /><PanelKpi label="Preço final materializado" value={`${fmtInt(finalPriceCount)}/${fmtInt(recommended.length)}`} /><PanelKpi label="Mandatórios" value={`${result.mandatoryBought}/${result.mandatoryRecommended}`} /><PanelKpi label="Importantes" value={`${result.importantBought}/${result.importantRecommended}`} /></div></PanelCard>
    </div>
    {hasSalesOverlap ? <PanelAlert tone="error">379 e 8022 possuem movimentos em datas sobrepostas. As duas fontes continuam visíveis separadamente; o total combinado permanece bloqueado e nenhuma deduplicação é inventada.</PanelAlert> : null}
    {(divergentAudits.length || result.limitations.length) ? <PanelCard><PanelSectionHeader eyebrow="AUDITORIA DA FICHA" title={`${divergentAudits.length} divergência(s) · ${result.limitations.length} limitação(ões)`} description="Pendências permanecem visíveis e não são convertidas em cálculo válido." />{divergentAudits.slice(0,6).map(check => <div key={check.id} className="panel-muted" style={{ marginTop: 8 }}><strong>{check.label}</strong> · {check.note || `${check.expected} × ${check.calculated}`}</div>)}{result.limitations.map((limit, index) => <div key={`limit-${index}`} className="panel-muted" style={{ marginTop: 8 }}>• {limit}</div>)}</PanelCard> : null}
  </div>;

  const assortment = <div className="panel-stack">
    <div className="panel-grid panel-grid-auto"><PanelKpi label="Comprados no sortimento" value={fmtInt(boughtRecommended.length)} /><PanelKpi label="Não comprados" value={fmtInt(missingRecommended.length)} /><PanelKpi label="Oportunidades" value={fmtInt(result.opportunities.length)} /><PanelKpi label="Comprados fora" value={fmtInt(confirmedOutside.length)} /><PanelKpi label="Pendências de correspondência" value={fmtInt(unresolvedBought.length)} /></div>
    <PanelCard><PanelSectionHeader eyebrow="SORTIMENTO E EXECUÇÃO" title={`${result.officialAssortment} SKUs oficiais · ${result.executableAssortment} executáveis agora`} description="Compra, histórico, oportunidade, disponibilidade e preço ficam na mesma mesa. Use o filtro para trocar a leitura sem sair desta aba." action={<label style={{ display: 'grid', gap: 4 }}><span className="panel-mini-label">Mostrar</span><select className="panel-select" value={assortmentScope} onChange={event => setAssortmentScope(event.target.value as AssortmentScope)}><option value="recommended">Sortimento oficial</option><option value="bought">Comprados no sortimento</option><option value="missing">Não comprados no sortimento</option><option value="opportunities">Oportunidades e diagnósticos</option><option value="outside">Comprados fora</option><option value="pending">Pendências de correspondência</option></select></label>} /><CommercialProductTable products={scopedProducts[assortmentScope]} /></PanelCard>
    {assortmentScope === 'pending' ? <PanelAlert tone="warning">Pendência de correspondência não é chamada de “fora do sortimento”. O item permanece separado até que EAN/cadastro/sortimento sejam reconciliados.</PanelAlert> : null}
  </div>;

  const launches = <div className="panel-stack"><div className="panel-grid panel-grid-auto"><PanelKpi label="Recomendados" value={fmtInt(result.launches.totalRecommended)} /><PanelKpi label="Adotados" value={fmtInt(result.launches.adopted)} /><PanelKpi label="Faltantes" value={fmtInt(result.launches.missing)} /><PanelKpi label="Disponíveis agora" value={fmtInt(result.launches.availableNow)} /><PanelKpi label="Somente Carteira" value={fmtInt(result.launches.portfolioOnly)} /><PanelKpi label="Sem Winthor" value={fmtInt(result.launches.withoutWinthor)} /></div><PanelCard><PanelSectionHeader eyebrow="LANÇAMENTOS" title="Adoção, disponibilidade e ação comercial" description="Lançamentos permanecem separados porque exigem acompanhamento próprio, mas usam o mesmo histórico, preço e estoque do restante do sortimento." /><CommercialProductTable products={result.launchesProducts} launchMode /></PanelCard></div>;

  const promotions = <PanelCard><PanelSectionHeader eyebrow="PROMOÇÕES" title={!support.promotions.length ? 'Fonte estruturada pendente' : result.promotions.length ? `${result.promotions.length} regra(s) aplicável(is) ao cliente` : 'Nenhuma regra aplicável ao cliente'} description="Aplicabilidade considera validade e perfil/CNPJ. Mínimos de pedido continuam exibidos como condição e não são tratados como atingidos sem evidência." />{!support.promotions.length ? <PanelEmptyState variant="section" title="Nenhuma promoção oficial estruturada" description="Nada é inventado sem fonte validada." /> : !result.promotions.length ? <PanelEmptyState variant="section" title="Nenhuma promoção aplicável" description="Há fonte de promoções carregada, mas nenhuma regra ativa atende ao perfil deste CNPJ na data selecionada." /> : <div className="panel-grid panel-grid-auto" style={{marginTop:14}}>{result.promotions.map(rule=><PanelCard compact key={rule.id}><PanelStat label={rule.name} value={rule.benefit||'Benefício não informado'} note={`${rule.validFrom || '—'} a ${rule.validTo || '—'}`} /><div className="panel-muted" style={{marginTop:8,fontSize:'var(--panel-font-caption)'}}>Mín. quantidade: {rule.minimumQuantity ?? '—'} · Mín. valor: {rule.minimumValue === null ? '—' : fmtBRL(rule.minimumValue)}{rule.requiredFamilies.length ? ` · Famílias: ${rule.requiredFamilies.join(', ')}` : ''}</div>{rule.note ? <div className="panel-muted" style={{marginTop:6,fontSize:'var(--panel-font-caption)'}}>{rule.note}</div> : null}</PanelCard>)}</div>}</PanelCard>;

  const content: Record<ClientesSortimentoView, React.ReactNode> = { overview, assortment, launches, promotions };
  return <PanelPage title="Clientes & Sortimento" metricLabel="Competência" metricValue={result.competenceLabel}>{selector}{content[view]}</PanelPage>;
}
