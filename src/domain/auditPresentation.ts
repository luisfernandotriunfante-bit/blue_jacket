import type { CanonicalReconciliationCheck, ReconciliationStatus } from './canonical';
import type { DataQualityIssue, DataQualitySeverity } from './unified';

export interface AuditSourceRequirement {
  id: string;
  label: string;
  required?: boolean;
  loaded: boolean;
}

export interface AuditNotice {
  severity: 'BLOCKED' | 'DIVERGENT' | 'ERROR' | 'WARNING' | 'INFO';
  text: string;
  action: string;
}

export interface QualityIssueSummary {
  key: string;
  code: string;
  severity: DataQualitySeverity;
  message: string;
  source: string;
  count: number;
  entities: string[];
}

const severityRank: Record<DataQualitySeverity, number> = { ERROR: 0, WARNING: 1, INFO: 2 };

export function summarizeQualityIssues(issues: DataQualityIssue[]): QualityIssueSummary[] {
  const grouped = new Map<string, QualityIssueSummary>();
  for (const issue of issues) {
    const key = `${issue.severity}|${issue.code}|${issue.source}|${issue.message}`;
    const current = grouped.get(key);
    const entity = issue.entityKey?.trim();
    if (current) {
      current.count += 1;
      if (entity && !current.entities.includes(entity) && current.entities.length < 5) current.entities.push(entity);
    } else {
      grouped.set(key, { key, code: issue.code, severity: issue.severity, message: issue.message, source: issue.source, count: 1, entities: entity ? [entity] : [] });
    }
  }
  return Array.from(grouped.values()).sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || right.count - left.count || left.code.localeCompare(right.code));
}

function reconciliationAction(check: CanonicalReconciliationCheck) {
  if (check.status === 'BLOCKED') return 'Carregue ou substitua a fonte indicada em Atualizar lote e processe o lote novamente.';
  return 'Confira esperado, calculado e diferença; corrija a origem indicada e processe o lote novamente.';
}

export function buildAuditNotices(args: {
  warnings?: string[];
  checks?: CanonicalReconciliationCheck[];
  qualityIssues?: DataQualityIssue[];
  sources: AuditSourceRequirement[];
}): AuditNotice[] {
  const notices: AuditNotice[] = [];
  for (const source of args.sources) {
    if (source.required && !source.loaded) notices.push({ severity: 'BLOCKED', text: `${source.label}: fonte principal ainda não carregada.`, action: `Carregue ${source.label} em Atualizar lote e processe o arquivo.` });
  }
  for (const check of (args.checks || []).filter(item => item.status !== 'OK')) {
    const severity = check.status as Exclude<ReconciliationStatus, 'OK'>;
    notices.push({ severity, text: `${check.label}: ${check.note || 'o resultado não foi conciliado.'}`, action: reconciliationAction(check) });
  }
  for (const issue of (args.qualityIssues || []).filter(item => item.severity !== 'INFO')) {
    notices.push({ severity: issue.severity, text: `${issue.code}: ${issue.message}`, action: `Revise ${issue.source || 'a fonte indicada'} e reprocesse o lote.` });
  }
  for (const warning of (args.warnings || [])) notices.push({ severity: 'WARNING', text: warning, action: 'Revise a fonte mencionada e processe um lote atualizado em Atualizar lote.' });
  return notices;
}
