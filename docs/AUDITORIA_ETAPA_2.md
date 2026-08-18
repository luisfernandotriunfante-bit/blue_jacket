# Auditoria Blue Jacket — Etapa 2

Escopo exclusivo: relacionamentos `CNPJ → Premissas → Roteiro → Redes`.

Base: `main` no commit `6871f2bfa818ed9918f7fb1dc5355169082015e8`.

Branch: `agent/auditoria-relacionamentos-etapa-2`.

## Regra aplicada

1. A chave canônica de CNPJ possui 14 dígitos quando a fonte demonstra que o identificador é CNPJ.
2. Perda de zeros pelo Excel é recomposta e registrada; o valor original permanece na auditoria.
3. Identificador de 11 dígitos não é transformado em CNPJ sem evidência. Na Premissas, a própria coluna `TIPO = CNPJ` é evidência; `CPF/CODIGO INVALIDO` permanece ambíguo/inválido.
4. A rede segue a prioridade confirmada: `Premissas → Roteiro → referência → SEM REDE`.
5. Divergências entre fontes ou dentro da mesma fonte não são silenciosas.
6. Tela de clientes, agrupamento de redes e lojas do Roteiro usam a mesma resolução.

## Problemas encontrados e alterações

| Problema | Comportamento anterior | Alteração | Teste | Esperado | Obtido | Diferença |
|---|---|---|---|---:|---:|---:|
| Origem de rede falsificada | Rede da referência era copiada para o mapa de Premissas e aparecia como `PREMISSAS` | Fontes permanecem separadas; a precedência é aplicada somente na resolução | `referência não é rebatizada...` | origem `REFERENCIA` | `REFERENCIA` | 0 |
| CNPJ recomposto sem rastro | `cleanCnpj` devolvia somente o resultado final | Normalização registra original, canônico, estado e motivo | `normalização registra...` | `2318826000200 → 02318826000200` | igual | 0 |
| CPF poderia ser confundido com CNPJ | Tamanho era o único sinal disponível | Premissas usa a coluna `TIPO`; CPF/código inválido permanece explícito | `Premissas usa a coluna TIPO...` | CPF com 11 dígitos preservado | preservado | 0 |
| Cliente e loja podiam usar redes diferentes | Clientes liam só Premissas; lojas tinham regra própria | Ambos usam o mesmo resolvedor canônico | `clientes e lojas usam a mesma resolução...` | mesma rede | mesma rede | 0 |
| Duplicidade/conflito na mesma fonte seria sobrescrito | `Map` mantinha uma linha sem alerta | Índice registra duplicidade e redes conflitantes; linha vazia não apaga rede preenchida | `conflito de rede dentro da mesma fonte...` | conflito visível | conflito visível | 0 |

## Reconciliação com os arquivos reais — 17/08/2026

| Fonte | Linhas | CNPJs únicos | CNPJs da venda encontrados | Valor da venda encontrado |
|---|---:|---:|---:|---:|
| 8022 | 758 | 89 | 89 | R$ 161.480,09 |
| Premissas | 8.516 | 8.516 | 89 | R$ 161.480,09 |
| Roteiro Ativo agosto | 31 | 31 | 0 | R$ 0,00 |
| TOP REDES anterior — referência | 849 | 849 | 19 | R$ 50.693,88 |

O Roteiro de agosto não contém nenhum dos 89 CNPJs com venda na carga atual. Portanto, o fallback por Roteiro está implementado e testado, mas seu valor realizado nessa competência é zero; inventar um vínculo para fazê-lo aparecer seria incorreto.

### Origem efetiva das redes

| Origem | CNPJs | Valor |
|---|---:|---:|
| Premissas | 21 | R$ 58.117,90 |
| Roteiro | 0 | R$ 0,00 |
| Referência | 3 | R$ 3.714,90 |
| Sem Rede | 65 | R$ 99.647,29 |
| **Total** | **89** | **R$ 161.480,09** |

Antes desta etapa, os 3 CNPJs vindos da referência apareciam incorretamente como Premissas. O total oficial com rede continua R$ 61.832,80; somente a rastreabilidade foi corrigida.

## Qualidade de CNPJ encontrada nas fontes

- 8022: 758 ocorrências com 14 dígitos; nenhuma ambígua.
- Premissas: 1.892 ocorrências recompostas com evidência; 1 CPF/ambíguo e 209 códigos já marcados pela fonte como `CPF/CODIGO INVALIDO`.
- Roteiro: 14 ocorrências recompostas; nenhuma ambígua.
- Referência anterior: 457 ocorrências recompostas; 17 de 11 dígitos e 3 de tamanho inválido permanecem ambíguas.
- Nenhum dos 230 identificadores ambíguos/inválidos participa das 89 vendas atuais.
- Não há CNPJ duplicado nem conflito de rede dentro de Premissas, Roteiro ou referência na carga atual.

Essas 230 ocorrências permanecem `DIVERGENT` na auditoria de fonte. Não foram promovidas artificialmente a CNPJ válido.

## Critério de fechamento da etapa

- regra identificada: concluído;
- implementação canônica: concluída;
- testes automatizados: concluídos;
- reconciliação das fontes reais: concluída;
- valor total preservado: R$ 161.480,09;
- divergências de qualidade: visíveis e sem impacto na carga de vendas atual;
- não inclui persistência por competência, estoque, metas nem validação completa do TOP REDES, que pertencem às etapas seguintes.
