// netlify/functions/picking-edit-line.js
// Bewerkt een bestaande picking: voeg een regel toe of verwijder een specifieke move line.
//
// POST { action: 'add', pickingId, productId, quantity, lotName? }
//   → Voegt een move toe, optioneel met specifiek serienummer uit busstock
//
// POST { action: 'remove_line', pickingId, moveLineId, moveId }
//   → Verwijdert een specifieke move line (1 serienummer); als move leeg → move ook weg

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

    const body       = JSON.parse(event.body || '{}');
    const { action, pickingId } = body;
    if (!action || !pickingId)
      return cors({ error: 'action en pickingId zijn verplicht.' }, 400);

    const pid        = parseInt(pickingId);
    const locationId = parseInt(user.odooLocationId);

    // Picking ophalen + veiligheidscheck
    const pickings = await odooCall('stock.picking', 'read', [[pid]], {
      fields: ['id', 'name', 'state', 'location_id', 'location_dest_id'],
    });
    if (!pickings?.length) return cors({ error: 'Picking niet gevonden.' }, 404);
    const picking = pickings[0];

    const srcId  = Array.isArray(picking.location_id)      ? picking.location_id[0]      : picking.location_id;
    const destId = Array.isArray(picking.location_dest_id) ? picking.location_dest_id[0] : picking.location_dest_id;
    if (srcId !== locationId && destId !== locationId)
      return cors({ error: 'Deze picking behoort niet tot jouw bus.' }, 403);
    if (picking.state === 'done' || picking.state === 'cancel')
      return cors({ error: `Picking is al ${picking.state}.` }, 400);

    // ── ADD ──────────────────────────────────────────────────────────────────
    if (action === 'add') {
      const { productId, quantity, lotName } = body;
      if (!productId || !quantity || quantity <= 0)
        return cors({ error: 'productId en quantity zijn verplicht.' }, 400);

      const productPid = parseInt(productId);

      // UoM ophalen
      const products = await odooCall('product.product', 'read', [[productPid]], {
        fields: ['uom_id'],
      });
      const uomId = Array.isArray(products[0]?.uom_id) ? products[0].uom_id[0] : 1;

      // Lot opzoeken als serienummer opgegeven
      let lotId = null;
      if (lotName && lotName.trim()) {
        const lots = await odooCall('stock.lot', 'search_read',
          [[['name', '=', lotName.trim()], ['product_id', '=', productPid]]],
          { fields: ['id', 'name'], limit: 1 }
        );
        if (!lots?.length)
          return cors({ error: `Serienummer "${lotName}" niet gevonden in Odoo.` }, 404);
        lotId = lots[0].id;

        // Controleer of lot in busstock zit
        const quantCheck = await odooCall('stock.quant', 'search_count',
          [[['location_id', '=', locationId], ['lot_id', '=', lotId],
            ['product_id', '=', productPid], ['quantity', '>', 0]]]
        );
        if (!quantCheck)
          return cors({ error: `Serienummer "${lotName}" zit niet in jouw bus.` }, 400);
      }

      // Move aanmaken
      const moveId = await odooCall('stock.move', 'create', [{
        picking_id:          pid,
        product_id:          productPid,
        product_uom_qty:     lotId ? 1 : parseFloat(quantity),
        product_uom:         uomId,
        location_id:         srcId,
        location_dest_id:    destId,
        description_picking: `[EXTRA] ${user.name}`,
      }]);

      // Als lot: move line aanmaken met specifiek lot
      if (lotId) {
        await odooCall('stock.move.line', 'create', [{
          move_id:         moveId,
          picking_id:      pid,
          product_id:      productPid,
          lot_id:          lotId,
          quantity:        1,
          location_id:     srcId,
          location_dest_id: destId,
        }]);
      }

      try { await odooCall('stock.picking', 'action_assign', [[pid]]); } catch {}
      return cors({ success: true, action: 'added' });
    }

    // ── REMOVE_LINE ───────────────────────────────────────────────────────────
    if (action === 'remove_line') {
      const { moveLineId, moveId } = body;
      if (!moveLineId || !moveId)
        return cors({ error: 'moveLineId en moveId zijn verplicht.' }, 400);

      const mlId = parseInt(moveLineId);
      const mid  = parseInt(moveId);

      // Controleer dat move line bij deze picking hoort
      const lines = await odooCall('stock.move.line', 'search_read',
        [[['id', '=', mlId], ['picking_id', '=', pid]]],
        { fields: ['id', 'qty_done'] }
      );
      if (!lines?.length)
        return cors({ error: 'Move line niet gevonden in deze picking.' }, 404);

      // Move line verwijderen
      await odooCall('stock.move.line', 'unlink', [[mlId]]);

      // Kijk of de move nog lines heeft
      const remaining = await odooCall('stock.move.line', 'search_count',
        [[['move_id', '=', mid]]]
      );

      if (remaining === 0) {
        // Geen lines meer → move verwijderen
        await odooCall('stock.move', 'write', [[mid], { product_uom_qty: 0 }]);
        try { await odooCall('stock.move', 'unlink', [[mid]]); } catch {}
      } else {
        // Move qty verlagen met 1
        const moves = await odooCall('stock.move', 'read', [[mid]], {
          fields: ['product_uom_qty'],
        });
        const currentQty = moves[0]?.product_uom_qty || 0;
        if (currentQty > 1) {
          await odooCall('stock.move', 'write', [[mid], {
            product_uom_qty: currentQty - 1,
          }]);
        }
      }

      try { await odooCall('stock.picking', 'action_assign', [[pid]]); } catch {}
      return cors({ success: true, action: 'removed' });
    }

    // ── UPDATE_QTY ────────────────────────────────────────────────────────────
    if (action === 'update_qty') {
      const { moveId, newQty } = body;
      if (!moveId || newQty === undefined)
        return cors({ error: 'moveId en newQty zijn verplicht.' }, 400);

      const mid = parseInt(moveId);
      const qty = parseFloat(newQty);

      // Verify move belongs to this picking
      const moves = await odooCall('stock.move', 'read', [[mid]], {
        fields: ['id', 'picking_id', 'state', 'product_uom_qty'],
      });
      if (!moves?.length) return cors({ error: 'Regel niet gevonden.' }, 404);

      const move = moves[0];
      const movePid = Array.isArray(move.picking_id) ? move.picking_id[0] : move.picking_id;
      if (movePid !== pid) return cors({ error: 'Regel hoort niet bij deze picking.' }, 403);
      if (move.state === 'done') return cors({ error: 'Kan een afgeronde regel niet wijzigen.' }, 400);

      if (qty <= 0) {
        // Aantal = 0 → move volledig verwijderen
        const moveLines = await odooCall('stock.move.line', 'search_read',
          [[['move_id', '=', mid]]], { fields: ['id'] }
        );
        if (moveLines?.length) {
          await odooCall('stock.move.line', 'unlink', [moveLines.map(ml => ml.id)]);
        }
        await odooCall('stock.move', 'write', [[mid], { product_uom_qty: 0 }]);
        try { await odooCall('stock.move', 'unlink', [[mid]]); } catch {}
      } else {
        // Stap 1: update gevraagde hoeveelheid op de move
        await odooCall('stock.move', 'write', [[mid], { product_uom_qty: qty }]);

        // Stap 2: update ook de gereserveerde hoeveelheid op de move lines
        // Zo klopt qty_done bij bevestigen (qty_done = ml.quantity)
        const moveLines = await odooCall('stock.move.line', 'search_read',
          [[['move_id', '=', mid]]],
          { fields: ['id', 'quantity'] }
        );

        if (moveLines?.length === 1) {
          // Enkelvoudige lijn: zet quantity direct op nieuwe waarde
          await odooCall('stock.move.line', 'write',
            [[moveLines[0].id], { quantity: qty }]
          );
        } else if (moveLines?.length > 1) {
          // Meerdere lijnen: verdeel proportioneel
          const totalReserved = moveLines.reduce((sum, ml) => sum + (ml.quantity || 0), 0);
          if (totalReserved > 0) {
            let remaining = qty;
            for (let i = 0; i < moveLines.length; i++) {
              const ml = moveLines[i];
              const lineQty = i === moveLines.length - 1
                ? Math.max(0, remaining)
                : Math.round(((ml.quantity / totalReserved) * qty) * 1000) / 1000;
              remaining -= lineQty;
              await odooCall('stock.move.line', 'write', [[ml.id], { quantity: lineQty }]);
            }
          }
        }
      }

      try { await odooCall('stock.picking', 'action_assign', [[pid]]); } catch {}
      return cors({ success: true, action: 'updated', newQty: qty });
    }

    return cors({ error: `Onbekende actie: ${action}` }, 400);
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Edit line error:', err);
    return cors({ error: 'Fout bij bewerken: ' + err.message }, 500);
  }
};