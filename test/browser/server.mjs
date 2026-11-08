// Serves this repository and RuMorph (RUMORPH_DIR) under /scripts/extensions/third-party/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');

const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css' };

export function start(port = 0) {
    const roots = {
        'SillyTavern-RuInflect': repo,
        'SillyTavern-RuMorph': process.env.RUMORPH_DIR || path.resolve(repo, '..', 'SillyTavern-RuMorph'),
    };
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        let file;
        const m = url.pathname.match(/^\/scripts\/extensions\/third-party\/([^/]+)\/(.*)$/);
        if (m && roots[m[1]]) file = path.join(roots[m[1]], decodeURIComponent(m[2]));
        else if (url.pathname === '/scripts/personas.js') file = path.join(here, 'personas-stub.js');
        else if (url.pathname === '/') file = path.join(here, 'harness.html');
        if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404);
            return res.end('not found');
        }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
