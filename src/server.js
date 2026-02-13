const express = require('express');
const http = require('http');
const { env } = require('./config/env');
const { corsMiddleware } = require('./middleware/cors');
const {
  rawBodyForTerra,
  conditionalParsers,
} = require('./middleware/bodyParsers');
const { createWebSocketServer } = require('./websocket/server');

// Routers
const authRouter = require('./routes/auth');
const terraRouter = require('./routes/terra');
const checkinsRouter = require('./routes/checkins');
const aiRouter = require('./routes/ai');
const foodRouter = require('./routes/food');

const app = express();

// CORS for all routes
app.use(corsMiddleware);

// Raw body for Terra webhook route only
app.use('/terra/webhook', rawBodyForTerra);

// Body parsers for all other routes
conditionalParsers.forEach((mw) => app.use(mw));

// Health route
app.get('/', (_req, res) => {
  res.json({ message: 'Swolegotchi Backend Server is running!' });
});

// Route mounting
app.use('/', authRouter);
app.use('/terra', terraRouter);

// Legacy alias for old Terra callback path
app.get('/auth/terra/callback', (req, res) => {
  const query = req.url.split('?')[1] || '';
  res.redirect(302, `/terra/auth/callback${query ? `?${query}` : ''}`);
});

// Legacy alias for old Terra initiate path
app.get('/auth/terra/initiate', (req, res) => {
  const query = req.url.split('?')[1] || '';
  res.redirect(302, `/terra/auth/initiate${query ? `?${query}` : ''}`);
});
app.use('/api', checkinsRouter);
app.use('/api', aiRouter);
app.use('/api', foodRouter);

// Create HTTP server to share with WebSocket
const server = http.createServer(app);
// Initialize WebSocket server
createWebSocketServer(server);

server.listen(env.port, () => {
  console.log(`Server listening on port ${env.port}`);
  console.log(`Environment: ${env.nodeEnv}`);
});

module.exports = app;
