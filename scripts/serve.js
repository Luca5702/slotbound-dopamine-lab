import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');

export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
});

/**
 * Creates a zero-dependency static HTTP server for the Slotbound workspace.
 * @param {string} [rootDir=DEFAULT_ROOT]
 * @returns {http.Server}
 */
export function createServer(rootDir = DEFAULT_ROOT) {
  const resolvedRoot = path.resolve(rootDir);

  return http.createServer(async (req, res) => {
    try {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
      }

      const rawUrl = String(req.url || '/');
      // Reject raw or multi-encoded path traversal sequences before URL normalization collapses them
      const rawPathPart = rawUrl.split('?')[0].split('#')[0];
      let decodedRaw = rawPathPart;
      try {
        for (let i = 0; i < 3; i++) {
          const nextDecoded = decodeURIComponent(decodedRaw);
          if (nextDecoded === decodedRaw) break;
          decodedRaw = nextDecoded;
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('400 Bad Request');
        return;
      }

      if (
        rawPathPart.includes('..') ||
        decodedRaw.includes('..') ||
        decodedRaw.includes('\0')
      ) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
      }

      const parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
      let pathname = decodeURIComponent(parsedUrl.pathname);
      if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
      }

      // Normalize and enforce path traversal protection
      const candidatePath = path.resolve(resolvedRoot, '.' + pathname);
      const relative = path.relative(resolvedRoot, candidatePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
      }

      let targetPath = candidatePath;
      let stat;
      try {
        stat = await fs.stat(targetPath);
        if (stat.isDirectory()) {
          targetPath = path.join(targetPath, 'index.html');
          stat = await fs.stat(targetPath);
        }
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`404 Not Found: ${pathname}`);
        return;
      }

      const ext = path.extname(targetPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = await fs.readFile(targetPath);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.byteLength,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      });

      if (method === 'HEAD') {
        res.end();
      } else {
        res.end(content);
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`500 Internal Server Error: ${err?.message || 'Unknown error'}`);
    }
  });
}

export const createStaticServer = createServer;

/**
 * Starts the static server on the specified port and resolves once listening.
 * @param {number|{port?: number, host?: string, rootDir?: string}} [options=3000]
 * @returns {Promise<{server: http.Server, port: number, url: string, close: () => Promise<void>}>}
 */
export function startServer(options = {}) {
  const opts = typeof options === 'number' ? { port: options } : options;
  const port = opts.port !== undefined ? Number(opts.port) : Number(process.env.PORT || 3000);
  const host = opts.host || process.env.HOST || '127.0.0.1';
  const rootDir = opts.rootDir || DEFAULT_ROOT;

  const server = createServer(rootDir);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      const url = `http://${host}:${actualPort}`;
      resolve({
        server,
        port: actualPort,
        url,
        close: () =>
          new Promise((resClose, rejClose) => {
            server.close((err) => (err ? rejClose(err) : resClose()));
          }),
      });
    });
  });
}

// Direct CLI execution support: `node scripts/serve.js [--port=3000]`
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  const portArg = process.argv.find((arg) => arg.startsWith('--port='));
  const cliPort = portArg ? Number(portArg.split('=')[1]) : Number(process.env.PORT || 3000);
  startServer({ port: cliPort })
    .then(({ url }) => {
      console.log(`[Slotbound Server] Serving ${DEFAULT_ROOT} at ${url}`);
    })
    .catch((err) => {
      console.error('[Slotbound Server] Failed to start:', err);
      process.exit(1);
    });
}
