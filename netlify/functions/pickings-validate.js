// netlify/functions/pickings-validate.js
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

    const id   = parseInt(pickingId);
    const user = await findById(authUser.id);
    if (!user || !user.odooLocationId) {
      return cors({ error: 'Geen buslocatie ingesteld voor dit account.' }, 403);
    }

    // Picking ophalen
    const pickings = await odooCall('stock.picking', 'read', [[id]], {
      fields: ['id', 'name', 'state', 'location_id', 'location_dest_id', 'origin'],
    });
    if (!pickings || pickings.length === 0) {
      return cors({ error: 'Picking niet gevonden.' }, 404);
    }

    const picking = pickings[0];
    const busId   = parseInt(user.odooLocationId);
    const srcId   = Array.isArray(picking.location_id)      ? picking.location_id[0]      : picking.location_id;
    const destId  = Array.isArray(picking.location_dest_id) ? picking.location_dest_id[0] : picking.location_dest_id;
    const origin  = picking.origin || '';

    // Veiligheidscheck: picking moet bij deze bus horen
    if (srcId !== busId && destId !== busId) {
      return cors({ error: 'Deze picking behoort niet tot jouw bestelbus.' }, 403);
    }

    if (picking.state === 'done')   return cors({ error: 'Deze picking is al bevestigd.' }, 400);
    if (picking.state === 'cancel') return cors({ error: 'Deze picking is geannuleerd.' }, 400);

    // ── Failsafe: WH/OUT mag pas bevestigd worden als de bijhorende MAOP klaar is ──
    const isOutbound = srcId === busId;
    const isRetour   = origin.startsWith('RETOUR-');

    if (isOutbound && !isRetour && origin) {
      const pendingMaop = await odooCall('stock.picking', 'search_read',
        [[
          ['origin',           '=',      origin],
          ['location_dest_id', '=',      busId],
          ['state',            'not in', ['done', 'cancel']],
        ]],
        { fields: ['id', 'name', 'state'], limit: 5 }
      );

      if (pendingMaop && pendingMaop.length > 0) {
        const namen = pendingMaop.map(p => p.name).join(', ');
        return cors({
          error: `Bevestig eerst de ophaalbon (${namen}) voordat je de plaatsingsbon kunt bevestigen. De materialen moeten eerst in jouw bus zitten.`,
        }, 400);
      }
    }

    // ── Stap 1: qty_done instellen op alle move lines ─────────────────────────
    // Haal ook de moves op voor hun product_uom_qty (gevraagde hoeveelheid)
    // zodat qty_done nooit hoger is dan wat gevraagd werd
    const movesForPicking = await odooCall('stock.move', 'search_read',
      [[['picking_id', '=', id], ['state', 'not in', ['done', 'cancel']]]],
      { fields: ['id', 'product_uom_qty'] }
    );
    const demandedByMoveId = Object.fromEntries(
      (movesForPicking || []).map(m => [m.id, m.product_uom_qty || 0])
    );

    const moveLines = await odooCall('stock.move.line', 'search_read',
      [[['picking_id', '=', id], ['state', 'not in', ['done', 'cancel']]]],
      { fields: ['id', 'move_id', 'quantity', 'qty_done'] }
    );

    for (const ml of moveLines) {
      const moveId    = Array.isArray(ml.move_id) ? ml.move_id[0] : ml.move_id;
      const demanded  = demandedByMoveId[moveId] ?? (ml.quantity || 0);
      // qty_done = gereserveerd, maar nooit meer dan wat gevraagd is
      const qtyDone   = Math.min(ml.quantity || 0, demanded);
      if (qtyDone > 0) {
        await odooCall('stock.move.line', 'write', [[ml.id], { qty_done: qtyDone }]);
      }
    }

    // ── Stap 2: Valideer de picking ───────────────────────────────────────────
    let result;
    try {
      result = await odooCall('stock.picking', 'button_validate', [[id]], {
        context: { immediate_transfer: true },
      });
    } catch (validateErr) {
      console.warn('button_validate warning:', validateErr.message);
      result = true;
    }

    // ── Stap 3: Wizard afhandelen indien teruggestuurd ────────────────────────
    if (result && typeof result === 'object' && result.res_model) {
      try {
        if (result.res_model === 'stock.backorder.confirmation') {
          const wizardId = await odooCall('stock.backorder.confirmation', 'create',
            [{ show_transfers: false }]
          );
          await odooCall('stock.backorder.confirmation', 'process_cancel_backorder', [[wizardId]]);
        } else if (result.res_model === 'stock.immediate.transfer') {
          const wizardId = await odooCall('stock.immediate.transfer', 'create',
            [{ pick_ids: [[6, 0, [id]]] }]
          );
          await odooCall('stock.immediate.transfer', 'process', [[wizardId]]);
        }
      } catch (wizardErr) {
        console.warn('Wizard verwerking mislukt:', wizardErr.message);
      }
    }

    // ── Eindstatus ophalen ────────────────────────────────────────────────────
    const updated    = await odooCall('stock.picking', 'read', [[id]], { fields: ['id', 'name', 'state'] });
    const finalState = updated?.[0]?.state || 'unknown';

    return cors({
      success:     true,
      pickingName: picking.name,
      state:       finalState,
      message:     finalState === 'done'
        ? `Picking ${picking.name} succesvol bevestigd.`
        : `Picking ${picking.name} verwerkt (status: ${finalState}).`,
    });

  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Pickings validate error:', err);
    return cors({ error: 'Fout bij bevestigen: ' + err.message }, 500);
  }
};