import React,{createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import { loadCandidateList } from '../canonical/candidateLists';
import { initializeCompetenceFromAvailableEvidence } from '../canonical/competenceStore';
import { reportSettingsCompetences } from '../canonical/reportSettings';
import { activateCanonicalBundleReference,deactivateCanonicalBundle,resolveActiveCanonicalBundle,type ActiveCanonicalBundle } from '../canonical/runtime';
import { canonicalSellOutCompetence } from '../canonical/sellOutRules';
import { buildCanonicalFromStoredSources, CANONICAL_ENGINE_VERSION } from '../canonical/sourceImport';
import { rebuildForCanonicalEngine } from '../canonical/engineMigration';
import { systemDataOperationCoordinator } from '../canonical/systemDataOperationCoordinator';
import { RESET_NOTICE } from './migrationReset';

interface DataContextType { activeCanonical:ActiveCanonicalBundle|null; activateCanonical:(bundle:ActiveCanonicalBundle)=>void; deactivateCanonical:()=>void; dataNotice:string; migrationError:string }
const DataContext=createContext<DataContextType>({activeCanonical:null,activateCanonical:()=>undefined,deactivateCanonical:()=>undefined,dataNotice:RESET_NOTICE,migrationError:''});
export function DataProvider({children}:{children:ReactNode}){
  const [initialPointer]=useState<ActiveCanonicalBundle|null>(()=>resolveActiveCanonicalBundle());
  const [legacyToMigrate,setLegacyToMigrate]=useState<ActiveCanonicalBundle|null>(()=>initialPointer&&initialPointer.engineVersion!==CANONICAL_ENGINE_VERSION?initialPointer:null);
  const [activeCanonical,setActiveCanonical]=useState<ActiveCanonicalBundle|null>(()=>initialPointer?.engineVersion===CANONICAL_ENGINE_VERSION?initialPointer:null);
  const [migrationError,setMigrationError]=useState('');
  useEffect(()=>{
    if(!legacyToMigrate)return;
    let cancelled=false;
    setMigrationError('');
    // A referência v18 permanece apenas como evidência para a migração. Ela não
    // é exposta pelo DataContext nem consumida pelas telas enquanto o rebuild v19
    // usa as 19 fontes locais + Admin Registry local atual.
    void systemDataOperationCoordinator.run('ENGINE_MIGRATION',async()=>rebuildForCanonicalEngine(legacyToMigrate,CANONICAL_ENGINE_VERSION,buildCanonicalFromStoredSources)).then(result=>{
      if(cancelled)return;
      if(result.status==='BUSY'){
        // Nenhuma fila obsoleta: uma operação concorrente continua dona do gate.
        // Mantemos o build legado não consumível e tentamos de novo após um tick
        // explícito do estado React, sem executar em paralelo.
        setLegacyToMigrate(current=>current?{...current}:current);
        return;
      }
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
  },[legacyToMigrate]);

  useEffect(()=>{
    let cancelled=false;
    const initialize=(observedM3:string|null|undefined,hasActiveBuild:boolean)=>{
      initializeCompetenceFromAvailableEvidence({
        hasActiveBuild,
        observedM3,
        // Lemos as metas no momento de aplicar a decisão. Isso também cobre
        // settings recém-restaurados por um snapshot legado enquanto M3 era lido.
        settingsCompetences:reportSettingsCompetences(),
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
      // A função relê CompetenceState aqui, depois do await. Assim uma decisão
      // manual feita durante a leitura assíncrona sempre prevalece.
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
  const dataNotice=migrationError||(legacyToMigrate?'Build legado identificado. Migração canônica v19 em andamento.':activeCanonical?`Build canônico ativo: ${activeCanonical.motorBuildId}.`:RESET_NOTICE);
  return <DataContext.Provider value={{activeCanonical,activateCanonical,deactivateCanonical:rollback,dataNotice,migrationError}}>{children}</DataContext.Provider>
}
export const useData=()=>useContext(DataContext);
