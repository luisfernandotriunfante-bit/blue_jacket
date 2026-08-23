# Varredura temporária da limpeza

## Imports de módulos canônicos antigos
src/ui/charts/DailyMovementWindow.tsx:8:const WINDOW_STORAGE_KEY='bj_sellout_daily_window_end';
src/services/canonicalEngine.ts:72:  const detectedNetworkTargets = workbooks.has('legacyTopNetworks') ? parseLegacyNetworkTargets(workbooks.get('legacyTopNetworks')!.workbook) : new Map<string, number>(Object.entries(previousSupport.legacyNetworkTargets || {}));
src/services/canonicalEngine.ts:73:  const detectedNetworkOwners = workbooks.has('legacyTopNetworks') ? parseLegacyNetworkOwners(workbooks.get('legacyTopNetworks')!.workbook) : new Map<string, {teamCode:string;vendorCode:string}>(Object.entries(previousSupport.legacyNetworkOwners || {}));
src/services/canonicalEngine.ts:76:  if (!detectedNetworkTargets.size && routeStores.some(store => store.target > 0)) warnings.push('TOP REDES de referência não carregado; a Meta Redes foi preenchida provisoriamente com a Meta Tops do Roteiro Ativo.');
src/services/canonicalEngine.ts:92:  const clients = buildClients(transactions, premisesByCnpj, resolvedRouteStores, detectedClientNetworks); const vendors = buildVendorResults(transactions, rcaByNew, rcaByOld, targets, business); const coordinators = buildCoordinators(vendors); const networks = buildNetworks(transactions, premisesByCnpj, resolvedRouteStores, detectedNetworkTargets, detectedNetworkOwners, detectedClientOwners, detectedClientNetworks); const lines = buildLines(transactions); const daily = buildDaily(transactions,periodStart,periodEnd);
src/services/canonicalEngine.ts:152:  const support: CanonicalSupportData = { rcas: rcas.map(r => ({ ...r })), vendorTargets: targets.map(t => ({ ...t })), clients: resolvedPremises.map(p => ({ ...p })), activeRoute: resolvedRouteStores.map(r => ({ ...r })), legacyNetworkTargets: Object.fromEntries(detectedNetworkTargets.entries()), legacyNetworkOwners: Object.fromEntries(detectedNetworkOwners.entries()), legacyClientNetworks: Object.fromEntries(detectedClientNetworks.entries()), legacyClientOwners: Object.fromEntries(detectedClientOwners.entries()), products: Array.from(priceList.bySku.values()).map(p => ({ ...p })), itemCodes: Array.from(cadastro.byInternal.entries()).map(([internalCode, item]) => ({ internalCode, ...item })) };
src/services/canonicalEngine.ts:160:    networks: networks.map(n => { const manual = config.networkTargets[n.key]; const target = Number.isFinite(manual) ? Math.max(manual, 0) : n.detectedNetworkTarget; return { ...n, networkTarget: target, networkAttainment: target > 0 ? n.total / target : 0, gapToNetworkTarget: Math.max(target - n.total, 0) }; }),
src/services/canonical/support.ts:1:export * from './supportCore';
src/services/canonical/support.ts:4:import { parseCadastro286 as parseCadastro286Core } from './supportCore';
src/services/canonical/aggregate.ts:103:  keys.forEach(key=>{const a=activity.get(key)||{name:key,invoiced:0,toInvoice:0,clients:new Set<string>(),vendors:new Map<string,VendorActivity>()};const stores=storesByNetwork.get(key)||[];const topTarget=stores.reduce((s,store)=>s+store.topTarget,0);const detectedNetworkTarget=detectedTargets.get(key)||topTarget;const total=a.invoiced+a.toInvoice;const dominant=Array.from(a.vendors.entries()).sort(([,left],[,right])=>right.value-left.value)[0];const owner=detectedOwners.get(key);const storeOwners=new Map<string,{weight:number;teamCode:string}>();stores.forEach(store=>{const item=clientOwners.get(store.cnpj);if(!item?.vendorCode)return;const current=storeOwners.get(item.vendorCode)||{weight:0,teamCode:item.teamCode};current.weight+=store.topTarget||1;if(!current.teamCode)current.teamCode=item.teamCode;storeOwners.set(item.vendorCode,current)});const storeOwner=Array.from(storeOwners.entries()).sort(([,left],[,right])=>right.weight-left.weight)[0];const vendorCode=owner?.vendorCode||dominant?.[0]||storeOwner?.[0]||'';const teamCode=owner?.teamCode||dominant?.[1].teamCode||storeOwner?.[1].teamCode||'';networks.push({key,name:a.name,teamCode,vendorCode,detectedNetworkTarget,networkTarget:detectedNetworkTarget,topTarget,invoiced:a.invoiced,toInvoice:a.toInvoice,total,networkAttainment:detectedNetworkTarget>0?total/detectedNetworkTarget:0,topAttainment:topTarget>0?total/topTarget:0,gapToNetworkTarget:Math.max(detectedNetworkTarget-total,0),gapToTopTarget:Math.max(topTarget-total,0),clients:a.clients.size,stores:stores.sort((x,y)=>y.topTarget-x.topTarget||y.total-x.total)})});
src/services/canonical/aggregate.ts:104:  return networks.sort((a,b)=>b.detectedNetworkTarget-a.detectedNetworkTarget||b.total-a.total);
src/services/canonical/supportCore.ts:153:  const rows = sheetRows(workbook, '319');
src/services/documentGenerator.ts:44:    // TOP REDES é uma visão de redes com meta. Venda sem Meta Redes e sem Meta Tops
src/services/documentGenerator.ts:244:  // 319 e 12.326 exigem campos que o estado canônico ainda não preserva
src/services/documentGenerator.ts:248:  workbook.clearRows('319',2,50000,1,19);
src/services/documentGenerator.ts:249:  workbook.clearRows('12.326',2,50000,1,22);
src/services/documentGenerator.ts:251:  // 12.326ana usa somente granularidade item-a-item efetivamente preservada pelo
src/services/documentGenerator.ts:255:  workbook.clearRows('12.326ana',2,50000,1,13);
src/services/documentGenerator.ts:263:  workbook.patchCells('12.326ana',pendingRows,2);
src/services/documentGenerator.ts:274:  workbook.download(`TOP REDES ${parts.monthName}'${parts.shortYear}.xlsx`);
src/services/templateWorkbook.ts:184:    // O TOP REDES pode preencher dezenas de milhares de células na aba oculta
tests/top-networks-export-filter.test.ts:8:test('TOP REDES não exporta rede sem Meta Redes e sem Meta Tops', () => {
tests/top-networks-export-filter.test.ts:14:test('TOP REDES aplica percentual validado em G H K L inclusive em estilo herdado', () => {
tests/definitive-cleanup.test.ts:12:  assert.equal(tokens.includes('--bj-'), false);
tests/definitive-cleanup.test.ts:13:  assert.equal(existsSync('src/ui/primitives/GlassSurface.tsx'), false);
tests/definitive-cleanup.test.ts:25:  assert.equal(config.includes('TOP REDES · Referência legada'), false);
tests/definitive-cleanup.test.ts:29:  assert.equal(canonical.includes('legacyNetworkTargets'), false);
tests/definitive-cleanup.test.ts:30:  assert.equal(canonical.includes('legacyNetworkOwners'), false);
tests/definitive-cleanup.test.ts:33:  assert.equal(canonical.includes('detectedNetworkTarget'), false);
tests/definitive-cleanup.test.ts:51:  assert.equal(dataContext.includes('bj_produtos'), false);
tests/definitive-cleanup.test.ts:52:  assert.equal(dataContext.includes('bj_metricas'), false);
tests/definitive-cleanup.test.ts:53:  assert.equal(dataContext.includes('bj_sellout'), false);
tests/definitive-cleanup.test.ts:60:  assert.equal(existsSync('src/services/legacyStockReport.ts'), false);
tests/definitive-cleanup.test.ts:61:  assert.equal(existsSync('src/services/legacyStockReportSummary.ts'), false);
tests/definitive-cleanup.test.ts:62:  assert.equal(existsSync('src/services/legacyStockReference.ts'), false);
tests/customer-stock-propagation.test.ts:28:    support: { rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {}, products: [], itemCodes: [] },
tests/top-networks-template-format-regression.test.ts:44:test('TOP REDES mantém F com a mesma tipografia/alinhamento estrutural dos demais valores', () => {
tests/top-networks-template-format-regression.test.ts:52:test('TOP REDES mantém G e H como percentual depois da preparação do modelo', () => {
tests/top-networks-template-format-regression.test.ts:62:test('TOP REDES estende a formatação condicional de F G H e não deixa dxf trocar percentual por General', () => {
tests/customer-intelligence-no-fake-tier.test.ts:4:import { parseActiveRoute } from '../src/services/canonical/supportCore.ts';
tests/sellout-daily-window-state.test.ts:8:  assert.match(source,/WINDOW_STORAGE_KEY='bj_sellout_daily_window_end'/);
tests/top-networks-visual-standardization.test.ts:8:test('TOP REDES normaliza todas as linhas de detalhe pelo mesmo estilo-base', () => {
tests/top-networks-visual-standardization.test.ts:16:test('TOP REDES limpa filtros herdados sem remover a estrutura de autofiltro', () => {
tests/combo-client-portfolio.test.ts:3:import { buildComboPortfolioLookup } from '../src/domain/comboClientPortfolio';
tests/receipt-reconciliation.test.ts:12:      rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {},
tests/export-source-blockers.test.ts:7:test('TOP REDES não fabrica dados da aba 319 enquanto os campos fonte permanecem indisponíveis', () => {
tests/export-source-blockers.test.ts:8:  assert.match(generator, /clearRows\('319',2,50000,1,19\)/);
tests/export-source-blockers.test.ts:9:  assert.doesNotMatch(generator, /patchCells\('319'/);
tests/export-source-blockers.test.ts:12:test('TOP REDES não sintetiza pedido\/setor na aba 12.326 a partir de CNPJ e RCA', () => {
tests/unified-architecture.test.ts:22:  assert.match(source, /removeItem\('bj_produtos'\)/);
tests/unified-architecture.test.ts:23:  assert.match(source, /removeItem\('bj_metricas'\)/);
tests/unified-architecture.test.ts:24:  assert.match(source, /removeItem\('bj_sellout'\)/);
tests/unified-architecture.test.ts:25:  assert.match(source, /unifiedStored\?\[\]:readStored<ProdutoEstoque\[]>\('bj_produtos'/);
tests/audit-p0-receipt-pipeline.test.ts:13:      rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {},
tests/customer-intelligence-current-sales.test.ts:24:    support: { products: [], itemCodes, clients: [], activeRoute: [], rcas: [], vendorTargets: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {} },
tests/customer-intelligence-real-sources-integration.test.ts:9:import { parseActiveRoute, parsePremises } from '../src/services/canonical/supportCore.ts';
tests/customer-intelligence-real-sources-integration.test.ts:116:      clients: [], activeRoute: [], rcas: [], vendorTargets: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {},
tests/customer-intelligence-valid-cnpj-only.test.ts:3:import { parsePremises } from '../src/services/canonical/supportCore.ts';
tests/operational-sources.test.ts:92:    support: { itemCodes: [{ internalCode: '565', description: 'Produto A', ean: '', factoryCode: '' }], products: [], rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {} },
tests/templates.test.ts:12:test('modelo TOP REDES preserva todas as abas operacionais',()=>{
tests/templates.test.ts:14:  assert.deepEqual(workbook.SheetNames,['Top Redes','12.326','319','12.326ana','Loja a Loja','redes','Equipe']);
tests/audit-checkpoint-regression.test.ts:17:  const engine=read('src/services/canonicalEngine.ts');
tests/audit-checkpoint-regression.test.ts:26:test('checkpoint: exportação TOP REDES mantém K=REDES, L=TOPS e rede canônica',()=>{
tests/legacy-stock-report.test.ts:6:import { buildLegacyStockReportRows, buildLegacyStockReportXlsx } from '../src/services/legacyStockReport.ts';
tests/legacy-stock-report.test.ts:7:import { summarizeLegacyStockReport } from '../src/services/legacyStockReportSummary.ts';
tests/legacy-stock-report.test.ts:42:      rcas: [], vendorTargets: [], clients: [], activeRoute: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {},
tests/customer-intelligence.test.ts:100:      ], clients: [], activeRoute: [], rcas: [], vendorTargets: [], legacyNetworkTargets: {}, legacyNetworkOwners: {}, legacyClientNetworks: {}, legacyClientOwners: {},
tests/top-networks-model.test.ts:25:test('modelo TOP REDES expõe cabeçalhos e áreas operacionais para auditoria de conteúdo',()=>{
tests/top-networks-model.test.ts:27:  const expected=['Top Redes','12.326','319','12.326ana','Loja a Loja','redes','Equipe'];
tests/top-networks-model.test.ts:66:  assert.match(source,/workbook\.clearRows\('319',2,50000,1,19\)/);
tests/top-networks-model.test.ts:70:test('TOP REDES padroniza percentuais e valores sem substituir o estilo visual das células',()=>{
tests/top-networks-model.test.ts:91:test('TOP REDES exporta vendedor e supervisor no padrão Winthor atual',()=>{
tests/top-networks-model.test.ts:105:  assert.ok(rows('319')>=1);
tests/top-networks-model.test.ts:106:  assert.ok(rows('12.326')>=1);
tests/top-networks-model.test.ts:107:  assert.ok(rows('12.326ana')>=1);
tests/top-networks-model.test.ts:114:test.todo('BLOQUEADA POR FONTE AUSENTE: 12.326 exige número do pedido/setor e demais campos do pedido; o 8022 canônico atual não preserva essa granularidade e não pode agrupar por CNPJ+RCA como substituto exato.');
tests/top-networks-model.test.ts:115:test.todo('BLOQUEADA POR FONTE AUSENTE: 319 possui campos de peso/caixa e outros atributos que precisam de mapeamento explícito da fonte antes de serem reproduzidos como modelo original.');
tests/canonical-persistence-quota.test.ts:18:  assert.equal(safeLocalStorageWrite(storage, 'bj_metricas', '{"ok":true}'), true);
tests/canonical-persistence-quota.test.ts:20:  assert.equal(storage.getItem('bj_metricas'), '{"ok":true}');
scripts/audit-sources.ts:3:import { processCanonicalFiles } from '../src/services/canonicalEngine.ts';
docs/AUDITORIA_ETAPA_1.md:49:- `BLOQUEADA POR REGRESSÃO PENDENTE`: comparação completa célula a célula do Painel e do TOP REDES.
docs/AUDITORIA_ETAPA_1.md:69:A carga contém 758 movimentos válidos, 89 CNPJs, 29 vendedores e 4 coordenações. Um achado importante permanece aberto: 65 dos 89 CNPJs, somando R$ 99.647,29, não possuem rede em Premissas, Roteiro nem referência. Antes o valor desaparecia do agrupamento; agora fica preservado e alertado em `SEM REDE`. Os R$ 61.832,80 com rede continuam separados para o TOP REDES oficial.
docs/VISUAL_STANDARD.md:31:O antigo `GlassSurface` não faz mais parte da arquitetura.
docs/MAPA_CELULAS_PAINEL.md:19:| M15 | Mesmo mês ano anterior | `'12.319.Ref25'!$H$2` | histórico 379 | Mapeamento de fonte pendente |
docs/AUDIT_CHECKPOINT_2026-08-18.md:22:- Premissas, Roteiro e referência TOP REDES separados e rastreáveis;
docs/AUDIT_CHECKPOINT_2026-08-18.md:103:### Etapa 8 — TOP REDES
docs/AUDIT_CHECKPOINT_2026-08-18.md:118:2. **BLOQUEADA POR FONTE AUSENTE** — `12.326` exige PEDIDO/SETOR e outros campos que o estado canônico atual não preserva;
docs/AUDIT_CHECKPOINT_2026-08-18.md:119:3. **BLOQUEADA POR FONTE AUSENTE** — `319` possui peso/caixa e outros atributos ainda sem mapeamento demonstrado;
docs/AUDIT_CHECKPOINT_2026-08-18.md:120:4. **BLOQUEADA POR FONTE AUSENTE** — `12.326ana` não pode certificar número de pedido porque esse dado não existe no estado canônico atual.
docs/AUDIT_CHECKPOINT_2026-08-18.md:143:- percentuais comprovados do TOP REDES;
docs/AUDITORIA_FUNCIONAL.md:7:- `TOP REDES Julho'26.xlsb`: referência do TOP REDES, convertida internamente para `.xlsx` para permitir preenchimento no navegador sem perder o layout.
docs/AUDITORIA_FUNCIONAL.md:16:6. Equipe e código de RCA do TOP REDES são preservados da referência e, na ausência dela, derivados do maior movimento da rede.
docs/AUDITORIA_FUNCIONAL.md:24:14. A rede e o responsável por CNPJ do TOP REDES anterior são preservados. Isso permite conciliar o Roteiro Ativo atual com Meta Redes, Meta Tops, equipe e RCA.
docs/AUDITORIA_FUNCIONAL.md:25:15. Sem um TOP REDES anterior, a Meta Redes recebe provisoriamente a Meta Tops e o painel exibe um aviso de conferência.
docs/AUDITORIA_FUNCIONAL.md:42:### TOP REDES
docs/AUDITORIA_FUNCIONAL.md:52:Os 15 arquivos fornecidos em `AAAAAA.zip` foram processados com o motor canônico, junto da referência `TOP REDES Julho'26.xlsb`.
docs/AUDITORIA_ETAPA_2.md:35:| TOP REDES anterior — referência | 849 | 849 | 19 | R$ 50.693,88 |
docs/AUDITORIA_ETAPA_2.md:70:- não inclui persistência por competência, estoque, metas nem validação completa do TOP REDES, que pertencem às etapas seguintes.

## DataContext projections

## Inline style count por página
src/pages/ClientesSortimentoUnifiedPage.tsx: 8
src/pages/ConfiguracoesPage.tsx: 39
src/pages/CriacaoComboPage.tsx: 25
src/pages/DocumentosPage.tsx: 4
src/pages/EstoquePage.tsx: 18
src/pages/LancamentosPage.tsx: 0
src/pages/MetasPage.tsx: 4
src/pages/SellOutPage.tsx: 8
