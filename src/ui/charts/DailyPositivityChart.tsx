type PositivityPoint = {
  date: string;
  invoicedPositivation: number;
  totalPositivation: number;
};

function linePath(values: number[], x: (index: number) => number, y: (value: number) => number) {
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(' ');
}

export function DailyPositivityChart({ data }: { data: PositivityPoint[] }) {
  if (!data.length) return null;

  const width = 720;
  const height = 222;
  const pad = { top: 18, right: 18, bottom: 36, left: 46 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(...data.flatMap(item => [item.invoicedPositivation, item.totalPositivation]), 1);
  const ceiling = Math.max(Math.ceil(maxValue * 1.15), 2);
  const x = (index: number) => pad.left + (index / Math.max(data.length - 1, 1)) * innerWidth;
  const y = (value: number) => pad.top + innerHeight - (value / ceiling) * innerHeight;
  const invoiced = data.map(item => item.invoicedPositivation);
  const total = data.map(item => item.totalPositivation);
  const grid = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '14px', flexWrap: 'wrap', marginBottom: '6px', color: 'var(--panel-muted)', fontSize: '0.68rem' }}>
        <Legend color="#a78bfa" label="Pos. total" />
        <Legend color="#60a5fa" label="Pos. faturada" />
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Movimentação diária de positivação" style={{ display: 'block', minWidth: '500px' }}>
        <defs>
          <linearGradient id="positivity-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.015" />
          </linearGradient>
        </defs>
        {grid.map(level => {
          const value = ceiling * level;
          const gy = y(value);
          return (
            <g key={level}>
              <line x1={pad.left} y1={gy} x2={width - pad.right} y2={gy} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
              <text x={pad.left - 9} y={gy + 4} textAnchor="end" fill="#8794a8" fontSize="9">{Math.round(value)}</text>
            </g>
          );
        })}
        <path d={`${linePath(total, x, y)} L ${x(data.length - 1)} ${pad.top + innerHeight} L ${x(0)} ${pad.top + innerHeight} Z`} fill="url(#positivity-area)" />
        <path d={linePath(total, x, y)} fill="none" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath(invoiced, x, y)} fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((item, index) => (
          <g key={item.date}>
            <circle cx={x(index)} cy={y(item.totalPositivation)} r="3.2" fill="#a78bfa" stroke="#11161d" strokeWidth="1.3" />
            <text x={x(index)} y={height - 13} textAnchor="middle" fill="#8794a8" fontSize="9">
              {new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ width: '18px', borderTop: `2px solid ${color}` }} />
      {label}
    </span>
  );
}
