import { useEffect, useState } from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import type { CanonicalList } from '../canonical/types';
import { useData } from '../store/DataContext';
import { PanelAlert, PanelEmptyState, PanelPage } from '../ui/pattern/PanelVisual';
import { ProductCatalogPage } from './ProductCatalogPage';

export function LancamentosPage() {
  const { activeCanonical } = useData(); const [lists, setLists] = useState<{m1: CanonicalList;m3: CanonicalList}|null>(null); const [error, setError] = useState('');
  useEffect(() => { if (!activeCanonical) { setLists(null); return; } let live=true; setError(''); Promise.all([loadCandidateList('M1_ITEM_ESTOQUE'),loadCandidateList('M3_MOVIMENTO_VENDAS')]).then(([m1,m3])=>live&&setLists({m1,m3})).catch(e=>live&&setError(String(e))); return()=>{live=false}; },[activeCanonical]);
  if (!activeCanonical) return <PanelPage title="Lançamentos"><PanelEmptyState variant="page" title="Sem bundle canônico ativo" description="Atualize as bases para materializar os lançamentos." /></PanelPage>;
  if (error) return <PanelPage title="Lançamentos"><PanelAlert tone="error">Erro ao carregar lançamentos: {error}</PanelAlert></PanelPage>;
  if (!lists) return <PanelPage title="Lançamentos"><PanelEmptyState variant="page" title="Carregando lançamentos" description="Leitura passiva dos dados canônicos ativos." /></PanelPage>;
  return <ProductCatalogPage m1={lists.m1} m3={lists.m3} launchesOnly />;
}
