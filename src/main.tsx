import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setupPwa } from './lib/pwa';
import { captureSharedShift } from './lib/share';
import './styles.css';

captureSharedShift();
setupPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
