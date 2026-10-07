const http = require('http');
const req = http.request({ host: '127.0.0.1', port: 3000, path: '/sessions', method: 'GET' }, (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', JSON.stringify(res.headers, null, 2));
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log('BODY:', data));
});
req.on('error', (e) => console.error('ERROR:', e.message));
req.end();
