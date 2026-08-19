import React from 'react';
import type { CanonicalReconciliationCheck, ReconciliationLevel } from '../../domain/canonical';
import {
  RECONCILIATION_LEVEL_DESCRIPTIONS,
  RECONCILIATION_LEVEL_LABELS,
  checksByLevel,
  formatReconciliationValue,
  statusLabel,
  summarizeReconciliation,
} from '../../domain/reconciliationPresentation';
import { PanelCard, PanelSectionHeader } from '../pattern/PanelVisual';

const LEVELS:ReconciliationLevel[]=['INTERNAL','SOURCE','SPREADSHEET'];

function statusColor(status:CanonicalReconciliationCheck['status']){
  if(status==='OK')return'#86efac';
  if(status==='DIVERGENT')return'#fca5a5';
  return'#fcd34d';
}
function statusBorder(status:CanonicalReconciliationCheck['status']){
  if(status==='OK')return'rgba(134,239,172,.16)';
  if(status==='DIVERGENT')return'rgba(248,113,113,.26)';
  return'rgba(245,158,11,.26)';
}
function statusBackground(status:CanonicalReconciliationCheck['status']){
  if(status==='OK')return'rgba(34,197,94,.035)';
  if(status==='DIVERGENT')return'rgba(239,68,68,.055)';
  return'rgba(245,158,11,.055)';
}

export function ReconciliationAuditPanel({checks}:{checks:CanonicalReconciliationCheck[]}){
  const summary=summarizeReconciliation(checks);
  return <PanelCard>
    <PanelSectionHeader
      eyebrow="AUDITORIA AUTOMÁTICA"
      title="Validação em três níveis"
      description="Cada teste mostra a referência usada, o esperado, o calculado, a diferença e o status. Um teste bloqueado nunca é apresentado como OK."
      action={<div className="panel-chips"><span className="panel-badge" style={{color:'#86efac'}}>OK · {summary.ok}</span><span className="panel-badge" style={{color:'#fca5a5'}}>DIVERGENTE · {summary.divergent}</span><span className="panel-badge" style={{color:'#fcd34d'}}>BLOQUEADO · {summary.blocked}</span></div>}
    />
    <div style={{display:'grid',gap:'18px',marginTop:'16px'}}>
      {LEVELS.map(level=>{
        const levelChecks=checksByLevel(checks,level);
        return <section key={level}>
          <div style={{display:'flex',justifyContent:'space-between',gap:'12px',alignItems:'flex-end',marginBottom:'8px'}}>
            <div><div className="panel-eyebrow">{RECONCILIATION_LEVEL_LABELS[level]}</div><div style={{color:'var(--panel-muted)',fontSize:'.69rem',marginTop:'4px'}}>{RECONCILIATION_LEVEL_DESCRIPTIONS[level]}</div></div>
            <span className="panel-badge">{levelChecks.length} TESTE(S)</span>
          </div>
          {levelChecks.length===0?<div style={{padding:'12px',border:'1px dashed rgba(255,255,255,.1)',borderRadius:'10px',color:'var(--panel-muted)',fontSize:'.72rem'}}>Nenhum teste registrado neste nível para a carga atual.</div>:<div className="panel-table-wrap"><table className="panel-table"><thead><tr><th>Teste</th><th>Fonte</th><th className="is-right">Esperado</th><th className="is-right">Calculado</th><th className="is-right">Diferença</th><th>Status</th></tr></thead><tbody>{levelChecks.map(check=><tr key={check.id} style={{background:statusBackground(check.status)}}><td style={{minWidth:'230px'}}><strong style={{color:'var(--panel-text)'}}>{check.label}</strong>{check.note?<div style={{color:check.status==='BLOCKED'?'#fcd34d':'var(--panel-muted)',fontSize:'.66rem',lineHeight:1.35,marginTop:'4px'}}>{check.note}</div>:null}</td><td style={{minWidth:'155px',color:'var(--panel-text-dim)'}}>{check.source}</td><td className="is-right">{formatReconciliationValue(check.expected)}</td><td className="is-right">{formatReconciliationValue(check.calculated)}</td><td className="is-right">{formatReconciliationValue(check.difference)}</td><td><span className="panel-badge" style={{color:statusColor(check.status),borderColor:statusBorder(check.status)}}>{statusLabel(check.status)}</span></td></tr>)}</tbody></table></div>}
        </section>;
      })}
    </div>
  </PanelCard>;
}
