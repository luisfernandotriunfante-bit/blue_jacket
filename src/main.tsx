import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BlueJacketShell } from './ui/BlueJacketShell'
import { HoverSidebar } from './ui/navigation/HoverSidebar'
import { TopTabs } from './ui/navigation/TopTabs'
import { PanelEmptyState, PanelPage } from './ui/pattern/PanelVisual'
import { EstoquePage, type EstoqueView } from './pages/EstoquePage'
import { LancamentosPage } from './pages/LancamentosPage'
import { ConfiguracoesPage } from './pages/ConfiguracoesPage'
import { MetasPage } from './pages/MetasPage'
import { SELL_OUT_TABS, SellOutPage } from './pages/SellOutPage'
import { TopRetailNetworksPage } from './pages/TopRetailNetworksPage'
import { DocumentosPage } from './pages/DocumentosPage'
import { CriacaoComboPage } from './pages/CriacaoComboPage'
import { ClientesSortimentoPage, type ClientesSortimentoView } from './pages/ClientesSortimentoUnifiedPage'
import { DataProvider } from './store/DataContext'
import { ListasCanonicasPage } from './pages/ListasCanonicasPage'
import './ui/theme/foundation.css'

function App() {
  const [activeTab, setActiveTab] = useState('estoque')
  const [activeEstoqueTopTab, setActiveEstoqueTopTab] = useState('overview')
  const [activeSellOutTopTab, setActiveSellOutTopTab] = useState('resumo')
  const [activeAtividadesTopTab, setActiveAtividadesTopTab] = useState('combo')
  const [activeClientesTopTab, setActiveClientesTopTab] = useState<ClientesSortimentoView>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const selectSection = (id: string) => {
    setActiveTab(id)
    setSidebarOpen(false)
  }

  const sidebarItems = [
    { id: 'estoque', label: 'Estoque', active: activeTab === 'estoque', onSelect: () => selectSection('estoque') },
    { id: 'sellout', label: 'Sell Out', active: activeTab === 'sellout', onSelect: () => selectSection('sellout') },
    { id: 'pex', label: 'PEX', description: 'Em construção', active: activeTab === 'pex', onSelect: () => selectSection('pex') },
    { id: 'sortimento', label: 'Clientes & Sortimento', active: activeTab === 'sortimento', onSelect: () => selectSection('sortimento') },
    { id: 'atividades', label: 'Atividades', active: activeTab === 'atividades', onSelect: () => selectSection('atividades') },
    { id: 'relatorios', label: 'Documentos', active: activeTab === 'relatorios', onSelect: () => selectSection('relatorios') },
    { id: 'metas', label: 'Metas', active: activeTab === 'metas', onSelect: () => selectSection('metas') },
    { id: 'listas-canonicas', label: 'Listas Canônicas', active: activeTab === 'listas-canonicas', onSelect: () => selectSection('listas-canonicas') },
    { id: 'configuracoes', label: 'Atualizar Bases', active: activeTab === 'configuracoes', onSelect: () => selectSection('configuracoes') },
  ]

  const sidebar = (
    <>
      <button
        type="button"
        className="bj-sidebar-trigger"
        data-open={sidebarOpen ? 'true' : 'false'}
        aria-label={sidebarOpen ? 'Fechar navegação principal' : 'Abrir navegação principal'}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen(open => !open)}
      >
        <span className="bj-sidebar-trigger-lines" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="bj-sidebar-backdrop"
        data-open={sidebarOpen ? 'true' : 'false'}
        aria-label="Fechar navegação principal"
        tabIndex={sidebarOpen ? 0 : -1}
        onClick={() => setSidebarOpen(false)}
      />
      <HoverSidebar
        forceOpen={sidebarOpen}
        brand={<div className="bj-brand"><span className="bj-brand-mark" aria-hidden="true" /><span>BLUE JACKET</span></div>}
        items={sidebarItems}
      />
    </>
  )

  const estoqueTopTabs = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'products', label: 'Produtos' },
    { id: 'launches', label: 'Lançamentos' },
    { id: 'movements', label: 'Entradas e Saídas' },
    { id: 'purchase-helper', label: 'Auxiliar de Pedidos' },
  ]

  const atividadesTopTabs = [{ id: 'combo', label: 'Criação de Combo' }]
  const clientesTopTabs = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'assortment', label: 'Sortimento' },
    { id: 'launches', label: 'Lançamentos' },
    { id: 'promotions', label: 'Promoções' },
  ]

  const topNavigation = activeTab === 'estoque' ? (
    <TopTabs tabs={estoqueTopTabs} activeId={activeEstoqueTopTab} onChange={setActiveEstoqueTopTab} />
  ) : activeTab === 'sellout' ? (
    <TopTabs tabs={SELL_OUT_TABS} activeId={activeSellOutTopTab} onChange={setActiveSellOutTopTab} ariaLabel="Navegação do Sell Out" />
  ) : activeTab === 'atividades' ? (
    <TopTabs tabs={atividadesTopTabs} activeId={activeAtividadesTopTab} onChange={setActiveAtividadesTopTab} />
  ) : activeTab === 'sortimento' ? (
    <TopTabs tabs={clientesTopTabs} activeId={activeClientesTopTab} onChange={value => setActiveClientesTopTab(value as ClientesSortimentoView)} />
  ) : null

  const currentLabel = sidebarItems.find(item => item.id === activeTab)?.label ?? activeTab
  const estoqueView: EstoqueView = activeEstoqueTopTab === 'products'
    ? 'products'
    : activeEstoqueTopTab === 'movements'
      ? 'movements'
      : activeEstoqueTopTab === 'purchase-helper'
        ? 'purchase-helper'
        : 'overview'

  return (
    <BlueJacketShell sidebar={sidebar} topNavigation={topNavigation}>
      {activeTab === 'estoque' ? (
        activeEstoqueTopTab === 'launches' ? <LancamentosPage /> : <EstoquePage view={estoqueView} />
      ) : activeTab === 'sellout' ? (
        activeSellOutTopTab === 'redes' ? <TopRetailNetworksPage /> : <SellOutPage view={activeSellOutTopTab as 'resumo' | 'gerencial'} />
      )
      : activeTab === 'sortimento' ? <ClientesSortimentoPage view={activeClientesTopTab} />
      : activeTab === 'atividades' && activeAtividadesTopTab === 'combo' ? <CriacaoComboPage />
      : activeTab === 'relatorios' ? <DocumentosPage />
      : activeTab === 'metas' ? <MetasPage />
      : activeTab === 'listas-canonicas' ? <ListasCanonicasPage />
      : activeTab === 'configuracoes' ? <ConfiguracoesPage />
      : (
        <PanelPage title={currentLabel}>
          <PanelEmptyState variant="page" title={`${currentLabel} em construção`} description="Este módulo faz parte do roadmap e ainda não está disponível para uso operacional." />
        </PanelPage>
      )}
    </BlueJacketShell>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode><DataProvider><App /></DataProvider></React.StrictMode>,
)
