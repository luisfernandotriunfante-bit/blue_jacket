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
  compact?: boolean
  flush?: boolean
}>

export function PanelCard({ className = '', style, compact = false, flush = false, children }: PanelCardProps) {
  const classes = ['panel-card', compact ? 'panel-card-compact' : '', flush ? 'panel-card-flush' : '', className].filter(Boolean).join(' ')
  return <section className={classes} style={style}>{children}</section>
}

type PanelKpiTone = 'red' | 'blue' | 'green' | 'purple' | 'amber' | 'default'

type PanelKpiProps = {
  label: string
  value: ReactNode
  tone?: PanelKpiTone
  detail?: ReactNode
}

export function PanelKpi({ label, value, tone = 'default', detail }: PanelKpiProps) {
  return (
    <div className={`panel-kpi panel-kpi-${tone}`}>
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

type EmptyStateVariant = 'page' | 'section' | 'compact'

type PanelEmptyStateProps = {
  icon?: ReactNode
  title: string
  description: ReactNode
  variant?: EmptyStateVariant
}

export function PanelEmptyState({ icon = '◇', title, description, variant = 'section' }: PanelEmptyStateProps) {
  return (
    <div className={`panel-empty-state panel-empty-state-${variant}`}>
      <div className="panel-empty-icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}

type AlertTone = 'info' | 'success' | 'warning' | 'error'

export function PanelAlert({ tone = 'info', children }: PropsWithChildren<{ tone?: AlertTone }>) {
  return <div className={`panel-alert panel-alert-${tone}`}>{children}</div>
}

type PanelTabsProps<T extends string> = {
  tabs: Array<{ id: T; label: string; disabled?: boolean }>
  activeId: T
  onChange: (id: T) => void
  ariaLabel?: string
}

export function PanelTabs<T extends string>({ tabs, activeId, onChange, ariaLabel = 'Navegação da seção' }: PanelTabsProps<T>) {
  return (
    <div className="panel-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          className="panel-tab"
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function PanelSectionNav({ items, ariaLabel = 'Índice da página' }: { items: Array<{ id: string; label: string }>; ariaLabel?: string }) {
  return (
    <nav className="panel-section-nav" aria-label={ariaLabel}>
      {items.map(item => <a key={item.id} href={`#${item.id}`} className="panel-section-nav-link">{item.label}</a>)}
    </nav>
  );
}

export function PanelDisclosure({ eyebrow, title, description, action, defaultOpen = false, children }: PropsWithChildren<{ eyebrow: string; title: string; description?: ReactNode; action?: ReactNode; defaultOpen?: boolean }>) {
  return (
    <details className="panel-disclosure" open={defaultOpen}>
      <summary className="panel-disclosure-summary">
        <span className="panel-disclosure-copy"><span className="panel-eyebrow">{eyebrow}</span><strong>{title}</strong>{description ? <span>{description}</span> : null}</span>
        <span className="panel-disclosure-action">{action}<span className="panel-disclosure-chevron" aria-hidden="true">⌄</span></span>
      </summary>
      <div className="panel-disclosure-content">{children}</div>
    </details>
  );
}

export function PanelStat({ label, value, note, tone = 'default' }: { label: ReactNode; value: ReactNode; note?: ReactNode; tone?: PanelKpiTone }) {
  const toneClass = tone === 'default' ? '' : ` panel-stat-${tone}`
  return (
    <div className={`panel-stat${toneClass}`}>
      <div className="panel-mini-label">{label}</div>
      <div className="panel-stat-value">{value}</div>
      {note ? <div className="panel-stat-note">{note}</div> : null}
    </div>
  )
}

export function PanelInfoRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="panel-info-row">
      <span className="panel-info-label">{label}</span>
      <strong className="panel-info-value">{value}</strong>
    </div>
  )
}
