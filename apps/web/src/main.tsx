import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { App } from './app/App';
import { AuthProvider } from './app/auth';
import { ToastProvider } from './components/ui';
import './styles/app.css';
import './styles/extra.css';

const app = (
  <ToastProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ToastProvider>
);

// The single-file demo lives in a sandboxed page with no real URLs, so it routes in memory.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {__DEMO__ ? (
      <MemoryRouter initialEntries={['/login']}>{app}</MemoryRouter>
    ) : (
      <BrowserRouter>{app}</BrowserRouter>
    )}
  </StrictMode>,
);
