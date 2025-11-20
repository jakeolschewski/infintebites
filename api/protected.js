const fs = require('fs');
const path = require('path');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};

export default function handler(req, res) {
  const auth = req.headers.authorization || '';
  const b64 = auth.split(' ')[1] || '';
  const [username, password] = Buffer.from(b64, 'base64').toString().split(':');
  const USER = process.env.BASIC_AUTH_USERNAME;
  const PASS = process.env.BASIC_AUTH_PASSWORD;
  if (username === USER && password === PASS) {
    let filePath = path.join(process.cwd(), 'frontend', 'public', req.url === '/' ? 'index.html' : req.url);
    // prevent directory traversal
    filePath = filePath.replace(/\.\./g, '');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const data = fs.readFileSync(filePath);
      res.setHeader('Content-Type', contentType);
      res.statusCode = 200;
      res.end(data);
      return;
    } else {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
  }
  res.statusCode = 401;
  res.setHeader('WWW-Authenticate', 'Basic realm="Protected"');
  res.end('Auth required');
}
