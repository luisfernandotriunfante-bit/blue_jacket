import type { CanonicalReconciliationCheck, ReconciliationLevel, ReconciliationStatus } from './canonical';

export const RECONCILIATION_LEVEL_LABELS:Record<ReconciliationLevel,string>={
  INTERNAL:'CONSISTÊNCIA INTERNA',
  SOURCE:'RECONCILIAÇÃO DE FONTES',
  SPREADSHEET:'REGRESSÃO CONTRA PLANILHA',
};

export const RECONCILIATION_LEVEL_DESCRIPTIONS:Record<ReconciliationLevel,string>={
  INTERNAL:'Confere identidades e fechamentos entre partes independentes do estado canônico.',
  SOURCE:'Refaz a leitura direta da fonte e compara o resultado com o motor.',
  SPREADSHEET:'Compara o motor com a regra ou célula da planilha de referência quando a fórmula está demonstrada.',
};

export interface ReconciliationSummary { total:number; ok:number; divergent:number; blocked:number; }

export function summarizeReconciliation(checks:CanonicalReconciliationCheck[]):ReconciliationSummary{
  return checks.reduce<ReconciliationSummary>((summary,check)=>{
    summary.total+=1;
    if(check.status==='OK')summary.ok+=1;
    else if(check.status==='DIVERGENT')summary.divergent+=1;
    else summary.blocked+=1;
    return summary;
  },{total:0,ok:0,divergent:0,blocked:0});
}

export function statusLabel(status:ReconciliationStatus):string{
  if(status==='OK')return'OK';
  if(status==='DIVERGENT')return'DIVERGENTE';
  return'BLOQUEADO';
}

export function formatReconciliationValue(value:number|string|null):string{
  if(value===null||value===undefined||value==='')return'—';
  if(typeof value==='string')return value;
  if(!Number.isFinite(value))return String(value);
  return value.toLocaleString('pt-BR',{maximumFractionDigits:6});
}

export function checksByLevel(checks:CanonicalReconciliationCheck[],level:ReconciliationLevel):CanonicalReconciliationCheck[]{
  return checks.filter(check=>check.level===level);
}
