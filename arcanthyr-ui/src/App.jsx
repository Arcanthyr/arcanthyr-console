import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Research from './pages/Research';
import Upload from './pages/Upload';
import Library from './pages/Library';
import Compose from './pages/Compose';
import { playAmbient, unlockAudio } from './utils/tts';

export default function App() {
  // Welcome clip — fires on the first user interaction of the session.
  // Deferred from mount because browsers block AudioContext until a user gesture.
  useEffect(() => {
    if (!sessionStorage.getItem('arc_welcomed')) {
      sessionStorage.setItem('arc_welcomed', '1');
      const fire = () => {
        unlockAudio();
        playAmbient('welcome');
      };
      document.addEventListener('click',   fire, { once: true });
      document.addEventListener('keydown', fire, { once: true });
      return () => {
        document.removeEventListener('click',   fire);
        document.removeEventListener('keydown', fire);
      };
    }
  }, []);

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
