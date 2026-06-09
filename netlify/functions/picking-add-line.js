// netlify/functions/picking-add-line.js
// Voegt extra regels toe aan een bestaande WH/OUT picking in Odoo.
// items: [{ productId, quantity }]

const { requireAuth, cors } = require('./lib/auth');
const { findById }          = require('./lib/users');
const { odooCall }          = require('./lib/odoo');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  if (event.httpMethod !== 'POST')    return cors({ error: 'Method not allowed' }, 405);

  try {
    const authUser = requireAuth(event);
    const user     = await findById(authUser.id);

    if (!user || !user.odooLocationId) {
      return cors({ error: 'Geen buslocatie ingesteld.' }, 403);
    }

    const { pickingId, items } = JSON.parse(event.body || '{}');
    if (!pickingId || !Array.isArray(items) || items.length === 0) {
      return cors({ error: 'pickingId en items zijn verplicht.' }, 400);
    }

    const locationId = parseInt(user.odooLocationId);

    // Picking ophalen en veiligheidscheck
    const pickings = await odooCall('stock.picking', 'read', [[parseInt(pickingId)]], {
      fields: ['id', 'name', 'state', 'location_id', 'location_dest_id'],
    });
    if (!pickings || pickings.length === 0) {
      return cors({ error: 'Picking niet gevonden.' }, 404);
    }
    const picking = pickings[0];

    // Veiligheidscheck: bron moet de bus van de technieker zijn
    const srcId = Array.isArray(picking.location_id)
      ? picking.location_id[0] : picking.location_id;
    if (srcId !== locationId) {
      return cors({ error: 'Deze picking behoort niet tot jouw bus.' }, 403);
    }
    if (picking.state === 'done' || picking.state === 'cancel') {
      return cors({ error: `Picking is al ${picking.state}.` }, 400);
    }

    const destId = Array.isArray(picking.location_dest_id)
      ? picking.location_dest_id[0] : picking.location_dest_id;

    // UoM per product ophalen en moves aanmaken
    const productIds = items.map(i => parseInt(i.productId));
    const products   = await odooCall('product.product', 'read', [productIds], {
      fields: ['id', 'uom_id'],
    });
    const uomById = Object.fromEntries(products.map(p => [
      p.id,
      Array.isArray(p.uom_id) ? p.uom_id[0] : p.uom_id,
    ]));

    for (const item of items) {
      const pid = parseInt(item.productId);
      const qty = parseFloat(item.quantity);
      if (!pid || qty <= 0) continue;

      await odooCall('stock.move', 'create', [{
        picking_id:          parseInt(pickingId),
        product_id:          pid,
        product_uom_qty:     qty,
        product_uom:         uomById[pid] || 1,
        location_id:         locationId,
        location_dest_id:    destId,
        description_picking: `[EXTRA] ${user.name}`,
      }]);
    }

    // Beschikbaarheid herberekenen
    try {
      await odooCall('stock.picking', 'action_assign', [[parseInt(pickingId)]]);
    } catch (e) {
      console.warn('action_assign warning:', e.message);
    }

    return cors({ success: true, pickingName: picking.name });
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Picking add line error:', err);
    return cors({ error: 'Fout bij toevoegen regels: ' + err.message }, 500);
  }
};
