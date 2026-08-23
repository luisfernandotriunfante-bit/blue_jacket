import { readFileSync, writeFileSync, rmSync } from 'node:fs';
const path='src/pages/CriacaoComboPage.tsx';
let s=readFileSync(path,'utf8');
const must=(from,to,label)=>{if(!s.includes(from))throw new Error(`Não encontrado: ${label}`);s=s.replace(from,to)};
const regex=(pattern,to,label)=>{if(!pattern.test(s))throw new Error(`Não encontrado: ${label}`);s=s.replace(pattern,to)};

must("import { buildComboPortfolioLookup } from '../domain/comboClientPortfolio';\n",'', 'import portfolio local');
must("import { useData } from '../store/DataContext';\n", "import { useData } from '../store/DataContext';\nimport { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';\n", 'import unified guard');
must("  const { produtos, canonical } = useData();","  const { canonical } = useData();",'context produtos');
regex(/\n\s*const \[portfolioLookup,[\s\S]*?const \[portfolioError, setPortfolioError\] = useState\(''\);/,'','estados portfolio local');
regex(/  const tableProducts = useMemo\([\s\S]*?\n  \);\n\n  const comboProducts/, `  const tableProducts = useMemo(() => (canonical?.inventory || [])
    .filter(product => product.hasWinthor === true && Number.isFinite(product.saleUnit) && product.saleUnit > 0)
    .map(product => ({
      codigo: product.code,
      descricao: product.description,
      ean: product.ean,
      quantidade: product.quantity,
      saldoMinimo: 0,
      custoUnitario: product.costUnit,
      vendaUnitario: product.saleUnit,
      entradas: 0,
      saidas: 0,
      saldoPedido: product.pendingQty,
      saldoPedidoCaixas: product.pendingCases,
      saldoPedidoValorCusto: product.pendingCost,
      saldoPedidoValorVenda: product.pendingSale,
      isLancamento: product.isLaunch,
      hasWinthor: product.hasWinthor,
      factoryCode: product.factoryCode,
      physicalCases: product.physicalCases,
      physicalUnits: product.physicalUnits,
      grossKg: product.grossKg,
    })), [canonical]);

  const comboProducts`, 'tableProducts canonical');
regex(/  const clientLookup = useMemo\([\s\S]*?\n  \);\n\n  const selectedClients/, `  const clientLookup = useMemo(() => {
    const lookup = buildComboClientLookup(canonical?.transactions || []);
    if (canonical && isUnifiedCanonicalState(canonical)) {
      canonical.unified.customers.forEach(customer => {
        const current = lookup.get(customer.cnpj);
        const code = normalizeComboClientCode(customer.winthorCustomerCode);
        lookup.set(customer.cnpj, {
          cnpj: customer.cnpj,
          name: customer.customerName || current?.name || '',
          codes: code ? [code] : current?.codes || [],
        });
      });
    }
    return lookup;
  }, [canonical]);

  const selectedClients`, 'lookup clientes canonical');
regex(/  const selectedClients = useMemo\(\(\) => Array\.from\(clientCnpjs\)\.map\(cnpj => \{[\s\S]*?\}\), \[clientCnpjs, clientLookup, clientCodeOverrides, portfolioLookup\]\);/, `  const selectedClients = useMemo(() => Array.from(clientCnpjs).map(cnpj => {
    const lookup = clientLookup.get(cnpj);
    const hasOverride = Object.prototype.hasOwnProperty.call(clientCodeOverrides, cnpj);
    const automaticCode = lookup?.codes.length === 1 ? lookup.codes[0] : '';
    const rawCode = hasOverride ? clientCodeOverrides[cnpj] : automaticCode;
    const clientCode = normalizeComboClientCode(rawCode);
    const source = hasOverride && clientCode
      ? 'MANUAL'
      : lookup?.codes.length === 1
        ? 'BASE CANÔNICA'
        : lookup && lookup.codes.length > 1
          ? 'CONFLITO CANÔNICO'
          : 'NÃO LOCALIZADO';
    return { cnpj, name: lookup?.name || '', clientCode, rawCode, source, possibleCodes: lookup?.codes || [] };
  }), [clientCnpjs, clientLookup, clientCodeOverrides]);`, 'selected clients canonical');
regex(/\n  const importClientPortfolio = async \(file: File\) => \{[\s\S]*?\n  \};\n/,'\n','função upload carteira local');
regex(/\n\s*<div className="panel-toolbar" style=\{\{ marginBottom: '10px'[\s\S]*?portfolioError[^\n]*\n\s*<\/div>\n/,'\n','toolbar carteira local');

s=s.replaceAll('O preço de tabela vem exclusivamente da Posição 105.','O preço de tabela vem do PVENDA1 canônico da PCTABPR (Região 11).');
s=s.replaceAll('PREÇO TABELA · 105','PREÇO TABELA · PVENDA1');
s=s.replaceAll('Carregue a Posição 105 e o Cadastro 286 em Configurações. Esta tela usa exclusivamente o preço de venda do 105 como preço de tabela.','Carregue PCTABPR e Cadastro 286 em Configurações. Esta tela usa o PVENDA1 canônico da Região 11 como preço de tabela.');
s=s.replaceAll('O código Winthor é buscado primeiro no Relatório Carteira de Clientes; se não existir lá, o sistema tenta o vínculo do 8022.','O código Winthor vem do Customer Master canônico; vínculos observados no 8022 servem apenas como confirmação dentro da mesma base.');
s=s.replaceAll('Carregue o Relatório Carteira de Clientes e depois digite um CNPJ ou importe uma lista.','Digite um CNPJ ou importe uma lista; o vínculo é resolvido pela base canônica carregada em Configurações.');
s=s.replaceAll("client.source === 'CARTEIRA' || client.source === '8022'", "client.source === 'BASE CANÔNICA'");
s=s.replaceAll("client.source.startsWith('CONFLITO')", "client.source === 'CONFLITO CANÔNICO'");
s=s.replace('className="panel-secondary-button" onClick={downloadExcel}', 'className="panel-primary-button" onClick={downloadExcel}');

writeFileSync(path,s,'utf8');
rmSync('scripts/migrate-combo-canonical.mjs');
rmSync('.github/workflows/migrate-combo-canonical.yml');
