'use client';

/**
 * PreviewTabs — owns the App | Docs | Build Report tab state on the
 * project preview page. Replaces the raw inline <script> that fought
 * React hydration: tab switching is real state now, and hash deep-links
 * (#docs, #build) activate the right tab on mount.
 *
 * Children are passed as three named slots so the heavy tab contents
 * stay server-rendered (docs prose, build report tables).
 */

import { useState, useEffect, ReactNode } from 'react';

type Tab = 'app' | 'docs' | 'build';

export function PreviewTabs({
  app,
  docs,
  build,
}: {
  app: ReactNode;
  docs: ReactNode;
  build: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('app');

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace('#', '');
      if (h === 'docs' || h === 'marketing') setTab('docs');
      else if (h === 'build') setTab('build');
      else if (h === 'app') setTab('app');
      // #deploy / #modify stay on the App tab (those sections live there)
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const btn = (t: Tab, label: string) => (
    <button
      className={`tab tab-btn${tab === t ? ' active' : ''}`}
      data-tab={t}
      onClick={() => setTab(t)}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="tab-bar">
        {btn('app', 'App')}
        {btn('docs', 'Docs')}
        {btn('build', 'Build Report')}
      </div>

      <div id="tab-app" className="tab-panel" style={{ display: tab === 'app' ? 'block' : 'none' }}>
        {app}
      </div>
      <div id="tab-docs" className="tab-panel" style={{ display: tab === 'docs' ? 'block' : 'none' }}>
        {docs}
      </div>
      <div id="tab-build" className="tab-panel" style={{ display: tab === 'build' ? 'block' : 'none' }}>
        {build}
      </div>
    </>
  );
}
