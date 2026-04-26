import { useState } from 'react';
import Nav from '../components/Nav';
import ComposePanel from '../components/ComposePanel';
import HealthReportsPanel from '../components/HealthReportsPanel';
import SecondarySourcesPanel from '../components/SecondarySourcesPanel';
import UploadPanel from '../components/UploadPanel';
import FeedbackPanel from '../components/FeedbackPanel';

const SUB_TABS = ['COMPOSE', 'CORPUS', 'SECONDARY SOURCES', 'UPLOAD', 'FEEDBACK'];

export default function CorpusAdmin() {
  const [activeTab, setActiveTab] = useState('COMPOSE');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-shell)' }}>
      <Nav />
      <SubTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'COMPOSE' && <ComposePanel />}
        {activeTab === 'CORPUS' && <HealthReportsPanel />}
        {activeTab === 'SECONDARY SOURCES' && <SecondarySourcesPanel />}
        {activeTab === 'UPLOAD' && <UploadPanel />}
        {activeTab === 'FEEDBACK' && <FeedbackPanel />}
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
