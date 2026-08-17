import React, { useMemo, useRef, useState } from 'react';
import { useData } from '../store/DataContext';
import { processCanonicalFiles } from '../services/canonicalEngine';
import { PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

type FileUiKind={key:string;label:string;color:string;group:'operacao'|'cadastro'};
const FILE_TYPES:FileUiKind[]=[
 {key:'vendas',label:'Vendas 8022',color:'#ef4444',group:'operacao'},
 {key:'posicao',label:'Posição Estoque 105',color:'#3b82f6',group:'operacao'},
 {key:'carteira',label:'Carteira Colgate',color:'#f59e0b',group:'operacao'},
 {key:'8013',label:'Estoque 8013',color:'#06b6d4',group:'operacao'},
 {key:'cadastro',label:'Cadastro 286',color:'#8b5cf6',group:'cadastro'},
 {key:'lista',label:'Lista de Preço',color:'#10b981',group:'cadastro'},
 {key:'lancamentos',label:'Lista de Lançamentos',color:'#ec4899',group:'cadastro'},
 {key:'rcas',label:'De-Para RCAs',color:'#a78bfa',group:'cadastro'},
 {key:'bussola',label:'Bússola de Metas',color:'#22c55e',group:'cadastro'},
 {key:'premissas',label:'Base de Premissas',color:'#60a5fa',group:'cadastro'},
 {key:'roteiro',label:'Roteiro Ativo',color:'#fb7185',group:'cadastro'},
 {key:'top-redes',label:'TOP REDES (referência)',color:'#f97316',group:'cadastro'},
];
function identifyFile(name:string):FileUiKind{const lower=name.toLowerCase();if(lower.includes('8022')||lower.includes('vendas'))return FILE_TYPES[0];if(lower.includes('posicao')||lower.includes('posição')||lower.includes('105'))return FILE_TYPES[1];if(lower.includes('carteira'))return FILE_TYPES[2];if(lower.includes('8013'))return FILE_TYPES[3];if(lower.includes('cadastro')||lower.includes('286'))return FILE_TYPES[4];if(lower.includes('lista')&&(lower.includes('preco')||lower.includes('preço')))return FILE_TYPES[5];if(lower.includes('lançamento')||lower.includes('lancamento'))return FILE_TYPES[6];if(lower.includes('novos rca')||lower.includes('rcas'))return FILE_TYPES[7];if(lower.includes('bussola')||lower.includes('bússola'))return FILE_TYPES[8];if(lower.includes('premissas'))return FILE_TYPES[9];if(lower.includes('roteiro ativo'))return FILE_TYPES[10];if(lower.includes('top redes'))return FILE_TYPES[11];return{key:'desconhecido',label:'Arquivo não identificado',color:'#6b7280',group:'cadastro'}}
const fieldStyle:React.CSSProperties={width:'100%',borderRadius:'10px',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(0,0,0,0.22)',color:'white',padding:'11px 12px',outline:'none',font:'inherit'};
const formatCompactCurrency=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value||0);

export function ConfiguracoesPage(){
 const{canonical,setCanonical,manualConfig,setManualConfig,setProdutos,setMetricas,setSellOut}=useData();
 const[isDragging,setIsDragging]=useState(false);const[isProcessing,setIsProcessing]=useState(false);const[success,setSuccess]=useState(false);const[selectedFiles,setSelectedFiles]=useState<File[]>([]);const[errorMessage,setErrorMessage]=useState('');const fileInputRef=useRef<HTMLInputElement>(null);
 const addFiles=(newFiles:File[])=>{setSuccess(false);setErrorMessage('');setSelectedFiles(prev=>[...prev.filter(p=>!newFiles.some(n=>n.name===p.name)),...newFiles])};
 const removeFile=(name:string)=>setSelectedFiles(prev=>prev.filter(f=>f.name!==name));
 const handleProcess=async()=>{if(!selectedFiles.length)return;setIsProcessing(true);setSuccess(false);setErrorMessage('');try{const result=await processCanonicalFiles(selectedFiles,manualConfig,canonical);setCanonical(result.canonical);setProdutos(result.produtos);setMetricas(result.metricas);setSellOut(result.sellOut);setSuccess(true);setSelectedFiles([])}catch(error){console.error('Erro ao processar base canônica:',error);setErrorMessage(error instanceof Error?error.message:'Não foi possível processar os arquivos.')}finally{setIsProcessing(false)}};
 const grouped=useMemo(()=>{const operacao:File[]=[];const cadastro:File[]=[];selectedFiles.forEach(file=>identifyFile(file.name).group==='operacao'?operacao.push(file):cadastro.push(file));return{operacao,cadastro}},[selectedFiles]);
 const updateNetworkTarget=(key:string,value:number)=>setManualConfig({...manualConfig,networkTargets:{...manualConfig.networkTargets,[key]:Math.max(value||0,0)}});
 return <PanelPage title="Configurações" metricLabel={canonical?'Base atualizada':'Arquivos na fila'} metricValue={canonical?new Date(canonical.generatedAt).toLocaleDateString('pt-BR'):selectedFiles.length.toLocaleString('pt-BR')}>
  <div className="panel-grid panel-grid-2">
   <PanelCard className={`panel-dropzone${isDragging?' is-dragging':''}`}>
    <input type="file" multiple accept=".xls,.xlsx,.xlsb" style={{display:'none'}} ref={fileInputRef} onChange={e=>{if(e.target.files?.length)addFiles(Array.from(e.target.files));e.target.value=''}}/>
    <div onDragOver={e=>{e.preventDefault();setIsDragging(true)}} onDragLeave={e=>{e.preventDefault();setIsDragging(false)}} onDrop={e=>{e.preventDefault();setIsDragging(false);if(e.dataTransfer.files?.length)addFiles(Array.from(e.dataTransfer.files))}} onClick={()=>fileInputRef.current?.click()} style={{width:'100%',minHeight:'190px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
     <div className="panel-dropzone-icon">⬆</div><h2>Atualizar base do Blue Jacket</h2><p>Arraste os relatórios novos ou clique para selecionar. Cadastros mensais já carregados são reaproveitados nas próximas cargas.</p>
     <div className="panel-badges" style={{justifyContent:'center',marginTop:'18px'}}>{FILE_TYPES.slice(0,8).map(ft=><span key={ft.key} className="panel-badge" style={{color:ft.color,borderColor:`${ft.color}44`,background:`${ft.color}12`}}>{ft.label}</span>)}</div>
    </div>
   </PanelCard>
   <PanelCard><PanelSectionHeader eyebrow="IMPORTAÇÃO" title={`Arquivos na fila (${selectedFiles.length})`} description="Relatórios de operação atualizam o dia; cadastros e metas atualizam a base de apoio quando forem enviados."/>
    <div className="panel-stack" style={{gap:'18px'}}><FileGroup title="OPERAÇÃO / ROTINA" files={grouped.operacao} onRemove={removeFile}/><FileGroup title="CADASTROS / METAS" files={grouped.cadastro} onRemove={removeFile}/>
     {!selectedFiles.length&&<div style={{color:'var(--panel-muted)',fontStyle:'italic',minHeight:'82px',display:'flex',alignItems:'center'}}>Nenhum arquivo na fila. Você pode carregar apenas os relatórios do dia quando as bases mensais já estiverem salvas.</div>}
     <div style={{marginTop:'auto',paddingTop:'4px',display:'flex',flexDirection:'column',gap:'10px'}}><button className="panel-primary-button" onClick={handleProcess} disabled={!selectedFiles.length||isProcessing}>{isProcessing?'Processando e conciliando...':'Processar e atualizar base canônica'}</button>{success&&<div className="panel-success">Base canônica atualizada. Sell Out, estoque, equipe e redes usam a mesma apuração.</div>}{errorMessage&&<div style={{color:'#fca5a5',padding:'10px 12px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'10px'}}>{errorMessage}</div>}</div>
    </div>
   </PanelCard>
  </div>
  <PanelCard><PanelSectionHeader eyebrow="PARÂMETROS" title="Metas editáveis" description="A Meta Sell Out (T&C) e a Meta Redes são parâmetros independentes das metas oficiais da Bússola e do Roteiro Ativo." action={canonical?<span className="panel-badge">Meta indústria: {formatCompactCurrency(canonical.industryTarget)}</span>:undefined}/>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:'14px',marginTop:'18px'}}>
    <label style={{display:'grid',gap:'7px'}}><span style={{color:'var(--panel-muted)',fontSize:'0.78rem',fontWeight:700}}>META SELL OUT (T&C)</span><input type="number" min="0" step="1000" value={manualConfig.sellOutTarget||''} onChange={e=>setManualConfig({...manualConfig,sellOutTarget:Number(e.target.value)||0})} style={fieldStyle} placeholder="Ex.: 6500000"/></label>
    <label style={{display:'grid',gap:'7px'}}><span style={{color:'var(--panel-muted)',fontSize:'0.78rem',fontWeight:700}}>META COBERTURA (DIAS)</span><input type="number" min="0" step="1" value={manualConfig.coverageTargetDays||''} onChange={e=>setManualConfig({...manualConfig,coverageTargetDays:Number(e.target.value)||0})} style={fieldStyle}/></label>
    {canonical&&<div style={{display:'grid',gap:'7px'}}><span style={{color:'var(--panel-muted)',fontSize:'0.78rem',fontWeight:700}}>META POSITIVAÇÃO · BÚSSOLA</span><div style={{...fieldStyle,cursor:'default',color:'#dbeafe'}}>{canonical.industryPositivityTarget.toLocaleString('pt-BR')}</div></div>}
   </div>
   {canonical?.networks.length?<div style={{marginTop:'24px'}}><div className="panel-eyebrow" style={{marginBottom:'10px'}}>META REDES</div><div style={{color:'var(--panel-muted)',fontSize:'0.8rem',marginBottom:'14px'}}>O valor detectado no TOP REDES entra como ponto de partida. Qualquer alteração abaixo passa a ser a meta operacional usada pelo motor.</div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))',gap:'10px'}}>{canonical.networks.filter(n=>n.detectedNetworkTarget>0||n.topTarget>0).map(network=><label key={network.key} style={{display:'grid',gap:'6px',padding:'12px',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'12px',background:'rgba(255,255,255,0.025)'}}><span style={{color:'white',fontSize:'0.8rem',fontWeight:700}}>{network.name}</span><input type="number" min="0" step="1000" value={network.networkTarget||''} onChange={e=>updateNetworkTarget(network.key,Number(e.target.value)||0)} style={fieldStyle}/><span style={{color:'var(--panel-muted)',fontSize:'0.7rem'}}>Tops: {formatCompactCurrency(network.topTarget)} · referência: {formatCompactCurrency(network.detectedNetworkTarget)}</span></label>)}</div></div>:null}
  </PanelCard>
  {canonical?.warnings.length?<PanelCard><PanelSectionHeader eyebrow="VALIDAÇÃO" title="Pendências conhecidas" description="O motor sinaliza cálculos que ainda não devem ser inventados antes da conciliação final."/><div style={{display:'grid',gap:'8px',marginTop:'14px'}}>{canonical.warnings.map((warning,index)=><div key={`${warning}-${index}`} style={{color:'#fcd34d',fontSize:'0.82rem',padding:'10px 12px',border:'1px solid rgba(245,158,11,0.2)',background:'rgba(245,158,11,0.06)',borderRadius:'10px'}}>{warning}</div>)}</div></PanelCard>:null}
 </PanelPage>;
}
function FileGroup({title,files,onRemove}:{title:string;files:File[];onRemove:(name:string)=>void}){if(!files.length)return null;return <div><div className="panel-eyebrow" style={{marginBottom:'9px'}}>{title} · {files.length}</div><div className="panel-file-list">{files.map(file=>{const info=identifyFile(file.name);return <FileRow key={file.name} file={file} label={info.label} color={info.color} onRemove={onRemove}/>})}</div></div>}
function FileRow({file,label,color,onRemove}:{file:File;label:string;color:string;onRemove:(name:string)=>void}){return <div className="panel-file-row" style={{borderLeft:`3px solid ${color}`}}><div style={{minWidth:0}}><div className="panel-file-title" style={{color}}>{label}</div><div className="panel-file-name" style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</div><div className="panel-file-date">Atualizado: {new Date(file.lastModified).toLocaleDateString('pt-BR')}</div></div><button className="panel-icon-button" onClick={e=>{e.stopPropagation();onRemove(file.name)}} title="Remover" aria-label={`Remover ${file.name}`}>✕</button></div>}
