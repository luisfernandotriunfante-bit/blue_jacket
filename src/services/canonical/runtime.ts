import type { ProdutoEstoque } from '../../store/DataContext';
import type { CanonicalSalesTransaction, LineName } from '../../domain/canonical';

export type Row = any[];
export type RcaMap = { newCode: string; oldCode: string; name: string; coordinatorCode: string; coordinatorName: string };
export type CompassTarget = { oldCode: string; name: string; supervisorName: string; salesTarget: number; positivityTarget: number };
export type PremiseClient = { cnpj: string; name: string; city: string; network: string; profile: string; isTop: boolean };
export type RouteStore = { cnpj: string; name: string; fantasyName: string; city: string; networkRaw: string; managerCnpj: string; groupingCode: string; tier: string; storeType: string; target: number };
export type ProductMaster = { sku: string; ean: string; description: string; category: string; subcategory: string; brand: string; isLaunch: boolean; boxPrice: number; unitPrice: number; unitsPerCase: number; line: LineName | '' };
export type SalesTransaction = CanonicalSalesTransaction;
export type StockProduct = ProdutoEstoque & { factoryCode?: string; physicalCases?: number; physicalUnits?: number; grossKg?: number };
export const DAY_NAMES = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];
