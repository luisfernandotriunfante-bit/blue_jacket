import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { buildComboClientLookup, extractComboCnpjs, normalizeComboClientCode, normalizeComboCnpj, type ComboClientLookupEntry } from '../domain/comboClients';
import { buildComboPortfolioLookup } from '../domain/comboClientPortfolio';
import { comboDiscount, parseComboPrice, selectComboProducts } from '../domain/comboPricing';
import { matchedStockCodes, normalizeStockCode } from '../domain/stockCodeFilter';
import { buildComboWorkbook, DEFAULT_COMBO_WORKBOOK_OPTIONS, type ComboWorkbookOptions } from '../services/comboWorkbook';
import { useData } from '../store/DataContext';
import { StockCodeListFilter } from '../ui/stock/StockCodeListFilter';
import { PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatCnpj(cnpj: string) {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

export function CriacaoComboPage() {
  const { produtos, canonical } = useData();
  const [importedCodes, setImportedCodes] = useState<Set<string>>(() => new Set());
  const [practicedPrices, setPracticedPrices] = useState<Record<string, string>>({});
  const [clientCnpjs, setClientCnpjs] = useState<Set<string>>(() => new Set());
  const [clientCodeOverrides, setClientCodeOverrides] = useState<Record<string, string>>({});
  const [manualCnpj, setManualCnpj] = useState('');
  const [clientError, setClientError] = useState('');
  const [clientImportName, setClientImportName] = useState('');
  const [portfolioLookup, setPortfolioLookup] = useState<Map<string, ComboClientLookupEntry>>(() => new Map());
  const [portfolioFileName, setPortfolioFileName] = useState('');
  const [portfolioError, setPortfolioError] = useState('');
  const [exportOptions, setExportOptions] = useState<ComboWorkbookOptions>({ ...DEFAULT_COMBO_WORKBOOK_OPTIONS });

  const tableProducts = useMemo(
    () => produtos.filter(product => product.hasWinthor === true && Number.isFinite(product.vendaUnitario) && product.vendaUnitario > 0),
    [produtos],
  );

  const comboProducts = useMemo(
    () => selectComboProducts(tableProducts, importedCodes),
    [tableProducts, importedCodes],
  );

  const matchedImportedCodes = useMemo(
    () => matchedStockCodes(tableProducts, importedCodes),
    [tableProducts, importedCodes],
  );

  const unmatchedCodes = useMemo(
    () => Array.from(importedCodes).filter(code => !matchedImportedCodes.has(code)),
    [importedCodes, matchedImportedCodes],
  );

  const filledCount = useMemo(
    () => comboProducts.filter(product => parseComboPrice(practicedPrices[product.codigo] || '') !== null).length,
    [comboProducts, practicedPrices],
  );

  const clientLookup = useMemo(
    () => buildComboClientLookup(canonical?.transactions || []),
    [canonical],
  );

  const selectedClients = useMemo(() => Array.from(clientCnpjs).map(cnpj => {
    const portfolio = portfolioLookup.get(cnpj);
    const fallback8022 = clientLookup.get(cnpj);
    const lookup = portfolio?.codes.length ? portfolio : fallback8022;
    const hasOverride = Object.prototype.hasOwnProperty.call(clientCodeOverrides, cnpj);
    const automaticCode = lookup?.codes.length === 1 ? lookup.codes[0] : '';
    const rawCode = hasOverride ? clientCodeOverrides[cnpj] : automaticCode;
    const clientCode = normalizeComboClientCode(rawCode);
    const source = hasOverride && clientCode
      ? 'MANUAL'
      : portfolio?.codes.length === 1
        ? 'CARTEIRA'
        : portfolio && portfolio.codes.length > 1
          ? 'CONFLITO CARTEIRA'
          : fallback8022?.codes.length === 1
            ? '8022'
            : fallback8022 && fallback8022.codes.length > 1
              ? 'CONFLITO 8022'
              : 'NÃO LOCALIZADO';
    return {
      cnpj,
      name: portfolio?.name || fallback8022?.name || '',
      clientCode,
      rawCode,
      source,
      possibleCodes: lookup?.codes || [],
    };
  }), [clientCnpjs, clientLookup, clientCodeOverrides, portfolioLookup]);

  const resolvedClientCount = selectedClients.filter(client => Boolean(client.clientCode)).length;
  const unresolvedClientCount = selectedClients.length - resolvedClientCount;
  const needsPracticedPrice = exportOptions.includePracticedPrice || exportOptions.includeDiscount;
  const productsReady = comboProducts.length > 0 && (!needsPracticedPrice || filledCount === comboProducts.length);
  const clientsReady = !exportOptions.includeClients || selectedClients.length > 0;
  const canExport = productsReady && clientsReady;

  const changeImportedCodes = (codes: Set<string>) => {
    setImportedCodes(codes);
  };

  const removeSelectedCode = (code: string) => {
    setImportedCodes(current => {
      const next = new Set(current);
      next.delete(code);
      return next;
    });
  };

  const removeProduct = (product: (typeof comboProducts)[number]) => {
    const aliases = new Set(
      [product.codigo, product.ean, product.factoryCode]
        .map(normalizeStockCode)
        .filter(Boolean),
    );
    setImportedCodes(current => new Set(Array.from(current).filter(code => !aliases.has(normalizeStockCode(code)))));
    setPracticedPrices(current => {
      const next = { ...current };
      delete next[product.codigo];
      return next;
    });
  };

  const updatePracticedPrice = (code: string, value: string) => {
    setPracticedPrices(current => ({ ...current, [code]: value }));
  };

  const clearPrices = () => setPracticedPrices({});

  const updateExportOption = (key: keyof ComboWorkbookOptions, checked: boolean) => {
    setExportOptions(current => ({ ...current, [key]: checked }));
  };

  const addManualClient = () => {
    const cnpj = normalizeComboCnpj(manualCnpj);
    if (!cnpj) {
      setClientError('Informe um CNPJ válido.');
      return;
    }
    setClientCnpjs(current => new Set([...current, cnpj]));
    setManualCnpj('');
    setClientError('');
  };

  const importClients = async (file: File) => {
    try {
      setClientError('');
      let values: unknown[] = [];
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
        const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][] : [];
        values = rows.flat();
      } else {
        values = [await file.text()];
      }

      const imported = extractComboCnpjs(values);
      if (!imported.size) {
        setClientError('Nenhum CNPJ válido foi encontrado no arquivo.');
        setClientImportName('');
        return;
      }
      setClientCnpjs(current => new Set([...current, ...imported]));
      setClientImportName(file.name);
    } catch {
      setClientError('Não foi possível ler a lista de clientes.');
      setClientImportName('');
    }
  };

  const importClientPortfolio = async (file: File) => {
    try {
      setPortfolioError('');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = workbook.SheetNames.flatMap(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        return sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][] : [];
      });
      const lookup = buildComboPortfolioLookup(rows);
      if (!lookup.size) {
        setPortfolioLookup(new Map());
        setPortfolioFileName('');
        setPortfolioError('Não encontrei as colunas Código Cliente e CNPJ nesse relatório.');
        return;
      }
      setPortfolioLookup(lookup);
      setPortfolioFileName(file.name);
    } catch {
      setPortfolioLookup(new Map());
      setPortfolioFileName('');
      setPortfolioError('Não foi possível ler a carteira de clientes.');
    }
  };

  const updateClientCode = (cnpj: string, value: string) => {
    setClientCodeOverrides(current => ({ ...current, [cnpj]: value }));
  };

  const removeClient = (cnpj: string) => {
    setClientCnpjs(current => {
      const next = new Set(current);
      next.delete(cnpj);
      return next;
    });
    setClientCodeOverrides(current => {
      const next = { ...current };
      delete next[cnpj];
      return next;
    });
  };

  const clearClients = () => {
    setClientCnpjs(new Set());
    setClientCodeOverrides({});
    setClientImportName('');
    setClientError('');
  };

  const downloadExcel = () => {
    if (!canExport) return;

    const workbook = buildComboWorkbook(
      comboProducts.map(product => ({
        codigo: product.codigo,
        descricao: product.descricao,
        tablePrice: product.vendaUnitario,
        practicedPrice: parseComboPrice(practicedPrices[product.codigo] || ''),
      })),
      selectedClients.map(client => ({ cnpj: client.cnpj, clientCode: client.clientCode })),
      exportOptions,
    );
    XLSX.writeFile(workbook, 'criacao-de-combo.xlsx');
  };

  if (!tableProducts.length) {
    return (
      <PanelPage title="Criação de Combo">
        <PanelEmptyState
          icon="◆"
          title="Preço de tabela indisponível"
          description="Carregue a Posição 105 e o Cadastro 286 em Configurações. Esta tela usa exclusivamente o preço de venda do 105 como preço de tabela."
        />
      </PanelPage>
    );
  }

  return (
    <PanelPage title="Criação de Combo">
      <div className="panel-stack">
        <PanelCard>
          <PanelSectionHeader
            eyebrow="ATIVIDADES"
            title="Produtos do Combo"
            description="Adicione um EAN, código Winthor ou código de fábrica por vez, ou importe uma lista. O preço de tabela vem exclusivamente da Posição 105."
            action={<span className="panel-badge">PREÇO TABELA · 105</span>}
          />

          <div className="panel-toolbar" style={{ marginBottom: '14px', alignItems: 'center' }}>
            <StockCodeListFilter products={tableProducts} codes={importedCodes} onChange={changeImportedCodes} allowManual />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
              {comboProducts.length > 0 ? <span className="panel-badge">PREÇOS · {filledCount}/{comboProducts.length}</span> : null}
              <button type="button" className="panel-secondary-button" onClick={clearPrices} disabled={filledCount === 0}>Limpar preços</button>
            </div>
          </div>

          <div style={{ color: 'var(--panel-muted)', fontSize: '0.74rem', marginBottom: '16px' }}>
            O desconto é calculado por item como (Preço de Tabela − Preço Praticado) ÷ Preço de Tabela. O preenchimento do preço praticado só será obrigatório se ele ou a % de desconto estiverem marcados para exportação.
          </div>

          {!importedCodes.size ? (
            <PanelEmptyState
              icon="◆"
              title="Adicione ou importe os itens do combo"
              description="Digite um EAN/código e clique em Adicionar item, ou importe TXT, CSV, XLS ou XLSX com os códigos dos produtos."
            />
          ) : (
            <div className="panel-table-wrap">
              <table className="panel-table">
                <thead>
                  <tr>
                    <th>Código / EAN</th>
                    <th>Produto</th>
                    <th className="is-right">Preço de Tabela</th>
                    <th className="is-right">Preço Praticado</th>
                    <th className="is-right">% de Desconto</th>
                    <th className="is-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {comboProducts.map(product => {
                    const practicedRaw = practicedPrices[product.codigo] || '';
                    const practiced = parseComboPrice(practicedRaw);
                    const discount = comboDiscount(product.vendaUnitario, practiced);
                    return (
                      <tr key={product.codigo}>
                        <td className="is-strong">{product.codigo}</td>
                        <td>
                          <div className="is-strong">{product.descricao}</div>
                          {product.ean ? <div className="is-muted" style={{ marginTop: '3px', fontSize: '0.7rem' }}>EAN {product.ean}</div> : null}
                        </td>
                        <td className="is-right is-strong">{formatCurrency(product.vendaUnitario)}</td>
                        <td className="is-right">
                          <input
                            className="panel-input"
                            aria-label={`Preço praticado ${product.codigo}`}
                            inputMode="decimal"
                            value={practicedRaw}
                            placeholder="0,00"
                            onChange={event => updatePracticedPrice(product.codigo, event.target.value)}
                            style={{ width: '132px', minHeight: '34px', textAlign: 'right', padding: '6px 8px' }}
                          />
                        </td>
                        <td className="is-right">
                          {discount === null ? (
                            <span className="is-muted">—</span>
                          ) : (
                            <span className="is-strong" style={{ color: discount >= 0 ? 'var(--panel-text)' : '#fca5a5' }}>{formatPercent(discount)}</span>
                          )}
                        </td>
                        <td className="is-right">
                          <button type="button" className="panel-secondary-button" aria-label={`Excluir item ${product.codigo}`} onClick={() => removeProduct(product)}>Excluir</button>
                        </td>
                      </tr>
                    );
                  })}
                  {unmatchedCodes.map(code => (
                    <tr key={`unmatched-${code}`}>
                      <td className="is-strong">{code}</td>
                      <td>
                        <div className="is-strong" style={{ color: '#fca5a5' }}>Item não encontrado</div>
                        <div className="is-muted" style={{ marginTop: '3px', fontSize: '0.7rem' }}>Revise o EAN/código informado e adicione o correto.</div>
                      </td>
                      <td className="is-right"><span className="is-muted">—</span></td>
                      <td className="is-right"><span className="is-muted">—</span></td>
                      <td className="is-right"><span className="panel-badge panel-badge-amber">NÃO ENCONTRADO</span></td>
                      <td className="is-right">
                        <button type="button" className="panel-secondary-button" aria-label={`Excluir código ${code}`} onClick={() => removeSelectedCode(code)}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader
            eyebrow="EXCEL"
            title="Conteúdo do arquivo"
            description="Marque somente o que você quer levar para o Excel. Código Winthor e descrição do produto ficam sempre na aba Produtos."
            action={<span className="panel-badge">EXPORTAÇÃO PERSONALIZADA</span>}
          />

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {([
              ['includeTablePrice', 'Preço de Tabela'],
              ['includePracticedPrice', 'Preço Praticado'],
              ['includeDiscount', '% de Desconto'],
              ['includeClients', 'Aba Clientes'],
            ] as Array<[keyof ComboWorkbookOptions, string]>).map(([key, label]) => (
              <label key={key} className="panel-secondary-button" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={exportOptions[key]}
                  onChange={event => updateExportOption(key, event.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span className="panel-badge">PRODUTOS · {comboProducts.length}</span>
            {exportOptions.includeClients ? <span className="panel-badge">CLIENTES · {resolvedClientCount}/{selectedClients.length}</span> : <span className="panel-badge">CLIENTES · FORA DO EXCEL</span>}
            <button type="button" className="panel-secondary-button" onClick={downloadExcel} disabled={!canExport} style={{ marginLeft: 'auto' }}>Gerar Excel</button>
          </div>

          {!productsReady && comboProducts.length === 0 ? <div style={{ color: '#fca5a5', fontSize: '0.74rem', marginTop: '12px' }}>Adicione ao menos um produto para gerar o Excel.</div> : null}
          {!productsReady && comboProducts.length > 0 && needsPracticedPrice ? <div style={{ color: '#fca5a5', fontSize: '0.74rem', marginTop: '12px' }}>Como Preço Praticado ou % de Desconto está marcado, preencha o preço praticado de todos os produtos.</div> : null}
          {exportOptions.includeClients && selectedClients.length === 0 ? <div style={{ color: '#fca5a5', fontSize: '0.74rem', marginTop: '12px' }}>A aba Clientes está marcada. Adicione ao menos um cliente ou desmarque essa opção.</div> : null}
          {exportOptions.includeClients && unresolvedClientCount > 0 ? <div style={{ color: '#fca5a5', fontSize: '0.74rem', marginTop: '12px' }}>{unresolvedClientCount} cliente{unresolvedClientCount === 1 ? '' : 's'} sem código Winthor confirmado. O Excel será gerado normalmente e esses códigos ficarão em branco.</div> : null}
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader
            eyebrow="CLIENTES"
            title="Clientes do Combo"
            description="Adicione um CNPJ manualmente ou importe uma lista. O código Winthor é buscado primeiro no Relatório Carteira de Clientes; se não existir lá, o sistema tenta o vínculo do 8022."
            action={<span className="panel-badge">{exportOptions.includeClients ? 'INCLUIR NO EXCEL' : 'FORA DO EXCEL'}</span>}
          />

          <div className="panel-toolbar" style={{ marginBottom: '10px', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <label className="panel-secondary-button" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
              Carregar carteira de clientes
              <input
                aria-label="Carregar relatório carteira de clientes do combo"
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void importClientPortfolio(file);
                  event.target.value = '';
                }}
              />
            </label>
            {portfolioLookup.size > 0 ? <span className="panel-badge" title={portfolioFileName}>CARTEIRA · {portfolioLookup.size} CNPJS</span> : null}
            {portfolioError ? <span style={{ color: '#fca5a5', fontSize: '0.7rem' }}>{portfolioError}</span> : null}
          </div>

          <div className="panel-toolbar" style={{ marginBottom: '14px', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <input
              className="panel-input"
              aria-label="CNPJ do cliente do combo"
              value={manualCnpj}
              placeholder="CNPJ do cliente"
              inputMode="numeric"
              onChange={event => setManualCnpj(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addManualClient();
                }
              }}
              style={{ minWidth: '220px' }}
            />
            <button type="button" className="panel-secondary-button" onClick={addManualClient}>Adicionar CNPJ</button>
            <label className="panel-secondary-button" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
              Importar lista de CNPJs
              <input
                aria-label="Importar lista de CNPJs do combo"
                type="file"
                accept=".txt,.csv,.xlsx,.xls"
                style={{ display: 'none' }}
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void importClients(file);
                  event.target.value = '';
                }}
              />
            </label>
            {clientImportName ? <span className="panel-badge" title={clientImportName}>LISTA IMPORTADA</span> : null}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
              {selectedClients.length > 0 ? <span className="panel-badge">CLIENTES · {resolvedClientCount}/{selectedClients.length} VINCULADOS</span> : null}
              <button type="button" className="panel-secondary-button" onClick={clearClients} disabled={selectedClients.length === 0}>Limpar clientes</button>
            </div>
          </div>

          {clientError ? <div style={{ color: '#fca5a5', fontSize: '0.74rem', marginBottom: '12px' }}>{clientError}</div> : null}
          {exportOptions.includeClients && unresolvedClientCount > 0 ? <div style={{ color: '#fca5a5', fontSize: '0.74rem', marginBottom: '12px' }}>{unresolvedClientCount} cliente{unresolvedClientCount === 1 ? '' : 's'} sem código Winthor confirmado. Você pode corrigir o código manualmente ou gerar o Excel com esse campo em branco.</div> : null}

          {selectedClients.length === 0 ? (
            <PanelEmptyState
              icon="◆"
              title="Vincule os clientes do combo"
              description={exportOptions.includeClients
                ? 'Carregue o Relatório Carteira de Clientes e depois digite um CNPJ ou importe uma lista. Se não quiser clientes no arquivo, desmarque Aba Clientes em Conteúdo do arquivo.'
                : 'A aba Clientes está desmarcada. Você pode deixar esta lista vazia ou montar os clientes agora e marcar a opção depois.'}
            />
          ) : (
            <div className="panel-table-wrap">
              <table className="panel-table">
                <thead>
                  <tr>
                    <th>CNPJ</th>
                    <th>Cliente</th>
                    <th>Código Winthor</th>
                    <th>Origem do vínculo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedClients.map(client => (
                    <tr key={client.cnpj}>
                      <td className="is-strong">{formatCnpj(client.cnpj)}</td>
                      <td>{client.name || <span className="is-muted">—</span>}</td>
                      <td>
                        <input
                          className="panel-input"
                          aria-label={`Código Winthor do cliente ${client.cnpj}`}
                          inputMode="numeric"
                          value={client.rawCode}
                          placeholder="Código Winthor"
                          onChange={event => updateClientCode(client.cnpj, event.target.value)}
                          style={{ width: '150px', minHeight: '34px', padding: '6px 8px' }}
                        />
                        {client.source.startsWith('CONFLITO') ? <div style={{ color: '#fca5a5', fontSize: '0.68rem', marginTop: '4px' }}>Códigos encontrados: {client.possibleCodes.join(', ')}</div> : null}
                      </td>
                      <td>
                        <span className={`panel-badge${client.source === 'CARTEIRA' || client.source === '8022' ? '' : client.clientCode ? '' : ' panel-badge-amber'}`}>{client.source}</span>
                      </td>
                      <td className="is-right"><button type="button" className="panel-secondary-button" onClick={() => removeClient(client.cnpj)}>Remover</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelCard>
      </div>
    </PanelPage>
  );
}
