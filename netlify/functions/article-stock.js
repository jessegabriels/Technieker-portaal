// netlify/functions/article-stock.js
// Retourneert de beschikbare voorraad per Odoo-product-ID voor het magazijn (locatie 5).
// Lichtgewicht: geen productdetails, enkel hoeveelheden.
// Toegankelijk voor alle geauthenticeerde gebruikers (technieker én admin).

const { requireAuth, cors } = require('./lib/auth');
const { odooCall }          = require('./lib/odoo');

const WAREHOUSE_LOCATION_ID = parseInt(process.env.ODOO_WAREHOUSE_LOCATION_ID || '5', 10);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  if (event.httpMethod !== 'GET')     return cors({ error: 'Method not allowed' }, 405);

  try {
    requireAuth(event); // enkel controleren of ingelogd, rol maakt niet uit

    // Haal alle quants op voor het magazijn
    const quants = await odooCall('stock.quant', 'search_read',
      [[
        ['location_id', 'child_of', WAREHOUSE_LOCATION_ID],
        ['location_id.usage', '=', 'internal'],
      ]],
      {
        fields: ['product_id', 'quantity', 'reserved_quantity'],
        limit: 10000,
      }
    );

    // Groepeer per product en bereken beschikbare hoeveelheid
    const totals = {};
    for (const q of (quants || [])) {
      if (!q.product_id?.[0]) continue;
      const pid = q.product_id[0];
      if (!totals[pid]) totals[pid] = { qty: 0, reserved: 0 };
      totals[pid].qty      += q.quantity          || 0;
      totals[pid].reserved += q.reserved_quantity || 0;
    }

    // { [productId]: beschikbareQty }
    const stock = {};
    for (const [pid, s] of Object.entries(totals)) {
      stock[pid] = Math.max(0, Math.round((s.qty - s.reserved) * 1000) / 1000);
    }

    return cors({ stock });

  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Article stock error:', err);
    return cors({ error: 'Fout bij ophalen stockinfo: ' + err.message }, 500);
  }
};
