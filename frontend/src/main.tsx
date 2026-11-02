import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { httpApi } from './lib/api';
import { firebaseAuth, loadConfig } from './lib/firebaseAuth';
import './styles.css';

async function start() {
  const root = createRoot(document.getElementById('root')!);
  try {
    const auth = firebaseAuth(await loadConfig());
    const api = httpApi(() => auth.token());
    root.render(
      <StrictMode>
        <BrowserRouter>
          <App api={api} auth={auth} />
        </BrowserRouter>
      </StrictMode>,
    );
  } catch {
    root.render(<p role="alert">Aplikacije ni mogoče zagnati: manjka konfiguracija.</p>);
  }
}

void start();
