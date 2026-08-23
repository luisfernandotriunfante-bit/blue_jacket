import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BlueJacketShell } from './ui/BlueJacketShell'
import { HoverSidebar } from './ui/navigation/HoverSidebar'
import { TopTabs } from './ui/navigation/TopTabs'
import { PanelEmptyState, PanelPage } from './ui/pattern/PanelVisual'
import { EstoquePage } from './pages/EstoquePage'
import { LancamentosPage } from './pages/LancamentosPage'
import { ConfiguracoesPage } from './pages/ConfiguracoesPage'
import { MetasPage } from './pages/MetasPage'
import { SellOutPage } from './pages/SellOutPage'
import { DocumentosPage } from './pages/DocumentosPage'
import { CriacaoComboPage } from './pages/CriacaoComboPage'
import { ClientesSortimentoPage, type ClientesSortimentoView } from './pages/ClientesSortimentoUnifiedPage'
import { DataProvider } from './store/DataContext'
import './ui/theme/foundation.css'

function App() {
  const [activeTab, setActiveTab] = useState('estoque')
  const [activeEstoqueTopTab, setActiveEstoqueTopTab] = useState('overview')
  const [activeAtividadesTopTab, setActiveAtividadesTopTab] = useState('combo')
  const [activeClientesTopTab, setActiveClientesTopTab] = useState<ClientesSortimentoView>('overview')

  const sidebarItems = [
    { id: 'estoque', label: 'Estoque', active: activeTab === 'estoque', onSelect: () => setActiveTab('estoque') },
    { id: 'sellout', label: 'Sell Out', active: activeTab === 'sellout', onSelect: () => setActiveTab('sellout') },
    { id: 'pex', label: 'PEX', description: 'Em construção', active: activeTab === 'pex', onSelect: () => setActiveTab('pex') },
    { id: 'sortimento', label: 'Clientes & Sortimento', active: activeTab === 'sortimento', onSelect: () => setActiveTab('sortimento') },
    { id: 'atividades', label: 'Atividades', active: activeTab === 'atividades', onSelect: () => setActiveTab('atividades') },
    { id: 'relatorios', label: 'Documentos', active: activeTab === 'relatorios', onSelect: () => setActiveTab('relatorios') },
    { id: 'metas', label: 'Metas', active: activeTab === 'metas', onSelect: () => setActiveTab('metas') },
    { id: 'configuracoes', label: 'Configurações', active: activeTab === 'configuracoes', onSelect: () => setActiveTab('configuracoes') },
  ]

  const sidebar = (
    <HoverSidebar
      brand={<div style={{ padding: '24px', fontWeight: 'bold', fontSize: '1.2rem', color: 'white' }}>BLUE JACKET</div>}
      items={sidebarItems}
    />
  )

  const estoqueTopTabs = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'products', label: 'Produtos' },
    { id: 'launches', label: 'Lançamentos' },
    { id: 'movements', label: 'Entradas e Saídas' },
  ]

  const atividadesTopTabs = [{ id: 'combo', label: 'Criação de Combo' }]
  const clientesTopTabs = [
    { id: 'overview', label: 'Visão Geral' }, { id: 'assortment', label: 'Sortimento' }, { id: 'opportunities', label: 'Oportunidades' },
    { id: 'launches', label: 'Lançamentos' }, { id: 'outside', label: 'Comprado Fora' }, { id: 'promotions', label: 'Promoções' },
    { id: 'pricing', label: 'Preços' }, { id: 'history', label: 'Histórico' }, { id: 'export', label: 'Exportar' },
  ]

  const topNavigation = activeTab === 'estoque' ? (
    <TopTabs tabs={estoqueTopTabs} activeId={activeEstoqueTopTab} onChange={setActiveEstoqueTopTab} />
  ) : activeTab === 'atividades' ? (
    <TopTabs tabs={atividadesTopTabs} activeId={activeAtividadesTopTab} onChange={setActiveAtividadesTopTab} />
  ) : activeTab === 'sortimento' ? (
    <TopTabs tabs={clientesTopTabs} activeId={activeClientesTopTab} onChange={value => setActiveClientesTopTab(value as ClientesSortimentoView)} />
  ) : null

  const currentLabel = sidebarItems.find(i => i.id === activeTab)?.label ?? activeTab
  const estoqueView = activeEstoqueTopTab === 'products' ? 'products' : activeEstoqueTopTab === 'movements' ? 'movements' : 'overview'

  return (
    <BlueJacketShell sidebar={sidebar} topNavigation={topNavigation}>
      {activeTab === 'estoque' ? (
        activeEstoqueTopTab === 'launches' ? <LancamentosPage /> : <EstoquePage view={estoqueView} />
      ) : activeTab === 'sellout' ? <SellOutPage />
      : activeTab === 'sortimento' ? <ClientesSortimentoPage view={activeClientesTopTab} />
      : activeTab === 'atividades' && activeAtividadesTopTab === 'combo' ? <CriacaoComboPage />
      : activeTab === 'relatorios' ? <DocumentosPage />
      : activeTab === 'metas' ? <MetasPage />
      : activeTab === 'configuracoes' ? <ConfiguracoesPage />
      : (
        <PanelPage title={currentLabel}>
          <PanelEmptyState icon="◆" title={`${currentLabel} em construção`} description="Este módulo faz parte do roadmap e ainda não está disponível para uso operacional." />
        </PanelPage>
      )}
    </BlueJacketShell>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode><DataProvider><App /></DataProvider></React.StrictMode>,
)
