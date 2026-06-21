import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WebSocketBridge } from './ws-bridge';
import RemoteSession from '../renderer/RemoteSession';
import '../renderer/globals.css';
import './web-client.css';

// The browser web client: a thin entry around the shared RemoteSession. It
// connects same-origin (no targetUrl) and stores the access code in
// sessionStorage. The desktop app reuses RemoteSession with its own props.
const bridge = new WebSocketBridge();
const TOKEN_KEY = 'claude-remote-token';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RemoteSession
      bridge={bridge}
      persistToken={(t) => sessionStorage.setItem(TOKEN_KEY, t)}
      loadSavedToken={() => sessionStorage.getItem(TOKEN_KEY)}
      onRetry={() => window.location.reload()}
    />
  </StrictMode>,
);
