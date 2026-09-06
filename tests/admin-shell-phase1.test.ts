import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADMIN_TABS, MAIN_SECTIONS, initialNavigationState } from '../src/navigation.ts';
import { CANONICAL_ENGINE_VERSION, REQUIRED_SOURCE_IDS } from '../src/canonical/sourceImport.ts';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('sidebar principal tem exatamente sete módulos na ordem homologada', () => {
  assert.deepEqual(MAIN_SECTIONS.map(item => item.label), ['Sell Out','PEX','Estoque','Atividades','Clientes e Sortimento','Documentos','Administração']);
  assert.equal(MAIN_SECTIONS.length, 7);
  for (const removed of ['Metas', 'Listas Canônicas', 'Auditoria', 'Atualizar Bases']) assert.equal(MAIN_SECTIONS.some(item => item.label === removed), false);
});

test('Administração tem sete abas com ids estáveis e ordem homologada', () => {
  assert.deepEqual(ADMIN_TABS, [
    { id: 'bases', label: 'Bases' }, { id: 'cadastros', label: 'Cadastros' }, { id: 'metas', label: 'Metas' }, { id: 'competencias', label: 'Competências' }, { id: 'auditoria', label: 'Auditoria' }, { id: 'canonical', label: 'Dados Canônicos' }, { id: 'sync', label: 'Sincronização' },
  ]);
});

test('uso normal abre Estoque e deep-link sync abre Administração → Sincronização', () => {
  assert.deepEqual(initialNavigationState(''), { section: 'estoque', adminTab: 'bases' });
  assert.deepEqual(initialNavigationState('#sync=BJ1.workspace.secret'), { section: 'administracao', adminTab: 'sync' });
  assert.deepEqual(initialNavigationState('sync=BJ1.workspace.secret'), { section: 'administracao', adminTab: 'sync' });
});

test('Bases mantém as 19 fontes e não contém implementação de sync ou bundle', () => {
  assert.equal(REQUIRED_SOURCE_IDS.length, 19);
  const bases = source('../src/pages/admin/BasesPage.tsx');
  assert.match(bases, /processSourceUpdates/); assert.match(bases, /REQUIRED_SOURCE_IDS\.map/);
  assert.doesNotMatch(bases, /cloudSync|deviceSync|Bundle Canônico|onBundleImport|recoverTechnicalBundle|persistCanonicalBundle/);
});

test('Sincronização concentra pareamento, restore e Bundle sem tabela principal de fontes', () => {
  const sync = source('../src/pages/admin/SincronizacaoPage.tsx');
  assert.match(sync, /connectDeviceSyncWorkspace/); assert.match(sync, /restoreCurrentDeviceSnapshot/); assert.match(sync, /recoverTechnicalBundle/); assert.match(sync, /Restaurar Bundle Canônico/);
  assert.doesNotMatch(sync, /REQUIRED_SOURCE_IDS|<table|processSourceUpdates/);
});

test('Administração reutiliza os editores e visualizações oficiais sem duplicá-los', () => {
  const admin = source('../src/pages/admin/AdminPage.tsx');
  assert.match(admin, /import \{ MetasPage \} from '\.\.\/MetasPage'/); assert.match(admin, /view === 'metas'\) return <MetasPage \/>/);
  assert.match(admin, /import \{ AuditoriaPage \} from '\.\.\/AuditoriaPage'/); assert.match(admin, /view === 'auditoria'\) return <AuditoriaPage \/>/);
  assert.match(admin, /import \{ ListasCanonicasPage \} from '\.\.\/ListasCanonicasPage'/); assert.match(admin, /view === 'canonical'\) return <ListasCanonicasPage \/>/);
  assert.doesNotMatch(admin, /Meta T&C|Meta Positivação|Meta Redes/);
});

test('deep-link mantém o mesmo hash sync e o shell não usa Configurações como destino', () => {
  const cloudSync = source('../src/canonical/cloudSync.ts'); const main = source('../src/main.tsx');
  assert.match(cloudSync, /url\.hash = `sync=\$\{encodeURIComponent\(pairingCode\(identity\)\)\}`/); assert.match(cloudSync, /new URLSearchParams\(hash\)\.get\('sync'\)/);
  assert.match(main, /initialNavigationState\(window\.location\.hash\)/); assert.match(main, /activeTab === 'administracao'/); assert.doesNotMatch(main, /configuracoes|ConfiguracoesPage/);
});

test('engine canônica evolui para v20 sem alterar o shell homologado da Fase 1', () => {
  assert.equal(CANONICAL_ENGINE_VERSION, 'browser-stage4-product-assortment-v20-targets-by-competence');
});
