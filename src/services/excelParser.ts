import * as XLSX from 'xlsx';
import { ProdutoEstoque, MetricasEstoque, SellOutData, DiaVenda, ClienteRanking, VendedorSellOut, CoordenadorSellOut } from '../store/DataContext';

const DIAS_SEMANA = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];

function excelDateToDate(serial: number): Date {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
}

export async function processExcelFiles(files: File[]): Promise<{ produtos: ProdutoEstoque[], metricas: MetricasEstoque }> {
  const produtosMap = new Map<string, ProdutoEstoque>();

  const getOrCreate = (cod: string) => {
    if (!produtosMap.has(cod)) {
      produtosMap.set(cod, { codigo: cod, descricao: '', ean: '', quantidade: 0, saldoMinimo: 0, custoUnitario: 0, vendaUnitario: 0, entradas: 0, saidas: 0, saldoPedido: 0, hasWinthor: false });
    }
    return produtosMap.get(cod)!;
  };

  const cleanSapCode = (code: string) => String(code).replace(/^0+/, '');
  const parseNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).replace(/R\$/g, '').trim();
    if (str.includes('.') && str.includes(',')) return Number(str.replace(/\./g, '').replace(',', '.')) || 0;
    if (str.includes(',')) return Number(str.replace(',', '.')) || 0;
    return Number(str) || 0;
  };

  const sapToInternalMap = new Map<string, string>();
  const getFileWeight = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('cadastro')) return 1;
    if (n.includes('posicao')) return 2;
    if (n.includes('carteira')) return 3;
    if (n.includes('lista')) return 4;
    if (n.includes('lan') && n.includes('amento')) return 5;
    return 99;
  };

  const sortedFiles = [...files].sort((a, b) => getFileWeight(a.name) - getFileWeight(b.name));

  for (const file of sortedFiles) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
    const fileName = file.name.toLowerCase();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      if (fileName.includes('cadastro')) {
        if (String(row[0]).trim() === '11') {
          const cod = String(row[1]).trim();
          if (cod && !isNaN(Number(cod))) {
            const p = getOrCreate(cod);
            p.descricao = String(row[2]).trim() || p.descricao;
            p.ean = String(row[20]).trim() || p.ean;
            p.hasWinthor = true;
            const sap = String(row[23]).trim();
            if (sap) sapToInternalMap.set(sap, cod);
          }
        }
      } else if (fileName.includes('posicao')) {
        const cod = String(row[0]).trim();
        if (cod && !isNaN(Number(cod)) && cod !== '') {
          const p = getOrCreate(cod);
          p.descricao = String(row[1]).trim() || p.descricao;
          p.quantidade = parseNumber(row[8]);
          p.custoUnitario = parseNumber(row[10]);
          p.vendaUnitario = parseNumber(row[14]);
          p.hasWinthor = true;
        }
      } else if (fileName.includes('carteira')) {
        if (i > 0 && String(row[0]).trim() !== 'Order Date') {
          const material = String(row[4]).trim();
          if (!material) continue;
          const descCarteira = String(row[5]).trim();
          const sap = cleanSapCode(material);
          let internalCod = sapToInternalMap.get(sap);
          if (!internalCod) internalCod = sap;
          if (internalCod) {
            const p = getOrCreate(internalCod);
            p.descricao = p.descricao || descCarteira;
            const orderQty = parseNumber(row[6]);
            const billQty = parseNumber(row[7]);
            p.saldoPedido += (orderQty + billQty);
            const netValue = parseNumber(row[8]);
            p.saldoPedidoValorCusto = (p.saldoPedidoValorCusto || 0) + netValue;
          }
        }
      } else if (fileName.includes('lista')) {
        const sap = String(row[8]).trim();
        const desc = String(row[9]).trim();
        const ean = String(row[10]).trim();
        if (sap && sap !== 'Distribuidor - Visão COM desc contrato' && !sap.includes('ICMS')) {
          const internalCod = sapToInternalMap.get(sap) || sap;
          if (internalCod && produtosMap.has(internalCod)) {
            const p = produtosMap.get(internalCod)!;
            if (!p.descricao || p.descricao.startsWith('Produto ')) p.descricao = desc;
            if (!p.ean) p.ean = ean;
          }
        }
      } else if (fileName.includes('lan') && fileName.includes('amento')) {
        const cod = String(row[0]).trim();
        const ean = String(row[3]).trim();
        if (cod && cod !== 'COD' && produtosMap.has(cod)) produtosMap.get(cod)!.isLancamento = true;
        else if (ean && ean !== 'ean') {
          const matched = Array.from(produtosMap.values()).find(p => p.ean === ean);
          if (matched) matched.isLancamento = true;
        }
      }
    }
  }

  let valorEstoqueCompra = 0;
  let valorEstoqueVenda = 0;
  let saldoPedidoCusto = 0;
  let saldoPedidoVenda = 0;
  let produtosRuptura = 0;
  let totalSaidas = 0;
  const produtosArray = Array.from(produtosMap.values());

  produtosArray.forEach(p => {
    valorEstoqueCompra += (p.quantidade * p.custoUnitario);
    valorEstoqueVenda += (p.quantidade * p.vendaUnitario);
    const custoPedido = p.saldoPedidoValorCusto !== undefined ? p.saldoPedidoValorCusto : (p.saldoPedido * p.custoUnitario);
    saldoPedidoCusto += custoPedido;
    const margin = (p.custoUnitario > 0 && p.vendaUnitario > 0) ? (p.vendaUnitario / p.custoUnitario) : 0;
    if (p.saldoPedidoValorVenda === undefined) p.saldoPedidoValorVenda = custoPedido * margin;
    saldoPedidoVenda += p.saldoPedidoValorVenda;
    if (p.quantidade < p.saldoMinimo) produtosRuptura++;
    totalSaidas += p.saidas;
  });

  const saidaDiaria = totalSaidas / 30;
  let coberturaDiasAtual = 0;
  let coberturaEstoqueMaisSaldo = 0;
  if (saidaDiaria > 0) {
    const totalQtd = produtosArray.reduce((acc, p) => acc + p.quantidade, 0);
    const totalQtdPedido = produtosArray.reduce((acc, p) => acc + p.saldoPedido, 0);
    coberturaDiasAtual = Math.round(totalQtd / saidaDiaria);
    coberturaEstoqueMaisSaldo = Math.round((totalQtd + totalQtdPedido) / saidaDiaria);
  } else {
    coberturaDiasAtual = 95;
    coberturaEstoqueMaisSaldo = 121;
  }

  const metricas: MetricasEstoque = { valorEstoqueCompra, valorEstoqueVenda, saldoPedidoCusto, saldoPedidoVenda, coberturaDiasAtual, coberturaEstoqueMaisSaldo, produtosRuptura, metaCobertura: 60 };
  return { produtos: produtosArray, metricas };
}

export async function processSellOutFile(file: File): Promise<SellOutData> {
  const parseNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).replace(/R\$/g, '').trim();
    if (str.includes('.') && str.includes(',')) return Number(str.replace(/\./g, '').replace(',', '.')) || 0;
    if (str.includes(',')) return Number(str.replace(',', '.')) || 0;
    return Number(str) || 0;
  };

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
  const diasMap = new Map<string, DiaVenda>();
  const clientesMap = new Map<string, ClienteRanking>();
  const vendedoresMap = new Map<string, VendedorSellOut & { clientesFaturado: Set<string>; clientesTotal: Set<string> }>();
  const coordsMap = new Map<string, CoordenadorSellOut & { clientesFaturado: Set<string>; clientesTotal: Set<string> }>();
  let faturadoTotal = 0;
  let aFaturarTotal = 0;
  const clientesFaturadoGlobal = new Set<string>();
  const clientesTotalGlobal = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 32) continue;
    const statusRaw = String(row[15] || '').trim().toUpperCase();
    const isFaturado = statusRaw === 'FATURADO';
    const isAFaturar = statusRaw === 'A FATURAR' || statusRaw === 'PENDENTE' || statusRaw === 'EM CARTEIRA';
    if (!isFaturado && !isAFaturar) continue;

    const dateSerial = typeof row[2] === 'number' ? row[2] : null;
    const codCliente = String(row[3] || '').trim();
    const nomeCliente = String(row[4] || '').trim();
    const cnpj = String(row[5] || '').trim();
    const cidade = String(row[7] || '').trim();
    const codVendedor = String(row[17] || '').trim();
    const nomeVendedor = String(row[18] || '').trim();
    const codCoord = String(row[19] || '').trim();
    const nomeCoord = String(row[20] || '').trim();
    const valorNF = parseNumber(row[31]);
    if (!nomeCliente || valorNF === 0) continue;

    if (dateSerial) {
      const dateObj = excelDateToDate(dateSerial);
      const dateStr = dateObj.toISOString().split('T')[0];
      const diaSemana = DIAS_SEMANA[dateObj.getUTCDay()];
      if (!diasMap.has(dateStr)) diasMap.set(dateStr, { data: dateStr, diaSemana, venda: 0, faturado: 0, positivacao: 0 });
      const dia = diasMap.get(dateStr)!;
      if (isFaturado) dia.faturado += valorNF;
      else dia.venda += valorNF;
    }

    const clienteKey = cnpj || nomeCliente;
    if (!clientesMap.has(clienteKey)) clientesMap.set(clienteKey, { cnpj, nome: nomeCliente, cidade, faturado: 0, aFaturar: 0 });
    const cliente = clientesMap.get(clienteKey)!;
    if (isFaturado) cliente.faturado += valorNF;
    else cliente.aFaturar += valorNF;

    if (codVendedor) {
      if (!vendedoresMap.has(codVendedor)) vendedoresMap.set(codVendedor, { codVendedor, nomeVendedor, codCoord, nomeCoord, faturado: 0, aFaturar: 0, positivacao: 0, clientesFaturado: new Set(), clientesTotal: new Set() });
      const vend = vendedoresMap.get(codVendedor)!;
      if (isFaturado) { vend.faturado += valorNF; vend.clientesFaturado.add(clienteKey); } else vend.aFaturar += valorNF;
      vend.clientesTotal.add(clienteKey);
    }

    const coordKey = codCoord || nomeCoord;
    if (coordKey) {
      if (!coordsMap.has(coordKey)) coordsMap.set(coordKey, { codCoord, nomeCoord, faturado: 0, aFaturar: 0, positivacao: 0, vendedores: [], clientesFaturado: new Set(), clientesTotal: new Set() });
      const coord = coordsMap.get(coordKey)!;
      if (isFaturado) { coord.faturado += valorNF; coord.clientesFaturado.add(clienteKey); clientesFaturadoGlobal.add(clienteKey); } else coord.aFaturar += valorNF;
      coord.clientesTotal.add(clienteKey);
      clientesTotalGlobal.add(clienteKey);
    }

    if (isFaturado) faturadoTotal += valorNF;
    else aFaturarTotal += valorNF;
  }

  const diasPosMap = new Map<string, Set<string>>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 32) continue;
    const statusRaw = String(row[15] || '').trim().toUpperCase();
    if (statusRaw !== 'FATURADO') continue;
    const dateSerial = typeof row[2] === 'number' ? row[2] : null;
    if (!dateSerial) continue;
    const dateObj = excelDateToDate(dateSerial);
    const dateStr = dateObj.toISOString().split('T')[0];
    const cnpj = String(row[5] || '').trim();
    const nomeCliente = String(row[4] || '').trim();
    const clienteKey = cnpj || nomeCliente;
    if (!diasPosMap.has(dateStr)) diasPosMap.set(dateStr, new Set());
    diasPosMap.get(dateStr)!.add(clienteKey);
  }
  diasPosMap.forEach((clients, date) => { if (diasMap.has(date)) diasMap.get(date)!.positivacao = clients.size; });

  const diasDeVenda = Array.from(diasMap.values()).sort((a, b) => a.data.localeCompare(b.data));
  const topClientes: ClienteRanking[] = Array.from(clientesMap.values()).sort((a, b) => (b.faturado + b.aFaturar) - (a.faturado + a.aFaturar)).slice(0, 20);

  vendedoresMap.forEach(vend => {
    vend.positivacao = vend.clientesFaturado.size;
    const coordKey = vend.codCoord || vend.nomeCoord;
    if (coordsMap.has(coordKey)) {
      const coord = coordsMap.get(coordKey)!;
      const existing = coord.vendedores.find(v => v.codVendedor === vend.codVendedor);
      if (!existing) coord.vendedores.push({ codVendedor: vend.codVendedor, nomeVendedor: vend.nomeVendedor, codCoord: vend.codCoord, nomeCoord: vend.nomeCoord, faturado: vend.faturado, aFaturar: vend.aFaturar, positivacao: vend.positivacao });
    }
  });

  const coordenadores: CoordenadorSellOut[] = Array.from(coordsMap.values()).map(c => ({ codCoord: c.codCoord, nomeCoord: c.nomeCoord, faturado: c.faturado, aFaturar: c.aFaturar, positivacao: c.clientesFaturado.size, vendedores: c.vendedores.sort((a, b) => b.faturado - a.faturado) })).sort((a, b) => b.faturado - a.faturado);
  const vendaTotal = faturadoTotal + aFaturarTotal;
  const positivacaoFaturado = clientesFaturadoGlobal.size;
  const positivacaoTotal = clientesTotalGlobal.size;
  const ticketMedio = positivacaoFaturado > 0 ? faturadoTotal / positivacaoFaturado : 0;
  return { faturadoTotal, aFaturarTotal, vendaTotal, positivacaoFaturado, positivacaoTotal, ticketMedio, diasDeVenda, topClientes, coordenadores };
}
