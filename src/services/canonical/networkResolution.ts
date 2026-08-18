import type { NetworkAssignmentSource } from '../../domain/canonical';
import { displayNetwork, networkKey } from './utils';

export interface NetworkResolution {
  network:string;
  key:string;
  source:NetworkAssignmentSource;
  divergentSources:string[];
}

function normalizedNetwork(value:string):string {
  const raw=String(value||'').trim();
  if(!raw)return'';
  const withoutPrefix=raw.replace(/^REDE(?:MS)?\s*/i,'').trim();
  return displayNetwork(withoutPrefix?`Rede ${withoutPrefix}`:'Rede');
}

export function resolveClientNetwork(premisesNetwork:string,routeNetwork:string,referenceNetwork:string):NetworkResolution {
  const candidates:Array<{source:Exclude<NetworkAssignmentSource,'SEM_REDE'>;network:string}>=[
    {source:'PREMISSAS',network:normalizedNetwork(premisesNetwork)},
    {source:'ROTEIRO',network:normalizedNetwork(routeNetwork)},
    {source:'REFERENCIA',network:normalizedNetwork(referenceNetwork)},
  ].filter(candidate=>Boolean(candidate.network)) as Array<{source:Exclude<NetworkAssignmentSource,'SEM_REDE'>;network:string}>;

  const selected=candidates[0];
  if(!selected)return{network:'SEM REDE',key:'SEM REDE',source:'SEM_REDE',divergentSources:[]};
  const selectedKey=networkKey(selected.network);
  const divergentSources=candidates
    .filter(candidate=>networkKey(candidate.network)!==selectedKey)
    .map(candidate=>`${candidate.source}: ${candidate.network}`);
  return{network:selected.network,key:selectedKey,source:selected.source,divergentSources};
}
