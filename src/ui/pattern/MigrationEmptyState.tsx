import { PanelAlert, PanelCard, PanelEmptyState, PanelKpi, PanelPage, PanelSectionHeader } from './PanelVisual';
import { RESET_NOTICE } from '../../store/migrationReset';

export function MigrationPage({ title, heading, description, columns = [], kpis = [] }: {
  title: string;
  heading: string;
  description: string;
  columns?: string[];
  kpis?: string[];
}) {
  return <PanelPage title={title} metricLabel="Situação" metricValue="Sem dados">
    <div className="panel-stack">
      <PanelAlert tone="warning">{RESET_NOTICE}</PanelAlert>
      {kpis.length ? <div className="panel-grid panel-grid-auto">{kpis.map(label => <PanelKpi key={label} label={label} value="0" detail="Sem carga oficial" />)}</div> : null}
      <PanelCard>
        <PanelSectionHeader eyebrow="ETAPA 1 · CASCA VISUAL" title={heading} description={description} />
        {columns.length ? <div className="panel-table-wrap"><table className="panel-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody><tr><td colSpan={columns.length}><PanelEmptyState variant="compact" title="Sem dados oficiais" description="A tabela será preenchida somente pelos novos motores, após uma nova carga oficial." /></td></tr></tbody></table></div> : <PanelEmptyState variant="section" title="Sem dados oficiais" description="Esta área permanece disponível, mas a carga e os cálculos anteriores foram removidos." />}
      </PanelCard>
    </div>
  </PanelPage>;
}
