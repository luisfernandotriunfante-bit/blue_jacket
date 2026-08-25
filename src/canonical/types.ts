export type ContractType = 'TEXT' | 'CODE_TEXT' | 'DOC_TEXT' | 'CNPJ14_TEXT' | 'GTIN_TEXT' | 'DATE' | 'INTEGER' | 'DECIMAL' | 'CURRENCY_BRL' | 'PERCENT_DECIMAL' | 'ENUM_TEXT' | 'BOOLEAN';

export type AuditSeverity = 'BLOCKED' | 'BLOCKED_DEPENDENT_CALC' | 'WARNING' | 'INFO';
export interface CanonicalAudit { code: string; severity: AuditSeverity; source: string; file: string; message: string; action: string; row?: number; }
export interface RawTyped<T = unknown> { raw: unknown; typed: T | null; }
export interface ParsedSource { source: string; fileName: string; sheet: string; rows: Array<Record<string, RawTyped>>; audits: CanonicalAudit[]; }
export interface CanonicalList { id: 'M1_ITEM_ESTOQUE' | 'M2_CLIENTE_RCA' | 'M3_MOVIMENTO_VENDAS' | 'M4_HISTORICO_TRANSICAO'; records: Array<Record<string, unknown>>; sources: string[]; generatedAt: string; competence: string; snapshotDate: string; warnings: CanonicalAudit[]; errors: CanonicalAudit[]; }
export interface CanonicalBundle { version: 'v1'; generatedAt: string; lists: Record<CanonicalList['id'], CanonicalList>; parsedSources: ParsedSource[]; }
