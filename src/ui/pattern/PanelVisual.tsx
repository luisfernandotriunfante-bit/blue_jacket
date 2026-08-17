import type { CSSProperties, PropsWithChildren, ReactNode } from 'react'

type PanelPageProps = PropsWithChildren<{
  title: string
  eyebrow?: string
  metricLabel?: string
  metricValue?: ReactNode
}>

export function PanelPage({
  title,
  eyebrow = 'BLUE JACKET',
  metricLabel,
  metricValue,
  children,
}: PanelPageProps) {
  return (
    <div className="panel-page">
      <header className="panel-page-header">
        <div>
          <div className="panel-eyebrow panel-eyebrow-neutral">{eyebrow}</div>
          <h1 className="panel-page-title">{title}</h1>
        </div>
        {metricLabel && metricValue !== undefined ? (
          <div className="panel-header-metric">
            <div className="panel-header-metric-label">{metricLabel}</div>
            <div className="panel-header-metric-value">{metricValue}</div>
          </div>
        ) : null}
      </header>
      <div className="panel-page-content">{children}</div>
    </div>
  )
}

type PanelCardProps = PropsWithChildren<{
  className?: string
  style?: CSSProperties
}>

export function PanelCard({ className = '', style, children }: PanelCardProps) {
  return <section className={`panel-card ${className}`.trim()} style={style}>{children}</section>
}

type PanelKpiTone = 'red' | 'blue' | 'green' | 'purple' | 'amber' | 'default'

type PanelKpiProps = {
  label: string
  value: ReactNode
  tone?: PanelKpiTone
  detail?: ReactNode
}

const RED_SELL_OUT_KPIS = new Set([
  'Sell Out Total',
  'Faturado',
  'A Faturar',
  'Positivação Total',
  'Meta Sell Out T&C',
  'Tendência',
  'Necessário / dia',
  'Meta Positivação',
])

export function PanelKpi({ label, value, tone = 'default', detail }: PanelKpiProps) {
  const effectiveTone: PanelKpiTone = RED_SELL_OUT_KPIS.has(label) ? 'red' : tone

  return (
    <div className={`panel-kpi panel-kpi-${effectiveTone}`}>
      <div className="panel-kpi-glow" aria-hidden="true" />
      <div className="panel-kpi-label">{label}</div>
      <div className="panel-kpi-value">{value}</div>
      {detail ? <div className="panel-kpi-detail">{detail}</div> : null}
    </div>
  )
}

type PanelSectionHeaderProps = {
  eyebrow: string
  title: string
  description?: ReactNode
  action?: ReactNode
}

export function PanelSectionHeader({ eyebrow, title, description, action }: PanelSectionHeaderProps) {
  return (
    <div className="panel-section-header">
      <div className="panel-section-copy">
        <div className="panel-eyebrow">{eyebrow}</div>
        <div className="panel-section-title">{title}</div>
        {description ? <div className="panel-section-description">{description}</div> : null}
      </div>
      {action ? <div className="panel-section-action">{action}</div> : null}
    </div>
  )
}

type PanelEmptyStateProps = {
  icon?: ReactNode
  title: string
  description: ReactNode
}

export function PanelEmptyState({ icon = '◇', title, description }: PanelEmptyStateProps) {
  return (
    <div className="panel-empty-state">
      <div className="panel-empty-icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}
