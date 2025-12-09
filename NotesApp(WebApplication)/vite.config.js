import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Simple Vite plugin to expose a frontend health endpoint at /healthz.
 * This ensures the preview system can detect readiness independently of the backend.
 */
function healthcheckPlugin() {
  return {
    name: 'frontend-healthcheck',
    configureServer(server) {
      server.middlewares.use('/healthz', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'ok', service: 'frontend' }));
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/healthz', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'ok', service: 'frontend' }));
      });
    },
  };
}

// PUBLIC_INTERFACE
export default defineConfig(({ mode }) => {
  /** Load env prefixed with REACT_APP_ for client usage */
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');

  /**
   * Determine dev/preview server port robustly:
   * - Prefer REACT_APP_PORT (frontend-specific)
   * - Fallback to generic PORT often set by hosting environments
   * - Default to 3000
   * Note: npm scripts set --port 3000 explicitly to avoid shell-specific env expansion;
   * this config still honors env when running Vite without explicit --port.
   */
  const port = Number(
    env.REACT_APP_PORT ||
    process.env.REACT_APP_PORT ||
    process.env.PORT ||
    3000
  );

  /** Determine backend port used in proxy; default 5179 */
  const backendPort = Number(process.env.BACKEND_PORT || 5179);

  /** Dynamically allow the current host for preview environments */
  const allowedHosts = [];
  // Always allow Kavia preview hosts
  // Required host for this environment:
  allowedHosts.push('vscode-internal-35218-qa.qa01.cloud.kavia.ai');
  // Keep previous known host patterns (compatibility with other QA envs)
  allowedHosts.push('vscode-internal-31398-qa.qa01.cloud.kavia.ai');
  // Optionally add current environment-provided hosts
  if (process.env.PREVIEW_HOST) {
    allowedHosts.push(process.env.PREVIEW_HOST);
  } else if (process.env.HOSTNAME) {
    allowedHosts.push(process.env.HOSTNAME);
  }

  return {
    plugins: [react(), healthcheckPlugin()],
    server: {
      // Bind to all interfaces and allow the QA preview host
      host: '0.0.0.0',
      port,
      strictPort: true,
      allowedHosts,
      proxy: {
        // Explicitly proxy backend API calls to FastAPI during development
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          secure: false,
        },
        // Websocket proxy (if backend uses ws under /ws)
        '/ws': {
          target: `ws://localhost:${backendPort}`,
          ws: true,
          changeOrigin: true,
          secure: false,
        },
      }
    },
    preview: {
      host: '0.0.0.0',
      port,
      strictPort: true,
      allowedHosts
    },
    define: {
      // PUBLIC_INTERFACE
      __APP_CONFIG__: JSON.stringify({
        // Always prefer relative paths in development so Vite proxy is used
        API_BASE: '/api',
        // Ignore any absolute BACKEND_URL while running under Vite dev server
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
        PORT: port
      })
    }
  };
});
