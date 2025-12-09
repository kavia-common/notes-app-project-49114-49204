import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Simple Vite plugin to expose a frontend health endpoint at /healthz (only).
 * Do not intercept '/' so that the SPA index.html is served by Vite as usual.
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
      // Only add a handler for /healthz; do not register catch-alls that could shadow '/'
      server.middlewares.use('/healthz', handler);
    },
    configurePreviewServer(server) {
      // Keep parity for preview
      server.middlewares.use('/healthz', handler);
    },
  };
}

// PUBLIC_INTERFACE
export default defineConfig(({ mode }) => {
  // Load env prefixed with REACT_APP_ for client usage
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');

  // Determine dev/preview server port, default 3000
  const port = Number(
    env.REACT_APP_PORT ||
      process.env.REACT_APP_PORT ||
      process.env.PORT ||
      3000
  );

  // Backend port used in proxy; default 5179
  const backendPort = Number(process.env.BACKEND_PORT || 5179);

  // Dynamically allow preview host(s)
  const allowedHosts = [
    'vscode-internal-35218-qa.qa01.cloud.kavia.ai',
    'vscode-internal-31398-qa.qa01.cloud.kavia.ai',
  ];
  if (process.env.PREVIEW_HOST) {
    allowedHosts.push(process.env.PREVIEW_HOST);
  } else if (process.env.HOSTNAME) {
    allowedHosts.push(process.env.HOSTNAME);
  }

  return {
    plugins: [react(), healthcheckPlugin()],
    server: {
      host: '0.0.0.0',
      port,
      strictPort: true,
      allowedHosts,
      proxy: {
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
      },
    },
    preview: {
      host: '0.0.0.0',
      port,
      strictPort: true,
      allowedHosts,
    },
    // Ensure the default index.html is used for SPA at '/'
    appType: 'spa',
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
