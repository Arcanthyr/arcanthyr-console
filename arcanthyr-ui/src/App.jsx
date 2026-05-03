import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { initApi } from './api';
import Landing from './pages/Landing';
import Intel from './pages/Intel';
import CaseSearch from './pages/CaseSearch';
import Legislation from './pages/Legislation';
import CorpusAdmin from './pages/CorpusAdmin';

function AuthGate({ children }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  if (!isLoaded) return null;

  if (isSignedIn) {
    initApi(getToken);
    // temporary — remove after confirming token appears
    getToken().then(t => console.log('[clerk] token:', t?.slice(0, 20)));
  }

  return children;
}

function ProtectedRoute({ element }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/" replace />;
  return element;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route path="/"             element={<Landing />} />
          <Route path="/intel"        element={<ProtectedRoute element={<Intel />} />} />
          <Route path="/case-search"  element={<ProtectedRoute element={<CaseSearch />} />} />
          <Route path="/legislation"  element={<ProtectedRoute element={<Legislation />} />} />
          <Route path="/corpus-admin" element={<ProtectedRoute element={<CorpusAdmin />} />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
