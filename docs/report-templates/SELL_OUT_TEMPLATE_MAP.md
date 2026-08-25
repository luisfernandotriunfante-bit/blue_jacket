# Mapa visual — Painel Sell Out

Template visual: `public/templates/painel-sell-out-padrao.xlsx`. O exportador copia somente a aparência e grava valores estáticos já derivados pelo Blue Jacket. O Excel final não contém fórmulas, links, consultas ou dados auxiliares.

| Elemento visual | Aba / célula | Campo do view-model | Formato |
|---|---|---|---|
| Dias com venda | `SELL OUT - Milenio 2026!F3:F4` | `totals.daysWithSales` | inteiro |
| Meta de vendas | `M8` | `totals.salesTarget` | moeda |
| Faturado | `M9` | `totals.invoiced` | moeda |
| A faturar | `M10` | `totals.toInvoice` | moeda |
| Sell Out | `M11` | `totals.realized` | moeda |
| Estoque a venda | `L19` | `stock.atSale` | moeda |
| Estoque a custo | `L26` | `stock.atCost` | moeda |
| Positivação | `L34:L35` | `totals.positivityTarget`, `totals.positiveCustomers` | inteiro |
| Movimento diário | `C8:G38` | `dailyRows` | data/moeda |
| Venda por linha | `J40:N43` | `salesByLine` | moeda/percentual |
| Equipes/RCA | aba visual `EQUIPES` | `vendorRows` | moeda/percentual |

Campos sem valor final formal no bundle — carteira, cobertura e comparativos históricos — ficam limpos. Eles nunca herdam fórmula ou valor do template.
