import Nav from '../components/Nav';

export default function Legislation() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-shell)' }}>
      <Nav />
      <div className="p-6"><h1 className="text-xl font-semibold">LEGISLATION</h1></div>
    </div>
  );
}
