# Capturas públicas sanitizadas — Fase 0

Baseline: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`

Capturas presentes: **42** (21 desktop 1440×900 + 21 reduzidas 1024×768).

## Estado das capturas

As capturas foram geradas em 2026-09-17 por automação Puppeteer/Chromium sobre worktree isolado do commit `a6a05a0`:

- `git worktree add --detach C:\bj-baseline-wt a6a05a00738585cab2fdeb4596dfdad1e84d02d1`
- Dev server: `npm run dev -- --host 127.0.0.1 --port 4180`
- Automação: Puppeteer 25.11.0 com perfil copiado do Chrome (sem interferência no perfil ativo)

**Bundle canônico:** NÃO ativo nesta sessão. IndexedDB copiado do Chrome não foi reconhecido pelo Chromium. As capturas mostram estados vazios e de loading da baseline, não o estado normal com dados operacionais.

**O que as capturas documentam:** estrutura de navegação, layout, dimensões, tipografia, componentes (sidebar, abas, cabeçalhos, tabelas, cards, menus), estados vazios e mensagens de loading de cada visão na baseline `a6a05a0`. **O que NÃO documentam:** estado normal com M1–M4 carregados, conteúdo de tabelas/listas/KPIs.

As versões brutas privadas correspondentes estão em `C:\bj-phase0-private-evidence\screenshots\raw\` (fora do Git).

## Manifesto público (SHA-256)

| Arquivo | SHA-256 |
|---|---|
| admin-auditoria-desktop.png | `d56d15b8e39a88480666fc07fe004f9b2763f7e211fc8ed241e81e40b8d35f1e` |
| admin-auditoria-reduzido.png | `824c6cbc64b06068fab553eb3984a1f19fc711bb5edbdf35528b3e40553a921e` |
| admin-bases-desktop.png | `557a31eb1fe295409292c144bd266d33947808d68282f6868b67e48d335d14fa` |
| admin-bases-reduzido.png | `9cee4c4d9211deb170ec15b3fbe3de540ebbc6404e04f9cdfc5233e96d5d90f4` |
| admin-cadastros-desktop.png | `e6a567d5f3ca659d4f1a46b4db7a1f69fcd5474d518f8e19de008b9481fb3c72` |
| admin-cadastros-reduzido.png | `7278d87bfc2e9aaabda3707d292d6c7dc390972ab738526a18f4f62047ad8b80` |
| admin-competencias-desktop.png | `61e5f9d0ac66b908781a5357fcb3140bee56d4bcff23febf4559d42a2084261e` |
| admin-competencias-reduzido.png | `a52418a3d7325b44db8d2cd5f834bf487f0f03a7ab162ed2ee3103040fe89cc5` |
| admin-dados-canonicos-desktop.png | `79a2b996ea46f214ecc98784b30f683428153719653882d5a8cc152b4e508311` |
| admin-dados-canonicos-reduzido.png | `78b2483afc69a3550223361bf5b6050426bb7cbc5238251060f2731bb8246c6c` |
| admin-metas-desktop.png | `e0d2a46b989f1a41f68eb957b4d4164e7eacb6f6e1bea46a496c8d2ce90aa034` |
| admin-metas-reduzido.png | `d7ca22d2b7b28b6d0c0b3e3770186a108256dc3756541b219e31e2db18ecd0a4` |
| admin-sincronizacao-desktop.png | `3ccd87695a73807404c1540e483caae854a95f4b14b3f693fb9dfeefb9931b03` |
| admin-sincronizacao-reduzido.png | `f3fe31a0e634a0d8fdc19546b0cb3a461330462f5fed94f2d3acc36d95e2aa04` |
| atividades-combo-desktop.png | `31394b45034878fae63d521661371700a539380b0b86648f9119925f2e1e4f08` |
| atividades-combo-reduzido.png | `16cb0f5576ec886c43f03a3e3cdb2bc9436b97b6f3a099b8de92c176741cbb51` |
| clientes-lancamentos-desktop.png | `41ab98c556fbacaf54bd597224afc1bf592afa4ff8d69a4942ff28f4dace29c9` |
| clientes-lancamentos-reduzido.png | `99d564fc09a7e0439297cc196cc53cd4d1c082f7c53a7d30fe707a6abc0dbe38` |
| clientes-promocoes-desktop.png | `0b09caa1c94a62072757b3e8566cdb8e5cd88ae167dca5d5ff31760ebd04a6cc` |
| clientes-promocoes-reduzido.png | `cccaa29e78692d853229573519ff8bdc433958d95d14acaccf95a9ef44463012` |
| clientes-sortimento-desktop.png | `b690974eea769dcecde2c8c307a5f245f38d6445165d615a238de3335df782d3` |
| clientes-sortimento-reduzido.png | `21bf1bfc39b724d08fe8c2d3b58172c5791a187ab5a5e5885017923c684023a8` |
| clientes-visao-geral-desktop.png | `9c391523e26d62157f7e6693bf13a3e1a1b44b2f960db944b0ce7690a00f7aae` |
| clientes-visao-geral-reduzido.png | `af67d33e9442a0026d9fc6cfa6afd7ae6b3ace19c7513f3997cf17f3646313f0` |
| documentos-desktop.png | `9e6a4d6ac412e45cde67b7dcbd66378a3e8c02cf0c4ec6ca23cb82663a0bf5f8` |
| documentos-reduzido.png | `763ae496994c1027a96411dafc5b88f4075745f6ceed2a33844a5597dd0bb39c` |
| estoque-entradas-saidas-desktop.png | `43b2f9e233e2cf68c83096c1c27e534c0052aac7e73130f98e233448b8d0fba1` |
| estoque-entradas-saidas-reduzido.png | `2849cd8052c8f4419504428e78150d88053b794c60206b119f6cfc6bde0c6858` |
| estoque-lancamentos-desktop.png | `e9d23c14a03a3a93f141ff63717b71715234f06811ab2651269a7e53099ddd9a` |
| estoque-lancamentos-reduzido.png | `f5eaf28f25864fc91f956c68eaf1472aa818ba67f4cb6ca639d7d8573f6f89f6` |
| estoque-produtos-desktop.png | `76d39cc8ec8340054b0a9dd5c6073cbc6650f3c1fe58cce30570b2784843c6f6` |
| estoque-produtos-reduzido.png | `2c35079d732263425a2f2e8ffe7932e9b8296a3c967d26ad77ab673598bf06cd` |
| estoque-visao-geral-desktop.png | `843ac9f495858ebd4fcd2fd9804660efa8e41b67ca943527a4879f1d2e52f721` |
| estoque-visao-geral-reduzido.png | `1b6c3c9c53a8b7c1ad75fd0cf203d05a78561a56dfaaf701fe7b2c9f00b21557` |
| pex-desktop.png | `bd9f7955e7c061172da32c4f209faee6083495c637620bbe38a8bc51541c8366` |
| pex-reduzido.png | `9e5d740f29faf21fecdbe5218c7d435f9b8666691e3db739bb26799e742557fa` |
| sellout-gerencial-desktop.png | `3e8dd9a7b2a8ff5c6f3b534d645635a954985765985a61d848995ca7c5fbcf0f` |
| sellout-gerencial-reduzido.png | `9ce43261369c083d9858ac264ae68d6ea2e2fb5283d2b455509f1ebea0f42158` |
| sellout-redes-desktop.png | `42da430db9c85fb7c3826e40a69811d3642f471fd74b99b7951f9083a1b39fa4` |
| sellout-redes-reduzido.png | `86f5dba20641ee5dfeb3cdc492fa8bd6dae6c59efe226778a4925117d6fa2cc7` |
| sellout-resumo-desktop.png | `28b7d4fef9eecaae4c7f03eef1a1c9614056e73f744be9d05e9433b74c362894` |
| sellout-resumo-reduzido.png | `c47b4c92789543019eb59f2a70fd8f83a00df80c21ce582b9a600836506d1aa4` |

