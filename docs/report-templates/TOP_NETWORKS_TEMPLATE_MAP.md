# Mapa visual — Top Redes

Template visual: `public/templates/top-redes-padrao.xlsx`.

O arquivo final contém **somente a aba `Top Redes`**. As abas antigas de alimentação foram removidas da saída: não existem abas escondidas, fórmulas, links, consultas ou bases auxiliares.

| Elemento visual | Célula/range | Campo do view-model | Formato |
|---|---|---|---|
| Competência | `B2` | `competence` | texto |
| Meta Redes | `D2` | `totals.networkTarget` | moeda ou `Não configurada` |
| Meta Tops | `E2` | soma de `rows.topTarget` | moeda |
| Faturado | `F2` | `totals.invoiced` | moeda |
| A faturar | `I2` | `totals.toInvoice` | moeda |
| Redes | `A3:M` | `rows` | texto/moeda/percentual |

Com Meta Redes não configurada, o painel apresenta `Não configurada`; nenhum zero é usado como meta real. O painel mostra 24 redes e R$ 354.610,77 para o universo de rede canônica resolvida.
