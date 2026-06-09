// netlify/functions/pickings-validate.js
// Valideert een Odoo picking vanuit het portaal.
// Stelt alle qty_done in op de gereserveerde hoeveelheid en bevestigt de picking.

const { requireAuth, cors } = require('./lib/auth');
const { findById }          = require('./lib/users');
const { odooCall }          = require('./lib/odoo');
 
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  if (event.httpMethod !== 'POST') return cors({ error: 'Method not allowed' }, 405);
 
  try {
    const authUser = requireAuth(event);
    const { pickingId } = JSON.parse(event.body || '{}');
 
    if (!pickingId || isNaN(parseInt(pickingId))) {
      return cors({ error: 'Ongeldig picking ID.' }, 400);
    }
 
    const id = parseInt(pickingId);
 
    // Haal gebruiker op voor veiligheidscontrole
    const user = await findById(authUser.id);
    if (!user || !user.odooLocationId) {
      return cors({ error: 'Geen buslocatie ingesteld voor dit account.' }, 403);
    }
 
    // Controleer of picking bestaat en bij deze technieker hoort
    const pickings = await odooCall('stock.picking', 'read', [[id]], {
      fields: ['id', 'name', 'state', 'location_id', 'location_dest_id'],
    });
 
    if (!pickings || pickings.length === 0) {
      return cors({ error: 'Picking niet gevonden.' }, 404);
    }
 
    const picking = pickings[0];
 
    // Veiligheidscheck:
    // MAOP (inbound):  location_dest_id = bus  → technieker ontvangt materiaal
    // WH/OUT (outbound): location_id = bus     → technieker plaatst materiaal
    const busId  = parseInt(user.odooLocationId);
    const srcId  = Array.isArray(picking.location_id)      ? picking.location_id[0]      : picking.location_id;
    const destId = Array.isArray(picking.location_dest_id) ? picking.location_dest_id[0] : picking.location_dest_id;
 
    if (srcId !== busId && destId !== busId) {
      return cors({ error: 'Deze picking behoort niet tot jouw bestelbus.' }, 403);
    }
 
    if (picking.state === 'done') {
      return cors({ error: 'Deze picking is al bevestigd.' }, 400);
    }
 
    if (picking.state === 'cancel') {
      return cors({ error: 'Deze picking is geannuleerd.' }, 400);
    }
 
    // Stap 1: Stel qty_done in op alle move lines
    const moveLines = await odooCall('stock.move.line', 'search_read',
      [[['picking_id', '=', id], ['state', 'not in', ['done', 'cancel']]]],
      { fields: ['id', 'quantity', 'qty_done'] }
    );
 
    for (const ml of moveLines) {
      if (ml.quantity > 0) {
        await odooCall('stock.move.line', 'write',
          [[ml.id], { qty_done: ml.quantity }]
        );
      }
    }
 
    // Stap 2: Valideer de picking
    let result;
    try {
      result = await odooCall('stock.picking', 'button_validate', [[id]], {
        context: { immediate_transfer: true },
      });
    } catch (validateErr) {
      // Sommige Odoo-versies gooien een fout als er niets te valideren is
      console.warn('button_validate warning:', validateErr.message);
      result = true;
    }
 
    // Stap 3: Als er een backorder-wizard terugkomt, verwerk deze
    if (result && typeof result === 'object' && result.res_model) {
      try {
        if (result.res_model === 'stock.backorder.confirmation') {
          // Maak wizard aan en verwerk zonder backorder
          const wizardId = await odooCall('stock.backorder.confirmation', 'create',
            [{ show_transfers: false }]
          );
          await odooCall('stock.backorder.confirmation', 'process_cancel_backorder',
            [[wizardId]]
          );
        } else if (result.res_model === 'stock.immediate.transfer') {
          // Bevestig onmiddellijke overdracht
          const wizardId = await odooCall('stock.immediate.transfer', 'create',
            [{ pick_ids: [[6, 0, [id]]] }]
          );
          await odooCall('stock.immediate.transfer', 'process', [[wizardId]]);
        }
      } catch (wizardErr) {
        console.warn('Wizard verwerking mislukt (mogelijk al verwerkt):', wizardErr.message);
      }
    }
 
    // Controleer eindstatus
    const updated = await odooCall('stock.picking', 'read', [[id]], {
      fields: ['id', 'name', 'state'],
    });
    const finalState = updated?.[0]?.state || 'unknown';
 
    return cors({
      success: true,
      pickingName: picking.name,
      state: finalState,
      message: finalState === 'done'
        ? `Picking ${picking.name} succesvol bevestigd.`
        : `Picking ${picking.name} verwerkt (status: ${finalState}).`,
    });
 
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Pickings validate error:', err);
    return cors({ error: 'Fout bij bevestigen: ' + err.message }, 500);
  }
};
