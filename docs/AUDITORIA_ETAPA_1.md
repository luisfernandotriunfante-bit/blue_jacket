# Auditoria Blue Jacket — Etapa 1

Base da auditoria: `main` no commit `9ec8e6f459e57f91781aa9f653ca9467afe83a42`.

Branch: `agent/auditoria-reconciliacao-etapa-1`.

## Critério usado

Compilação e consistência interna não provam equivalência com a planilha. A infraestrutura agora separa:

1. `INTERNAL`: identidades dentro da base canônica.
2. `SOURCE`: soma independente da fonte versus motor.
3. `SPREADSHEET`: regressão contra fórmula, célula ou entrada da planilha original.

Cada verificação registra esperado, calculado, diferença, tolerância, status e fonte. Regra não demonstrada fica `BLOCKED`, nunca `OK`.

## Problemas encontrados e alterações

| Problema | Regra comprovada | Antes | Alteração | Teste | Esperado | Obtido | Diferença |
|---|---|---|---|---|---:|---:|---:|
| Venda sumia das redes | Premissas é principal; Roteiro é fallback; sem vínculo deve aparecer como Sem Rede | `buildNetworks` encerrava a linha quando Premissas não tinha rede | Resolução Premissas → Roteiro → referência → Sem Rede, com origem e divergências por CNPJ | `redes usam fallback...` | 600 | 600 | 0 |
| Divergência de rede era silenciosa | Premissas prevalece, mas conflito deve ser alertado | Não havia rastro da fonte escolhida | `networkAssignments` registra origem, rede, valor e fontes divergentes | `fonte de rede segue...` | Premissas + alerta | Premissas + alerta | 0 |
| Deploy sem testes | Deploy somente após typecheck, testes e build | Workflow executava apenas build | GitHub Actions ganhou etapa de testes bloqueante | suíte completa | testes antes do deploy | configurado | — |
| Auditoria comparava resultados derivados do mesmo cálculo | Fonte deve ser somada independentemente | Apenas consistência interna | `sumRawSales8022` soma diretamente as linhas do 8022, sem usar o parser canônico | `soma direta do 8022...` | R$ 1.334,56 | R$ 1.334,56 | R$ 0,00 |
| Carteira sem prova unitária | Caixas × Un/CX = unidades | Apenas total plausível | Teste linha a linha e reconciliação de custo/quantidade | `carteira converte caixas...` | 10 × 12 = 120 | 120 | 0 |
| Sem Winthor sem prova de origem | Só carteira sem correspondência no Cadastro 286 | KPI dependia de `hasWinthor` já calculado | Teste demonstra cadastrado sem estoque = Winthor e material não conciliado = Sem Winthor | `Sem Winthor nasce...` | 1 item | 1 item | 0 |
| Lançamento sem regressão | Exclusivamente Lista Oficial, por EAN | Regra implementada sem teste | Teste de EAN conciliado, duplicado, pendente e produto não listado | `Lançamento vem...` | 2 EANs únicos | 2 | 0 |

## Cobertura criada

- Posição 105 completa e compacta.
- Cadastro 286 completo e compacto.
- Vendas 8022: Faturado, A Faturar, filtro de tipo e CNPJ com zero inicial.
- CNPJ canônico e proteção contra transformar CPF em CNPJ.
- Bússola: somente MCD + Colgate.
- Claudio → Flavio e Thiago da Silva Conegundes → Thiago.
- Carteira: custo integral, caixas → unidades e Sem Winthor.
- Lançamentos exclusivamente por EAN.
- Positivação faturada + adicional a faturar sem duplicar CNPJ.
- Fechamento de vendedores e coordenadores.
- Atribuição e fechamento de redes, incluindo Sem Rede.
- Estrutura dos dois modelos Excel e limpeza Open XML crítica.

## Regras bloqueadas, sem falsa validação

- `BLOQUEADA POR REGRA NÃO CONFIRMADA`: precedência exata entre `Order Qty` e `Bill Qty` na carteira.
- `BLOQUEADA POR REGRA NÃO CONFIRMADA`: regra por produto de cobertura/estoque mínimo e distinção entre Ruptura e Risco de Ruptura.
- `BLOQUEADA POR IMPLEMENTAÇÃO PENDENTE`: redistribuição de Meta Redes Geral após ajuste individual.
- `BLOQUEADA POR REGRESSÃO PENDENTE`: comparação completa célula a célula do Painel e do TOP REDES.

## Descoberta comprovada na planilha fórmula

O acréscimo da carteira não foi inferido pelo total. Na referência, `'2026-MILENIO'!L24` contém o valor numérico `0,31530488350705`, e `L21` usa `L28*(1+L24)`. O sistema mantém esse valor como padrão. Se o usuário alterar o parâmetro, a regressão passa a mostrar divergência em vez de esconder a mudança.

## Checkpoints operacionais

Foi executada a nova rotina `audit:sources` sobre os arquivos operacionais enviados, com referência em 17/08/2026:

| Medida | Fonte direta | Motor | Diferença | Estado |
|---|---:|---:|---:|---|
| Faturado 8022 | R$ 29.167,94 | R$ 29.167,94 | R$ 0,00 | Fonte reconciliada |
| A Faturar 8022 | R$ 132.312,15 | R$ 132.312,15 | R$ 0,00 | Fonte reconciliada |
| Sell Out | R$ 161.480,09 | R$ 161.480,09 | R$ 0,00 | Fonte reconciliada |
| Soma vendedores | R$ 161.480,09 | R$ 161.480,09 | R$ 0,00 | Consistência fechada |
| Soma coordenações | R$ 161.480,09 | R$ 161.480,09 | R$ 0,00 | Consistência fechada |
| Soma redes + Sem Rede | R$ 161.480,09 | R$ 161.480,09 | R$ 0,00 | Consistência fechada |
| Acréscimo carteira | 31,530488350705% (`L24`) | 31,530488350705% | 0 | Planilha reconciliada |

A carga contém 758 movimentos válidos, 89 CNPJs, 29 vendedores e 4 coordenações. Um achado importante permanece aberto: 65 dos 89 CNPJs, somando R$ 99.647,29, não possuem rede em Premissas, Roteiro nem referência. Antes o valor desaparecia do agrupamento; agora fica preservado e alertado em `SEM REDE`. Os R$ 61.832,80 com rede continuam separados para o TOP REDES oficial.

Estoque e carteira reproduziram os checkpoints numéricos anteriores na carga atual, mas continuam checkpoints de investigação até a regressão célula a célula da competência ser concluída. Não foram promovidos automaticamente a “verdade absoluta”.
