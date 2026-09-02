import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { importCanonicalBundle } from '../canonical/bundleStore';
import { PanelAlert, PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';
import { APPROVED_CANONICAL_BUILD } from '../canonical/runtime';
import { loadCandidateList } from '../canonical/candidateLists';
import { useData } from '../store/DataContext';
import { networkTargetFor, setNetworkTargetFor } from '../canonical/reportSettings';
import { detectSourceForFileName, loadSourceStagingManifests, processSourceUpdates, requestPersistentSourceStorage, REQUIRED_SOURCE_IDS, SOURCE_LABELS, type SourceStageManifest, type SourceUpdateProgress } from '../canonical/sourceImport';

const statusLabel=(manifest:SourceStageManifest|undefined,file:File|undefined)=>file?'SELECIONADA':manifest?'VÁLIDA':'NÃO CARREGADA';
const shortHash=(hash:string)=>hash?`${hash.slice(0,10)}…`:'';

export function ConfiguracoesPage(){
  const {activeCanonical,activateCanonical}=useData();
  const [status,setStatus]=useState('');const [error,setError]=useState('');
  const [selected,setSelected]=useState<Partial<Record<string,File>>>({});
  const [manifests,setManifests]=useState<SourceStageManifest[]>([]);
  const [progress,setProgress]=useState<SourceUpdateProgress|null>(null);
  const [unmatched,setUnmatched]=useState<string[]>([]);
  const [processing,setProcessing]=useState(false);
  const competence='2026-08';const [networkTarget,setNetworkTarget]=useState(()=>networkTargetFor(competence)?.toString()??'');
  const refresh=()=>loadSourceStagingManifests().then(setManifests).catch(reason=>setError(String(reason)));
  useEffect(()=>{void refresh()},[]);
  const manifestBySource=useMemo(()=>new Map(manifests.map(manifest=>[manifest.source,manifest])),[manifests]);
  const validCount=REQUIRED_SOURCE_IDS.filter(source=>manifestBySource.has(source)).length;

  const assignMany=(files:File[])=>{const next:Partial<Record<string,File>>={...selected};const unknown:string[]=[];for(const file of files){const source=detectSourceForFileName(file.name);if(source&&!next[source])next[source]=file;else if(source)next[source]=file;else unknown.push(file.name)}setSelected(next);setUnmatched(unknown);setError('');};
  const onMany=(event:ChangeEvent<HTMLInputElement>)=>{assignMany(Array.from(event.target.files??[]));event.target.value=''};
  const onSource=(source:string,event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(file)setSelected(current=>({...current,[source]:file}));event.target.value=''};

  const process=async()=>{setProcessing(true);setError('');setStatus('');try{const storage=await requestPersistentSourceStorage();if(storage.quota&&storage.usage&&storage.quota-storage.usage<200*1024*1024)throw new Error('STORAGE_SPACE_LOW: menos de 200 MB livres para processar as bases.');const base=activeCanonical?{active:activeCanonical,lists:Object.fromEntries((await Promise.all((['M1_ITEM_ESTOQUE','M2_CLIENTE_RCA','M3_MOVIMENTO_VENDAS','M4_HISTORICO_TRANSICAO'] as const).map(async id=>[id,await loadCandidateList(id)]))) as [string,unknown][]) as any}:undefined;const result=await processSourceUpdates(selected,setProgress,base);await refresh();if(result.rejected.length){setError(`Fonte rejeitada; o bundle anterior foi preservado. ${result.rejected.map(item=>`${SOURCE_LABELS[item.source]??item.source}: ${item.errors.join(' | ')}`).join(' · ')}`);return}if(result.missing.length){setStatus(`Stagings salvos. Ainda faltam ${result.missing.length} fonte(s): ${result.missing.map(source=>SOURCE_LABELS[source]??source).join(', ')}.`);return}if(!result.active)throw new Error('CANONICAL_BUILD_NOT_CREATED');activateCanonical(result.active);setSelected({});setStatus(result.updated.length===0?`NENHUMA BASE ALTERADA — ${result.unchanged.length} arquivo(s) reutilizado(s), com o mesmo conteúdo já processado. Os valores permanecem iguais. Build ativo: ${result.active.motorBuildId}.`:`ATUALIZAÇÃO CONCLUÍDA — ${result.updated.length} fonte(s) atualizada(s), ${result.unchanged.length} reutilizada(s). Build ativo: ${result.active.motorBuildId}.`)}catch(reason){setError(String(reason))}finally{setProcessing(false);setProgress(null)}};

  const onBundleImport=async(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(!file)return;setStatus('Validando e restaurando bundle técnico…');setError('');try{const imported=await importCanonicalBundle(file);activateCanonical();setStatus(`Bundle de restauração ${imported.motorBuildId} importado e ativado.`)}catch(reason){setStatus('');setError(String(reason))}finally{event.target.value=''}};

  return <PanelPage title="Atualizar Bases" metricLabel="Fontes válidas" metricValue={`${validCount}/19`}>
    {activeCanonical?<PanelAlert tone="success">Build ativo: {activeCanonical.motorBuildId}<br/>Atualize somente os relatórios que mudaram; os demais stagings válidos serão reutilizados.</PanelAlert>:<PanelAlert tone="info">Primeira carga: selecione as 19 fontes originais. Depois disso, cada atualização pode substituir apenas as fontes que mudaram.</PanelAlert>}
    <PanelCard><PanelSectionHeader eyebrow="IMPORTAÇÃO REAL" title="Arquivos originais → Blue Jacket" description="Todo o processamento acontece localmente neste navegador: parser → staging → M1–M4 → novo build ativo. Nenhum arquivo comercial é enviado ao GitHub." />
      <label className="panel-button" style={{display:'inline-block',cursor:'pointer'}}>Selecionar vários arquivos<input type="file" multiple accept=".xls,.xlsx,.txt" onChange={onMany} style={{display:'none'}} /></label>{' '}
      <button className="panel-button" disabled={processing||Object.keys(selected).length===0} onClick={()=>void process()}>{processing?'Processando…':'PROCESSAR E ATUALIZAR SISTEMA'}</button>
      {progress?<p className="panel-muted">{progress.phase} — {progress.message}</p>:null}
      {unmatched.length?<PanelAlert tone="warning">Não identifiquei automaticamente: {unmatched.join(', ')}. Use o botão da fonte correta na tabela abaixo.</PanelAlert>:null}
      {status?<PanelAlert tone="success">{status}</PanelAlert>:null}{error?<PanelAlert tone="error">{error}</PanelAlert>:null}
      <div className="panel-table-wrap" style={{marginTop:12}}><table className="panel-table"><thead><tr><th>Fonte</th><th>Status</th><th>Arquivo atual</th><th>Linhas</th><th>Hash</th><th>Substituir</th></tr></thead><tbody>{REQUIRED_SOURCE_IDS.map(source=>{const manifest=manifestBySource.get(source),file=selected[source];return <tr key={source}><td>{SOURCE_LABELS[source]??source}</td><td>{statusLabel(manifest,file)}</td><td>{file?.name??manifest?.fileName??'—'}</td><td>{manifest?.parsedRows??'—'}</td><td>{manifest?shortHash(manifest.fileHash):'—'}</td><td><label className="panel-button" style={{display:'inline-block',cursor:'pointer'}}>Selecionar<input type="file" accept=".xls,.xlsx,.txt" onChange={event=>onSource(source,event)} style={{display:'none'}} /></label></td></tr>})}</tbody></table></div>
    </PanelCard>
    <PanelCard><PanelSectionHeader eyebrow="META MANUAL" title="Meta Redes Geral" description="Parâmetro separado da meta de Sell Out, por competência. Sem valor, o relatório mostra Não configurada." /><label className="panel-muted">Competência {competence} <input type="number" min="0" value={networkTarget} onChange={event=>setNetworkTarget(event.target.value)} /></label> <button className="panel-button" onClick={()=>{setNetworkTargetFor(competence,networkTarget.trim()===''?null:Number(networkTarget));setStatus('Meta Redes Geral salva para a competência.');}}>Salvar Meta Redes</button></PanelCard>
    <PanelCard><PanelSectionHeader eyebrow="AVANÇADO / RECUPERAÇÃO" title="Restaurar Bundle Canônico" description="Backup técnico. Não é necessário para a atualização normal das bases." /><label className="panel-button" style={{display:'inline-block',cursor:'pointer'}}>Selecionar bundle ZIP<input type="file" accept=".zip,application/zip" onChange={onBundleImport} style={{display:'none'}} /></label><p className="panel-muted">Build homologado de recuperação: {APPROVED_CANONICAL_BUILD.motorBuildId}</p></PanelCard>
  </PanelPage>
}
