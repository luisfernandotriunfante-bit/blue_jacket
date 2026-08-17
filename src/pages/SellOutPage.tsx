import React, { useState, useMemo } from 'react';
import { useData, CoordenadorSellOut, DiaVenda } from '../store/DataContext';

const T = {
  bg: '#0d1117',
  card: 'rgba(255,255,255,0.05)',
  cardBorder: 'rgba(255,255,255,0.1)',
  cardBlur: 'blur(24px)',
  cardShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
  red: '#e31b2d',
  redDark: '#b80f20',
  redGlow: 'rgba(227,27,45,0.18)',
  muted: '#8b9ab0',
  mutedLight: '#b0bdd1',
  text: '#e7ecf4',
  textDim: '#c5cedd',
  panel: 'rgba(13,17,23,0.85)',
  separator: 'rgba(255,255,255,0.07)',
};

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const fmtInt = (v: number) => v.toLocaleString('pt-BR');
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

function classifyLine(desc: string): string {
  const d = (desc || '').toUpperCase();
  if (/^CD\b/.test(d) || d.includes('CREME DENTAL') || d.includes('DENTIFRICIO')) return 'Creme Dental';
  if (/^SAB\b/.test(d) || d.includes('SABONETE')) return 'Sabonetes';
  if (/^(SH|COND|CR PENT|KIT SH)\b/.test(d) || d.includes('SHAMPOO') || d.includes('CONDICIONADOR')) return 'Hair';
  if (/^(ED|ENX|ENXAG|FITA DENT|FIO|GD)\b/.test(d) || d.includes('ESCOVA DENTAL') || d.includes('ENXAGUANTE') || d.includes('FIO DENTAL')) return 'Esc + Enx + Fio';
  if (/^(PINHO SOL|LIMP|LAVA ROUPA|AJAX|DESINF|DESENG)\b/.test(d) || d.includes('LIMPADOR') || d.includes('DESINFETANTE')) return 'Limpeza';
  return '';
}

const LINES = ['Creme Dental', 'Esc + Enx + Fio', 'Sabonetes', 'Hair', 'Limpeza'] as const;

function LineChart({ days }: { days: DiaVenda[] }) {
  const W = 520, H = 200, PAD = { top: 16, right: 20, bottom: 28, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...days.map(d => Math.max(d.faturado, d.venda)), 1);
  const maxPos = Math.max(...days.map(d => d.positivacao), 1);
  const xScale = (i: number) => (i / Math.max(days.length - 1, 1)) * chartW;
  const yScale = (v: number) => chartH - (v / maxVal) * chartH;
  const yScalePos = (v: number) => chartH - (v / maxPos) * chartH;
  const buildPath = (vals: number[], scale: (v: number) => number) => {
    if (!vals.some(v => v > 0)) return '';
    return vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)},${scale(v).toFixed(1)}`).join(' ');
  };
  const buildArea = (vals: number[], scale: (v: number) => number) => {
    const path = buildPath(vals, scale);
    if (!path) return '';
    const last = vals.length - 1;
    return `${path} L ${xScale(last).toFixed(1)},${chartH} L 0,${chartH} Z`;
  };
  const fatVals = days.map(d => d.faturado);
  const vendVals = days.map(d => d.venda);
  const posVals = days.map(d => d.positivacao);
  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="grad-fat" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.red} stopOpacity="0.4" /><stop offset="100%" stopColor={T.red} stopOpacity="0.02" /></linearGradient>
        <linearGradient id="grad-vend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity="0.25" /><stop offset="100%" stopColor="#16a34a" stopOpacity="0.01" /></linearGradient>
        <clipPath id="chart-clip"><rect x="0" y="0" width={chartW} height={chartH} /></clipPath>
      </defs>
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {gridLines.map(pct => {
          const y = chartH - pct * chartH;
          const val = pct * maxVal;
          return <g key={pct}><line x1="0" y1={y} x2={chartW} y2={y} stroke={T.separator} strokeWidth="1" /><text x="-6" y={y + 4} textAnchor="end" fill={T.muted} fontSize="9">{val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}</text></g>;
        })}
        <g clipPath="url(#chart-clip)"><path d={buildArea(vendVals, yScale)} fill="url(#grad-vend)" /><path d={buildArea(fatVals, yScale)} fill="url(#grad-fat)" /></g>
        <g clipPath="url(#chart-clip)"><path d={buildPath(vendVals, yScale)} fill="none" stroke="#16a34a" strokeWidth="2" strokeDasharray="5,3" strokeLinecap="round" /><path d={buildPath(fatVals, yScale)} fill="none" stroke={T.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />{maxPos > 0 && <path d={buildPath(posVals, yScalePos)} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" />}</g>
        {days.map((d, i) => { if (days.length > 20 && i % 5 !== 0 && i !== days.length - 1) return null; const day = parseInt(d.data.split('-')[2]); return <text key={d.data} x={xScale(i)} y={chartH + 16} textAnchor="middle" fill={T.muted} fontSize="9">{day}</text>; })}
      </g>
    </svg>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'navy' | 'default' }) {
  const accentColor = tone === 'red' ? T.red : tone === 'navy' ? '#3b82f6' : T.mutedLight;
  return (
    <div style={{ background: T.card, borderTop: `1px solid ${T.cardBorder}`, borderRight: `1px solid ${T.cardBorder}`, borderBottom: `1px solid ${T.cardBorder}`, borderLeft: `4px solid ${accentColor}`, borderRadius: '16px', padding: '20px 22px', backdropFilter: T.cardBlur, WebkitBackdropFilter: T.cardBlur, boxShadow: T.cardShadow, position: 'relative', overflow: 'hidden' }}>
      {tone === 'red' && <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 80% 20%, ${T.redGlow}, transparent 60%)`, pointerEvents: 'none' }} />}
      <div style={{ color: accentColor, fontSize: '10px', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '10px' }}>{label}</div>
      <div style={{ color: T.text, fontSize: 'clamp(1.3rem, 2.5vw, 2rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function DailyTable({ days }: { days: DiaVenda[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '0 0 12px', borderBottom: `1px solid ${T.separator}` }}><div style={{ color: T.red, fontSize: '10px', fontWeight: 900, letterSpacing: '0.13em', textTransform: 'uppercase' }}>DETALHE</div><div style={{ color: T.text, fontWeight: 700, fontSize: '1rem', marginTop: '4px' }}>Fechamento por dia</div></div>
      <div style={{ flex: 1, overflowY: 'auto', marginTop: '4px' }} className="bj-custom-scroll">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}><thead><tr style={{ position: 'sticky', top: 0, background: T.bg }}><th style={{ padding: '8px 8px 8px 0', textAlign: 'left', color: T.muted, fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: `1px solid ${T.separator}` }}>DIA</th><th style={{ padding: '8px', textAlign: 'right', color: T.muted, fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: `1px solid ${T.separator}` }}>SELL OUT</th><th style={{ padding: '8px 0 8px 8px', textAlign: 'right', color: T.muted, fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: `1px solid ${T.separator}` }}>FATURADO</th></tr></thead>
          <tbody>{days.map(d => { const parts = d.data.split('-'); const day = parseInt(parts[2]); const MONTHS = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']; const mon = MONTHS[parseInt(parts[1]) - 1] || parts[1]; return <tr key={d.data} style={{ borderBottom: `1px solid ${T.separator}` }}><td style={{ padding: '9px 8px 9px 0' }}><div style={{ color: T.text, fontWeight: 700, fontSize: '0.95rem', lineHeight: 1 }}>{day}</div><div style={{ color: T.muted, fontSize: '0.65rem', marginTop: '2px' }}>{mon}</div></td><td style={{ padding: '9px 8px', textAlign: 'right', color: d.venda > 0 ? '#22c55e' : T.muted }}>{d.venda > 0 ? fmtBRL(d.venda) : 'R$ 0,00'}</td><td style={{ padding: '9px 0 9px 8px', textAlign: 'right', color: d.faturado > 0 ? T.text : T.muted }}>{fmtBRL(d.faturado)}</td></tr>; })}</tbody>
        </table>
      </div>
    </div>
  );
}

function SellOutPorLinha({ dias }: { dias: DiaVenda[] }) {
  return (
    <section style={{ marginTop: '0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}><div style={{ flex: 1 }}><div style={{ color: T.red, fontSize: '10px', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase' }}>SELL OUT POR LINHA</div></div><div style={{ fontSize: '0.7rem', color: T.muted, background: 'rgba(227,27,45,0.1)', border: '1px solid rgba(227,27,45,0.3)', borderRadius: '20px', padding: '4px 12px' }}>Classificação por EAN a validar</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>{LINES.map((line, i) => <div key={line} style={{ background: i === 0 ? 'rgba(227,27,45,0.12)' : 'rgba(255,255,255,0.04)', border: i === 0 ? `1px solid rgba(227,27,45,0.35)` : `1px solid rgba(255,255,255,0.1)`, borderRadius: '16px', padding: '18px 16px', backdropFilter: T.cardBlur, WebkitBackdropFilter: T.cardBlur, boxShadow: i === 0 ? `0 4px 24px rgba(227,27,45,0.15), ${T.cardShadow}` : T.cardShadow }}><div style={{ color: i === 0 ? T.red : T.muted, fontSize: '9px', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '10px' }}>{line}</div><div style={{ color: T.text, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.03em' }}>—</div><div style={{ color: T.muted, fontSize: '0.7rem', marginTop: '6px' }}>Aguardando EAN map</div></div>)}</div>
      <div style={{ marginTop: '12px', color: T.muted, fontSize: '0.7rem', fontStyle: 'italic' }}>Prévia montada pelo agrupamento/descrição do 8022. A classificação definitiva será fechada por EAN.</div>
    </section>
  );
}

function GerencialTab({ coordenadores }: { coordenadores: CoordenadorSellOut[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setExpanded(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const totalFat = coordenadores.reduce((s, c) => s + c.faturado, 0);
  const totalAFat = coordenadores.reduce((s, c) => s + c.aFaturar, 0);
  const totalPos = coordenadores.reduce((s, c) => s + c.positivacao, 0);
  const col = (label: string) => ({ padding: '11px 14px', textAlign: 'right' as const, color: T.muted, fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' as const, letterSpacing: '0.1em', borderBottom: `2px solid ${T.separator}` });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>{coordenadores.map((coord, i) => { const colors = [T.red, '#3b82f6', '#8b5cf6', '#10b981']; const c = colors[i % colors.length]; return <div key={coord.codCoord || coord.nomeCoord} style={{ background: T.card, borderTop: `1px solid ${T.cardBorder}`, borderRight: `1px solid ${T.cardBorder}`, borderBottom: `1px solid ${T.cardBorder}`, borderLeft: `4px solid ${c}`, borderRadius: '16px', padding: '20px', backdropFilter: T.cardBlur, WebkitBackdropFilter: T.cardBlur, boxShadow: T.cardShadow }}><div style={{ color: c, fontSize: '9px', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>Coordenador</div><div style={{ color: T.text, fontWeight: 800, fontSize: '1.05rem', marginBottom: '14px' }}>{coord.nomeCoord}</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>{[{ label: 'Faturado', value: fmtBRL(coord.faturado), color: T.text }, { label: 'A Faturar', value: coord.aFaturar > 0 ? fmtBRL(coord.aFaturar) : '—', color: '#22c55e' }, { label: 'Positivação', value: fmtInt(coord.positivacao), color: '#a78bfa' }, { label: 'Part.', value: totalFat > 0 ? fmtPct(coord.faturado / totalFat) : '—', color: c }].map(item => <div key={item.label}><div style={{ color: T.muted, fontSize: '0.68rem', marginBottom: '3px' }}>{item.label}</div><div style={{ color: item.color, fontWeight: 700, fontSize: '0.9rem' }}>{item.value}</div></div>)}</div></div>; })}</div>
      <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: '18px', overflow: 'hidden', backdropFilter: T.cardBlur, WebkitBackdropFilter: T.cardBlur, boxShadow: T.cardShadow }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.separator}` }}><div style={{ color: T.red, fontSize: '10px', fontWeight: 900, letterSpacing: '0.13em', textTransform: 'uppercase' }}>EQUIPE</div><div style={{ color: T.text, fontWeight: 700, fontSize: '1rem', marginTop: '4px' }}>Breakdown por Coordenador e Vendedor</div><div style={{ color: T.muted, fontSize: '0.75rem', marginTop: '2px' }}>Clique no coordenador para expandir</div></div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}><thead><tr style={{ background: 'rgba(0,0,0,0.3)' }}><th style={{ ...col(''), textAlign: 'left', paddingLeft: '20px' }}>Nome</th><th style={col('Faturado')}>Faturado (R$)</th><th style={col('A Faturar')}>A Faturar (R$)</th><th style={col('Total')}>Total (R$)</th><th style={col('Posit.')}>Posit.</th></tr></thead>
          <tbody>{coordenadores.map(coord => { const key = coord.codCoord || coord.nomeCoord; const isOpen = expanded.has(key); return <React.Fragment key={key}><tr onClick={() => toggle(key)} style={{ cursor: 'pointer', background: 'rgba(227,27,45,0.05)', borderBottom: `1px solid ${T.separator}`, transition: 'background 0.15s' }}><td style={{ padding: '13px 14px 13px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ color: T.red, fontSize: '0.75rem', transition: 'transform 0.2s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span><div><div style={{ color: T.text, fontWeight: 800 }}>{coord.nomeCoord}</div><div style={{ color: T.muted, fontSize: '0.7rem' }}>{coord.vendedores.length} vendedor(es)</div></div></td><td style={{ padding: '13px 14px', textAlign: 'right', color: T.text, fontWeight: 700 }}>{fmtBRL(coord.faturado)}</td><td style={{ padding: '13px 14px', textAlign: 'right', color: coord.aFaturar > 0 ? '#22c55e' : T.muted }}>{coord.aFaturar > 0 ? fmtBRL(coord.aFaturar) : '—'}</td><td style={{ padding: '13px 14px', textAlign: 'right', color: T.text, fontWeight: 700 }}>{fmtBRL(coord.faturado + coord.aFaturar)}</td><td style={{ padding: '13px 14px', textAlign: 'right', color: '#a78bfa', fontWeight: 700 }}>{coord.positivacao}</td></tr>{isOpen && coord.vendedores.map((v, vi) => <tr key={v.codVendedor || v.nomeVendedor} style={{ background: vi % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'transparent', borderBottom: `1px solid ${T.separator}` }}><td style={{ padding: '10px 14px 10px 48px' }}><div style={{ color: T.textDim, fontWeight: 600, fontSize: '0.85rem' }}>{v.nomeVendedor.replace(/^(CLT\s*-\s*|PJ\s*-\s*)/i, '')}</div><div style={{ color: T.muted, fontSize: '0.68rem' }}>Cód. {v.codVendedor}</div></td><td style={{ padding: '10px 14px', textAlign: 'right', color: T.text }}>{fmtBRL(v.faturado)}</td><td style={{ padding: '10px 14px', textAlign: 'right', color: v.aFaturar > 0 ? '#22c55e' : T.muted }}>{v.aFaturar > 0 ? fmtBRL(v.aFaturar) : '—'}</td><td style={{ padding: '10px 14px', textAlign: 'right', color: T.textDim }}>{fmtBRL(v.faturado + v.aFaturar)}</td><td style={{ padding: '10px 14px', textAlign: 'right', color: '#a78bfa' }}>{v.positivacao}</td></tr>)}</React.Fragment>; })}</tbody>
          <tfoot><tr style={{ background: 'rgba(227,27,45,0.08)', borderTop: `2px solid rgba(227,27,45,0.25)` }}><td style={{ padding: '12px 14px 12px 20px', color: T.red, fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Geral</td><td style={{ padding: '12px 14px', textAlign: 'right', color: T.text, fontWeight: 800 }}>{fmtBRL(totalFat)}</td><td style={{ padding: '12px 14px', textAlign: 'right', color: '#22c55e', fontWeight: 800 }}>{fmtBRL(totalAFat)}</td><td style={{ padding: '12px 14px', textAlign: 'right', color: T.text, fontWeight: 800 }}>{fmtBRL(totalFat + totalAFat)}</td><td style={{ padding: '12px 14px', textAlign: 'right', color: '#a78bfa', fontWeight: 800 }}>{fmtInt(totalPos)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

function ResumoTab({ sellOut }: { sellOut: NonNullable<ReturnType<typeof useData>['sellOut']> }) {
  const totalSellOut = sellOut.faturadoTotal + sellOut.aFaturarTotal;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 0.8fr', gap: '14px' }}><KpiCard label="SELL OUT TOTAL" value={fmtBRL(totalSellOut)} tone="red" /><KpiCard label="FATURADO" value={fmtBRL(sellOut.faturadoTotal)} tone="navy" /><KpiCard label="A FATURAR" value={fmtBRL(sellOut.aFaturarTotal)} /><KpiCard label="POSITIVAÇÃO" value={fmtInt(sellOut.positivacaoFaturado)} /></div>
      <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: '18px', padding: '24px', backdropFilter: T.cardBlur, WebkitBackdropFilter: T.cardBlur, boxShadow: T.cardShadow }}><div style={{ marginBottom: '20px', borderBottom: `1px solid ${T.separator}`, paddingBottom: '16px' }}><div style={{ color: T.red, fontSize: '10px', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase' }}>MOVIMENTO DIÁRIO</div><div style={{ color: T.text, fontWeight: 700, fontSize: '1rem', marginTop: '4px' }}>Faturado, a faturar e positivação</div></div><div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px', minHeight: '260px' }}><div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}><div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '20px', height: '2px', background: T.red }} /><span style={{ color: T.muted, fontSize: '0.72rem' }}>Faturado</span></div><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '20px', height: '2px', background: '#16a34a', borderTop: '2px dashed #16a34a' }} /><span style={{ color: T.muted, fontSize: '0.72rem' }}>A faturar</span></div><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '20px', height: '2px', background: '#3b82f6' }} /><span style={{ color: T.muted, fontSize: '0.72rem' }}>Positivações</span></div></div><LineChart days={sellOut.diasDeVenda} /></div><DailyTable days={sellOut.diasDeVenda} /></div></div>
      <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: '18px', padding: '24px', backdropFilter: T.cardBlur, WebkitBackdropFilter: T.cardBlur, boxShadow: T.cardShadow }}><SellOutPorLinha dias={sellOut.diasDeVenda} /></div>
      <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: '18px', padding: '24px', backdropFilter: T.cardBlur, WebkitBackdropFilter: T.cardBlur, boxShadow: T.cardShadow }}><div style={{ marginBottom: '18px' }}><div style={{ color: T.red, fontSize: '10px', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase' }}>TOP CLIENTES</div><div style={{ color: T.text, fontWeight: 700, fontSize: '1rem', marginTop: '4px' }}>Ranking por faturamento acumulado</div></div><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}><thead><tr>{['#', 'Cliente', 'Cidade', 'Faturado', 'A Faturar'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: h === '#' || h === 'Cliente' || h === 'Cidade' ? 'left' : 'right', color: T.muted, fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: `1px solid ${T.separator}` }}>{h}</th>)}</tr></thead><tbody>{sellOut.topClientes.slice(0, 12).map((c, i) => <tr key={c.cnpj || c.nome} style={{ borderBottom: `1px solid ${T.separator}` }}><td style={{ padding: '9px 12px', color: T.muted, fontWeight: 700 }}>{i + 1}</td><td style={{ padding: '9px 12px', color: T.text, fontWeight: 600, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</td><td style={{ padding: '9px 12px', color: T.muted, fontSize: '0.78rem' }}>{c.cidade}</td><td style={{ padding: '9px 12px', textAlign: 'right', color: T.text, fontWeight: 700 }}>{fmtBRL(c.faturado)}</td><td style={{ padding: '9px 12px', textAlign: 'right', color: c.aFaturar > 0 ? '#22c55e' : T.muted }}>{c.aFaturar > 0 ? fmtBRL(c.aFaturar) : '—'}</td></tr>)}</tbody></table></div>
    </div>
  );
}

type TabId = 'resumo' | 'gerencial';

export function SellOutPage() {
  const { sellOut } = useData();
  const [activeTab, setActiveTab] = useState<TabId>('resumo');
  if (!sellOut) {
    return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '20px', textAlign: 'center' }}><div style={{ fontSize: '4rem' }}>📊</div><h2 style={{ color: T.text, fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Nenhum Relatório de Vendas Carregado</h2><p style={{ color: T.muted, maxWidth: '420px', lineHeight: 1.6 }}>Vá em <strong style={{ color: T.red }}>Configurações</strong> e faça upload do arquivo{' '}<strong style={{ color: T.text }}>vendas-8022.xls</strong> para visualizar o Sell Out.</p></div>;
  }
  const tabs: { id: TabId; label: string }[] = [{ id: 'resumo', label: 'Resumo' }, { id: 'gerencial', label: 'Gerencial' }];
  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      <div style={{ background: 'linear-gradient(118deg, #0e1728 0%, #172742 65%, #311a27 100%)', borderBottom: `4px solid ${T.red}`, padding: '28px 40px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}><div><div style={{ color: '#bec8da', fontSize: '11px', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>BLUE JACKET</div><h1 style={{ color: 'white', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 800, letterSpacing: '-0.04em', margin: '6px 0 0' }}>Sell Out</h1></div><div style={{ textAlign: 'right' }}><div style={{ color: '#c5cedd', fontSize: '0.75rem', marginBottom: '4px' }}>Total do Período</div><div style={{ color: 'white', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.04em' }}>{fmtBRL(sellOut.faturadoTotal + sellOut.aFaturarTotal)}</div></div></div>
      <div style={{ display: 'flex', gap: '4px', padding: '0 40px', borderBottom: `1px solid ${T.separator}`, background: 'rgba(13,17,23,0.95)', backdropFilter: 'blur(14px)', position: 'sticky', top: 0, zIndex: 20 }}>{tabs.map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ background: 'none', border: 'none', borderBottom: activeTab === tab.id ? `3px solid ${T.red}` : '3px solid transparent', color: activeTab === tab.id ? T.red : T.muted, padding: '16px 18px 14px', fontWeight: 750, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s ease', whiteSpace: 'nowrap', marginBottom: '-1px' }}>{tab.label}</button>)}</div>
      <div style={{ padding: '28px 40px 56px', maxWidth: '1540px', margin: '0 auto' }}>{activeTab === 'resumo' ? <ResumoTab sellOut={sellOut} /> : <GerencialTab coordenadores={sellOut.coordenadores} />}</div>
    </div>
  );
}
