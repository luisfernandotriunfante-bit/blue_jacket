import * as XLSX from 'xlsx';
import type { CanonicalState } from '../domain/canonical';

export function buildCanonicalNetworkWorkbook(state: CanonicalState): XLSX.WorkBook {
  const networks = state.networks
    .filter(network => network.key !== 'SEM REDE')
    .sort((left, right) => right.networkTarget - left.networkTarget || right.total - left.total);

  const networkRows = networks.map(network => ({
    Rede: network.name,
    'Meta Rede': network.networkTarget,
    'Meta Tops': network.topTarget,
    Faturado: network.invoiced,
    'A Faturar': network.toInvoice,
    'Sell Out': network.total,
    '% Meta Rede': network.networkTarget > 0 ? network.total / network.networkTarget : 0,
    '% Meta Tops': network.topTarget > 0 ? network.total / network.topTarget : 0,
    'Falta Meta Rede': network.gapToNetworkTarget,
    'Falta Meta Tops': network.gapToTopTarget,
    Clientes: network.clients,
  }));

  const storeRows = networks.flatMap(network => network.stores.map(store => ({
    Rede: network.name,
    'Rede Roteiro': store.routeNetwork || '',
    CNPJ: store.cnpj,
    Loja: store.name,
    Fantasia: store.fantasyName,
    Cidade: store.city,
    'CNPJ Gestor': store.managerCnpj,
    Agrupamento: store.groupingCode,
    Categoria: store.tier,
    Tipo: store.storeType,
    'Meta Top': store.topTarget,
    Faturado: store.invoiced,
    'A Faturar': store.toInvoice,
    'Sell Out': store.total,
  })));

  const workbook = XLSX.utils.book_new();
  const networkSheet = XLSX.utils.json_to_sheet(networkRows);
  networkSheet['!cols'] = [
    { wch: 32 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
    { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(workbook, networkSheet, 'Redes');

  const storeSheet = XLSX.utils.json_to_sheet(storeRows);
  storeSheet['!cols'] = [
    { wch: 30 }, { wch: 30 }, { wch: 18 }, { wch: 36 }, { wch: 28 }, { wch: 24 }, { wch: 18 },
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(workbook, storeSheet, 'Lojas');

  const sourceSheet = XLSX.utils.json_to_sheet(state.sources.filter(source => source.loaded).map(source => ({
    Fonte: source.kind,
    Arquivo: source.fileName,
    Linhas: source.rows,
    Atualizado: source.updatedAt,
    Observação: source.note || '',
  })));
  XLSX.utils.book_append_sheet(workbook, sourceSheet, 'Fontes');
  return workbook;
}

export function downloadCanonicalNetworkWorkbook(state: CanonicalState) {
  const workbook = buildCanonicalNetworkWorkbook(state);
  const date = state.referenceDate || new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `Blue-Jacket-Redes-${date}.xlsx`);
}
