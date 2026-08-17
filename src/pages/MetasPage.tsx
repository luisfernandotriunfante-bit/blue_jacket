import React from 'react';
import { useData } from '../store/DataContext';
import { LINE_NAMES } from '../domain/canonical';
import { PanelCard, PanelEmptyState, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';

const fieldStyle:React.CSSProperties={width:'100%',borderRadius:'10px',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(0,0,0,0.22)',color:'white',padding:'11px 12px',outline:'none',font:'inherit'};
const brl=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value||0);
const pct=(value:number)=>`${(value*100).toFixed(1)}%`;

export function MetasPage(){
 const{canonical,manualConfig,setManualConfig}=useData();
 if(!canonical)return <PanelPage title="Metas"><PanelEmptyState icon="◎" title="Base ainda não carregada" description="Carregue Bússola, Roteiro e TOP REDES em Configurações para iniciar a manutenção das metas."/></PanelPage>;

 const networkRows=canonical.networks.filter(network=>network.detectedNetworkTarget>0||network.topTarget>0||network.networkTarget>0);
 const networkTotal=networkRows.reduce((sum,network)=>sum+network.networkTarget,0);
 const topTotal=canonical.networks.reduce((sum,network)=>sum+network.topTarget,0);
 const lineTotal=LINE_NAMES.reduce((sum,name)=>sum+(manualConfig.lineShares[name]||0),0);

 const setField=(field:'sellOutTarget'|'coverageTargetDays',value:number)=>setManualConfig({...manualConfig,[field]:Math.max(value||0,0)});
 const setShare=(name:(typeof LINE_NAMES)[number],value:number)=>setManualConfig({...manualConfig,lineShares:{...manualConfig.lineShares,[name]:Math.max(value||0,0)/100}});

 const saveNetworkTargets=(targets:Record<string,number>)=>setManualConfig({...manualConfig,networkTargets:targets});

 // A Meta Redes é independente da Meta T&C. Alterar o total redistribui todas as
 // redes proporcionalmente à participação atual, preservando a composição.
 const setNetworkTotal=(requested:number)=>{
  const total=Math.max(Number(requested)||0,0);
  if(!networkRows.length)return;
  const currentTotal=networkRows.reduce((sum,network)=>sum+Math.max(network.networkTarget,0),0);
  const next={...manualConfig.networkTargets};
  if(currentTotal>0){networkRows.forEach(network=>{next[network.key]=total*(Math.max(network.networkTarget,0)/currentTotal)})}
  else {const share=total/networkRows.length;networkRows.forEach(network=>{next[network.key]=share})}
  saveNetworkTargets(next);
 };

 // Ao editar uma rede, o total de Meta Redes permanece fixo e somente o saldo é
 // redistribuído proporcionalmente entre as demais redes, como definido no modelo.
 const setNetwork=(key:string,requested:number)=>{
  if(!networkRows.length)return;
  const total=networkTotal;
  if(total<=0){saveNetworkTargets({...manualConfig.networkTargets,[key]:Math.max(Number(requested)||0,0)});return}
  const edited=Math.min(Math.max(Number(requested)||0,0),total);
  const others=networkRows.filter(network=>network.key!==key);
  const residual=Math.max(total-edited,0);
  const othersCurrent=others.reduce((sum,network)=>sum+Math.max(network.networkTarget,0),0);
  const next={...manualConfig.networkTargets,[key]:edited};
  if(others.length){
   if(othersCurrent>0)others.forEach(network=>{next[network.key]=residual*(Math.max(network.networkTarget,0)/othersCurrent)});
   else {const equal=residual/others.length;others.forEach(network=>{next[network.key]=equal})}
  }
  saveNetworkTargets(next);
 };

 return <PanelPage title="Metas" metricLabel="Meta Sell Out T&C" metricValue={brl(manualConfig.sellOutTarget)}>
  <PanelCard><PanelSectionHeader eyebrow="REFERÊNCIAS OFICIAIS" title="Metas recebidas dos arquivos" description="Somente leitura. Essas metas vêm das fontes oficiais e não são alteradas manualmente aqui."/><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'12px',marginTop:'16px'}}><ReadOnly label="Meta indústria · Bússola" value={brl(canonical.industryTarget)}/><ReadOnly label="Meta positivação · Bússola" value={canonical.industryPositivityTarget.toLocaleString('pt-BR')}/><ReadOnly label="Meta Tops · Roteiro Ativo" value={brl(topTotal)}/></div></PanelCard>

  <PanelCard><PanelSectionHeader eyebrow="AJUSTÁVEIS" title="Parâmetros gerais" description="Alterações são salvas automaticamente e passam a valer no painel e nos documentos gerados."/><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:'14px',marginTop:'16px'}}><Field label="Meta Sell Out (T&C)" value={manualConfig.sellOutTarget} step={1000} onChange={value=>setField('sellOutTarget',value)} detail="Definida manualmente e independente da Meta Indústria."/><Field label="Meta Redes Geral" value={networkTotal} step={1000} onChange={setNetworkTotal} detail="Total exclusivo das redes. Ao alterar, todas as metas de rede são redistribuídas proporcionalmente."/><Field label="Meta de cobertura (dias)" value={manualConfig.coverageTargetDays} step={1} onChange={value=>setField('coverageTargetDays',value)} detail="Referência usada na visão de estoque."/></div></PanelCard>

  <PanelCard><PanelSectionHeader eyebrow="LINHAS COMERCIAIS" title="Distribuição da Meta T&C" description="Percentuais editáveis usados para calcular a meta das cinco linhas." action={<span className="panel-badge" style={{color:Math.abs(lineTotal-1)<0.0001?'#86efac':'#fcd34d'}}>TOTAL · {pct(lineTotal)}</span>}/><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(205px,1fr))',gap:'10px',marginTop:'16px'}}>{LINE_NAMES.map(name=><div key={name} style={{padding:'14px',border:'1px solid rgba(255,255,255,.08)',borderRadius:'12px',background:'rgba(255,255,255,.018)'}}><div style={{color:'white',fontWeight:750,fontSize:'.78rem',marginBottom:'8px'}}>{name}</div><div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'8px',alignItems:'center'}}><input type="number" min="0" step="0.5" value={(manualConfig.lineShares[name]*100)||''} onChange={e=>setShare(name,Number(e.target.value)||0)} style={fieldStyle}/><span style={{color:'var(--panel-muted)'}}>%</span></div><div style={{color:'var(--panel-muted)',fontSize:'.67rem',marginTop:'7px'}}>Meta atual: {brl(manualConfig.sellOutTarget*(manualConfig.lineShares[name]||0))}</div></div>)}</div>{Math.abs(lineTotal-1)>=0.0001?<div style={{color:'#fcd34d',fontSize:'.72rem',marginTop:'12px'}}>Atenção: a distribuição das linhas está em {pct(lineTotal)}. Para distribuir integralmente a Meta T&C, o total deve fechar em 100%.</div>:null}</PanelCard>

  <PanelCard><PanelSectionHeader eyebrow="META REDES" title="Manutenção por rede" description="Editar uma rede não altera a Meta Redes Geral: o saldo é redistribuído proporcionalmente entre as outras redes." action={<span className="panel-badge">TOTAL · {brl(networkTotal)}</span>}/><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:'10px',marginTop:'16px'}}>{networkRows.map(network=>{const participation=networkTotal>0?network.networkTarget/networkTotal:0;return <div key={network.key} style={{padding:'14px',border:'1px solid rgba(255,255,255,.08)',borderRadius:'12px',background:'rgba(255,255,255,.018)'}}><div style={{display:'flex',justifyContent:'space-between',gap:'12px',marginBottom:'9px'}}><strong style={{color:'white',fontSize:'.82rem'}}>{network.name}</strong><span className="panel-badge">{pct(participation)} · TOPS {brl(network.topTarget)}</span></div><input type="number" min="0" max={networkTotal||undefined} step="1000" value={network.networkTarget||''} onChange={e=>setNetwork(network.key,Number(e.target.value)||0)} style={fieldStyle}/><div style={{color:'var(--panel-muted)',fontSize:'.67rem',marginTop:'7px'}}>Referência TOP REDES: {brl(network.detectedNetworkTarget)} · Participação atual: {pct(participation)}</div></div>})}</div></PanelCard>
 </PanelPage>;
}

function ReadOnly({label,value}:{label:string;value:string}){return <div style={{padding:'14px 16px',border:'1px solid rgba(255,255,255,.08)',borderRadius:'12px',background:'rgba(255,255,255,.018)'}}><div style={{color:'var(--panel-muted)',fontSize:'.67rem',fontWeight:750,textTransform:'uppercase',letterSpacing:'.05em'}}>{label}</div><div style={{color:'white',fontSize:'1.15rem',fontWeight:820,marginTop:'7px'}}>{value}</div></div>}
function Field({label,value,step,onChange,detail}:{label:string;value:number;step:number;onChange:(value:number)=>void;detail:string}){return <label style={{display:'grid',gap:'7px'}}><span style={{color:'var(--panel-text-dim)',fontSize:'.75rem',fontWeight:750,textTransform:'uppercase'}}>{label}</span><input type="number" min="0" step={step} value={value||''} onChange={e=>onChange(Number(e.target.value)||0)} style={fieldStyle}/><span style={{color:'var(--panel-muted)',fontSize:'.68rem'}}>{detail}</span></label>}
