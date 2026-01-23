const express = require('express');

// Raw body only for Terra webhook
const rawBodyForTerra = express.raw({ type: 'application/json' });

// Conditional JSON and URL-encoded parsers (skip multipart route)
const conditionalParsers = [
  (req, res, next) => {
    if (
      (req.path === '/api/generate-swolegotchi' &&
        req.headers['content-type']?.includes('multipart/form-data')) ||
      req.path === '/terra/webhook'
    ) {
      return next();
    }
    return express.json()(req, res, next);
  },
  (req, res, next) => {
    if (
      (req.path === '/api/generate-swolegotchi' &&
        req.headers['content-type']?.includes('multipart/form-data')) ||
      req.path === '/terra/webhook'
    ) {
      return next();
    }
    return express.urlencoded({ extended: true })(req, res, next);
  },
];

module.exports = { rawBodyForTerra, conditionalParsers };
