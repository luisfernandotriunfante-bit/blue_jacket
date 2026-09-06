export const MAIN_SECTIONS = [
  { id: 'sellout', label: 'Sell Out' },
  { id: 'pex', label: 'PEX' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'atividades', label: 'Atividades' },
  { id: 'sortimento', label: 'Clientes e Sortimento' },
  { id: 'relatorios', label: 'Documentos' },
  { id: 'administracao', label: 'Administração' },
] as const;

export type MainSectionId = typeof MAIN_SECTIONS[number]['id'];

export const ADMIN_TABS = [
  { id: 'bases', label: 'Bases' },
  { id: 'cadastros', label: 'Cadastros' },
  { id: 'metas', label: 'Metas' },
  { id: 'competencias', label: 'Competências' },
  { id: 'auditoria', label: 'Auditoria' },
  { id: 'canonical', label: 'Dados Canônicos' },
  { id: 'sync', label: 'Sincronização' },
] as const;

export type AdminTabId = typeof ADMIN_TABS[number]['id'];

export function initialNavigationState(hash: string): { section: MainSectionId; adminTab: AdminTabId } {
  const hasSyncDeepLink = new URLSearchParams(hash.replace(/^#/, '')).has('sync');
  return hasSyncDeepLink
    ? { section: 'administracao', adminTab: 'sync' }
    : { section: 'estoque', adminTab: 'bases' };
}
