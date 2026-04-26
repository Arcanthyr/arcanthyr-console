import { useState } from 'react';
import Nav from '../components/Nav';
import ComposePanel from '../components/ComposePanel';
import HealthReportsPanel from '../components/HealthReportsPanel';

const SUB_TABS = ['COMPOSE', 'CORPUS', 'SECONDARY SOURCES', 'FEEDBACK'];

export default function CorpusAdmin() {
  const [activeTab, setActiveTab] = useState('COMPOSE');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-shell)' }}>
      <Nav />
      <SubTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'COMPOSE' && <ComposePanel />}
        {activeTab === 'CORPUS' && <HealthReportsPanel />}
        {activeTab === 'SECONDARY SOURCES' && <PlaceholderPanel>Secondary Sources — coming in Phase 3.</PlaceholderPanel>}
        {activeTab === 'FEEDBACK' && <PlaceholderPanel>Feedback — coming in Phase 3.</PlaceholderPanel>}
      </div>
    </div>
  );
}

function PlaceholderPanel({ children }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '32px 24px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' }}>
      {children}
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
