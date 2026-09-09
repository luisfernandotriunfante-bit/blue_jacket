import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BlueJacketShell } from './ui/BlueJacketShell'
import { HoverSidebar } from './ui/navigation/HoverSidebar'
import { TopTabs } from './ui/navigation/TopTabs'
import { PanelAlert, PanelEmptyState, PanelPage } from './ui/pattern/PanelVisual'
import { EstoquePage, type EstoqueView } from './pages/EstoquePage'
import { LancamentosPage } from './pages/LancamentosPage'
import { EntradasNotasPage } from './pages/EntradasNotasPage'
import { SELL_OUT_TABS, SellOutPage } from './pages/SellOutPage'
import { TopRetailNetworksPage } from './pages/TopRetailNetworksPage'
import { DocumentosPage } from './pages/DocumentosPage'
import { CriacaoComboPage } from './pages/CriacaoComboPage'
import { ClientesSortimentoPage, type ClientesSortimentoView } from './pages/ClientesSortimentoUnifiedPage'
import { AdminPage } from './pages/admin/AdminPage'
import { DataProvider, useData } from './store/DataContext'
import { ADMIN_TABS, MAIN_SECTIONS, initialNavigationState, type AdminTabId, type MainSectionId } from './navigation'
import { deviceSyncHasNewerRemoteSnapshot, deviceSyncIdentity, incomingDeviceSyncCode, restoreCurrentDeviceSnapshot } from './canonical/cloudSync'
import { systemDataOperationCoordinator } from './canonical/systemDataOperationCoordinator'
import './ui/theme/foundation.css'

/** Restores a newer paired snapshot on startup without replacing an unsynced local build. */
function DeviceSyncBootstrap() {
  const { activeCanonical, activateCanonical } = useData()

  useEffect(() => {
    if (incomingDeviceSyncCode()) return
    const identity = deviceSyncIdentity()
    if (!identity) return
    void systemDataOperationCoordinator.run('STARTUP_REMOTE_RESTORE', async () => {
      try {
        if (activeCanonical && !(await deviceSyncHasNewerRemoteSnapshot(identity))) return
        const restored = await restoreCurrentDeviceSnapshot(identity)
        if (restored) activateCanonical(restored)
      } catch {
        // Offline, first-use, or integrity failures leave this device's local copy untouched.
      }
    })
  }, [])

  return null
}

function App() {
  const { migrationError } = useData()
  const initialNavigation = initialNavigationState(window.location.hash)
  const [activeTab, setActiveTab] = useState<MainSectionId>(initialNavigation.section)
  const [activeAdminTopTab, setActiveAdminTopTab] = useState<AdminTabId>(initialNavigation.adminTab)
  const [activeEstoqueTopTab, setActiveEstoqueTopTab] = useState('overview')
  const [activeSellOutTopTab, setActiveSellOutTopTab] = useState('resumo')
  const [activeAtividadesTopTab, setActiveAtividadesTopTab] = useState('combo')
  const [activeClientesTopTab, setActiveClientesTopTab] = useState<ClientesSortimentoView>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const selectSection = (id: MainSectionId) => {
    setActiveTab(id)
    if (id === 'administracao') setActiveAdminTopTab('bases')
    setSidebarOpen(false)
  }

  const sidebarItems = MAIN_SECTIONS.map(section => ({
    ...section,
    description: undefined,
    active: activeTab === section.id,
    onSelect: () => selectSection(section.id),
  }))

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
  ) : activeTab === 'administracao' ? (
    <TopTabs tabs={[...ADMIN_TABS]} activeId={activeAdminTopTab} onChange={value => setActiveAdminTopTab(value as AdminTabId)} ariaLabel="Navegação da Administração" />
  ) : null

  const currentLabel = sidebarItems.find(item => item.id === activeTab)?.label ?? activeTab
  const estoqueView: EstoqueView = activeEstoqueTopTab === 'products'
    ? 'products'
    : 'overview'

  return (
    <BlueJacketShell sidebar={sidebar} topNavigation={topNavigation}>
      {migrationError ? <PanelAlert tone="error">{migrationError}</PanelAlert> : null}
      {activeTab === 'estoque' ? (
        activeEstoqueTopTab === 'launches' ? <LancamentosPage /> : activeEstoqueTopTab === 'movements' ? <EntradasNotasPage /> : <EstoquePage view={estoqueView} />
      ) : activeTab === 'sellout' ? (
        activeSellOutTopTab === 'redes' ? <TopRetailNetworksPage /> : <SellOutPage view={activeSellOutTopTab as 'resumo' | 'gerencial'} />
      )
      : activeTab === 'sortimento' ? <ClientesSortimentoPage view={activeClientesTopTab} />
      : activeTab === 'atividades' && activeAtividadesTopTab === 'combo' ? <CriacaoComboPage />
      : activeTab === 'relatorios' ? <DocumentosPage />
      : activeTab === 'administracao' ? <AdminPage view={activeAdminTopTab} />
      : (
        <PanelPage title={currentLabel}>
          <PanelEmptyState variant="page" title={`${currentLabel} em construção`} description="Este módulo faz parte do roadmap e ainda não está disponível para uso operacional." />
        </PanelPage>
      )}
    </BlueJacketShell>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode><DataProvider><DeviceSyncBootstrap /><App /></DataProvider></React.StrictMode>,
)
