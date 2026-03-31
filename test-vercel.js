const https = require('https');

const data = new TextEncoder().encode('Digits=2&From=%2B917736215631');

const options = {
  hostname: 'agrispark-lilac.vercel.app',
  port: 443,
  path: '/voice/handle-selection',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('RESPONSE:', body));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
