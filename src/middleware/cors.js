const cors = require('cors');

const corsMiddleware = cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:8081',
    /\.ngrok\.io$/,
    /\.ngrok-free\.app$/,
    /\.loca\.lt$/,
    /\.trycloudflare\.com$/,
    /^https:\/\/.*\.expo\.dev$/,
    /^https:\/\/.*\.exp\.direct$/,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'terra-signature'],
});

module.exports = { corsMiddleware };
