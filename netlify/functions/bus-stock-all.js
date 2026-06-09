// netlify/functions/bus-stock-all.js
const { requireAuth, cors } = require('./lib/auth');
const { getAll, findById }  = require('./lib/users');
const { odooCall }          = require('./lib/odoo');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  if (event.httpMethod !== 'GET')     return cors({ error: 'Method not allowed' }, 405);

  try {
    const authUser = requireAuth(event);
    const user     = await findById(authUser.id);
    if (!user) return cors({ error: 'Gebruiker niet gevonden.' }, 404);

    let targetUsers;
    if (user.role === 'admin') {
      const all = await getAll();
      targetUsers = all.filter(u => u.active && u.odooLocationId);
    } else {
      if (!user.odooLocationId)
        return cors({ buses: [], warning: 'Geen buslocatie ingesteld.' });
      targetUsers = [user];
    }

    if (targetUsers.length === 0) return cors({ buses: [] });

    const locationIds = [...new Set(targetUsers.map(u => parseInt(u.odooLocationId)))];

    // ── 1. Actuele stock via stock.quant (inclusief lot_id voor serienummers) ─
    const quants = await odooCall('stock.quant', 'search_read',
      [[['location_id', 'in', locationIds], ['quantity', '>', 0]]],
      {
        fields: ['product_id', 'quantity', 'reserved_quantity',
                 'location_id', 'product_uom_id', 'lot_id'],
        limit: 5000,
      }
    );

    // ── 2. Verwachte items: MAOP richting bus nog niet bevestigd ──────────────
    const incomingMoves = await odooCall('stock.move', 'search_read',
      [[['location_dest_id', 'in', locationIds],
        ['state', 'in', ['assigned', 'confirmed', 'waiting']]]],
      { fields: ['product_id', 'product_uom_qty', 'product_uom',
                 'location_dest_id', 'picking_id'], limit: 2000 }
    );

    // ── 3. Groepeer quants per locatie → per product (met lots) ──────────────
    // Elk serienummer = aparte quant-record → samenvoegen per product
    const quantsByLocAndProd = {};
    for (const q of (quants || [])) {
      const locId  = Array.isArray(q.location_id) ? q.location_id[0] : q.location_id;
      const prodId = Array.isArray(q.product_id)  ? q.product_id[0]  : q.product_id;
      const key    = `${locId}__${prodId}`;

      if (!quantsByLocAndProd[key]) {
        quantsByLocAndProd[key] = {
          locationId:  locId,
          productId:   prodId,
          productName: Array.isArray(q.product_id)    ? q.product_id[1]    : 'Onbekend',
          unit:        Array.isArray(q.product_uom_id)? q.product_uom_id[1]: 'stuk',
          qty:         0,
          reserved:    0,
          lots:        [],
        };
      }
      quantsByLocAndProd[key].qty      += q.quantity          || 0;
      quantsByLocAndProd[key].reserved += q.reserved_quantity || 0;

      const lotName = Array.isArray(q.lot_id) && q.lot_id[0] ? q.lot_id[1] : null;
      if (lotName) quantsByLocAndProd[key].lots.push(lotName);
    }

    // ── 4. Groepeer verwachte items per locatie ───────────────────────────────
    const incomingByLoc = {};
    for (const m of (incomingMoves || [])) {
      const locId = Array.isArray(m.location_dest_id) ? m.location_dest_id[0] : m.location_dest_id;
      if (!incomingByLoc[locId]) incomingByLoc[locId] = [];
      incomingByLoc[locId].push({
        productId:   Array.isArray(m.product_id)  ? m.product_id[0]  : m.product_id,
        productName: Array.isArray(m.product_id)  ? m.product_id[1]  : 'Onbekend',
        unit:        Array.isArray(m.product_uom) ? m.product_uom[1] : 'stuk',
        qty:         m.product_uom_qty || 0,
        pickingName: Array.isArray(m.picking_id)  ? m.picking_id[1]  : '',
      });
    }

    // ── 5. Bouw resultaat per bus ──────────────────────────────────────────────
    const buses = targetUsers.map(u => {
      const locId   = parseInt(u.odooLocationId);
      const stock   = Object.values(quantsByLocAndProd)
        .filter(s => s.locationId === locId)
        .map(s => ({ ...s, available: Math.max(0, s.qty - s.reserved) }));
      const incoming = incomingByLoc[locId] || [];

      return {
        userId:        u.id,
        userName:      u.name,
        department:    u.department,
        locationId:    locId,
        stock,
        incoming,
        totalItems:    stock.length,
        totalIncoming: incoming.length,
      };
    });

    return cors({ buses });
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Bus stock all error:', err);
    return cors({ error: 'Fout bij ophalen busstock: ' + err.message }, 500);
  }
};
