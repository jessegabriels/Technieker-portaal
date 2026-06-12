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

    // ── Stap 1: Reservering vernieuwen (action_assign) ───────────────────────
    // Kritiek voor OUT-pickings: de bus was leeg toen de bon aangemaakt werd,
    // dus de move lines hebben quantity=0. Na MAOP is de bus gevuld; action_assign
    // herberekent de reserveringen zodat qty_done correct ingesteld kan worden.
    try {
      await odooCall('stock.picking', 'action_assign', [[id]]);
    } catch (assignErr) {
      console.warn('action_assign warning:', assignErr.message);
    }

    // ── Stap 2: qty_done instellen op alle move lines ─────────────────────────
    // Herlaad moves + move lines NA de reservering
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
      const moveId   = Array.isArray(ml.move_id) ? ml.move_id[0] : ml.move_id;
      const demanded = demandedByMoveId[moveId] ?? 0;
      const reserved = ml.quantity || 0;
      // Gebruik gereserveerde qty als die beschikbaar is, anders gevraagde qty
      const qtyDone  = Math.min(reserved > 0 ? reserved : demanded, demanded);
      if (qtyDone > 0) {
        await odooCall('stock.move.line', 'write', [[ml.id], { qty_done: qtyDone }]);
      }
    }

    // ── Stap 3: Valideer de picking ───────────────────────────────────────────
    // Gooi echte Odoo-fouten door — niet wegstop­pen
    let result;
    try {
      result = await odooCall('stock.picking', 'button_validate', [[id]], {
        context: { immediate_transfer: true },
      });
    } catch (validateErr) {
      throw new Error('Odoo kon de picking niet bevestigen: ' + validateErr.message);
    }

    // ── Stap 4: Wizard afhandelen indien teruggestuurd ────────────────────────
    if (result && typeof result === 'object' && result.res_model) {
      const model = result.res_model;
      try {
        if (model === 'stock.backorder.confirmation') {
          const wizardId = await odooCall('stock.backorder.confirmation', 'create',
            [{ show_transfers: false, pick_ids: [[6, 0, [id]]] }]
          );
          await odooCall('stock.backorder.confirmation', 'process_cancel_backorder', [[wizardId]]);
        } else if (model === 'stock.immediate.transfer') {
          const wizardId = await odooCall('stock.immediate.transfer', 'create',
            [{ pick_ids: [[6, 0, [id]]] }]
          );
          await odooCall('stock.immediate.transfer', 'process', [[wizardId]]);
        } else {
          console.warn('Onbekend wizard-type na button_validate:', model);
        }
      } catch (wizardErr) {
        console.warn('Wizard verwerking mislukt:', wizardErr.message);
      }
    }

    // ── Stap 5: Eindstatus controleren ───────────────────────────────────────
    const updated    = await odooCall('stock.picking', 'read', [[id]], { fields: ['id', 'name', 'state'] });
    const finalState = updated?.[0]?.state || 'unknown';

    if (finalState !== 'done') {
      return cors({
        error: `Picking ${picking.name} kon niet bevestigd worden in Odoo (huidige status: ${finalState}). ` +
               `Controleer of alle artikelen beschikbaar zijn en probeer opnieuw.`,
      }, 400);
    }

    return cors({
      success:     true,
      pickingName: picking.name,
      state:       finalState,
      message:     `Picking ${picking.name} succesvol bevestigd.`,
    });

  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Pickings validate error:', err);
    return cors({ error: 'Fout bij bevestigen: ' + err.message }, 500);
  }
};