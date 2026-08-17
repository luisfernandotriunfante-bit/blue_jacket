import React, { useMemo, useRef, useState } from 'react';
import { useData } from '../store/DataContext';
import { processCanonicalFiles } from '../services/canonicalEngine';
import { detectSource } from '../services/canonical/utils';
import type { SourceAudit, SourceKind } from '../domain/canonical';
import { PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

type SourceUi={kind:SourceKind;label:string;description:string;group:'Rotina diária'|'Cadastros de apoio'|'Histórico';required?:boolean};
type ConsistencyCheck={label:string;ok:boolean;detail:string};
const SOURCES:SourceUi[]=[
 {kind:'sales8022',label:'Vendas 8022',description:'Faturado, a faturar, clientes, vendedores e produtos.',group:'Rotina diária',required:true},
 {kind:'stock105',label:'Posição Estoque 105',description:'Estoque financeiro, custo e preço de venda.',group:'Rotina diária',required:true},
 {kind:'purchasePortfolio',label:'Carteira Colgate',description:'Todo o valor ainda em carteira / estoque em trânsito.',group:'Rotina diária',required:true},
 {kind:'stock8013',label:'Estoque 8013',description:'Caixas, unidades e peso para conferência física.',group:'Rotina diária'},
 {kind:'items286',label:'Cadastro 286',description:'Código Winthor, EAN e vínculos operacionais dos itens.',group:'Cadastros de apoio'},
 {kind:'priceList',label:'Lista de Preço',description:'Referência Colgate → Milênio, EANs e classificação; não é preço de venda ao cliente.',group:'Cadastros de apoio'},
 {kind:'launchList',label:'Lista de Lançamentos',description:'Lista oficial: lançamento é identificado exclusivamente pelo EAN.',group:'Cadastros de apoio'},
 {kind:'rcaMap',label:'De-Para RCAs',description:'Código atual, código anterior, vendedor e coordenação.',group:'Cadastros de apoio'},
 {kind:'compassTargets',label:'Bússola de Metas',description:'Metas oficiais de indústria, vendedores e positivação.',group:'Cadastros de apoio'},
 {kind:'premises',label:'Base de Premissas',description:'CNPJ, rede, perfil e identificação de Top Varejista.',group:'Cadastros de apoio'},
 {kind:'activeRoute',label:'Roteiro Ativo',description:'PDVs ativos e Meta Tops oficial do mês.',group:'Cadastros de apoio'},
 {kind:'legacyTopNetworks',label:'TOP REDES · Referência',description:'Ponto de partida das metas operacionais de redes.',group:'Cadastros de apoio'},
 {kind:'history379_2025',label:'Histórico 379 · 2025',description:'Ano anterior completo para comparativos mensais.',group:'Histórico'},
 {kind:'history379_2026',label:'Histórico 379 · 2026',description:'Meses fechados de 2026 para média móvel e cobertura.',group:'Histórico'},
];
const fmtDateTime=(value?:string)=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Nunca carregado';
const fmtSize=(bytes:number)=>bytes<1024?`${bytes} B`:bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;
const brl=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const cnpjKey=(value:string)=>{let digits=String(value||'').replace(/\D/g,'');while(digits.length>14&&digits.startsWith('0'))digits=digits.slice(1);return digits.length>=12&&digits.length<14?digits.padStart(14,'0'):digits};
const closeEnough=(a:number,b:number,tolerance=.02)=>Math.abs(a-b)<=tolerance;

export function ConfiguracoesPage(){
 const{canonical,setCanonical,manualConfig,setProdutos,setMetricas,setSellOut}=useData();
 const[isDragging,setIsDragging]=useState(false);const[isProcessing,setIsProcessing]=useState(false);const[success,setSuccess]=useState(false);const[selectedFiles,setSelectedFiles]=useState<File[]>([]);const[errorMessage,setErrorMessage]=useState('');const fileInputRef=useRef<HTMLInputElement>(null);
 const addFiles=(newFiles:File[])=>{setSuccess(false);setErrorMessage('');setSelectedFiles(prev=>[...prev.filter(p=>!newFiles.some(n=>n.name===p.name)),...newFiles])};
 const removeFile=(name:string)=>setSelectedFiles(prev=>prev.filter(f=>f.name!==name));
 const handleProcess=async()=>{if(!selectedFiles.length)return;setIsProcessing(true);setSuccess(false);setErrorMessage('');try{const result=await processCanonicalFiles(selectedFiles,manualConfig,canonical);setCanonical(result.canonical);setProdutos(result.produtos);setMetricas(result.metricas);setSellOut(result.sellOut);setSuccess(true);setSelectedFiles([])}catch(error){console.error(error);setErrorMessage(error instanceof Error?error.message:'Não foi possível processar os arquivos.')}finally{setIsProcessing(false)}};
 const audits=useMemo(()=>new Map((canonical?.sources||[]).map(source=>[source.kind,source])),[canonical]);
 const queued=useMemo(()=>new Map(selectedFiles.map(file=>[detectSource(file.name),file])),[selectedFiles]);
 const groups=['Rotina diária','Cadastros de apoio','Histórico'] as const;

 const consistency=useMemo<ConsistencyCheck[]>(()=>{
  if(!canonical)return[];
  const checks:ConsistencyCheck[]=[];const add=(label:string,ok:boolean,detail:string)=>checks.push({label,ok,detail});
  const s=canonical.sellOut;
  add('Identidade do Sell Out',closeEnough(s.total,s.invoiced+s.toInvoice),`${brl(s.total)} = faturado ${brl(s.invoiced)} + a faturar ${brl(s.toInvoice)}.`);
  const vendorTotal=canonical.vendors.reduce((sum,v)=>sum+v.total,0);add('Sell Out × vendedores',closeEnough(s.total,vendorTotal),`Painel ${brl(s.total)} · soma dos vendedores ${brl(vendorTotal)} · diferença ${brl(vendorTotal-s.total)}.`);
  const coordinatorTotal=canonical.coordinators.reduce((sum,c)=>sum+c.total,0);add('Vendedores × coordenação',closeEnough(vendorTotal,coordinatorTotal),`Vendedores ${brl(vendorTotal)} · coordenação ${brl(coordinatorTotal)} · diferença ${brl(coordinatorTotal-vendorTotal)}.`);
  const lineTotal=canonical.lines.reduce((sum,line)=>sum+line.total,0);const unclassifiedValue=canonical.transactions.filter(tx=>!tx.line).reduce((sum,tx)=>sum+tx.value,0);add('Sell Out × linhas comerciais',closeEnough(s.total,lineTotal),`Painel ${brl(s.total)} · linhas ${brl(lineTotal)} · sem linha ${brl(unclassifiedValue)}.`);
  const stockCost=canonical.inventory.reduce((sum,p)=>sum+p.quantity*p.costUnit,0);const stockSale=canonical.inventory.reduce((sum,p)=>sum+p.quantity*p.saleUnit,0);add('Estoque financeiro · custo',closeEnough(stockCost,canonical.stock.costValue),`Produtos ${brl(stockCost)} · resumo ${brl(canonical.stock.costValue)}.`);add('Estoque financeiro · venda',closeEnough(stockSale,canonical.stock.saleValue),`Produtos ${brl(stockSale)} · resumo ${brl(canonical.stock.saleValue)}.`);
  const pendingCost=canonical.inventory.reduce((sum,p)=>sum+p.pendingCost,0);add('Carteira · custo',closeEnough(pendingCost,canonical.stock.pendingPurchaseCost),`Produtos ${brl(pendingCost)} · resumo ${brl(canonical.stock.pendingPurchaseCost)}.`);
  const supportCnpj=new Set([...canonical.support.clients.map(c=>cnpjKey(c.cnpj)),...canonical.support.activeRoute.map(c=>cnpjKey(c.cnpj))].filter(Boolean));const txCnpj=new Set(canonical.transactions.map(tx=>cnpjKey(tx.cnpj)).filter(Boolean));const unmapped=[...txCnpj].filter(cnpj=>!supportCnpj.has(cnpj));add('CNPJ × bases de rede',unmapped.length===0,unmapped.length===0?`${txCnpj.size} CNPJs movimentados possuem correspondência em Premissas ou Roteiro.`:`${unmapped.length} de ${txCnpj.size} CNPJs movimentados não aparecem em Premissas nem Roteiro.`);
  const non14=new Set(canonical.transactions.map(tx=>String(tx.cnpj||'').replace(/\D/g,'')).filter(cnpj=>cnpj&&cnpj.length!==14));add('Formato dos CNPJs',non14.size===0,non14.size===0?'Todos os CNPJs das transações estão armazenados com 14 dígitos.':`${non14.size} CNPJs estão armazenados sem 14 dígitos. O cruzamento tolera zeros à esquerda, mas o cadastro deve ser padronizado.`);
  const officialNetworks=canonical.networks.filter(network=>network.detectedNetworkTarget>0);add('Top Redes oficial',officialNetworks.length>0,`${officialNetworks.length} rede(s) possuem meta detectada no TOP REDES anterior ou consolidada pelo Roteiro Ativo; as cinco maiores alimentam o resumo e todas seguem para o arquivo detalhado.`);
  const noWinthor=canonical.inventory.filter(p=>p.hasWinthor===false&&(p.pendingQty>0||p.pendingCost>0)).length;add('Sem Winthor originado da Carteira',true,`${noWinthor} item(ns) da CARTEIRA sem conciliação Winthor. Esse número é informativo e deve ser auditado item a item quando for maior que zero.`);
  return checks;
 },[canonical]);

 return <PanelPage title="Configurações" metricLabel="Fontes registradas" metricValue={`${SOURCES.filter(source=>audits.get(source.kind)?.loaded).length}/${SOURCES.length}`}>
  <PanelCard>
   <PanelSectionHeader eyebrow="ATUALIZAÇÃO" title="Adicionar ou atualizar arquivos" description="Você pode enviar apenas o que mudou. As demais fontes permanecem salvas e mostram abaixo a data da última carga." action={<span className="panel-badge">Aceita Excel e TXT histórico</span>}/>
   <input type="file" multiple accept=".xls,.xlsx,.xlsb,.txt" style={{display:'none'}} ref={fileInputRef} onChange={e=>{if(e.target.files?.length)addFiles(Array.from(e.target.files));e.target.value=''}}/>
   <div className={`panel-dropzone${isDragging?' is-dragging':''}`} onDragOver={e=>{e.preventDefault();setIsDragging(true)}} onDragLeave={e=>{e.preventDefault();setIsDragging(false)}} onDrop={e=>{e.preventDefault();setIsDragging(false);if(e.dataTransfer.files?.length)addFiles(Array.from(e.dataTransfer.files))}} onClick={()=>fileInputRef.current?.click()} style={{marginTop:'16px',minHeight:'118px',cursor:'pointer',display:'grid',placeItems:'center',textAlign:'center',padding:'22px'}}>
    <div><div className="panel-dropzone-icon" style={{margin:'0 auto 8px'}}>⬆</div><strong style={{color:'white'}}>Arraste arquivos aqui ou clique para selecionar</strong><div style={{color:'var(--panel-muted)',fontSize:'0.76rem',marginTop:'5px'}}>Rotina, cadastros mensais e históricos podem ser processados juntos ou separadamente.</div></div>
   </div>
   {selectedFiles.length>0&&<div style={{marginTop:'16px'}}><div className="panel-eyebrow" style={{marginBottom:'9px'}}>NA FILA · {selectedFiles.length}</div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:'10px'}}>{selectedFiles.map(file=>{const source=SOURCES.find(item=>item.kind===detectSource(file.name));return <div key={file.name} style={{padding:'12px 14px',border:'1px solid rgba(239,51,64,.24)',borderRadius:'12px',background:'rgba(239,51,64,.045)',display:'grid',gridTemplateColumns:'1fr auto',gap:'12px',alignItems:'center'}}><div style={{minWidth:0}}><div style={{color:'var(--panel-red)',fontSize:'.7rem',fontWeight:800}}>{source?.label||'Arquivo não identificado'}</div><div style={{color:'white',fontSize:'.78rem',marginTop:'3px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</div><div style={{color:'var(--panel-muted)',fontSize:'.66rem',marginTop:'3px'}}>{fmtSize(file.size)}</div></div><button className="panel-icon-button" onClick={e=>{e.stopPropagation();removeFile(file.name)}}>✕</button></div>})}</div></div>}
   <div style={{display:'flex',gap:'12px',alignItems:'center',marginTop:'16px',flexWrap:'wrap'}}><button className="panel-primary-button" style={{maxWidth:'420px'}} onClick={handleProcess} disabled={!selectedFiles.length||isProcessing}>{isProcessing?'Processando e conciliando...':'Processar arquivos selecionados'}</button>{success&&<span className="panel-success">Base atualizada com sucesso.</span>}{errorMessage&&<span style={{color:'#fca5a5'}}>{errorMessage}</span>}</div>
  </PanelCard>

  {canonical&&<PanelCard><PanelSectionHeader eyebrow="AUDITORIA AUTOMÁTICA" title="Consistência entre motores e fontes" description="Confrontos internos executados sobre a base que está alimentando o painel agora." action={<span className="panel-badge" style={{color:consistency.every(check=>check.ok)?'#86efac':'#fcd34d'}}>{consistency.filter(check=>check.ok).length}/{consistency.length} OK</span>}/><div style={{display:'grid',gap:'8px',marginTop:'14px'}}>{consistency.map(check=><div key={check.label} style={{display:'grid',gridTemplateColumns:'150px minmax(180px,1fr) auto',gap:'12px',alignItems:'center',padding:'10px 12px',border:`1px solid ${check.ok?'rgba(134,239,172,.16)':'rgba(245,158,11,.24)'}`,background:check.ok?'rgba(34,197,94,.035)':'rgba(245,158,11,.055)',borderRadius:'10px'}}><strong style={{color:'white',fontSize:'.75rem'}}>{check.label}</strong><span style={{color:'var(--panel-muted)',fontSize:'.7rem',lineHeight:1.35}}>{check.detail}</span><span className="panel-badge" style={{color:check.ok?'#86efac':'#fcd34d'}}>{check.ok?'OK':'ATENÇÃO'}</span></div>)}</div></PanelCard>}

  {groups.map(group=><PanelCard key={group}><PanelSectionHeader eyebrow={group.toUpperCase()} title={group==='Rotina diária'?'Arquivos operacionais':group==='Histórico'?'Base histórica':'Cadastros e relacionamentos'} description={group==='Histórico'?'Mantidos na base para comparativos, média dos três meses e cobertura de estoque.':'Cada fonte mantém seu próprio registro de última atualização.'}/><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:'12px',marginTop:'16px'}}>{SOURCES.filter(source=>source.group===group).map(source=><SourceCard key={source.kind} source={source} audit={audits.get(source.kind)} queued={queued.get(source.kind)}/>)}</div></PanelCard>)}
  {canonical?.warnings.length?<PanelCard><PanelSectionHeader eyebrow="VALIDAÇÃO" title="Pendências conhecidas" description="Somente situações que ainda precisam de dado ou conciliação."/><div style={{display:'grid',gap:'8px',marginTop:'14px'}}>{canonical.warnings.map((warning,index)=><div key={`${warning}-${index}`} style={{color:'#fcd34d',fontSize:'0.82rem',padding:'10px 12px',border:'1px solid rgba(245,158,11,0.2)',background:'rgba(245,158,11,0.06)',borderRadius:'10px'}}>{warning}</div>)}</div></PanelCard>:null}
 </PanelPage>;
}

function SourceCard({source,audit,queued}:{source:SourceUi;audit?:SourceAudit;queued?:File}){
 const loaded=Boolean(audit?.loaded); const status=queued?'NA FILA':loaded?'ATUALIZADO':'NÃO CARREGADO';
 return <div style={{minHeight:'142px',padding:'15px 16px',border:`1px solid ${queued?'rgba(239,51,64,.32)':loaded?'rgba(255,255,255,.11)':'rgba(255,255,255,.065)'}`,borderRadius:'14px',background:queued?'rgba(239,51,64,.04)':'rgba(255,255,255,.018)',display:'flex',flexDirection:'column',gap:'10px'}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:'12px',alignItems:'flex-start'}}><div><div style={{color:loaded||queued?'white':'var(--panel-text-dim)',fontWeight:780,fontSize:'.86rem'}}>{source.label}</div><div style={{color:'var(--panel-muted)',fontSize:'.69rem',lineHeight:1.35,marginTop:'4px'}}>{source.description}</div></div><span className="panel-badge" style={{color:queued?'var(--panel-red)':loaded?'#86efac':'var(--panel-muted)',flexShrink:0}}>{status}</span></div>
  <div style={{marginTop:'auto',paddingTop:'9px',borderTop:'1px solid rgba(255,255,255,.055)',display:'grid',gap:'4px'}}><div style={{display:'flex',justifyContent:'space-between',gap:'12px',fontSize:'.68rem'}}><span style={{color:'var(--panel-muted)'}}>Última atualização</span><strong style={{color:loaded?'var(--panel-text)':'var(--panel-muted)',fontWeight:650}}>{fmtDateTime(audit?.updatedAt)}</strong></div><div style={{display:'flex',justifyContent:'space-between',gap:'12px',fontSize:'.66rem',minWidth:0}}><span style={{color:'var(--panel-muted)',flexShrink:0}}>Arquivo</span><span title={audit?.fileName} style={{color:'var(--panel-text-dim)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{queued?.name||audit?.fileName||'—'}</span></div>{audit?.note&&<div style={{color:'var(--panel-muted)',fontSize:'.64rem',lineHeight:1.3}}>{audit.note}</div>}</div>
 </div>
}
