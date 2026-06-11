// server/index.js
// Lokale ontwikkelingsserver — vervangt Netlify Functions tijdens lokaal testen.
// Start via: npm run server   (of: npm run dev  voor server + React tegelijk)
//
// Elke Netlify Function-handler wordt hier gemount als een Express-route.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Helper: Netlify-compatible handler → Express route ──────────────────────
// Netlify functions gebruiken (event, context) → { statusCode, body, headers }
// We emuleren dit zo dat de functiebestanden ongewijzigd blijven.

function netlifyHandler(handlerFn) {
  return async (req, res) => {
    // Bouw een nep-Netlify "event" object
    const event = {
      httpMethod: req.method,
      headers: req.headers,
      body: req.body ? JSON.stringify(req.body) : null,
      queryStringParameters: req.query || {},
      path: req.path,
    };

    try {
      const result = await handlerFn.handler(event, {});
      const { statusCode = 200, body, headers = {} } = result;

      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
      res.status(statusCode).send(body);
    } catch (err) {
      console.error('Handler fout:', err);
      res.status(500).json({ error: 'Interne serverfout' });
    }
  };
}

// ─── Routes — komen overeen met /.netlify/functions/<naam> ──────────────────

const handlers = {
  'auth-login':       require('../netlify/functions/auth-login'),
  'articles-get':     require('../netlify/functions/articles-get'),
  'articles-import':  require('../netlify/functions/articles-import'),
  'orders-create':    require('../netlify/functions/orders-create'),
  'orders-get':       require('../netlify/functions/orders-get'),
  'users-manage':     require('../netlify/functions/users-manage'),
  'articles-manage':  require('../netlify/functions/articles-manage'),
  'orders-manage':    require('../netlify/functions/orders-manage'),
  'pickings-get':     require('../netlify/functions/pickings-get'),
  'pickings-validate': require('../netlify/functions/pickings-validate'),
  'bus-stock-get':    require('../netlify/functions/bus-stock-get'),
  'picking-add-line':    require('../netlify/functions/picking-add-line'),
  'picking-remove-line': require('../netlify/functions/picking-remove-line'),
  'bus-stock-all':       require('../netlify/functions/bus-stock-all'),
  'picking-edit-line':   require('../netlify/functions/picking-edit-line'),
  'return-create':       require('../netlify/functions/return-create'),
  'dropships-get':       require('../netlify/functions/dropships-get'),
  'warehouse-stock':     require('../netlify/functions/warehouse-stock'),
};

// Mount elke handler op alle HTTP-methodes
Object.entries(handlers).forEach(([name, handler]) => {
  const route = `/api/${name}`;
  app.all(route, netlifyHandler(handler));
  console.log(`  ✓ ${route}`);
});

// OPTIONS preflight voor CORS
app.options('*', cors());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   Bestelportaal — lokale API server    ║`);
  console.log(`╠════════════════════════════════════════╣`);
  console.log(`║  http://localhost:${PORT}                 ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  console.log('Omgevingsvariabelen geladen:');
  console.log(`  ODOO_URL:  ${process.env.ODOO_URL || '⚠ niet ingesteld'}`);
  console.log(`  ODOO_DB:   ${process.env.ODOO_DB || '⚠ niet ingesteld'}`);
  console.log(`  ODOO_USERNAME: ${process.env.ODOO_USERNAME || '⚠ niet ingesteld'}`);
  console.log(`  ODOO_API_KEY:  ${process.env.ODOO_API_KEY ? '✓ ingesteld' : '⚠ niet ingesteld'}`);
  console.log(`  JWT_SECRET:    ${process.env.JWT_SECRET ? '✓ ingesteld' : '⚠ niet ingesteld'}\n`);
  console.log('Gebruik Ctrl+C om te stoppen.\n');
});
