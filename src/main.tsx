import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// One-time cleanup: remove Bolt-era localStorage keys that override VITE_ env vars
// These caused supabase client to init as null, producing the "LOADING" role label
localStorage.removeItem('fym_supabase_url');
localStorage.removeItem('fym_supabase_anon_key');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
