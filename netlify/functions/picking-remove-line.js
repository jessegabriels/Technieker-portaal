// netlify/functions/picking-remove-line.js
// Verwijdert een stock.move uit een WH/OUT picking.
// Controleert dat de picking bij de bus van de technieker hoort.

const { requireAuth, cors } = require('./lib/auth');
const { findById }          = require('./lib/users');
const { odooCall }          = require('./lib/odoo');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  if (event.httpMethod !== 'POST')    return cors({ error: 'Method not allowed' }, 405);

  try {
    const authUser = requireAuth(event);
    const user     = await findById(authUser.id);
    if (!user || !user.odooLocationId)
      return cors({ error: 'Geen buslocatie ingesteld.' }, 403);

    const { pickingId, moveId } = JSON.parse(event.body || '{}');
    if (!pickingId || !moveId)
      return cors({ error: 'pickingId en moveId zijn verplicht.' }, 400);

    const pid = parseInt(pickingId);
    const mid = parseInt(moveId);
    const locationId = parseInt(user.odooLocationId);

    // Picking ophalen en veiligheidscheck
    const pickings = await odooCall('stock.picking', 'read', [[pid]], {
      fields: ['id', 'name', 'state', 'location_id'],
    });
    if (!pickings?.length) return cors({ error: 'Picking niet gevonden.' }, 404);

    const picking = pickings[0];
    const srcId = Array.isArray(picking.location_id) ? picking.location_id[0] : picking.location_id;
    if (srcId !== locationId)
      return cors({ error: 'Deze picking behoort niet tot jouw bus.' }, 403);
    if (picking.state === 'done' || picking.state === 'cancel')
      return cors({ error: `Picking is al ${picking.state}.` }, 400);

    // Move ophalen
    const moves = await odooCall('stock.move', 'read', [[mid]], {
      fields: ['id', 'picking_id', 'state', 'product_id', 'qty_done'],
    });
    if (!moves?.length) return cors({ error: 'Regel niet gevonden.' }, 404);

    const move = moves[0];
    const movePicking = Array.isArray(move.picking_id) ? move.picking_id[0] : move.picking_id;
    if (movePicking !== pid)
      return cors({ error: 'Deze regel hoort niet bij de opgegeven picking.' }, 403);
    if (move.state === 'done')
      return cors({ error: 'Kan een afgeronde regel niet verwijderen.' }, 400);
    if ((move.qty_done || 0) > 0)
      return cors({ error: 'Kan een regel met verwerkte hoeveelheid niet verwijderen.' }, 400);

    // Stap 1: Move lines verwijderen
    const moveLines = await odooCall('stock.move.line', 'search_read',
      [[['move_id', '=', mid]]],
      { fields: ['id'] }
    );
    if (moveLines?.length) {
      await odooCall('stock.move.line', 'unlink', [moveLines.map(ml => ml.id)]);
    }

    // Stap 2: Move zelf op 0 zetten en verwijderen
    await odooCall('stock.move', 'write', [[mid], { product_uom_qty: 0 }]);
    try {
      await odooCall('stock.move', 'unlink', [[mid]]);
    } catch (unlinkErr) {
      // Als unlink mislukt, probeer write state cancel
      await odooCall('stock.move', 'write', [[mid], { state: 'cancel' }]);
    }

    // Stap 3: Beschikbaarheid herberekenen
    try {
      await odooCall('stock.picking', 'action_assign', [[pid]]);
    } catch (e) { /* niet kritisch */ }

    return cors({ success: true });
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Remove line error:', err);
    return cors({ error: 'Fout bij verwijderen: ' + err.message }, 500);
  }
};
