const https = require('https');

const data = new TextEncoder().encode('SpeechResult=Tomatoes&From=%2B917736215631');

const options = {
  hostname: 'agrispark-lilac.vercel.app',
  port: 443,
  path: '/voice/full-assistance?step=crop&name=John&location=Texas',
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
