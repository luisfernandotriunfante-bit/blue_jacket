import { useState } from 'react';
import { PanelAlert, PanelPage, PanelTabs } from '../../ui/pattern/PanelVisual';
import { LaunchRegistryPanel } from './registry/LaunchRegistryPanel';
import { RcasRegistryPanel } from './registry/RcasRegistryPanel';
import { TopRetailRegistryPanel } from './registry/TopRetailRegistryPanel';

type RegistryTab = 'rcas' | 'launches' | 'topRetailers';

const tabs: Array<{ id: RegistryTab; label: string }> = [
  { id: 'rcas', label: 'RCAs' },
  { id: 'launches', label: 'Lançamentos' },
  { id: 'topRetailers', label: 'Top Varejistas' },
];

export function CadastrosPage() {
  const [tab, setTab] = useState<RegistryTab>('rcas');
  return <PanelPage title="Cadastros" metricLabel="Uso canônico" metricValue="Fase 3B">
    <PanelAlert tone="warning">Os cadastros internos estão sendo preparados e sincronizados, mas ainda não substituem as fontes utilizadas pelos motores canônicos. A ativação operacional ocorrerá na próxima etapa.</PanelAlert>
    <PanelTabs tabs={tabs} activeId={tab} onChange={setTab} ariaLabel="Cadastros internos" />
    {tab === 'rcas' ? <RcasRegistryPanel /> : tab === 'launches' ? <LaunchRegistryPanel /> : <TopRetailRegistryPanel />}
  </PanelPage>;
}
