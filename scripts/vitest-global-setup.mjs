// Vitest global setup: the acceptance suite talks HTTP to 127.0.0.1:3000.
// If nothing is listening there, build (if needed) and start the app so `npm test` is self-contained.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = '3000';
let child = null;

function healthy() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
      res.resume();
      resolve(true); // any HTTP response means a server is listening
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function setup() {
  if (await healthy()) return;

  const env = {
    CLINIC_TZ: 'UTC',
    HOLIDAYS: '2026-10-08,2026-12-25,2027-01-01',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    ...process.env,
    PORT,
    NODE_ENV: 'production',
  };
  const shell = process.platform === 'win32';

  if (!existsSync(path.join(root, '.next', 'BUILD_ID'))) {
    const r = spawnSync('npm', ['run', 'build'], { cwd: root, env, stdio: 'inherit', shell });
    if (r.status !== 0) throw new Error('npm run build failed');
  }

  child = spawn('npm', ['start'], { cwd: root, env, stdio: 'inherit', shell });
  for (let i = 0; i < 120; i++) {
    if (await healthy()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Server did not become available on port 3000');
}

export async function teardown() {
  if (child) child.kill('SIGTERM');
}
