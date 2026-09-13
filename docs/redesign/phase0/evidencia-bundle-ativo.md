# EVIDÊNCIA REAL COM BUNDLE ATIVO — FASE 0

## 1. ARQUIVOS RECEBIDOS

Origem declarada pelo usuário: diretório `C:\setembro`. Não foi declarada a sessão, competência ou data de geração de cada arquivo; portanto estes arquivos são tratados como **estado observado nesta sessão de correção**, nunca como prova do estado histórico exato `a6a05a0`.

| Arquivo | Tamanho (bytes) | Formato | Origem/data declarada |
|---|---:|---|---|
| `09.26 Roteiro Ativo Top Varejistas Set'26 - Final.xlsx` | 42.533 | XLSX | `C:\setembro`; sessão/competência não informadas |
| `105.xls` | 347.952 | XLS | `C:\setembro`; sessão/competência não informadas |
| `12.322.txt` | 29.584 | TXT | `C:\setembro`; sessão/competência não informadas |
| `218.xls` | 49.776 | XLS | `C:\setembro`; sessão/competência não informadas |
| `286.xls` | 352.936 | XLS | `C:\setembro`; sessão/competência não informadas |
| `310 total 2026.txt` | 18.950.096 | TXT | `C:\setembro`; sessão/competência não informadas |
| `379 25.txt` | 67.515.025 | TXT | `C:\setembro`; sessão/competência não informadas |
| `379 26.txt` | 42.616.399 | TXT | `C:\setembro`; sessão/competência não informadas |
| `8013.xls` | 264.192 | XLS | `C:\setembro`; sessão/competência não informadas |
| `8022.xls` | 1.382.400 | XLS | `C:\setembro`; sessão/competência não informadas |
| `Bussola de Metas SETEMBRO - 2026 - MCD (3).xlsx` | 16.838.575 | XLSX | `C:\setembro`; sessão/competência não informadas |
| `CARTEIRA 31.08.xlsx` | 66.546 | XLSX | `C:\setembro`; sessão/competência não informadas |
| `pctabpr 13.xlsx` | 23.020.763 | XLSX | `C:\setembro`; sessão/competência não informadas |
| `relatorio_carteira_clientes.xls` | 878.592 | XLS | `C:\setembro`; sessão/competência não informadas |
| `teste-8014.xls` | 5.340.672 | XLS | `C:\setembro`; arquivo de teste, finalidade não informada |
| `teste-8022.xls` | 6.110.720 | XLS | `C:\setembro`; arquivo de teste, finalidade não informada |

Hashes SHA-256 calculados fora do Git em `2026-09-12T23:56:59.0751840-04:00`:

| Arquivo | SHA-256 |
|---|---|
| `09.26 Roteiro Ativo Top Varejistas Set'26 - Final.xlsx` | `67583F95431BCAB309A32A4C84450E1B82B9B78F64ED3376C43A222C106025B4` |
| `105.xls` | `FEA47A3DCCA4A7075B8B27853ECB66B31BA561DD2F5B26D933F41EFA7F4C97F9` |
| `12.322.txt` | `6265C976FD16D014AB3CAEF8E2DEF6246F6C29070BAC53082F4ABCF4C9D4DE27` |
| `218.xls` | `0965A32D40A56A6E71B9E71D659CB2A3FE1F149CD7615DB601FE6D59253D4472` |
| `286.xls` | `87AEB31AE787BA6DC227BF9F71241861BD7B1B5A545ABB1C72FA5AA80AEF1BE4` |
| `310 total 2026.txt` | `11749147E3B1145E653C36170715A0F437669DDFF15C0391E8E6EA71453A4199` |
| `379 25.txt` | `254011B6CA6B203C565E0CC7F1362EBFBB204B38064B8BE6B9909A7E2304F402` |
| `379 26.txt` | `FF3A791F09F8C7452B635C0931ACBB28CF10F6FD0377EAE406AB74FA5EA0E2E0` |
| `8013.xls` | `830C0F7E4ECBA2DE599ED52604321BCE92975D41E7E5F55326E76E334C583553` |
| `8022.xls` | `DD17A5C2D2E4705836F0353B6FD474B0CEB8B310C90B4C8506B2E775EA9B554D` |
| `Bussola de Metas SETEMBRO - 2026 - MCD (3).xlsx` | `962132E17EBC38F898A1540DA4832983069F60B856F934BD1FF48B90FC30BC26` |
| `CARTEIRA 31.08.xlsx` | `53629849AD72C067D96ECF7404F482B34AC6417CC68C292C2A979B22A910F934` |
| `pctabpr 13.xlsx` | `8291A864E0DBD7EF3340BF2D6F4B7C9569EEBF7420CC6205EC1113239CB74044` |
| `relatorio_carteira_clientes.xls` | `514BC202EF0C9889AAE683251580CCFC9544DBB034BFB99E30D0196BCE798D80` |
| `teste-8014.xls` | `C8564DCBE882468869469DE147E400AF3A12B9C99C0A89C3E8EB5C78AE7729C3` |
| `teste-8022.xls` | `249D9D0806C21278BEC5CA46CF72F35E4EC36B32586C9970C97A4AB82BF1E9A8` |

## 2. CARGA DO BUNDLE

- Checkout: detached em `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`.
- Instalação/build: `npm ci --cache C:\Users\McdAssistenteCP\AppData\Local\Temp\blue-jacket-npm-cache`; `npm run build`.
- Servidor: `npm run dev -- --host 127.0.0.1 --port 4180`.
- Navegação: `http://127.0.0.1:4180/?run=baseline#sync` → **Bases** → **Selecionar vários arquivos** → arquivos disponíveis em `C:\setembro` → **PROCESSAR E ATUALIZAR SISTEMA**.
- Arquivos aceitos em staging: 12 de 19.
- Rejeições: `8013.xls` — `PARSER_SCHEMA_CHANGED: Aba esperada: estoque-8013; recebidas: 8013.`; `8022.xls` — `PARSER_SCHEMA_CHANGED: Aba esperada: vendas-8022; recebidas: 8022.`
- Ausentes no diretório: `Lista_de_Preco (8).xlsx`, `lançamentos.xlsx`, `Sortimento Recomendado - Q3'26.xlsx`, `Nova Base de Premissas - Q3.xlsx`, `NOVOS RCAS.xlsx`.
- Resultado (bundle ativo?): **não**. A interface permaneceu em **Sem build ativo** e não mostrou KPIs/tabelas operacionais.

## 3. CAPTURAS

As 42 capturas do manifesto permanecem **NÃO REPRODUZIDAS**. O commit, comandos, URL e arquivos usados foram registrados, mas a condição obrigatória “bundle ativo com dados” não foi alcançada. Nenhum PNG foi gerado nesta execução; portanto não existe SHA-256 de captura a registrar.

## 4. NÚMEROS DE REFERÊNCIA

Sell Out, Redes, Estoque, Metas e Auditoria permanecem **NÃO REPRODUZIDOS**. O processamento não ativou o bundle e não forneceu interface operacional com dados. Nenhum valor foi inventado ou copiado de sessão anterior; não há artefato de números nem SHA-256 a registrar.

## 5. COMPETÊNCIAS

`CompetenceState` e `MonthlyClosingState` permanecem **NÃO REPRODUZIDOS**. Não foi possível comprovar 08/2026 fechada nem 09/2026 aberta a partir da execução sem bundle ativo. Não há artefato de estado nem SHA-256 a registrar.

## 6. DESEMPENHO

As três aberturas por tela pesada, medianas, DOM, linhas/cards e observações de rolagem permanecem **NÃO REPRODUZIDAS**. Sem bundle ativo não houve dataset para medir. Não há artefato de medição nem SHA-256 a registrar.

## 7. NOVO ESTADO DO PR

- Commit de partida confirmado antes da coleta: `2a71487748e467dabee6107c551d400a6acb1489`.
- Novo número de commits, verificado após o push do commit de geração: **7** em relação à `origin/main`.
- Novo SHA de tip do commit de geração, confirmado após o push: `4449b8f06671988d242f68c01bf140c822da275c`.
- O registro final desta seção é feito em um commit documental posterior; ele não altera as evidências nem os dados coletados.

## 8. CONFIRMAÇÃO DE INTEGRIDADE

- Nenhum arquivo versionado fora de `docs/redesign/phase0/**` será incluído no commit.
- Nenhum arquivo de dados original/backup será commitado no Git; os arquivos permanecem em `C:\setembro`.
- Nenhum merge foi feito.
- A branch oficial foi restaurada ao tip publicado antes do commit documental.
