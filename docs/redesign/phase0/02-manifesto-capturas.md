# 02 — Manifesto de capturas da baseline

Baseline obrigatória: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`

## Execução oficial de materialização

- Branch de trabalho confirmada antes da alteração: `2a71487748e467dabee6107c551d400a6acb1489`.
- Checkout executado para a coleta: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`.
- Processo exato: `npm ci --cache C:\Users\McdAssistenteCP\AppData\Local\Temp\blue-jacket-npm-cache`; `npm run build`; `npm run dev -- --host 127.0.0.1 --port 4180`.
- Ação exata: abrir `http://127.0.0.1:4180/?run=baseline#sync`, selecionar a aba **Bases**, escolher os arquivos disponíveis em `C:\setembro` e clicar em **PROCESSAR E ATUALIZAR SISTEMA**.
- URL acessada: `http://127.0.0.1:4180/?run=baseline#sync`.
- Resultado do build: sucesso, 115 módulos transformados. A primeira tentativa de `npm ci` falhou com `EPERM` no cache/arquivo nativo; a repetição com cache temporário concluiu com 25 pacotes instalados e 0 vulnerabilidades.
- Resultado do processamento: **12/19** fontes ficaram em staging; `Estoque / logística 8013` foi rejeitada com `PARSER_SCHEMA_CHANGED: Aba esperada: estoque-8013; recebidas: 8013.` e `Vendas 8022` com `PARSER_SCHEMA_CHANGED: Aba esperada: vendas-8022; recebidas: 8022.`
- Fontes ausentes exigidas pelo contrato: `Lista_de_Preco (8).xlsx`, `lançamentos.xlsx`, `Sortimento Recomendado - Q3'26.xlsx`, `Nova Base de Premissas - Q3.xlsx` e `NOVOS RCAS.xlsx`.
- Estado após a operação: **Sem build ativo**; o bundle canônico não foi materializado. A interface não passou a mostrar dados operacionais.

Nenhuma captura foi produzida porque a execução não materializou o bundle canônico nem o estado local/IndexedDB histórico exigido pelas telas. A versão pública atual corresponde à main posterior e **não pode** ser usada como substituta da baseline histórica. Como nenhum PNG foi gerado, não há SHA-256 de captura a registrar.

Status de todas as capturas: **NÃO REPRODUZIDO**.

| Arquivo esperado | Área | Aba | Viewport | Competência exibida | Estado | Dados presentes | Observações / limitação |
|---|---|---|---|---|---|---|---|
| `sellout-resumo-desktop.png` | Sell Out | Resumo | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | Baseline não executada em browser com estado local original |
| `sellout-resumo-reduzido.png` | Sell Out | Resumo | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `sellout-redes-desktop.png` | Sell Out | Redes | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `sellout-redes-reduzido.png` | Sell Out | Redes | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `sellout-gerencial-desktop.png` | Sell Out | Gerencial | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `sellout-gerencial-reduzido.png` | Sell Out | Gerencial | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `pex-desktop.png` | PEX | estado baseline | 1440×900 | N/A | NÃO REPRODUZIDO | N/A | Código indica estado em construção; captura não produzida |
| `pex-reduzido.png` | PEX | estado baseline | 1024×768 | N/A | NÃO REPRODUZIDO | N/A | idem |
| `estoque-visao-geral-desktop.png` | Estoque | Visão Geral | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | Baseline não executada |
| `estoque-visao-geral-reduzido.png` | Estoque | Visão Geral | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `estoque-produtos-desktop.png` | Estoque | Produtos | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `estoque-produtos-reduzido.png` | Estoque | Produtos | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `estoque-lancamentos-desktop.png` | Estoque | Lançamentos | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `estoque-lancamentos-reduzido.png` | Estoque | Lançamentos | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `estoque-entradas-saidas-desktop.png` | Estoque | Entradas e Saídas | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `estoque-entradas-saidas-reduzido.png` | Estoque | Entradas e Saídas | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `atividades-combo-desktop.png` | Atividades | Criação de Combo | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `atividades-combo-reduzido.png` | Atividades | Criação de Combo | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `clientes-visao-geral-desktop.png` | Clientes e Sortimento | Visão Geral | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `clientes-visao-geral-reduzido.png` | Clientes e Sortimento | Visão Geral | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `clientes-sortimento-desktop.png` | Clientes e Sortimento | Sortimento | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `clientes-sortimento-reduzido.png` | Clientes e Sortimento | Sortimento | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `clientes-lancamentos-desktop.png` | Clientes e Sortimento | Lançamentos | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `clientes-lancamentos-reduzido.png` | Clientes e Sortimento | Lançamentos | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `clientes-promocoes-desktop.png` | Clientes e Sortimento | Promoções | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `clientes-promocoes-reduzido.png` | Clientes e Sortimento | Promoções | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `documentos-desktop.png` | Documentos | Documentos | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `documentos-reduzido.png` | Documentos | Documentos | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-bases-desktop.png` | Administração | Bases | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-bases-reduzido.png` | Administração | Bases | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-cadastros-desktop.png` | Administração | Cadastros | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-cadastros-reduzido.png` | Administração | Cadastros | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-metas-desktop.png` | Administração | Metas | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-metas-reduzido.png` | Administração | Metas | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-competencias-desktop.png` | Administração | Competências | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-competencias-reduzido.png` | Administração | Competências | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-auditoria-desktop.png` | Administração | Auditoria | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-auditoria-reduzido.png` | Administração | Auditoria | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-canonical-desktop.png` | Administração | Dados Canônicos | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-canonical-reduzido.png` | Administração | Dados Canônicos | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-sync-desktop.png` | Administração | Sincronização | 1440×900 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |
| `admin-sync-reduzido.png` | Administração | Sincronização | 1024×768 | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | idem |

## Regra para completar posteriormente

Somente capturas executadas a partir do SHA `a6a05a00738585cab2fdeb4596dfdad1e84d02d1` podem preencher este manifesto. Não usar a main atual nem a versão pública posterior como substitutas.
