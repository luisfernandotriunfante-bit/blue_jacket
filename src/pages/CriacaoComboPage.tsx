import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { buildComboClientLookup, extractComboCnpjs, normalizeComboClientCode, normalizeComboCnpj, type ComboClientLookupEntry } from '../domain/comboClients';
import { comboDiscount, parseComboPrice, selectComboProducts } from '../domain/comboPricing';
import { matchedStockCodes, normalizeStockCode } from '../domain/stockCodeFilter';
import { buildComboWorkbook, DEFAULT_COMBO_WORKBOOK_OPTIONS, type ComboWorkbookOptions } from '../services/comboWorkbook';
import { useData } from '../store/DataContext';
import { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';
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
  const { canonical } = useData();
  const [importedCodes, setImportedCodes] = useState<Set<string>>(() => new Set());
  const [practicedPrices, setPracticedPrices] = useState<Record<string, string>>({});
  const [clientCnpjs, setClientCnpjs] = useState<Set<string>>(() => new Set());
  const [clientCodeOverrides, setClientCodeOverrides] = useState<Record<string, string>>({});
  const [manualCnpj, setManualCnpj] = useState('');
  const [clientError, setClientError] = useState('');
  const [clientImportName, setClientImportName] = useState('');
  const [exportOptions, setExportOptions] = useState<ComboWorkbookOptions>({ ...DEFAULT_COMBO_WORKBOOK_OPTIONS });

  // Catálogo completo: item conhecido não pode ser confundido com item elegível para o combo.
  // A elegibilidade (Winthor + PVENDA1 região 11) é aplicada por selectComboProducts.
  const tableProducts = useMemo(() => (canonical?.inventory || [])
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

  const comboProducts = useMemo(
    () => selectComboProducts(tableProducts, importedCodes),
    [tableProducts, importedCodes],
  );

  const matchedCatalogCodes = useMemo(
    () => matchedStockCodes(tableProducts, importedCodes),
    [tableProducts, importedCodes],
  );

  const matchedEligibleCodes = useMemo(
    () => matchedStockCodes(comboProducts, importedCodes),
    [comboProducts, importedCodes],
  );

  const unmatchedCodes = useMemo(
    () => Array.from(importedCodes).filter(code => !matchedCatalogCodes.has(code)),
    [importedCodes, matchedCatalogCodes],
  );

  const blockedCodes = useMemo(
    () => Array.from(importedCodes).filter(code => matchedCatalogCodes.has(code) && !matchedEligibleCodes.has(code)),
    [importedCodes, matchedCatalogCodes, matchedEligibleCodes],
  );

  const blockedSelections = useMemo(() => blockedCodes.map(code => {
    const product = tableProducts.find(candidate => matchedStockCodes([candidate], new Set([code])).has(code));
    const reasons: string[] = [];
    if (product && !product.hasWinthor) reasons.push('SEM WINTHOR');
    if (product && (!Number.isFinite(product.vendaUnitario) || product.vendaUnitario <= 0)) reasons.push('SEM PVENDA1 REGIÃO 11');
    return { code, product, reasons };
  }), [blockedCodes, tableProducts]);

  const filledCount = useMemo(
    () => comboProducts.filter(product => parseComboPrice(practicedPrices[product.codigo] || '') !== null).length,
    [comboProducts, practicedPrices],
  );

  const clientLookup = useMemo(() => {
    const observedLookup = buildComboClientLookup(canonical?.transactions || []);
    const lookup = new Map<string, ComboClientLookupEntry & { masterCode: string; observedCodes: string[] }>();
    observedLookup.forEach((entry, cnpj) => lookup.set(cnpj, {
      ...entry,
      masterCode: '',
      observedCodes: [...entry.codes],
    }));

    if (canonical && isUnifiedCanonicalState(canonical)) {
      canonical.unified.customers.forEach(customer => {
        const current = lookup.get(customer.cnpj);
        const masterCode = normalizeComboClientCode(customer.winthorCustomerCode);
        const observedCodes = current?.observedCodes || current?.codes || [];
        lookup.set(customer.cnpj, {
          cnpj: customer.cnpj,
          name: customer.customerName || current?.name || '',
          codes: masterCode ? [masterCode] : observedCodes,
          masterCode,
          observedCodes,
        });
      });
    }
    return lookup;
  }, [canonical]);

  const selectedClients = useMemo(() => Array.from(clientCnpjs).map(cnpj => {
    const lookup = clientLookup.get(cnpj);
    const hasOverride = Object.prototype.hasOwnProperty.call(clientCodeOverrides, cnpj);
    const masterCode = lookup?.masterCode || '';
    const observedCodes = lookup?.observedCodes || [];
    const automaticCode = masterCode || (observedCodes.length === 1 ? observedCodes[0] : '');
    const rawCode = hasOverride ? clientCodeOverrides[cnpj] : automaticCode;
    const clientCode = normalizeComboClientCode(rawCode);
    const masterDiverges = Boolean(masterCode && observedCodes.some(code => code !== masterCode));
    const source = hasOverride
      ? (clientCode ? 'MANUAL' : 'MANUAL · EM BRANCO')
      : masterCode
        ? (masterDiverges ? 'CUSTOMER MASTER · DIVERGE 8022' : 'CUSTOMER MASTER')
        : observedCodes.length === 1
          ? '8022'
          : observedCodes.length > 1
            ? 'CONFLITO 8022'
            : 'NÃO LOCALIZADO';
    return {
      cnpj,
      name: lookup?.name || '',
      clientCode,
      rawCode,
      source,
      possibleCodes: observedCodes,
      masterCode,
    };
  }), [clientCnpjs, clientLookup, clientCodeOverrides]);

  const resolvedClientCount = selectedClients.filter(client => Boolean(client.clientCode)).length;
  const unresolvedClientCount = selectedClients.length - resolvedClientCount;
  const unresolvedProductCount = blockedSelections.length + unmatchedCodes.length;
  const needsPracticedPrice = exportOptions.includePracticedPrice || exportOptions.includeDiscount;
  const productsReady = comboProducts.length > 0
    && unresolvedProductCount === 0
    && (!needsPracticedPrice || filledCount === comboProducts.length);
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
          title="Cadastro de produtos indisponível"
          description="Carregue Cadastro 286 e PCTABPR em Configurações. O combo só exporta itens com código Winthor confirmado e PVENDA1 canônico da Região 11."
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
            description="Adicione um EAN, código Winthor ou código de fábrica por vez, ou importe uma lista. O preço de tabela vem do PVENDA1 canônico da PCTABPR (Região 11)."
            action={<span className="panel-badge">PREÇO TABELA · PVENDA1</span>}
          />

          <div className="panel-toolbar" style={{ marginBottom: '14px', alignItems: 'center' }}>
            <StockCodeListFilter products={tableProducts} codes={importedCodes} onChange={changeImportedCodes} allowManual />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
              {comboProducts.length > 0 ? <span className="panel-badge">PREÇOS · {filledCount}/{comboProducts.length}</span> : null}
              {unresolvedProductCount > 0 ? <span className="panel-badge panel-badge-amber">PENDÊNCIAS · {unresolvedProductCount}</span> : null}
              <button type="button" className="panel-secondary-button" onClick={clearPrices} disabled={filledCount === 0}>Limpar preços</button>
            </div>
          </div>

          <div style={{ color: 'var(--panel-muted)', fontSize: '0.74rem', marginBottom: '16px' }}>
            O desconto é calculado por item como (Preço de Tabela − Preço Praticado) ÷ Preço de Tabela. O preenchimento do preço praticado só será obrigatório se ele ou a % de desconto estiverem marcados para exportação. Um item selecionado sem Winthor, sem PVENDA1 ou não localizado bloqueia o Excel até ser corrigido ou removido.
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

                  {blockedSelections.map(selection => {
                    const product = selection.product;
                    return (
                      <tr key={`blocked-${selection.code}`}>
                        <td className="is-strong">{selection.code}</td>
                        <td>
                          <div className="is-strong" style={{ color: '#fca5a5' }}>{product?.descricao || 'Item conhecido com cadastro incompleto'}</div>
                          <div className="is-muted" style={{ marginTop: '3px', fontSize: '0.7rem' }}>
                            {product?.ean ? `EAN ${product.ean} · ` : ''}{selection.reasons.join(' · ') || 'Item não elegível para exportação'}
                          </div>
                        </td>
                        <td className="is-right">{product && Number.isFinite(product.vendaUnitario) && product.vendaUnitario > 0 ? formatCurrency(product.vendaUnitario) : <span className="is-muted">—</span>}</td>
                        <td className="is-right"><span className="is-muted">—</span></td>
                        <td className="is-right"><span className="panel-badge panel-badge-amber">BLOQUEADO</span></td>
                        <td className="is-right">
                          <button type="button" className="panel-secondary-button" aria-label={`Excluir código ${selection.code}`} onClick={() => removeSelectedCode(selection.code)}>Excluir</button>
                        </td>
                      </tr>
                    );
                  })}

                  {unmatchedCodes.map(code => (
                    <tr key={`unmatched-${code}`}>
                      <td className="is-strong">{code}</td>
                      <td>
                        <div className="is-strong" style={{ color: '#fca5a5' }}>Item não encontrado</div>
                        <div className="is-muted" style={{ marginTop: '3px', fontSize: '0.7rem' }}>O código não existe no catálogo canônico atual. Revise o EAN/código ou remova a pendência.</div>
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
            {unresolvedProductCount > 0 ? <span className="panel-badge panel-badge-amber">PENDÊNCIAS PRODUTO · {unresolvedProductCount}</span> : null}
            {exportOptions.includeClients ? <span className="panel-badge">CLIENTES · {resolvedClientCount}/{selectedClients.length}</span> : <span className="panel-badge">CLIENTES · FORA DO EXCEL</span>}
            <button type="button" className="panel-primary-button" onClick={downloadExcel} disabled={!canExport} style={{ marginLeft: 'auto' }}>Gerar Excel</button>
          </div>

          {unresolvedProductCount > 0 ? <div style={{ color: '#fca5a5', fontSize: '0.74rem', marginTop: '12px' }}>Existem {unresolvedProductCount} item{unresolvedProductCount === 1 ? '' : 's'} selecionado{unresolvedProductCount === 1 ? '' : 's'} sem condição de exportação. Corrija o cadastro/preço ou exclua a pendência antes de gerar o Excel.</div> : null}
          {!productsReady && comboProducts.length === 0 && unresolvedProductCount === 0 ? <div style={{ color: '#fca5a5', fontSize: '0.74rem', marginTop: '12px' }}>Adicione ao menos um produto para gerar o Excel.</div> : null}
          {!productsReady && comboProducts.length > 0 && unresolvedProductCount === 0 && needsPracticedPrice ? <div style={{ color: '#fca5a5', fontSize: '0.74rem', marginTop: '12px' }}>Como Preço Praticado ou % de Desconto está marcado, preencha o preço praticado de todos os produtos.</div> : null}
          {exportOptions.includeClients && selectedClients.length === 0 ? <div style={{ color: '#fca5a5', fontSize: '0.74rem', marginTop: '12px' }}>A aba Clientes está marcada. Adicione ao menos um cliente ou desmarque essa opção.</div> : null}
          {exportOptions.includeClients && unresolvedClientCount > 0 ? <div style={{ color: '#fca5a5', fontSize: '0.74rem', marginTop: '12px' }}>{unresolvedClientCount} cliente{unresolvedClientCount === 1 ? '' : 's'} sem código Winthor confirmado. O Excel será gerado normalmente e esses códigos ficarão em branco.</div> : null}
        </PanelCard>

        <PanelCard>
          <PanelSectionHeader
            eyebrow="CLIENTES"
            title="Clientes do Combo"
            description="Adicione um CNPJ manualmente ou importe uma lista. O Customer Master canônico é a autoridade do código Winthor; vínculos observados no 8022 ficam visíveis como confirmação ou divergência."
            action={<span className="panel-badge">{exportOptions.includeClients ? 'INCLUIR NO EXCEL' : 'FORA DO EXCEL'}</span>}
          />

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
                ? 'Digite um CNPJ ou importe uma lista; o vínculo é resolvido pela base canônica carregada em Configurações. Se não quiser clientes no arquivo, desmarque Aba Clientes em Conteúdo do arquivo.'
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
                  {selectedClients.map(client => {
                    const hasConflict = client.source.includes('DIVERGE') || client.source.includes('CONFLITO');
                    return (
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
                          {client.source === 'CUSTOMER MASTER · DIVERGE 8022' ? <div style={{ color: '#fca5a5', fontSize: '0.68rem', marginTop: '4px' }}>Customer Master: {client.masterCode || '—'} · 8022 observado: {client.possibleCodes.join(', ') || '—'}</div> : null}
                          {client.source === 'CONFLITO 8022' ? <div style={{ color: '#fca5a5', fontSize: '0.68rem', marginTop: '4px' }}>Códigos observados no 8022: {client.possibleCodes.join(', ')}</div> : null}
                        </td>
                        <td>
                          <span className={`panel-badge${hasConflict || !client.clientCode ? ' panel-badge-amber' : ''}`}>{client.source}</span>
                        </td>
                        <td className="is-right"><button type="button" className="panel-secondary-button" onClick={() => removeClient(client.cnpj)}>Remover</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PanelCard>
      </div>
    </PanelPage>
  );
}
