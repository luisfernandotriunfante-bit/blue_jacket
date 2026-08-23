import { readFileSync, writeFileSync, rmSync } from 'node:fs';

function edit(path, fn){const source=readFileSync(path,'utf8');const next=fn(source);if(next===source)throw new Error(`Nenhuma alteração aplicada em ${path}`);writeFileSync(path,next,'utf8')}

edit('src/pages/ClientesSortimentoUnifiedPage.tsx', source => {
  let s=source;
  s=s.replace("import { PanelCard, PanelEmptyState, PanelKpi, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';", "import { PanelCard, PanelEmptyState, PanelKpi, PanelPage, PanelSectionHeader, PanelStat } from '../ui/pattern/PanelVisual';");
  s=s.replace("<div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) minmax(280px,2fr)', gap: 12, marginTop: 14 }}>", "<div className=\"panel-grid panel-grid-2\" style={{ marginTop: 14 }}>");
  s=s.replace("<input className=\"panel-input\" placeholder=\"Buscar CNPJ, cliente, rede, cidade ou faixa\"", "<input className=\"panel-input panel-input-full\" placeholder=\"Buscar CNPJ, cliente, rede, cidade ou faixa\"");
  s=s.replace("<select className=\"panel-input\" value={selectedCnpj}", "<select className=\"panel-select panel-input-full\" value={selectedCnpj}");
  s=s.replace(/\{\[\['Ambiente',[\s\S]*?\.map\(\(\[label,value\]\)=><div key=\{label\} style=\{\{padding:12,border:'1px solid rgba\(255,255,255,.07\)',borderRadius:12\}\}><div className=\"panel-mini-label\">\{label\}<\/div><strong style=\{\{color:'white',display:'block',marginTop:5\}\}>\{value\}<\/strong><\/div>\)\}/, `{[['Ambiente',result.customer.environment||'—'],['Perfil',result.customer.profile||'—'],['Faixa',result.customer.tier||'—'],['Canal',result.customer.assortmentChannel||'—'],['Vendedor',result.customer.vendorCode||'—'],['Coordenação',result.customer.coordinatorName||'—']].map(([label,value])=><PanelStat key={label} label={label} value={value} />)}`);
  s=s.replace("<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 16 }}>", "<div className=\"panel-grid panel-grid-compact\" style={{ marginTop: 16 }}>");
  s=s.replace("<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}>", "<div className=\"panel-grid panel-grid-auto\">");
  s=s.replace("<div style={{display:'grid',gap:10,marginTop:14}}>{result.promotions.map(rule=><div key={rule.id} style={{padding:14,border:'1px solid rgba(255,255,255,.08)',borderRadius:12}}><strong>{rule.name}</strong><div className=\"panel-muted\">{rule.benefit||'Benefício não informado'}</div></div>)}</div>", "<div className=\"panel-grid panel-grid-auto\" style={{marginTop:14}}>{result.promotions.map(rule=><PanelStat key={rule.id} label={rule.name} value={rule.benefit||'Benefício não informado'} />)}</div>");
  s=s.replaceAll('<PanelEmptyState icon="✓"', '<PanelEmptyState variant="compact"');
  s=s.replaceAll('<PanelEmptyState icon="◇"', '<PanelEmptyState variant="section"');
  s=s.replaceAll('<PanelEmptyState icon="◎"', '<PanelEmptyState variant="section"');
  s=s.replaceAll('<PanelEmptyState icon="◆"', '<PanelEmptyState variant="page"');
  return s;
});

edit('src/pages/ConfiguracoesPage.tsx', source => {
  let s=source;
  s=s.replace("import { PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';", "import { PanelAlert, PanelCard, PanelPage, PanelSectionHeader } from '../ui/pattern/PanelVisual';");
  s=s.replace("className={`panel-dropzone${isDragging ? ' is-dragging' : ''}`}", "className={`panel-dropzone panel-dropzone-compact${isDragging ? ' is-dragging' : ''}`}");
  s=s.replace(" style={{ marginTop: '16px', minHeight: '96px', cursor: 'pointer', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '18px' }}", " style={{ marginTop: '16px' }}");
  s=s.replaceAll("style={{ color: '#fca5a5'", "style={{ color: 'var(--panel-red-soft)'");
  s=s.replaceAll("style={{ color: '#fcd34d'", "style={{ color: 'var(--panel-amber-soft)'");
  return s;
});

rmSync('scripts/standardize-pages.mjs');
rmSync('.github/workflows/standardize-pages.yml');
