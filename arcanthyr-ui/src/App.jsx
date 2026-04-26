import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Intel from './pages/Intel';
import CaseSearch from './pages/CaseSearch';
import Legislation from './pages/Legislation';
import CorpusAdmin from './pages/CorpusAdmin';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"            element={<Landing />} />
        <Route path="/intel"       element={<Intel />} />
        <Route path="/case-search" element={<CaseSearch />} />
        <Route path="/legislation" element={<Legislation />} />
        <Route path="/corpus-admin" element={<CorpusAdmin />} />
        <Route path="*"            element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
