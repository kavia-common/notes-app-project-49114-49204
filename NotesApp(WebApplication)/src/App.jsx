import React, { useEffect, useState } from 'react';

// PUBLIC_INTERFACE
export default function App() {
  /** This is a public component entry point for the web app. */
  /** This reads configuration injected at build time by Vite (vite.config.js) */
  const cfg = typeof __APP_CONFIG__ !== 'undefined' ? __APP_CONFIG__ : {};

  const [health, setHealth] = useState('unknown');
  const [debugHealthUrl, setDebugHealthUrl] = useState('');

  useEffect(() => {
    let cancelled = false;

    // Prefer relative paths with Vite proxy in development
    const healthPath = cfg.HEALTHCHECK_PATH || '/healthz';
    const hasAbsoluteBackend = (cfg.BACKEND_URL || '').startsWith('http');
    const base = hasAbsoluteBackend ? (cfg.BACKEND_URL || cfg.API_BASE || '') : '';
    const url = base ? `${base}${healthPath}` : healthPath;

    setDebugHealthUrl(url);

    fetch(url, { method: 'GET' })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) {
          setHealth('backend: healthy');
        } else {
          setHealth(`backend: fail (${r.status})`);
        }
      })
      .catch(() => !cancelled && setHealth('backend: unreachable'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', margin: '2rem' }}>
      <h1>Notes App</h1>
      <p>Status: {health}</p>
      <small>Health URL: {debugHealthUrl}</small>
      <section style={{ marginTop: '1rem' }}>
        <h2>Configuration</h2>
        <ul>
          <li>PORT: {cfg.PORT}</li>
          <li>API_BASE: {cfg.API_BASE}</li>
          <li>BACKEND_URL: {cfg.BACKEND_URL}</li>
          <li>FRONTEND_URL: {cfg.FRONTEND_URL}</li>
          <li>WS_URL: {cfg.WS_URL}</li>
          <li>HEALTHCHECK_PATH: {cfg.HEALTHCHECK_PATH}</li>
          <li>NODE_ENV: {cfg.NODE_ENV}</li>
          <li>LOG_LEVEL: {cfg.LOG_LEVEL}</li>
          <li>EXPERIMENTS_ENABLED: {String(cfg.EXPERIMENTS_ENABLED)}</li>
        </ul>
      </section>
      <section style={{ marginTop: '1rem' }}>
        <p>The app is running using Vite dev server. It should be accessible on port {cfg.PORT || 3000}.</p>
      </section>
    </div>
  );
}
