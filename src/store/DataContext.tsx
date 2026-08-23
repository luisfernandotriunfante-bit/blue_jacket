import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { applyManualConfiguration, type CanonicalState, DEFAULT_MANUAL_CONFIGURATION, type ManualConfiguration } from '../domain/canonical';
import { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';
import { clearCanonicalState, loadCanonicalState, saveCanonicalState } from './canonicalPersistence';
import { competenceFromCanonical, loadManualConfiguration, normalizeManualConfiguration, saveManualConfiguration } from './competencePersistence';
import { getCanonicalSnapshotCompatibilityIssue } from './snapshotCompatibility';

interface DataContextType {
  canonical: CanonicalState | null;
  setCanonical: (data: CanonicalState | null) => void;
  manualConfig: ManualConfiguration;
  setManualConfig: (config: ManualConfiguration) => void;
  dataNotice: string;
  clearDataNotice: () => void;
}

const DataContext = createContext<DataContextType>({
  canonical: null,
  setCanonical: () => {},
  manualConfig: DEFAULT_MANUAL_CONFIGURATION,
  setManualConfig: () => {},
  dataNotice: '',
  clearDataNotice: () => {},
});

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [canonicalBase, setCanonicalBase] = useState<CanonicalState | null>(null);
  const [manualConfig, setManualConfigState] = useState<ManualConfiguration>(DEFAULT_MANUAL_CONFIGURATION);
  const [manualConfigPersistenceError, setManualConfigPersistenceError] = useState('');
  const [dataNotice, setDataNotice] = useState('');

  React.useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const stored = await loadCanonicalState();
      const storedUnified = stored && isUnifiedCanonicalState(stored) ? stored : null;
      const compatibilityIssue = getCanonicalSnapshotCompatibilityIssue(storedUnified || stored);
      const storedCanonical = storedUnified && !compatibilityIssue ? storedUnified : null;
      if (stored && !storedCanonical) await clearCanonicalState();
      const competence = competenceFromCanonical(storedCanonical);
      const manualLoad = loadManualConfiguration(localStorage, competence, { migrateLegacy: false });
      if (cancelled) return;
      setCanonicalBase(storedCanonical);
      setDataNotice(compatibilityIssue);
      setManualConfigState(manualLoad.config);
      setManualConfigPersistenceError(manualLoad.persistenceError || '');
    };
    void hydrate().catch(error => console.error('Não foi possível restaurar a base canônica.', error));
    return () => { cancelled = true; };
  }, []);

  const activeCompetence = useMemo(() => competenceFromCanonical(canonicalBase), [canonicalBase]);
  const canonical = useMemo(() => {
    const configured = applyManualConfiguration(canonicalBase, manualConfig);
    if (!configured || !manualConfigPersistenceError) return configured;
    return { ...configured, warnings: Array.from(new Set([...configured.warnings, manualConfigPersistenceError])) };
  }, [canonicalBase, manualConfig, manualConfigPersistenceError]);

  const setCanonical = (data: CanonicalState | null) => {
    if (data && !isUnifiedCanonicalState(data)) {
      console.error('Snapshot rejeitado: o Blue Jacket aceita somente UnifiedDataLayer.');
      return;
    }

    const nextCompetence = competenceFromCanonical(data);
    setCanonicalBase(data);
    if (data) {
      setDataNotice('');
      void saveCanonicalState(data).catch(error => console.error('Não foi possível persistir a base canônica no IndexedDB.', error));
      if (nextCompetence && nextCompetence !== activeCompetence) {
        const nextLoad = loadManualConfiguration(localStorage, nextCompetence, { migrateLegacy: false });
        setManualConfigState(nextLoad.config);
        setManualConfigPersistenceError(nextLoad.persistenceError || '');
      }
    } else {
      setManualConfigPersistenceError('');
      void clearCanonicalState();
    }
  };

  const setManualConfig = (config: ManualConfiguration) => {
    const normalized = normalizeManualConfiguration(config);
    setManualConfigState(normalized);
    if (!activeCompetence) return;
    try {
      saveManualConfiguration(localStorage, activeCompetence, normalized);
      setManualConfigPersistenceError('');
    } catch (error) {
      const message = `Configuração ${activeCompetence}: falha ao persistir alterações (${error instanceof Error ? error.message : 'erro desconhecido'}).`;
      setManualConfigPersistenceError(message);
      console.error(message, error);
    }
  };

  return (
    <DataContext.Provider value={{ canonical, setCanonical, manualConfig, setManualConfig, dataNotice, clearDataNotice: () => setDataNotice('') }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
