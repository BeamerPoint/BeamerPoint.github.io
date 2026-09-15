import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles.css';
import { App } from './App.js';

if (import.meta.env.DEV) {
  // Handy for inspecting model/compile state from the console during development.
  void import('./state/store.js').then((m) => {
    (window as unknown as Record<string, unknown>).bpStore = m.useStore;
  });
}

const host = document.getElementById('root');
if (host === null) throw new Error('#root not found');
createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
