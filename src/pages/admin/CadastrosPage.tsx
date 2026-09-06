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
  return <PanelPage title="Cadastros" metricLabel="Uso nos motores" metricValue="ATIVO">
    <PanelAlert tone="success">Os Cadastros internos participam do build canônico v19. Precedência oficial: MANUAL ativo → SOURCE_SEED ativo → fonte física. Registros MANUAL inativos funcionam como supressão administrativa e conflitos de camada superior não caem silenciosamente para a fonte.</PanelAlert>
    <PanelTabs tabs={tabs} activeId={tab} onChange={setTab} ariaLabel="Cadastros internos" />
    {tab === 'rcas' ? <RcasRegistryPanel /> : tab === 'launches' ? <LaunchRegistryPanel /> : <TopRetailRegistryPanel />}
  </PanelPage>;
}
