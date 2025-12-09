import React, { useEffect, useState } from 'react';

// PUBLIC_INTERFACE
export default function App() {
  /** This is a public component entry point for the web app. */
  /** This reads configuration injected at build time by Vite (vite.config.js) */
  const cfg = typeof __APP_CONFIG__ !== 'undefined' ? __APP_CONFIG__ : {};

  const [frontendHealth, setFrontendHealth] = useState('unknown');
  const [backendHealth, setBackendHealth] = useState('unknown');
  const [debugHealthUrl, setDebugHealthUrl] = useState('');
  const [debugBackendUrl, setDebugBackendUrl] = useState('');

  useEffect(() => {
    let cancelled = false;

    // Frontend health served by Vite middleware
    const healthPath = '/healthz';
    const url = healthPath;
    setDebugHealthUrl(url);
    fetch(url, { method: 'GET' })
      .then(async (r) => {
        if (cancelled) return;
        setFrontendHealth(r.ok ? 'healthy' : `fail (${r.status})`);
      })
      .catch(() => !cancelled && setFrontendHealth('unreachable'));

    // Backend health inferred by calling a proxied API endpoint
    // Using /api/notes (should return 200 and an array)
    const apiProbe = `${cfg.API_BASE || '/api'}/notes`;
    setDebugBackendUrl(apiProbe);
    fetch(apiProbe, { method: 'GET' })
      .then(async (r) => {
        if (cancelled) return;
        setBackendHealth(r.ok ? 'healthy' : `fail (${r.status})`);
      })
      .catch(() => !cancelled && setBackendHealth('unreachable'));

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', margin: '2rem' }}>
      <h1>Notes App</h1>
      <p>Frontend status: {frontendHealth}</p>
      <small>Frontend health URL: {debugHealthUrl}</small>
      <p style={{ marginTop: '0.5rem' }}>Backend status: {backendHealth}</p>
      <small>Backend probe URL: {debugBackendUrl}</small>
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
        <p>The app is running using Vite dev/preview server on port {cfg.PORT || 3000}. The SPA should render at '/'.</p>
      </section>
    </div>
  );
}
