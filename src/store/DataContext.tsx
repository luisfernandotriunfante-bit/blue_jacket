import React,{createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { bootstrapCompetenceState, loadCompetenceState } from '../canonical/competenceStore';
import { reportSettingsCompetences } from '../canonical/reportSettings';
import { activateCanonicalBundleReference,deactivateCanonicalBundle,resolveActiveCanonicalBundle,type ActiveCanonicalBundle } from '../canonical/runtime';
import { canonicalSellOutCompetence } from '../canonical/sellOutRules';
import { buildCanonicalFromStoredSources, CANONICAL_ENGINE_VERSION } from '../canonical/sourceImport';
import { rebuildForCanonicalEngine } from '../canonical/engineMigration';
import { RESET_NOTICE } from './migrationReset';

interface DataContextType { activeCanonical:ActiveCanonicalBundle|null; activateCanonical:(bundle:ActiveCanonicalBundle)=>void; deactivateCanonical:()=>void; dataNotice:string; migrationError:string }
const DataContext=createContext<DataContextType>({activeCanonical:null,activateCanonical:()=>undefined,deactivateCanonical:()=>undefined,dataNotice:RESET_NOTICE,migrationError:''});
export function DataProvider({children}:{children:ReactNode}){
  const [activeCanonical,setActiveCanonical]=useState<ActiveCanonicalBundle|null>(()=>resolveActiveCanonicalBundle());
  const [migrationError,setMigrationError]=useState('');
  useEffect(()=>{
    if(!activeCanonical||activeCanonical.engineVersion===CANONICAL_ENGINE_VERSION)return;
    let cancelled=false;
    // A mudança é de regra canônica, não de arquivo. Remontamos o M1–M4 a
    // partir do staging local para que campos novos (como Vl. Total do 218)
    // não dependam de o usuário reenviar uma fonte que já está válida.
    setMigrationError('');
    void rebuildForCanonicalEngine(activeCanonical,CANONICAL_ENGINE_VERSION,buildCanonicalFromStoredSources).then(bundle=>{
      if(!cancelled)setActiveCanonical(activateCanonicalBundleReference(bundle));
    }).catch(reason=>{
      if(cancelled)return;
      deactivateCanonicalBundle();
      setActiveCanonical(null);
      setMigrationError(`Build anterior incompatível com o motor atual e não pôde ser reconstruído: ${String(reason)}`);
    });
    return()=>{cancelled=true};
  },[activeCanonical]);

  useEffect(()=>{
    let cancelled=false;
    const settingsCompetences=reportSettingsCompetences();
    try {
      if(loadCompetenceState()) return;
    } catch(reason) {
      setMigrationError(`Estado administrativo de competência inválido: ${String(reason)}`);
      return;
    }
    if(!activeCanonical) {
      try { bootstrapCompetenceState(null,settingsCompetences); }
      catch(reason) { setMigrationError(`Não foi possível inicializar Competências: ${String(reason)}`); }
      return;
    }
    void loadCandidateList('M3_MOVIMENTO_VENDAS').then(m3=>{
      if(cancelled)return;
      const observed=canonicalSellOutCompetence(m3.records,m3.competence);
      bootstrapCompetenceState(observed,settingsCompetences);
    }).catch(reason=>{
      if(cancelled)return;
      try { bootstrapCompetenceState(null,settingsCompetences); }
      catch { setMigrationError(`Não foi possível inicializar Competências a partir do build: ${String(reason)}`); }
    });
    return()=>{cancelled=true};
  },[activeCanonical?.motorBuildId]);

  const activateCanonical=(bundle:ActiveCanonicalBundle)=>{setMigrationError('');setActiveCanonical(activateCanonicalBundleReference(bundle))};
  const rollback=()=>{deactivateCanonicalBundle();setActiveCanonical(null);setMigrationError('')};
  return <DataContext.Provider value={{activeCanonical,activateCanonical,deactivateCanonical:rollback,dataNotice:migrationError||(activeCanonical?`Build canônico ativo: ${activeCanonical.motorBuildId}.`:RESET_NOTICE),migrationError}}>{children}</DataContext.Provider>
}
export const useData=()=>useContext(DataContext);
