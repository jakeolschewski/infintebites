export default function handler(req, res) {
  const auth = req.headers.authorization || '';
  const b64 = auth.split(' ')[1] || '';
  const [username, password] = Buffer.from(b64, 'base64').toString().split(':');
  const USER = process.env.BASIC_AUTH_USERNAME;
  const PASS = process.env.BASIC_AUTH_PASSWORD;

  if (username === USER && password === PASS) {
    const fs = require('fs');
    const path = require('path');
    let filePath = path.join(process.cwd(), 'frontend', 'public', req.url === '/' ? 'index.html' : req.url);
    // prevent directory traversal
    filePath = filePath.replace(/\.\./g, '');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.txt': 'text/plain'
      };
      const data = fs.readFileSync(filePath);
      const type = mimeTypes[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', type);
      res.status(200).send(data);
      return;
    }
    // file not found
    res.status(404).send('Not Found');
    return;
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Protected Area"');
  res.status(401).send('Authentication required');
}
