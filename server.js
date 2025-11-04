const http = require('http');
const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const WEB_DIR = path.resolve(__dirname);
const SONOMA_DIR = path.join(WORKSPACE, 'Sonoma');
const PORT = process.env.PORT || 5173;

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain', ...headers });
  res.end(data);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv'
  }[ext] || 'application/octet-stream';
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not Found');
    send(res, 200, data, { 'Content-Type': contentType(filePath) });
  });
}

function listRaceFiles(raceDir) {
  const dir = path.join(SONOMA_DIR, raceDir);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  return files.filter(f => f.toLowerCase().endsWith('.csv')).sort();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  if (pathname === '/' || pathname === '/index.html') {
    return serveFile(res, path.join(WEB_DIR, 'index.html'));
  }
  if (pathname.startsWith('/static/')) {
    const rel = pathname.replace('/static/', '');
    const fp = path.join(WEB_DIR, rel);
    return serveFile(res, fp);
  }
  if (pathname.startsWith('/data/')) {
    const rel = pathname.replace('/data/', '');
    const fp = path.join(SONOMA_DIR, rel);
    return serveFile(res, fp);
  }
  if (pathname === '/api/list') {
    const r1 = listRaceFiles('Race 1');
    const r2 = listRaceFiles('Race 2');
    const payload = JSON.stringify({ race1: r1, race2: r2 });
    return send(res, 200, payload, { 'Content-Type': 'application/json' });
  }
  return send(res, 404, 'Not Found');
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});