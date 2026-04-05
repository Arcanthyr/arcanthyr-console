import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Research from './pages/Research';
import Upload from './pages/Upload';
import Library from './pages/Library';
import Compose from './pages/Compose';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"         element={<Landing />} />
        <Route path="/research" element={<Research />} />
        <Route path="/upload"   element={<Upload />} />
        <Route path="/library"  element={<Library />} />
        <Route path="/compose"  element={<Compose />} />
        <Route path="*"         element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
