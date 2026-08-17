# Auditoria funcional — Planilhas Sell Out

## Referências

- `Painel Sell Out MILENIO-Julho'26 FORMULA.xlsm`: referência de campos e cálculos históricos.
- `Painel Sell Out MILENIO-Julho'26.xlsx`: modelo oficial do Painel Sell Out sem fórmulas.
- `TOP REDES Julho'26.xlsb`: referência do TOP REDES, convertida internamente para `.xlsx` para permitir preenchimento no navegador sem perder o layout.

## Correções aplicadas

1. A geração genérica foi substituída por preenchimento dos modelos oficiais.
2. Fórmulas são removidas na exportação; os arquivos entregues contêm valores estáticos.
3. Logos, estilos, formatos, larguras, alturas, áreas de impressão e nomes de abas são preservados.
4. O contador de dias trabalhados foi limitado à competência. O uso antigo de `TODAY()` fazia julho continuar avançando em agosto e distorcia médias e tendências.
5. O resumo usa as cinco maiores redes; o documento detalhado usa todas as redes.
6. Equipe e código de RCA do TOP REDES são preservados da referência e, na ausência dela, derivados do maior movimento da rede.
7. A consolidação loja a loja deixou de filtrar todas as transações para cada loja; os movimentos são indexados por CNPJ antes da agregação.
8. O movimento diário agora contém todos os dias da competência, inclusive os dias zerados.
9. A data serial do Excel passou a ser convertida sem depender de `XLSX.SSF`, evitando falha no modo ESM/SSR.
10. A meta global usa a Meta PNA Colgate da Bússola quando não existe uma Meta T&C manual.
11. CNPJs são preservados com 14 dígitos, inclusive quando o Excel remove zeros iniciais.
12. A carteira é lida integralmente: linhas abertas e faturadas continuam em trânsito até a entrada física no CD.
13. A Lista de Preços é uma referência Colgate → Milênio e nunca é tratada como preço Milênio → cliente. Ela fornece o fator Un/CX para converter as caixas da carteira em unidades.
14. A rede e o responsável por CNPJ do TOP REDES anterior são preservados. Isso permite conciliar o Roteiro Ativo atual com Meta Redes, Meta Tops, equipe e RCA.
15. Sem um TOP REDES anterior, a Meta Redes recebe provisoriamente a Meta Tops e o painel exibe um aviso de conferência.
16. Tudo que pertence a Claudio é consolidado em Flavio; “Thiago da Silva Conegundes” e “Thiago” formam uma única coordenação.
17. A carteira a venda usa o custo integral acrescido da taxa da planilha-modelo (31,530488350705% por padrão), inclusive para produtos ainda sem código Winthor.
18. Lançamento vem exclusivamente da planilha oficial de lançamentos; “Sem Winthor” vem exclusivamente da carteira quando não há código correspondente no Cadastro 286.

## Saídas do modelo

### Painel Sell Out

- competência, dias úteis, dias trabalhados e atualização;
- Sell Out/Venda, faturado e positivação diária;
- meta, médias, tendência, histórico e necessidade diária;
- estoque a preço de venda e custo, carteira e coberturas;
- resultado das cinco linhas comerciais;
- resumo das cinco maiores redes;
- equipes com metas, realizado, a faturar, gaps e positivação.

### TOP REDES

- todas as redes com equipe, RCA, Meta Redes, Meta Tops, realizado, a faturar e gaps;
- loja a loja;
- cadastro de redes e clientes;
- equipe;
- bases auxiliares estáticas derivadas do estado canônico.

## Validação com a pasta operacional de 17/08/2026

Os 15 arquivos fornecidos em `AAAAAA.zip` foram processados com o motor canônico, junto da referência `TOP REDES Julho'26.xlsb`.

| Confronto | Resultado |
|---|---:|
| Movimentos válidos do 8022 | 758 |
| Faturado | R$ 29.167,94 |
| A faturar | R$ 132.312,15 |
| Sell Out total | R$ 161.480,09 |
| Meta global / Meta PNA | R$ 5.000.000,00 |
| Meta de positivação | 902 |
| Estoque 105 a custo | R$ 12.577.531,96 |
| Estoque 105 a venda | R$ 17.648.185,74 |
| Carteira integral em trânsito a custo | R$ 3.252.344,97 |
| Carteira integral em trânsito a venda | R$ 4.277.825,22 |
| Carteira | 27.676 cx / 549.496 un. |
| Itens da carteira sem Winthor | 4 itens / 608 cx / 17.088 un. |
| Lançamentos oficiais conciliados | 41 de 41 EANs |
| Estoque físico 8013 | 2.227.244 un. / 73.450 cx / 424.624,57 kg |
| Meta Tops do roteiro | R$ 1.175.428,19 |

As somas acima foram refeitas diretamente nas colunas das fontes e coincidem com o estado canônico. As 207 linhas da carteira encontraram fator Un/CX, portanto não ficou nenhuma linha sem conversão. A média correta dos três meses fechados (maio, junho e julho) é R$ 4.298.725,59; com ela, a cobertura resulta em 123 dias no estoque atual e 153 dias com a carteira.
