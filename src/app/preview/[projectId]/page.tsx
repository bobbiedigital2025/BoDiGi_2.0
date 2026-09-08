import { getProjectAnywhere } from '@/lib/agents/pipeline';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Minimal markdown → React renderer for the generated README.
 * Handles headings, bold/italic, inline code, code blocks, lists, links, tables (basic).
 * Keeps the preview self-contained without a markdown dependency.
 */
function renderMarkdown(md: string) {
  const blocks = md.split(/```/);
  const out: React.ReactNode[] = [];
  let key = 0;

  blocks.forEach((block, blockIdx) => {
    if (blockIdx % 2 === 1) {
      // Code block — first line is the language hint
      const lines = block.split('\n');
      const lang = lines[0].trim();
      const code = lines.slice(1).join('\n').replace(/^\n+|\n+$/g, '');
      out.push(
        <pre key={key++} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.5rem', padding: '1rem', overflowX: 'auto', fontSize: '0.8125rem', fontFamily: 'monospace', color: '#a5f3fc', margin: '1rem 0' }}>
          {lang && <div style={{ color: '#555', fontSize: '0.6875rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>{lang}</div>}
          <code>{code}</code>
        </pre>
      );
      return;
    }

    const lines = block.split('\n');
    let list: string[] = [];

    const flushList = () => {
      if (list.length === 0) return;
      out.push(
        <ul key={key++} style={{ margin: '0.75rem 0', paddingLeft: '1.5rem', color: '#bbb' }}>
          {list.map((item, i) => <li key={i} style={{ margin: '0.375rem 0', fontSize: '0.9375rem', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: inline(item) }} />)}
        </ul>
      );
      list = [];
    };

    const inline = (text: string): string =>
      text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#fff">$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:0.125rem 0.375rem;border-radius:0.25rem;font-size:0.8125rem;color:#a5f3fc">$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#67e8f9;text-decoration:underline">$1</a>');

    lines.forEach((line) => {
      const t = line.trim();
      if (/^#{1,6}\s/.test(t)) {
        flushList();
        const level = t.match(/^#+/)![0].length;
        const text = t.replace(/^#+\s*/, '');
        const sizes = ['1.75rem', '1.375rem', '1.125rem', '1rem', '0.9375rem', '0.875rem'];
        out.push(
          <div key={key++} style={{ fontSize: sizes[level - 1], fontWeight: 700, color: '#fff', margin: level <= 2 ? '1.75rem 0 0.75rem' : '1.25rem 0 0.5rem', borderBottom: level <= 2 ? '1px solid rgba(255,255,255,0.08)' : 'none', paddingBottom: level <= 2 ? '0.5rem' : 0 }} dangerouslySetInnerHTML={{ __html: inline(text) }} />
        );
      } else if (/^[-*]\s/.test(t) || /^\d+\.\s/.test(t)) {
        list.push(t.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));
      } else if (t === '---') {
        flushList();
        out.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '1.5rem 0' }} />);
      } else if (t.length > 0) {
        flushList();
        out.push(
          <p key={key++} style={{ margin: '0.75rem 0', color: '#bbb', fontSize: '0.9375rem', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: inline(t) }} />
        );
      }
    });
    flushList();
  });

  return <>{out}</>;
}

export default async function PreviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const data = await getProjectAnywhere(projectId);

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Preview not available</h2>
          <p style={{ color: '#666' }}>Project not found or pipeline not started yet.</p>
        </div>
      </div>
    );
  }

  const { state, files, testResults, complianceChecks } = data;

  // Fetch project owner's tier for branding badge (free tier shows BoDiGi 2.0 branding)
  let projectTier: string = 'free';
  try {
    const ownerId = (data as { userId?: string }).userId;
    if (ownerId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: profile } = await supabase
        .from('profiles')
        .select('tier')
        .eq('id', ownerId)
        .single();
      if (profile?.tier) projectTier = profile.tier;
    }
  } catch {
    // Default to free (show branding) if tier lookup fails — safest for business
  }

  const specs = state.specs;
  const arch = state.architecture;
  const frontendFiles = files.filter(f => f.agent === 'frontend');
  const dbFiles = files.filter(f => f.agent === 'database');
  const beFiles = files.filter(f => f.agent === 'backend');
  const devopsFiles = files.filter(f => f.agent === 'devops');
  const docsFiles = files.filter(f => f.agent === 'docs');

  const tests = (testResults || []) as Array<{ testName: string; type: string; status: string; duration: number; error: string | null }>;
  const checks = (complianceChecks || []) as Array<{ name: string; status: string; details: string }>;

  const passedTests = tests.filter(t => t.status === 'passed').length;
  const failedTests = tests.filter(t => t.status === 'failed').length;
  const passedChecks = checks.filter(c => c.status === 'passed').length;
  const failedChecks = checks.filter(c => c.status === 'failed').length;

  const readmeFile = docsFiles.find(f => f.path.endsWith('README.md'));
  const pitchFile = docsFiles.find(f => f.path.endsWith('INVESTOR_PITCH.md'));
  const realityFile = docsFiles.find(f => f.path.endsWith('REALITY_CHECK.md'));
  const launchFile = docsFiles.find(f => f.path.endsWith('LAUNCH_GUIDE.md'));
  // Legacy: single docs file that isn't one of the known names
  const legacyDocs = docsFiles.filter(f => f !== readmeFile && f !== pitchFile && f !== realityFile && f !== launchFile);

  const statusColor = state.status === 'done' ? '#10b981' : state.status === 'failed' ? '#ef4444' : '#a855f7';
  const statusLabel = state.status === 'done' ? 'Build Complete' : state.status === 'failed' ? 'Build Failed' : 'Building...';

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{state.name} — Live Preview</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; }
          .preview-header { position: sticky; top: 0; z-index: 100; background: rgba(10,10,10,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.08); padding: 0.75rem 1.5rem; display: flex; align-items: center; justify-content: space-between; }
          .preview-brand { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 1.1rem; }
          .preview-badge { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; }
          .preview-nav { display: flex; gap: 1.5rem; font-size: 0.875rem; color: #999; }
          .preview-nav a { color: #999; text-decoration: none; cursor: pointer; }
          .preview-nav a:hover { color: #fff; }
          .preview-hero { padding: 4rem 1.5rem; text-align: center; max-width: 900px; margin: 0 auto; }
          .preview-hero h1 { font-size: 3rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 1rem; background: linear-gradient(135deg, #a78bfa, #f0abfc, #67e8f9); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          .preview-hero p { font-size: 1.25rem; color: #999; margin-bottom: 2rem; }
          .preview-cta { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.875rem 2rem; border-radius: 0.75rem; font-weight: 600; font-size: 1rem; background: linear-gradient(135deg, #7c3aed, #c026d3, #0891b2); color: #fff; border: none; cursor: pointer; }
          .preview-section { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem; }
          .preview-section h2 { font-size: 1.75rem; font-weight: 700; margin-bottom: 1.5rem; }
          .feature-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
          .feature-card { padding: 1.25rem; border-radius: 0.75rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
          .feature-card h3 { font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem; }
          .feature-card p { font-size: 0.875rem; color: #888; }
          .priority-badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.6875rem; font-weight: 500; margin-bottom: 0.5rem; }
          .stack-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.75rem; }
          .stack-item { display: flex; gap: 0.5rem; align-items: center; padding: 0.75rem; border-radius: 0.5rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); font-size: 0.875rem; }
          .stack-key { color: #666; text-transform: capitalize; }
          .stack-val { color: #ccc; font-weight: 500; }
          .routes-list { display: flex; flex-direction: column; gap: 0.5rem; }
          .route-item { display: flex; gap: 0.75rem; align-items: center; padding: 0.625rem 1rem; border-radius: 0.5rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); font-size: 0.875rem; }
          .route-method { font-family: monospace; font-size: 0.75rem; font-weight: 700; padding: 0.125rem 0.375rem; border-radius: 0.25rem; }
          .route-path { font-family: monospace; color: #67e8f9; }
          .route-desc { color: #666; margin-left: auto; }
          .data-models { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
          .model-card { padding: 1rem; border-radius: 0.5rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); }
          .model-card h4 { font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem; color: #a78bfa; }
          .model-fields { font-size: 0.75rem; color: #888; font-family: monospace; }
          .file-list { display: flex; flex-direction: column; gap: 0.375rem; }
          .file-item { display: flex; gap: 0.5rem; align-items: center; padding: 0.5rem 0.75rem; border-radius: 0.375rem; background: rgba(255,255,255,0.02); font-family: monospace; font-size: 0.8125rem; }
          .file-agent { font-size: 0.6875rem; padding: 0.0625rem 0.375rem; border-radius: 9999px; margin-left: auto; }
          .test-row { display: flex; gap: 0.75rem; align-items: center; padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.8125rem; }
          .status-dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; flex-shrink: 0; }
          .progress-bar { height: 0.5rem; background: rgba(255,255,255,0.08); border-radius: 9999px; overflow: hidden; margin: 1rem 0; }
          .progress-fill { height: 100%; background: linear-gradient(90deg, #7c3aed, #c026d3); border-radius: 9999px; transition: width 0.5s ease; }
          .tab-bar { display: flex; gap: 0.5rem; padding: 0 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.06); max-width: 900px; margin: 0 auto; }
          .tab { padding: 0.75rem 1rem; font-size: 0.875rem; color: #666; cursor: pointer; border-bottom: 2px solid transparent; }
          .tab-btn { background: none; border: none; font-family: inherit; }
          .tab.active { color: #fff; border-bottom-color: #a855f7; }
          .tab:hover { color: #ccc; }
          .preview-footer { border-top: 1px solid rgba(255,255,255,0.06); padding: 2rem 1.5rem; text-align: center; color: #444; font-size: 0.8125rem; }
          .live-indicator { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.6875rem; color: #10b981; }
          .live-dot { width: 0.375rem; height: 0.375rem; border-radius: 50%; background: #10b981; animation: pulse 2s infinite; }
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          .meta-row { display: flex; gap: 1rem; font-size: 0.75rem; color: #666; margin-top: 0.5rem; }
          .meta-row span { display: flex; align-items: center; gap: 0.25rem; }
        `}</style>
      </head>
      <body>
        {/* Header */}
        <header className="preview-header">
          <div className="preview-brand">
            <div style={{ width: '1.75rem', height: '1.75rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #7c3aed, #c026d3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>
              {state.name.slice(0, 2).toUpperCase()}
            </div>
            {state.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {state.status !== 'done' && (
              <span className="live-indicator">
                <span className="live-dot"></span>
                LIVE BUILD
              </span>
            )}
            <span className="preview-badge" style={{ background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40` }}>
              {statusLabel}
            </span>
          </div>
        </header>

        {/* Progress */}
        <div className="preview-section" style={{ paddingTop: '1rem', paddingBottom: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem' }}>
            <span>Build Progress</span>
            <span>{data.progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${data.progress}%` }}></div>
          </div>
          <div className="meta-row">
            <span>Phase {state.currentPhase + 1}/7</span>
            <span>·</span>
            <span>{files.length} files generated</span>
            {data.ai?.connected && <><span>·</span><span>AI: {data.ai.model}</span></>}
          </div>
        </div>

        {/* View Tabs: App (default) | Docs | Build */}
        <div className="tab-bar">
          <button className="tab tab-btn active" data-tab="app">App</button>
          <button className="tab tab-btn" data-tab="docs">Docs</button>
          <button className="tab tab-btn" data-tab="build">Build Report</button>
        </div>

        {/* ============ TAB: THE APP ============ */}
        <div id="tab-app" className="tab-panel">

        {/* Hero */}
        <section className="preview-hero">
          <h1>{state.name}</h1>
          <p>{specs?.summary || state.idea}</p>
          <button className="preview-cta">Get Started →</button>
          {specs && (
            <div className="meta-row" style={{ justifyContent: 'center' }}>
              <span>Target: {specs.targetAudience}</span>
              <span>·</span>
              <span>Monetization: {specs.monetization}</span>
              <span>·</span>
              <span>Marketplace: {specs.marketplace}</span>
            </div>
          )}
        </section>

        {/* Features — this is what the app DOES */}
        {specs && specs.features.length > 0 && (
          <section className="preview-section">
            <h2>What it does</h2>
            <div className="feature-grid">
              {specs.features.map((f, i) => (
                <div key={i} className="feature-card">
                  <span className="priority-badge" style={{
                    background: f.priority === 'critical' ? '#ef444420' : f.priority === 'high' ? '#f59e0b20' : '#6b728020',
                    color: f.priority === 'critical' ? '#ef4444' : f.priority === 'high' ? '#f59e0b' : '#9ca3af',
                  }}>{f.priority}</span>
                  <h3>{f.name}</h3>
                  <p>{f.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pages — the actual screens of the app */}
        {arch?.pageRoutes && arch.pageRoutes.length > 0 && (
          <section className="preview-section">
            <h2>Screens</h2>
            <div className="feature-grid">
              {arch.pageRoutes.map((r, i) => (
                <div key={i} className="feature-card">
                  <span className="route-path" style={{ fontSize: '0.75rem' }}>{r.path}</span>
                  <h3 style={{ marginTop: '0.375rem' }}>{r.name}</h3>
                  <p>{r.role}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Data Models — what the app stores */}
        {arch?.dataModels && arch.dataModels.length > 0 && (
          <section className="preview-section">
            <h2>What it stores</h2>
            <div className="data-models">
              {arch.dataModels.map((m, i) => (
                <div key={i} className="model-card">
                  <h4>{m.name}</h4>
                  <div className="model-fields">
                    {m.fields.map((f, j) => (
                      <div key={j}>{f.name}: {f.type}{f.references ? ` → ${f.references}` : ''}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Deployment — only shown when a REAL deployment URL exists (future paid deploy feature).
            Never fabricated: see pipeline.ts DevOps note. */}
        {state.deploymentUrl && (
          <section className="preview-section">
            <div style={{ padding: '1.25rem', borderRadius: '0.75rem', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Deployed</span>
              <div style={{ marginTop: '0.5rem' }}>
                <a href={state.deploymentUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#67e8f9', textDecoration: 'underline', fontSize: '0.9375rem' }}>
                  {state.deploymentUrl}
                </a>
              </div>
            </div>
          </section>
        )}

        </div>{/* end tab-app */}

        {/* ============ TAB: DOCS ============ */}
        <div id="tab-docs" className="tab-panel" style={{ display: 'none' }}>
          <section className="preview-section" style={{ maxWidth: '760px', paddingTop: '2rem', paddingBottom: '4rem' }}>
            {docsFiles.length > 0 ? (
              <>
                {/* Document shelf — click to read */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
                  {readmeFile && (
                    <button className="doc-btn active" data-doc="readme" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#c4b5fd', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                      📘 README
                    </button>
                  )}
                  {pitchFile && (
                    <button className="doc-btn" data-doc="pitch" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#999', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                      💼 Investor Pitch
                    </button>
                  )}
                  {realityFile && (
                    <button className="doc-btn" data-doc="reality" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#999', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                      🔍 Reality Check
                    </button>
                  )}
                  {launchFile && (
                    <button className="doc-btn" data-doc="launch" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#999', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                      🚀 Launch Guide
                    </button>
                  )}
                </div>

                {/* Document panels */}
                {readmeFile && <div id="doc-readme" className="doc-panel">{renderMarkdown(readmeFile.content)}</div>}
                {pitchFile && <div id="doc-pitch" className="doc-panel" style={{ display: 'none' }}>{renderMarkdown(pitchFile.content)}</div>}
                {realityFile && <div id="doc-reality" className="doc-panel" style={{ display: 'none' }}>{renderMarkdown(realityFile.content)}</div>}
                {launchFile && <div id="doc-launch" className="doc-panel" style={{ display: 'none' }}>{renderMarkdown(launchFile.content)}</div>}
                {legacyDocs.map((f, i) => (
                  <div key={i}>{renderMarkdown(f.content)}</div>
                ))}

                {/* Download gate */}
                <div style={{ marginTop: '2.5rem', padding: '1.25rem', borderRadius: '0.75rem', background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(192,38,211,0.1))', border: '1px solid rgba(168,85,247,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>🔒 Download locked</div>
                    <div style={{ color: '#888', fontSize: '0.8125rem', marginTop: '0.25rem' }}>Read everything here. Upgrade to download these documents with your source code.</div>
                  </div>
                  <a href="/pricing" style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #7c3aed, #c026d3)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                    Upgrade to Download
                  </a>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: '#555', padding: '4rem 0' }}>
                <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>Documentation not ready yet</p>
                <p style={{ fontSize: '0.875rem' }}>The docs agent writes the README, Investor Pitch, and Reality Check at the end of the build.</p>
              </div>
            )}
          </section>
        </div>{/* end tab-docs */}

        {/* ============ TAB: BUILD REPORT ============ */}
        <div id="tab-build" className="tab-panel" style={{ display: 'none' }}>

        {/* Tech Stack */}
        {specs && Object.keys(specs.techStack).length > 0 && (
          <section className="preview-section">
            <h2>Tech Stack</h2>
            <div className="stack-grid">
              {Object.entries(specs.techStack).map(([k, v]) => (
                <div key={k} className="stack-item">
                  <span className="stack-key">{k}:</span>
                  <span className="stack-val">{v}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Architecture: Page Routes */}
        {arch?.pageRoutes && arch.pageRoutes.length > 0 && (
          <section className="preview-section">
            <h2>Page Routes</h2>
            <div className="routes-list">
              {arch.pageRoutes.map((r, i) => (
                <div key={i} className="route-item">
                  <span className="route-method" style={{ background: '#7c3aed20', color: '#a78bfa' }}>PAGE</span>
                  <span className="route-path">{r.path}</span>
                  <span className="route-desc">{r.name} ({r.role})</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Architecture: API Endpoints */}
        {arch?.apiEndpoints && arch.apiEndpoints.length > 0 && (
          <section className="preview-section">
            <h2>API Endpoints</h2>
            <div className="routes-list">
              {arch.apiEndpoints.map((e, i) => (
                <div key={i} className="route-item">
                  <span className="route-method" style={{
                    background: e.method === 'GET' ? '#10b98120' : e.method === 'POST' ? '#0891b220' : e.method === 'DELETE' ? '#ef444420' : '#f59e0b20',
                    color: e.method === 'GET' ? '#10b981' : e.method === 'POST' ? '#0891b2' : e.method === 'DELETE' ? '#ef4444' : '#f59e0b',
                  }}>{e.method}</span>
                  <span className="route-path">{e.path}</span>
                  <span className="route-desc">{e.description}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Architecture: Data Models */}
        {arch?.dataModels && arch.dataModels.length > 0 && (
          <section className="preview-section">
            <h2>Data Models</h2>
            <div className="data-models">
              {arch.dataModels.map((m, i) => (
                <div key={i} className="model-card">
                  <h4>{m.name}</h4>
                  <div className="model-fields">
                    {m.fields.map((f, j) => (
                      <div key={j}>{f.name}: {f.type}{f.references ? ` → ${f.references}` : ''}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Test Results */}
        {tests.length > 0 && (
          <section className="preview-section">
            <h2>Test Results ({passedTests} passed, {failedTests} failed)</h2>
            <div style={{ borderRadius: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {tests.map((t, i) => (
                <div key={i} className="test-row">
                  <span className="status-dot" style={{ background: t.status === 'passed' ? '#10b981' : t.status === 'failed' ? '#ef4444' : '#666' }}></span>
                  <span style={{ color: '#ccc' }}>{t.testName}</span>
                  <span style={{ color: '#555', fontSize: '0.6875rem' }}>{t.type}</span>
                  <span style={{ marginLeft: 'auto', color: '#555', fontSize: '0.6875rem' }}>{t.duration}ms</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Compliance Checks */}
        {checks.length > 0 && (
          <section className="preview-section">
            <h2>Compliance Audit ({passedChecks} passed, {failedChecks} failed)</h2>
            <div style={{ borderRadius: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {checks.map((c, i) => (
                <div key={i} className="test-row">
                  <span className="status-dot" style={{ background: c.status === 'passed' ? '#10b981' : '#ef4444' }}></span>
                  <span style={{ color: '#ccc', fontWeight: 500 }}>{c.name}</span>
                  <span style={{ color: '#555', fontSize: '0.75rem', marginLeft: 'auto' }}>{c.details}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Generated Files */}
        {files.length > 0 && (
          <section className="preview-section">
            <h2>Generated Files ({files.length})</h2>
            <div className="file-list">
              {frontendFiles.map((f, i) => (
                <div key={`fe-${i}`} className="file-item">
                  <span style={{ color: '#67e8f9' }}>▶</span>
                  <span style={{ color: '#ccc' }}>{f.path}</span>
                  <span className="file-agent" style={{ background: '#67e8f920', color: '#67e8f9' }}>frontend</span>
                </div>
              ))}
              {beFiles.map((f, i) => (
                <div key={`be-${i}`} className="file-item">
                  <span style={{ color: '#a78bfa' }}>▶</span>
                  <span style={{ color: '#ccc' }}>{f.path}</span>
                  <span className="file-agent" style={{ background: '#a78bfa20', color: '#a78bfa' }}>backend</span>
                </div>
              ))}
              {dbFiles.map((f, i) => (
                <div key={`db-${i}`} className="file-item">
                  <span style={{ color: '#f59e0b' }}>▶</span>
                  <span style={{ color: '#ccc' }}>{f.path}</span>
                  <span className="file-agent" style={{ background: '#f59e0b20', color: '#f59e0b' }}>database</span>
                </div>
              ))}
              {devopsFiles.map((f, i) => (
                <div key={`do-${i}`} className="file-item">
                  <span style={{ color: '#10b981' }}>▶</span>
                  <span style={{ color: '#ccc' }}>{f.path}</span>
                  <span className="file-agent" style={{ background: '#10b98120', color: '#10b981' }}>devops</span>
                </div>
              ))}
              {docsFiles.map((f, i) => (
                <div key={`dc-${i}`} className="file-item">
                  <span style={{ color: '#ec4899' }}>▶</span>
                  <span style={{ color: '#ccc' }}>{f.path}</span>
                  <span className="file-agent" style={{ background: '#ec489920', color: '#ec4899' }}>docs</span>
                </div>
              ))}
            </div>
          </section>
        )}

        </div>{/* end tab-build */}

        <footer className="preview-footer">
          {/* BoDiGi 2.0 branding — shown on free-tier previews, removed for paid tiers */}
          {(!projectTier || projectTier === 'free') && (
            <div style={{ marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '9999px', background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(192,38,211,0.15))', border: '1px solid rgba(168,85,247,0.3)' }}>
              <span style={{ fontWeight: 800, background: 'linear-gradient(135deg, #a78bfa, #e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '0.02em' }}>BoDiGi 2.0</span>
              <span style={{ color: '#888', fontSize: '0.8125rem' }}>made by Bobbie Digital</span>
            </div>
          )}
          <p>{state.name} — Live preview by BoDiGi 2.0. Built with AI agents.</p>
          <p style={{ marginTop: '0.25rem' }}>Project ID: {state.id} · {files.length} files · {data.progress}% complete</p>
        </footer>

        {/* Tab switching + doc switching + auto-refresh script */}
        <script dangerouslySetInnerHTML={{ __html: `
          document.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
              document.querySelectorAll('.tab-panel').forEach(function(p) { p.style.display = 'none'; });
              btn.classList.add('active');
              document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
            });
          });
          document.querySelectorAll('.doc-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              document.querySelectorAll('.doc-btn').forEach(function(b) {
                b.style.background = 'rgba(255,255,255,0.03)';
                b.style.borderColor = 'rgba(255,255,255,0.1)';
                b.style.color = '#999';
              });
              document.querySelectorAll('.doc-panel').forEach(function(p) { p.style.display = 'none'; });
              btn.style.background = 'rgba(168,85,247,0.1)';
              btn.style.borderColor = 'rgba(168,85,247,0.3)';
              btn.style.color = '#c4b5fd';
              document.getElementById('doc-' + btn.dataset.doc).style.display = 'block';
            });
          });
          if (window.parent === window) {
            // Standalone mode — auto-refresh every 3s while building
            setInterval(() => { window.location.reload(); }, 3000);
          }
        `}} />
      </body>
    </html>
  );
}
