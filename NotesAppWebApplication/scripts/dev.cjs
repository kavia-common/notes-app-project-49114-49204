#!/usr/bin/env node
/**
 * Development launcher for CRA that maps CLI flags to env vars.
 * Supports:
 *   npm run dev -- --port 3000 --host 0.0.0.0
 * Fallback order:
 *   PORT: argv --port -> PORT -> REACT_APP_PORT -> 3000
 *   HOST: argv --host -> HOST -> 0.0.0.0
 *
 * Also respects REACT_APP_NODE_ENV=development if provided (does not override NODE_ENV if set).
 */
const { spawn } = require('child_process');

function parseArg(flag) {
  const idx = process.argv.findIndex(a => a === flag || a.startsWith(flag + '='));
  if (idx === -1) return undefined;
  const val = process.argv[idx].includes('=')
    ? process.argv[idx].split('=').slice(1).join('=')
    : process.argv[idx + 1];
  return val;
}

const argPort = parseArg('--port') || parseArg('-p');
const argHost = parseArg('--host') || parseArg('-H');

// Compute env vars with fallbacks
const env = { ...process.env };
if (!env.NODE_ENV && env.REACT_APP_NODE_ENV) {
  env.NODE_ENV = env.REACT_APP_NODE_ENV;
}
env.HOST = argHost || env.HOST || '0.0.0.0';
env.PORT = argPort || env.PORT || env.REACT_APP_PORT || '3000';

// Spawn CRA dev server
const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['react-scripts', 'start'],
  { stdio: 'inherit', env }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
