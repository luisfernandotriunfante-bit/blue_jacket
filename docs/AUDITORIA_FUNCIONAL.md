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
13. A Lista de Preços é uma referência Colgate → Milênio e nunca é tratada como preço Milênio → cliente. A carteira a venda usa somente custo e preço de venda registrados no Winthor.
14. A rede e o responsável por CNPJ do TOP REDES anterior são preservados. Isso permite conciliar o Roteiro Ativo atual com Meta Redes, Meta Tops, equipe e RCA.
15. Sem um TOP REDES anterior, a Meta Redes recebe provisoriamente a Meta Tops e o painel exibe um aviso de conferência.
16. Tudo que pertence a Claudio é consolidado em Flavio; “Thiago da Silva Conegundes” e “Thiago” formam uma única coordenação.

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
| Carteira em trânsito a venda, somente itens valorizáveis no Winthor | R$ 3.189.529,29 |
| Estoque físico 8013 | 2.227.244 un. / 73.450 cx / 424.624,57 kg |
| Meta Tops do roteiro | R$ 1.175.428,19 |

As somas acima foram refeitas diretamente nas colunas das fontes e coincidem com o estado canônico. Permanecem sinalizadas 77 linhas da carteira sem preço de venda Winthor suficiente para valorização; a Lista de Preços Colgate → Milênio não é usada para preencher artificialmente esse valor.
