import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.scss';
import App from './App';
import { restoreFromBrowser } from './io/files';

restoreFromBrowser();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
