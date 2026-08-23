import { useEffect, useMemo, useState } from 'react';
import { DailyMovementChart } from './DailyMovementChart';
import { DailyPositivityChart } from './DailyPositivityChart';
import './charts.css';

type MovementDay = { date:string; invoiced:number; toInvoice:number; total:number; invoicedPositivation:number; totalPositivation:number; };
const WINDOW_DAYS=10;
const WINDOW_STORAGE_KEY='bj_sellout_daily_window_end';
const fmtBRL=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtInt=(value:number)=>Math.round(value||0).toLocaleString('pt-BR');
const fmtDate=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR');
const fmtShortDate=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
function addDays(date:string,amount:number){const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+amount);return value.toISOString().slice(0,10)}
function firstDayOfMonth(date:string){return `${date.slice(0,7)}-01`}
function buildCalendar(data:MovementDay[]){if(!data.length)return [] as MovementDay[];const ordered=[...data].sort((a,b)=>a.date.localeCompare(b.date));const byDate=new Map(ordered.map(item=>[item.date,item]));const monthStart=firstDayOfMonth(ordered[0].date);const latest=ordered[ordered.length-1].date;const minimumWindowStart=addDays(latest,-(WINDOW_DAYS-1));const start=monthStart<minimumWindowStart?monthStart:minimumWindowStart;const days:MovementDay[]=[];for(let cursor=start;cursor<=latest;cursor=addDays(cursor,1)){days.push(byDate.get(cursor)||{date:cursor,invoiced:0,toInvoice:0,total:0,invoicedPositivation:0,totalPositivation:0})}return days}
function readStoredEndDate(){try{return typeof window==='undefined'?'':window.sessionStorage.getItem(WINDOW_STORAGE_KEY)||''}catch{return''}}
function storeEndDate(date:string){try{if(typeof window!=='undefined'&&date)window.sessionStorage.setItem(WINDOW_STORAGE_KEY,date)}catch{/* storage indisponível não quebra a visualização */}}

export function DailyMovementWindow({data}:{data:MovementDay[]}){
 const calendar=useMemo(()=>buildCalendar(data),[data]);
 const latestDate=calendar.length?calendar[calendar.length-1].date:'';
 const maxEnd=Math.max(calendar.length-1,0);
 const minEnd=Math.min(WINDOW_DAYS-1,maxEnd);
 const[selectedEndDate,setSelectedEndDate]=useState(readStoredEndDate);
 const selectedIndex=selectedEndDate?calendar.findIndex(day=>day.date===selectedEndDate):-1;
 const safeEnd=selectedIndex>=minEnd&&selectedIndex<=maxEnd?selectedIndex:maxEnd;
 useEffect(()=>{if(!calendar.length)return;const current=calendar[safeEnd]?.date||latestDate;if(current!==selectedEndDate)setSelectedEndDate(current)},[calendar,latestDate,safeEnd,selectedEndDate]);
 useEffect(()=>{if(selectedEndDate)storeEndDate(selectedEndDate)},[selectedEndDate]);
 if(!calendar.length)return null;
 const startIndex=Math.max(0,safeEnd-(WINDOW_DAYS-1));
 const visible=calendar.slice(startIndex,safeEnd+1);
 const isLatest=safeEnd===maxEnd;
 const isEarliest=safeEnd===minEnd;
 const periodStart=visible[0]?.date||'';
 const periodEnd=visible[visible.length-1]?.date||'';
 const selectEnd=(index:number)=>{const target=Math.min(maxEnd,Math.max(minEnd,index));setSelectedEndDate(calendar[target]?.date||latestDate)};
 const move=(direction:number)=>selectEnd(safeEnd+direction);
 const goCurrent=()=>setSelectedEndDate(latestDate);

 return <div className="chart-window">
  <div className="chart-window-toolbar">
    <div><div className="chart-window-title">Janela sincronizada · {WINDOW_DAYS} dias</div><div className="chart-window-period">{fmtDate(periodStart)} — {fmtDate(periodEnd)}</div></div>
    <div className="chart-window-actions">
      <button type="button" className="chart-nav-button" onClick={()=>move(-1)} disabled={isEarliest} aria-label="Voltar um dia">‹</button>
      <button type="button" className="chart-nav-button" onClick={goCurrent} disabled={isLatest}>Atual</button>
      <button type="button" className="chart-nav-button" onClick={()=>move(1)} disabled={isLatest} aria-label="Avançar um dia">›</button>
    </div>
  </div>
  <div className="chart-pair">
   <div className="chart-stack">
    <MovementPanel eyebrow="MOVIMENTO FINANCEIRO" title="Sell Out diário"><DailyMovementChart data={visible}/></MovementPanel>
    <MovementPanel eyebrow="MOVIMENTO DE POSITIVAÇÃO" title="Clientes positivados por dia"><DailyPositivityChart data={visible}/></MovementPanel>
   </div>
   <div className="chart-daily-table">
    <div className="chart-daily-header"><div className="panel-eyebrow">PLANILHA DIÁRIA</div><div className="panel-section-title">Financeiro + positivação</div><div className="panel-muted" style={{fontSize:'var(--panel-font-caption)',marginTop:3}}>{fmtShortDate(periodStart)} — {fmtShortDate(periodEnd)}</div></div>
    <div className="chart-daily-body"><table className="panel-table"><thead><tr><th>Data</th><th className="is-right">Sell Out</th><th className="is-right">Faturado</th><th className="is-right">A Faturar</th><th className="is-right">Pos. Fat.</th><th className="is-right">Pos. Total</th></tr></thead><tbody>{visible.map(day=><tr key={day.date}><td className="is-strong">{fmtShortDate(day.date)}</td><td className="is-right is-strong">{fmtBRL(day.total)}</td><td className="is-right is-blue">{fmtBRL(day.invoiced)}</td><td className="is-right is-green">{fmtBRL(day.toInvoice)}</td><td className="is-right is-blue">{fmtInt(day.invoicedPositivation)}</td><td className="is-right">{fmtInt(day.totalPositivation)}</td></tr>)}</tbody></table></div>
    <div className="chart-daily-footer"><div className="panel-mini-label">Sell Out da janela</div><div className="panel-mini-value">{fmtBRL(visible.reduce((sum,day)=>sum+day.total,0))}</div></div>
   </div>
  </div>
 </div>;
}

function MovementPanel({eyebrow,title,children}:{eyebrow:string;title:string;children:React.ReactNode}){
 return <div className="chart-panel"><div className="chart-panel-copy"><div className="panel-eyebrow">{eyebrow}</div><div className="chart-panel-title">{title}</div></div>{children}</div>;
}
