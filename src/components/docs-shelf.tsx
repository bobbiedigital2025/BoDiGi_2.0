'use client';

import { useState } from 'react';

/**
 * DocsShelf — the document shelf in the Preview Docs tab.
 * Real React state for doc switching (replaces fragile inline-script
 * DOM manipulation). Renders markdown as readable documents:
 * headings, lists, bold, links — prose first, code de-emphasized.
 */

type DocFile = { name: string; content: string };

const DOC_META: Record<string, { label: string; emoji: string; pro?: boolean }> = {
  readme: { label: 'README', emoji: '📘' },
  pitch: { label: 'Investor Pitch', emoji: '💼' },
  reality: { label: 'Reality Check', emoji: '🔍' },
  launch: { label: 'Launch Guide', emoji: '🚀' },
  marketing: { label: 'Marketing Kit', emoji: '✨', pro: true },
};

function docKey(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes('readme')) return 'readme';
  if (n.includes('investor') || n.includes('pitch')) return 'pitch';
  if (n.includes('reality')) return 'reality';
  if (n.includes('launch')) return 'launch';
  if (n.includes('marketing')) return 'marketing';
  return null;
}

/** Escape HTML then apply inline markdown (bold, italic, code, links). */
function inline(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#fff">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:0.125rem 0.375rem;border-radius:0.25rem;font-size:0.8125rem;color:#a5f3fc">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#67e8f9;text-decoration:underline">$1</a>');
}

function renderMarkdown(md: string) {
  const blocks = md.split('```');
  const out: React.ReactNode[] = [];
  let key = 0;

  blocks.forEach((block, blockIdx) => {
    if (blockIdx % 2 === 1) {
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
        <ul key={key++} style={{ margin: '0.75rem 0', paddingLeft: '1.5rem', color: '#c9c9d1' }}>
          {list.map((item, i) => <li key={i} style={{ margin: '0.375rem 0', fontSize: '0.9375rem', lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: inline(item) }} />)}
        </ul>
      );
      list = [];
    };

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
          <p key={key++} style={{ margin: '0.75rem 0', color: '#c9c9d1', fontSize: '0.9375rem', lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: inline(t) }} />
        );
      }
    });
    flushList();
  });

  return out;
}

export function DocsShelf({ docs, canDownload, projectId }: { docs: DocFile[]; canDownload: boolean; projectId: string }) {
  const [active, setActive] = useState<string>(() => (docs.length ? docKey(docs[0].name) || 'readme' : 'readme'));

  const known = docs.filter((d) => docKey(d.name));
  const legacy = docs.filter((d) => !docKey(d.name));

  const activeDoc = known.find((d) => docKey(d.name) === active) || known[0];

  if (docs.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#555', padding: '4rem 0' }}>
        <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>Documentation not ready yet</p>
        <p style={{ fontSize: '0.875rem' }}>The docs agent writes the README, Investor Pitch, and Reality Check at the end of the build.</p>
      </div>
    );
  }

  return (
    <>
      {/* Document shelf — click to read */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {known.map((d) => {
          const k = docKey(d.name)!;
          const meta = DOC_META[k];
          const isActive = k === active;
          return (
            <button
              key={k}
              onClick={() => setActive(k)}
              style={isActive
                ? { padding: '0.75rem 1.25rem', borderRadius: '0.75rem', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#c4b5fd', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }
                : { padding: '0.75rem 1.25rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#999', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
            >
              {meta.emoji} {meta.label}
              {meta.pro && (
                <span style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.05em', background: 'linear-gradient(135deg, #7c3aed, #c026d3)', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', color: '#fff', verticalAlign: 'middle', marginLeft: '0.25rem' }}>PRO</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active document, rendered as readable prose */}
      {activeDoc && (
        <article style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0.75rem', padding: '2rem', minHeight: '300px' }}>
          {renderMarkdown(activeDoc.content)}
        </article>
      )}

      {/* Legacy/extra docs rendered below the active one */}
      {legacy.map((f, i) => (
        <article key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0.75rem', padding: '2rem', marginTop: '1.5rem' }}>
          {renderMarkdown(f.content)}
        </article>
      ))}

      {/* Download gate */}
      <div style={{ marginTop: '2.5rem', padding: '1.25rem', borderRadius: '0.75rem', background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(192,38,211,0.1))', border: '1px solid rgba(168,85,247,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>{canDownload ? '✅ Download included' : '⬇️ Download with watermark'}</div>
          <div style={{ color: '#888', fontSize: '0.8125rem', marginTop: '0.25rem' }}>
            {canDownload ? 'Grab the full ZIP — docs plus your complete source code.' : 'Free plan: your docs come watermarked as BoDiGi 2.0\u2019s Property. Upgrade any time to remove it.'}
          </div>
        </div>
        <a href={`/api/generate/${projectId}/download`} style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #7c3aed, #c026d3)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
          Download ZIP{canDownload ? '' : ' (watermarked)'}
        </a>
        {canDownload ? null : (
          <a href="/pricing" style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #7c3aed, #c026d3)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
            Upgrade to Remove Watermark
          </a>
        )}
      </div>
    </>
  );
}
