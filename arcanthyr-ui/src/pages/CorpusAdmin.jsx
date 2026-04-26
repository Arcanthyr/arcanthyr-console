import { useState } from 'react';
import Nav from '../components/Nav';
import Compose from './Compose';
import HealthReports from './HealthReports';

const SUB_TABS = ['COMPOSE', 'CORPUS', 'SECONDARY SOURCES', 'FEEDBACK'];

export default function CorpusAdmin() {
  const [activeTab, setActiveTab] = useState('COMPOSE');

  // COMPOSE and CORPUS render their own Nav — hand them the full page directly
  // to avoid double-Nav. Phase 3 will extract inner content properly.
  if (activeTab === 'COMPOSE') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <SubTabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Compose />
        </div>
      </div>
    );
  }

  if (activeTab === 'CORPUS') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <SubTabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <HealthReports />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-shell)' }}>
      <Nav />
      <SubTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 24px' }}>
        {activeTab === 'SECONDARY SOURCES' && (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' }}>
            Secondary Sources — coming in Phase 3.
          </div>
        )}
        {activeTab === 'FEEDBACK' && (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' }}>
            Feedback — coming in Phase 3.
          </div>
        )}
      </div>
    </div>
  );
}

function SubTabBar({ activeTab, onTabChange }) {
  return (
    <div style={{
      display: 'flex',
      background: 'var(--bg-topbar)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      {SUB_TABS.map(t => (
        <button
          key={t}
          onClick={() => onTabChange(t)}
          style={{
            padding: '11px 20px',
            fontSize: '11px',
            letterSpacing: '0.06em',
            background: 'transparent',
            color: activeTab === t ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: activeTab === t ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'color 0.15s',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
