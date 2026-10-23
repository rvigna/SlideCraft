import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.scss';
import App from './App';
import { restoreFromBrowser } from './io/files';
import { installApi } from './api';

installApi();

// Restore the last session before the first render so the editor never flashes an empty deck
void restoreFromBrowser().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
