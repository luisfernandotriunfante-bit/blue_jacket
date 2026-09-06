import { useEffect, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import type { CanonicalList } from '../canonical/types';
import { useData } from '../store/DataContext';
import { PanelAlert, PanelEmptyState, PanelPage } from '../ui/pattern/PanelVisual';
import { ProductCatalogPage } from './ProductCatalogPage';
import { beginBundleLoad, completeBundleLoad, failBundleLoad, type BundleLoadState } from '../canonical/bundleLoadState';

type LaunchLists = {m1: CanonicalList;m3: CanonicalList;m4: CanonicalList};

export function LancamentosPage() {
  const { activeCanonical } = useData(); const [load, setLoad] = useState<BundleLoadState<LaunchLists>>(()=>beginBundleLoad(null));
  useEffect(() => { const buildId=activeCanonical?.motorBuildId??null; setLoad(beginBundleLoad(buildId)); if (!buildId) return; let live=true; Promise.all([loadCandidateList('M1_ITEM_ESTOQUE'),loadCandidateList('M3_MOVIMENTO_VENDAS'),loadCandidateList('M4_HISTORICO_TRANSICAO')]).then(([m1,m3,m4])=>{if(live)setLoad(current=>completeBundleLoad(current,buildId,{m1,m3,m4}))}).catch(e=>{if(live)setLoad(current=>failBundleLoad(current,buildId,e))}); return()=>{live=false}; },[activeCanonical]);
  if (!activeCanonical) return <PanelPage title="Lançamentos"><PanelEmptyState variant="page" title="Sem bundle canônico ativo" description="Atualize as bases para materializar os lançamentos." /></PanelPage>;
  if (load.error) return <PanelPage title="Lançamentos"><PanelAlert tone="error">Erro ao carregar lançamentos: {load.error}</PanelAlert></PanelPage>;
  if (load.loading || !load.data) return <PanelPage title="Lançamentos"><PanelEmptyState variant="page" title="Carregando lançamentos" description="Leitura passiva dos dados canônicos ativos." /></PanelPage>;
  return <ProductCatalogPage m1={load.data.m1} m3={load.data.m3} m4={load.data.m4} launchesOnly />;
}
