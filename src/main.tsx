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
import { DataProvider } from './store/DataContext'
import './ui/theme/foundation.css'

function App() {
  const [activeTab, setActiveTab] = useState('estoque')
  const [activeTopTab, setActiveTopTab] = useState('lancamentos')

  const sidebarItems = [
    { id: 'estoque', label: 'Estoque', active: activeTab === 'estoque', onSelect: () => setActiveTab('estoque') },
    { id: 'sellout', label: 'Sell Out', active: activeTab === 'sellout', onSelect: () => setActiveTab('sellout') },
    { id: 'pex', label: 'PEX', active: activeTab === 'pex', onSelect: () => setActiveTab('pex') },
    { id: 'sortimento', label: 'Sortimento', active: activeTab === 'sortimento', onSelect: () => setActiveTab('sortimento') },
    { id: 'clientes', label: 'Clientes', active: activeTab === 'clientes', onSelect: () => setActiveTab('clientes') },
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
    { id: 'geral', label: 'Visão Geral' },
    { id: 'movimentacao', label: 'Entradas & Saídas' },
    { id: 'lancamentos', label: 'Lançamentos' },
  ]

  const topNavigation = activeTab === 'estoque' ? (
    <TopTabs tabs={estoqueTopTabs} activeId={activeTopTab} onChange={setActiveTopTab} />
  ) : null

  const currentLabel = sidebarItems.find(i => i.id === activeTab)?.label ?? activeTab

  return (
    <BlueJacketShell sidebar={sidebar} topNavigation={topNavigation}>
      {activeTab === 'estoque' ? (
        activeTopTab === 'lancamentos' ? <LancamentosPage /> : <EstoquePage />
      ) : activeTab === 'sellout' ? (
        <SellOutPage />
      ) : activeTab === 'relatorios' ? (
        <DocumentosPage />
      ) : activeTab === 'metas' ? (
        <MetasPage />
      ) : activeTab === 'configuracoes' ? (
        <ConfiguracoesPage />
      ) : (
        <PanelPage title={currentLabel}>
          <PanelEmptyState
            icon="◆"
            title={`${currentLabel} em construção`}
            description="A estrutura visual já segue o padrão do Sell Out. O conteúdo funcional será adicionado quando este módulo entrar na etapa de implementação."
          />
        </PanelPage>
      )}
    </BlueJacketShell>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DataProvider>
      <App />
    </React.StrictMode>,
)
