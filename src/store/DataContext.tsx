import React,{createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { initializeCompetenceFromAvailableEvidence } from '../canonical/competenceStore';
import { loadReportSettings } from '../canonical/reportSettings';
import { activateCanonicalBundleReference,deactivateCanonicalBundle,resolveActiveCanonicalBundle,type ActiveCanonicalBundle } from '../canonical/runtime';
import { canonicalSellOutCompetence } from '../canonical/sellOutRules';
import { buildCanonicalFromStoredSources, CANONICAL_ENGINE_VERSION } from '../canonical/sourceImport';
import { rebuildForCanonicalEngine } from '../canonical/engineMigration';
import { systemDataOperationCoordinator } from '../canonical/systemDataOperationCoordinator';
import { bootstrapTargetStateFromReportSettings, targetStateCompetences } from '../canonical/targetStore';
import { RESET_NOTICE } from './migrationReset';

interface DataContextType { activeCanonical:ActiveCanonicalBundle|null; activateCanonical:(bundle:ActiveCanonicalBundle)=>void; deactivateCanonical:()=>void; dataNotice:string; migrationError:string }
const DataContext=createContext<DataContextType>({activeCanonical:null,activateCanonical:()=>undefined,deactivateCanonical:()=>undefined,dataNotice:RESET_NOTICE,migrationError:''});
export function DataProvider({children}:{children:ReactNode}){
  const [initialPointer]=useState<ActiveCanonicalBundle|null>(()=>resolveActiveCanonicalBundle());
  const [legacyToMigrate,setLegacyToMigrate]=useState<ActiveCanonicalBundle|null>(()=>initialPointer&&initialPointer.engineVersion!==CANONICAL_ENGINE_VERSION?initialPointer:null);
  const [activeCanonical,setActiveCanonical]=useState<ActiveCanonicalBundle|null>(()=>initialPointer?.engineVersion===CANONICAL_ENGINE_VERSION?initialPointer:null);
  const [migrationError,setMigrationError]=useState('');
  const [operationState,setOperationState]=useState(()=>systemDataOperationCoordinator.getState());
  useEffect(()=>systemDataOperationCoordinator.subscribe(setOperationState),[]);

  // Safe, idempotent TargetState bootstrap. Only already competence-specific
  // ReportSettings are copied; global legacy fields are deliberately ignored.
  useEffect(()=>{
    try { bootstrapTargetStateFromReportSettings(loadReportSettings()); }
    catch(reason) { setMigrationError(`Não foi possível inicializar o TargetState: ${String(reason)}`); }
  },[]);

  useEffect(()=>{
    if(!legacyToMigrate||operationState.busy)return;
    let cancelled=false;
    setMigrationError('');
    // v19 and earlier references remain migration evidence only. They are never
    // exposed as active while the v20 rebuild uses the 19 sources + current
    // Admin Registry + current RCA Target Registry.
    void systemDataOperationCoordinator.run('ENGINE_MIGRATION',async()=>rebuildForCanonicalEngine(legacyToMigrate,CANONICAL_ENGINE_VERSION,buildCanonicalFromStoredSources)).then(result=>{
      if(cancelled||result.status==='BUSY')return;
      const bundle=result.value;
      setActiveCanonical(activateCanonicalBundleReference(bundle));
      setLegacyToMigrate(null);
    }).catch(reason=>{
      if(cancelled)return;
      deactivateCanonicalBundle();
      setActiveCanonical(null);
      setLegacyToMigrate(null);
      setMigrationError(`Build anterior incompatível com o motor atual e não pôde ser reconstruído: ${String(reason)}`);
    });
    return()=>{cancelled=true};
  },[legacyToMigrate,operationState.busy]);

  useEffect(()=>{
    let cancelled=false;
    const initialize=(observedM3:string|null|undefined,hasActiveBuild:boolean)=>{
      initializeCompetenceFromAvailableEvidence({
        hasActiveBuild,
        observedM3,
        // TargetState records are explicit competence evidence, but they never
        // select currentCompetence on their own; the Phase 2 M3 rule remains.
        settingsCompetences:targetStateCompetences(),
      });
    };

    if(!activeCanonical) {
      try { initialize(null,false); }
      catch(reason) { setMigrationError(`Não foi possível inicializar Competências: ${String(reason)}`); }
      return;
    }

    void loadCandidateList('M3_MOVIMENTO_VENDAS').then(m3=>{
      if(cancelled)return;
      const observed=canonicalSellOutCompetence(m3.records,m3.competence);
      initialize(observed,true);
    }).catch(reason=>{
      if(cancelled)return;
      try { initialize(null,true); }
      catch { setMigrationError(`Não foi possível inicializar Competências a partir do build: ${String(reason)}`); }
    });
    return()=>{cancelled=true};
  },[activeCanonical?.motorBuildId]);

  const activateCanonical=(bundle:ActiveCanonicalBundle)=>{setMigrationError('');setLegacyToMigrate(null);setActiveCanonical(activateCanonicalBundleReference(bundle))};
  const rollback=()=>{deactivateCanonicalBundle();setLegacyToMigrate(null);setActiveCanonical(null);setMigrationError('')};
  const dataNotice=migrationError||(legacyToMigrate?'Build legado identificado. Migração canônica v20 em andamento.':activeCanonical?`Build canônico ativo: ${activeCanonical.motorBuildId}.`:RESET_NOTICE);
  return <DataContext.Provider value={{activeCanonical,activateCanonical,deactivateCanonical:rollback,dataNotice,migrationError}}>{children}</DataContext.Provider>
}
export const useData=()=>useContext(DataContext);