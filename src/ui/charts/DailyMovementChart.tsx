type DailyMovementPoint = {
  date: string;
  invoiced: number;
  toInvoice: number;
  total: number;
};

const compactBRL = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return `R$ ${Math.round(value).toLocaleString('pt-BR')}`;
};

function linePath(values: number[], x: (index: number) => number, y: (value: number) => number) {
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(' ');
}

export function DailyMovementChart({ data }: { data: DailyMovementPoint[] }) {
  if (!data.length) return null;

  const width = 1120;
  const height = 300;
  const pad = { top: 24, right: 24, bottom: 48, left: 84 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(...data.flatMap(item => [item.total, item.invoiced, item.toInvoice]), 1);
  const ceiling = maxValue * 1.12;
  const x = (index: number) => pad.left + (index / Math.max(data.length - 1, 1)) * innerWidth;
  const y = (value: number) => pad.top + innerHeight - (value / ceiling) * innerHeight;
  const totalValues = data.map(item => item.total);
  const invoicedValues = data.map(item => item.invoiced);
  const toInvoiceValues = data.map(item => item.toInvoice);
  const totalPath = linePath(totalValues, x, y);
  const invoicedPath = linePath(invoicedValues, x, y);
  const toInvoicePath = linePath(toInvoiceValues, x, y);
  const totalArea = `${totalPath} L ${x(data.length - 1).toFixed(2)} ${(pad.top + innerHeight).toFixed(2)} L ${x(0).toFixed(2)} ${(pad.top + innerHeight).toFixed(2)} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const labelStep = data.length > 24 ? 5 : data.length > 15 ? 3 : data.length > 9 ? 2 : 1;

  return (
    <div style={{ marginTop: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ color: 'var(--panel-muted)', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Gráfico do movimento</div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--panel-muted)' }}>
          <Legend color="#ef3340" label="Sell Out" />
          <Legend color="#60a5fa" label="Faturado" />
          <Legend color="#4ade80" label="A Faturar" dashed />
        </div>
      </div>
      <div style={{ width: '100%', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', background: 'rgba(0,0,0,0.12)', padding: '8px 6px 2px' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Gráfico diário de faturado, a faturar e Sell Out" style={{ display: 'block', minWidth: data.length > 20 ? '900px' : '720px' }}>
          <defs>
            <linearGradient id="movement-total-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef3340" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#ef3340" stopOpacity="0.015" />
            </linearGradient>
          </defs>

          {grid.map(level => {
            const value = ceiling * level;
            const gy = y(value);
            return (
              <g key={level}>
                <line x1={pad.left} y1={gy} x2={width - pad.right} y2={gy} stroke="rgba(255,255,255,0.075)" strokeWidth="1" />
                <text x={pad.left - 12} y={gy + 4} textAnchor="end" fill="#8794a8" fontSize="10">{compactBRL(value)}</text>
              </g>
            );
          })}

          <path d={totalArea} fill="url(#movement-total-area)" />
          <path d={totalPath} fill="none" stroke="#ef3340" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <path d={invoicedPath} fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={toInvoicePath} fill="none" stroke="#4ade80" strokeWidth="2.2" strokeDasharray="7 5" strokeLinejoin="round" strokeLinecap="round" />

          {data.map((item, index) => (
            <g key={item.date}>
              <circle cx={x(index)} cy={y(item.total)} r="3.4" fill="#ef3340" stroke="#11161d" strokeWidth="1.5" />
              {(index % labelStep === 0 || index === data.length - 1) ? (
                <text x={x(index)} y={height - 18} textAnchor="middle" fill="#8794a8" fontSize="10">
                  {new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ display: 'inline-block', width: '22px', borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
      {label}
    </span>
  );
}
