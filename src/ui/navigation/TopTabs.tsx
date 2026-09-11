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
          tabIndex={tab.id === activeId ? 0 : -1}
          onKeyDown={event => {
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
            event.preventDefault();
            const enabled=tabs.filter(item => !item.disabled), index=enabled.findIndex(item => item.id === tab.id);
            const next=event.key==='Home'?0:event.key==='End'?enabled.length-1:(index+(event.key==='ArrowRight'?1:-1)+enabled.length)%enabled.length;
            onChange?.(enabled[next].id);
            const buttons=event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');buttons?.[next]?.focus();
          }}
          onClick={() => onChange?.(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

