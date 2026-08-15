export type TopTab = {
  id: string
  label: string
  disabled?: boolean
}

type TopTabsProps = {
  tabs?: TopTab[]
  activeId?: string
  onChange?: (id: string) => void
  ariaLabel?: string
}

export function TopTabs({
  tabs = [],
  activeId,
  onChange,
  ariaLabel = 'Navegação da tela',
}: TopTabsProps) {
  return (
    <nav className="bj-top-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="bj-top-tab"
          aria-selected={tab.id === activeId}
          disabled={tab.disabled}
          onClick={() => onChange?.(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
