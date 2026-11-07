import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { CampusMap } from './views/CampusMap';
import { TreeTestScene } from './views/TreeTestScene';

function App() {
  const [viewMode, setViewMode] = useState<'twin' | 'dashboard' | 'tree-test'>(() => {
    if (typeof window === 'undefined') return 'twin';
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view === 'tree-test') return 'tree-test';
    if (view === 'dashboard') return 'dashboard';
    return 'twin';
  });

  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent<{ view: 'twin' | 'dashboard' }>;
      if (customEvent.detail?.view) {
        setViewMode(customEvent.detail.view);
      }
    };

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'NAVIGATE_TWIN') {
        setViewMode('twin');
        const url = new URL(window.location.href);
        url.searchParams.delete('view');
        window.history.pushState(null, '', url.toString());
      }
    };

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('view');
      if (v === 'dashboard') {
        setViewMode('dashboard');
      } else {
        setViewMode('twin');
      }
    };

    window.addEventListener('campusops:navigate', handleNavigate);
    window.addEventListener('message', handleMessage);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('campusops:navigate', handleNavigate);
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const switchView = (mode: 'twin' | 'dashboard') => {
    setViewMode(mode);
    const url = new URL(window.location.href);
    if (mode === 'dashboard') {
      url.searchParams.set('view', 'dashboard');
    } else {
      url.searchParams.delete('view');
    }
    window.history.pushState(null, '', url.toString());
  };

  if (viewMode === 'tree-test') return <TreeTestScene />;

  return (
    <div className="campusops-app-root">
      {/* Top Global Mode Navigation Bar */}
      <header className="campusops-top-nav">
        <div className="campusops-nav-left">
          <span className="campusops-nav-badge">SRM EASWARI</span>
          <span className="campusops-nav-title">CampusOps Unified Platform</span>
        </div>
        <div className="campusops-nav-switcher">
          <button
            className={`campusops-tab-btn ${viewMode === 'twin' ? 'active' : ''}`}
            onClick={() => switchView('twin')}
          >
            🏛️ 3D Digital Twin
          </button>
          <button
            className={`campusops-tab-btn ${viewMode === 'dashboard' ? 'active' : ''}`}
            onClick={() => switchView('dashboard')}
          >
            📊 Operations Dashboard
          </button>
        </div>
        <div className="campusops-nav-right">
          <span className="tag">Unified Localhost ({typeof window !== 'undefined' ? window.location.host : 'localhost:5174'})</span>
        </div>
      </header>

      {/* Main View Container */}
      <main className="campusops-view-container">
        {viewMode === 'dashboard' ? (
          <div className="campusops-dashboard-frame">
            <iframe
              src="/dashboard/"
              title="CampusOps Dashboard"
              style={{
                width: '100%',
                height: 'calc(100vh - 52px)',
                border: 'none',
                display: 'block'
              }}
            />
          </div>
        ) : (
          <main className="shell">
            <header>
              <div>
                <p className="eyebrow">CAMPUSOPS · DIGITAL TWIN</p>
                <h1>Campus operations, in the world</h1>
              </div>
              <span className="tag">Real OSM footprints · estimated heights</span>
            </header>
            <CampusMap />
          </main>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
