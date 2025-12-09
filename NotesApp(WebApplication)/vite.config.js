import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Minimal health endpoint plugin for both dev and preview.
 * Only serves GET /healthz -> 200 JSON. Does not intercept '/'.
 */
function healthcheckPlugin() {
  const handler = (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ status: 'ok', service: 'frontend' }));
  };
  return {
    name: 'frontend-healthcheck',
    configureServer(server) {
      server.middlewares.use('/healthz', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/healthz', handler);
    },
  };
}

// PUBLIC_INTERFACE
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');

  // Always bind to 0.0.0.0:3000 with strictPort for both dev and preview
  const port = 3000;
  const host = '0.0.0.0';

  // Proxy targets for backend; optional at runtime
  const backendPort = Number(process.env.BACKEND_PORT || 5179);

  // Allow our public preview host and localhost
  const allowedHosts = [
    'vscode-internal-35218-qa.qa01.cloud.kavia.ai',
    '*.qa01.cloud.kavia.ai',
    'localhost',
    '127.0.0.1',
  ];

  const proxyConfig = {
    '/api': {
      target: `http://localhost:${backendPort}`,
      changeOrigin: true,
      secure: false,
    },
    '/ws': {
      target: `ws://localhost:${backendPort}`,
      ws: true,
      changeOrigin: true,
      secure: false,
    },
  };

  return {
    plugins: [react(), healthcheckPlugin()],
    // Ensure SPA served at '/' and no backend probing at server level
    appType: 'spa',
    server: {
      host,
      port,
      strictPort: true,
      allowedHosts,
      proxy: proxyConfig,
    },
    preview: {
      host,
      port,
      strictPort: true,
      allowedHosts,
      proxy: proxyConfig,
      // Explicitly ensure index.html is served for SPA at root
      // Vite preview already does this when appType is 'spa'
    },
    define: {
      // PUBLIC_INTERFACE
      __APP_CONFIG__: JSON.stringify({
        API_BASE: '/api',
        BACKEND_URL: '',
        FRONTEND_URL: env.REACT_APP_FRONTEND_URL || '',
        WS_URL: '/ws',
        NODE_ENV: env.REACT_APP_NODE_ENV || 'development',
        ENABLE_SOURCE_MAPS: (env.REACT_APP_ENABLE_SOURCE_MAPS || 'true') === 'true',
        TRUST_PROXY: (env.REACT_APP_TRUST_PROXY || 'true') === 'true',
        LOG_LEVEL: env.REACT_APP_LOG_LEVEL || 'info',
        HEALTHCHECK_PATH: '/healthz',
        FEATURE_FLAGS: env.REACT_APP_FEATURE_FLAGS || '{}',
        EXPERIMENTS_ENABLED: (env.REACT_APP_EXPERIMENTS_ENABLED || 'false') === 'true',
        PORT: port,
      }),
    },
  };
});
