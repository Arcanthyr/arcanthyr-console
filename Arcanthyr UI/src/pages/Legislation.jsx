import Nav from '../components/Nav';
import LegislationPanel from '../components/LegislationPanel';

export default function Legislation() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-shell)' }}>
      <Nav />
      <LegislationPanel />
    </div>
  );
}
