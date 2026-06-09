// netlify/functions/bus-stock-get.js
// Haalt de huidige voorraad op van de bestelbus van de technieker.
// Gebruikt stock.quant gefilterd op de buslocatie.

const { requireAuth, cors } = require('./lib/auth');
const { findById }          = require('./lib/users');
const { odooCall }          = require('./lib/odoo');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  if (event.httpMethod !== 'GET')     return cors({ error: 'Method not allowed' }, 405);

  try {
    const authUser = requireAuth(event);
    const user     = await findById(authUser.id);

    if (!user)               return cors({ error: 'Gebruiker niet gevonden.' }, 404);
    if (!user.odooLocationId) return cors({ stock: [], warning: 'Geen buslocatie ingesteld.' });

    const locationId = parseInt(user.odooLocationId);

    // stock.quant = actuele voorraad per locatie/product
    const quants = await odooCall('stock.quant', 'search_read',
      [[['location_id', '=', locationId], ['quantity', '>', 0]]],
      {
        fields: ['product_id', 'quantity', 'reserved_quantity', 'product_uom_id'],
        order:  'product_id asc',
      }
    );

    const stock = (quants || []).map(q => ({
      productId:   Array.isArray(q.product_id)      ? q.product_id[0]      : q.product_id,
      productName: Array.isArray(q.product_id)      ? q.product_id[1]      : 'Onbekend',
      unit:        Array.isArray(q.product_uom_id)  ? q.product_uom_id[1]  : 'stuk',
      qty:         q.quantity             || 0,
      reserved:    q.reserved_quantity    || 0,
      available:   Math.max(0, (q.quantity || 0) - (q.reserved_quantity || 0)),
    })).filter(s => s.available > 0);

    return cors({ stock });
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Bus stock error:', err);
    return cors({ error: 'Fout bij ophalen busvoorraad: ' + err.message }, 500);
  }
};
