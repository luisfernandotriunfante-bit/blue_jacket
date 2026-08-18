# Mapa inicial de células — Painel Sell Out com fórmulas

Fonte: `Painel Sell Out MILENIO-Julho'26 FORMULA.xlsm`, aba `2026-MILENIO`.

Este é o primeiro recorte do mapa solicitado. Valores em cache dependentes de `TODAY()` não são tratados como verdade da competência atual; a fórmula é a evidência principal.

| Célula | Descrição | Fórmula/entrada original | Blue Jacket atual | Situação |
|---|---|---|---|---|
| F3 | Dias úteis | `NETWORKDAYS($G$1,$G$2,$T$2:$T$23)` | `businessDayStats.total` | Regressão por competência pendente |
| F4 | Dias trabalhados | `NETWORKDAYS($G$1,TODAY(),$T$2:$T$23)-1` | `businessDayStats.elapsed` | Divergência potencial identificada; não corrigida sem validar competência/data de corte |
| M3 | Meta venda média diária | `$M$8/$F$3` | meta ÷ dias úteis | Regra equivalente |
| M4 | Venda média diária | `IF($E$39<0,"",$E$39/$F$4)` | Sell Out ÷ dias trabalhados | Regra equivalente, dependente de F4 |
| M5 | Venda média necessária | `IFERROR(($M$8-$M$11)/($F$3-$F$4),"-")` | diferença positiva ÷ dias restantes | Divergência potencial: motor limita valores negativos a zero |
| M8 | Meta T&C | entrada numérica | configuração/meta definida | Precisa ser isolada por competência |
| M9 | Faturado mês | `SUM(F8:F38)` | `sellOut.invoiced` | A comparar com 8022 e planilha da mesma competência |
| M10 | Tendência faturado | `M9/F4*F3` | média faturada × dias úteis | Regra equivalente, dependente de F4 |
| M11 | Sell Out mês | `SUM(E8:E38)` | Faturado + A Faturar | A comparar com 8022 e planilha da mesma competência |
| M12 | Tendência Sell Out | `M11/F4*F3` | média Sell Out × dias úteis | Regra equivalente, dependente de F4 |
| M15 | Mesmo mês ano anterior | `'12.319.Ref25'!$H$2` | histórico 379 | Mapeamento de fonte pendente |
| M16 | Média 3 meses fechados | `'Med3M-12319'!$R$3` | histórico 379 | Mapeamento de meses pendente |
| L19 | Estoque a venda | campo carregado da consulta `303 estoque vlr vda` | soma quantidade × preço de venda da 105 | Regressão de fonte pendente |
| L20 | Cobertura venda | `L19/M16*30` | estoque venda ÷ média 3 meses × 30 | Regra equivalente no total |
| L21 | Carteira a venda | `$L$28*(1+$L$24)` | carteira custo × (1 + markup) | Fórmula comprovada |
| L24 | Acréscimo carteira | entrada `0,31530488350705` | `portfolioSaleMarkup` padrão | Valor exato comprovado |
| L26 | Estoque a custo | `SUM('320ana'!J:J)` | soma quantidade × custo da 105 | Regressão de fonte pendente |
| L27 | Cobertura custo | `L26/M16*30` | estoque custo ÷ média 3 meses × 30 | Regra equivalente no total |
| L28 | Carteira a custo | entrada/resultado carregado `3.252.344,97` no arquivo de referência | soma integral da carteira | Regra de quantidade Order/Bill ainda bloqueada |
| L29 | Estoque + carteira custo | `L26+L28` | estoque custo + carteira custo | Regra equivalente |
| L30 | Cobertura projetada custo | `L29/M16*30` | projetado custo ÷ média 3 meses × 30 | Regra equivalente no total |
| L34 | Positivação | `G40` | CNPJ faturado + adicional a faturar | Regra unitária coberta; regressão de célula pendente |
| L35 | Tendência positivação | `L34/F4*F3` | tendência por dias úteis | Regra equivalente, dependente de F4 |

## Próxima expansão

O mapa ainda precisa incluir movimento diário, linhas, Top 5 redes, equipe completa e todas as abas auxiliares. Cada linha futura deverá registrar valor esperado da competência, valor calculado e diferença.
