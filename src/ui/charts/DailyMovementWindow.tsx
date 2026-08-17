import { useEffect, useMemo, useState } from 'react';
import { DailyMovementChart } from './DailyMovementChart';

type MovementDay = {
  date: string;
  invoiced: number;
  toInvoice: number;
  total: number;
  invoicedPositivation: number;
  totalPositivation: number;
};

const fmtBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInt = (value: number) => Math.round(value || 0).toLocaleString('pt-BR');
const fmtDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR');
const fmtShortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function buildCalendar(data: MovementDay[]) {
  if (!data.length) return [] as MovementDay[];
  const ordered = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(ordered.map(item => [item.date, item]));
  const firstActual = ordered[0].date;
  const latest = ordered[ordered.length - 1].date;
  const minimumWeekStart = addDays(latest, -6);
  const start = firstActual < minimumWeekStart ? firstActual : minimumWeekStart;
  const days: MovementDay[] = [];
  for (let cursor = start; cursor <= latest; cursor = addDays(cursor, 1)) {
    days.push(byDate.get(cursor) || {
      date: cursor,
      invoiced: 0,
      toInvoice: 0,
      total: 0,
      invoicedPositivation: 0,
      totalPositivation: 0,
    });
  }
  return days;
}

export function DailyMovementWindow({ data }: { data: MovementDay[] }) {
  const calendar = useMemo(() => buildCalendar(data), [data]);
  const latestDate = calendar.length ? calendar[calendar.length - 1].date : '';
  const maxEnd = Math.max(calendar.length - 1, 0);
  const minEnd = Math.min(6, maxEnd);
  const [endIndex, setEndIndex] = useState(maxEnd);

  useEffect(() => {
    setEndIndex(maxEnd);
  }, [latestDate, maxEnd]);

  if (!calendar.length) return null;

  const safeEnd = Math.min(Math.max(endIndex, minEnd), maxEnd);
  const startIndex = Math.max(0, safeEnd - 6);
  const visible = calendar.slice(startIndex, safeEnd + 1);
  const isLatest = safeEnd === maxEnd;
  const isEarliest = safeEnd === minEnd;
  const periodStart = visible[0]?.date || '';
  const periodEnd = visible[visible.length - 1]?.date || '';

  const move = (direction: number) => setEndIndex(current => Math.min(maxEnd, Math.max(minEnd, current + direction)));

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(220px, 1fr) auto', gap: '12px', alignItems: 'center', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', background: 'rgba(0,0,0,0.12)' }}>
        <button type="button" onClick={() => move(-1)} disabled={isEarliest} aria-label="Mover período um dia para trás" style={navButtonStyle(isEarliest)}>‹</button>
        <div style={{ display: 'grid', gap: '7px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ color: 'white', fontSize: '0.82rem', fontWeight: 750 }}>{fmtShortDate(periodStart)} — {fmtShortDate(periodEnd)}</div>
            <button type="button" onClick={() => setEndIndex(maxEnd)} disabled={isLatest} style={{ border: 0, background: 'transparent', color: isLatest ? 'var(--panel-muted)' : '#ef3340', cursor: isLatest ? 'default' : 'pointer', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', padding: 0 }}>Mais atual</button>
          </div>
          <input
            aria-label="Mover janela de sete dias"
            type="range"
            min={minEnd}
            max={maxEnd}
            step={1}
            value={safeEnd}
            onChange={event => setEndIndex(Number(event.target.value))}
            style={{ width: '100%', accentColor: '#ef3340', cursor: maxEnd > minEnd ? 'ew-resize' : 'default' }}
          />
        </div>
        <button type="button" onClick={() => move(1)} disabled={isLatest} aria-label="Mover período um dia para frente" style={navButtonStyle(isLatest)}>›</button>
      </div>

      <DailyMovementChart data={visible} />

      <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
          <div style={{ color: 'var(--panel-muted)', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Planilha diária · mesma semana</div>
          <div style={{ color: 'var(--panel-muted)', fontSize: '0.7rem' }}>{fmtDate(periodStart)} até {fmtDate(periodEnd)}</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead><tr>{['Data','Faturado','A Faturar','Sell Out','Pos. Fat.','Pos. Total'].map((heading, index) => <th key={heading} style={{ padding: '10px 12px', textAlign: index === 0 ? 'left' : 'right', color: 'var(--panel-muted)', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{heading}</th>)}</tr></thead>
            <tbody>{visible.map(day => <tr key={day.date} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}><td style={{ padding: '10px 12px', color: 'white', fontWeight: 650 }}>{fmtDate(day.date)}</td><td style={{ padding: '10px 12px', textAlign: 'right', color: 'white' }}>{fmtBRL(day.invoiced)}</td><td style={{ padding: '10px 12px', textAlign: 'right', color: '#4ade80' }}>{fmtBRL(day.toInvoice)}</td><td style={{ padding: '10px 12px', textAlign: 'right', color: 'white', fontWeight: 750 }}>{fmtBRL(day.total)}</td><td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--panel-muted)' }}>{fmtInt(day.invoicedPositivation)}</td><td style={{ padding: '10px 12px', textAlign: 'right', color: '#c4b5fd' }}>{fmtInt(day.totalPositivation)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function navButtonStyle(disabled: boolean) {
  return {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: disabled ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.06)',
    color: disabled ? 'rgba(255,255,255,0.22)' : 'white',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '1.5rem',
    lineHeight: 1,
  } as const;
}
