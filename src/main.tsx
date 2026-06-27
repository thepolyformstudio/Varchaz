/* ============================================================
   Varchaz — Entry Point
   ============================================================ */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastContainer, OfflineBanner, ErrorBoundary } from './components/shared';

// Styles
import './styles/index.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/auth.css';
import './styles/dashboard.css';
import './styles/tables.css';
import './styles/forms.css';
import './styles/admin.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <App />
          <ToastContainer />
          <OfflineBanner />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
