import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// PUBLIC_INTERFACE
export default defineConfig(({ mode }) => {
  /** Load env prefixed with REACT_APP_ for client usage */
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');

  /** Determine dev server port: prefer REACT_APP_PORT, default 3000 */
  const port = Number(env.REACT_APP_PORT || process.env.REACT_APP_PORT || 3000);

  /** Determine backend port used in proxy; default 5179 */
  const backendPort = Number(process.env.BACKEND_PORT || 5179);

  return {
    plugins: [react()],
    server: {
      // Bind to all interfaces and allow the QA preview host
      host: '0.0.0.0',
      port,
      strictPort: true,
      allowedHosts: ['vscode-internal-31398-qa.qa01.cloud.kavia.ai'],
      proxy: {
        // Proxy backend health and API calls to FastAPI during development
        '^/(healthz|api)(/.*)?$': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          secure: false,
        }
      }
    },
    preview: {
      host: '0.0.0.0',
      port,
      strictPort: true,
      allowedHosts: ['vscode-internal-31398-qa.qa01.cloud.kavia.ai']
    },
    define: {
      // PUBLIC_INTERFACE
      __APP_CONFIG__: JSON.stringify({
        API_BASE: env.REACT_APP_API_BASE || '/api',
        BACKEND_URL: env.REACT_APP_BACKEND_URL || '', // Prefer relative path via proxy in dev
        FRONTEND_URL: env.REACT_APP_FRONTEND_URL || '',
        WS_URL: env.REACT_APP_WS_URL || '',
        NODE_ENV: env.REACT_APP_NODE_ENV || 'development',
        ENABLE_SOURCE_MAPS: (env.REACT_APP_ENABLE_SOURCE_MAPS || 'true') === 'true',
        TRUST_PROXY: (env.REACT_APP_TRUST_PROXY || 'true') === 'true',
        LOG_LEVEL: env.REACT_APP_LOG_LEVEL || 'info',
        HEALTHCHECK_PATH: env.REACT_APP_HEALTHCHECK_PATH || '/healthz',
        FEATURE_FLAGS: env.REACT_APP_FEATURE_FLAGS || '{}',
        EXPERIMENTS_ENABLED: (env.REACT_APP_EXPERIMENTS_ENABLED || 'false') === 'true',
        PORT: port
      })
    }
  };
});
