'use client';

/**
 * Docs protection — copy-blocking + per-user watermark.
 * Not unbreakable (nothing stops a phone photo) but makes casual theft
 * hard and any leak traceable: the viewer's email is stamped across
 * every document.
 */

import { useEffect, ReactNode } from 'react';

export function DocsProtect({ email, children }: { email: string; children: ReactNode }) {
  useEffect(() => {
    const docsRoot = document.getElementById('tab-docs');
    if (!docsRoot) return;

    const block = (e: Event) => {
      e.preventDefault();
      return false;
    };

    // Block right-click and copy/cut/paste inside docs
    docsRoot.addEventListener('contextmenu', block);
    docsRoot.addEventListener('copy', block);
    docsRoot.addEventListener('cut', block);

    // Block Ctrl+C / Ctrl+X / Ctrl+P / Ctrl+S while in docs
    const keys = (e: KeyboardEvent) => {
      if (!docsRoot.contains(document.activeElement) && !isOverDocs) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'p', 's'].includes(k)) {
        e.preventDefault();
      }
    };
    let isOverDocs = false;
    const enter = () => { isOverDocs = true; };
    const leave = () => { isOverDocs = false; };
    docsRoot.addEventListener('mouseenter', enter);
    docsRoot.addEventListener('mouseleave', leave);
    document.addEventListener('keydown', keys);

    // Kill text selection styling inside docs
    const style = document.createElement('style');
    style.id = 'docs-protect-style';
    style.textContent = `
      #tab-docs { -webkit-user-select: none; -moz-user-select: none; user-select: none; }
      #tab-docs .doc-panel * { -webkit-user-select: none; -moz-user-select: none; user-select: none; }
    `;
    document.head.appendChild(style);

    return () => {
      docsRoot.removeEventListener('contextmenu', block);
      docsRoot.removeEventListener('copy', block);
      docsRoot.removeEventListener('cut', block);
      docsRoot.removeEventListener('mouseenter', enter);
      docsRoot.removeEventListener('mouseleave', leave);
      document.removeEventListener('keydown', keys);
      style.remove();
    };
  }, []);

  return (
    <>
      {children}
      {/* Watermark layer — email stamped diagonally over the docs tab */}
      {email && (
        <style>{`
          #tab-docs { position: relative; overflow: hidden; }
          #tab-docs .docs-watermark {
            position: absolute; inset: 0; pointer-events: none; z-index: 5;
            display: flex; flex-wrap: wrap; align-content: space-around; justify-content: space-around;
            opacity: 0.07; transform: rotate(-24deg); overflow: hidden;
            font-family: system-ui; font-size: 1rem; font-weight: 600; color: #fff;
            line-height: 4.5rem; letter-spacing: 0.12em; text-align: center;
          }
        `}</style>
      )}
      {email && (
        <div
          className="docs-watermark"
          aria-hidden="true"
          ref={(el) => {
            // Fill the layer with repeated email stamps
            if (el && el.childElementCount === 0) {
              const stamps = Math.max(24, Math.floor((el.clientWidth || 800) / 120) * 8);
              for (let i = 0; i < stamps; i++) {
                const s = document.createElement('span');
                s.textContent = email;
                s.style.padding = '0 1.5rem';
                el.appendChild(s);
              }
            }
          }}
        >
          {/* populated by ref above */}
        </div>
      )}
    </>
  );
}
