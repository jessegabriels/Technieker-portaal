// netlify/functions/return-create.js
// Maakt een retourbon aan (bus → magazijn) die NIET door de technieker bevestigd kan worden.
// De magazijnier valideert in Odoo.
//
// POST { items: [{ productId, quantity, lotNames?: string[] }] }

const { requireAuth, cors } = require('./lib/auth');
const { findById }          = require('./lib/users');
const { odooCall }          = require('./lib/odoo');
const crypto                = require('crypto');

const RETURN_PICKING_TYPE_ID = parseInt(process.env.ODOO_RETURN_PICKING_TYPE_ID || '0');
const RETURN_DEST_LOCATION_ID = parseInt(process.env.ODOO_RETURN_DEST_LOCATION_ID || '0');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});

  try {
    const authUser = requireAuth(event);
    const user     = await findById(authUser.id);
    if (!user || !user.odooLocationId)
      return cors({ error: 'Geen buslocatie ingesteld.' }, 403);

    if (event.httpMethod === 'GET') {
      // Haal retourpickings op voor deze bus
      const locationId = parseInt(user.odooLocationId);
      const domain = [
        ['location_id', '=', locationId],
        ['origin', 'like', 'RETOUR-'],
        ['state', 'not in', ['cancel']],
      ];
      const pickings = await odooCall('stock.picking', 'search_read', [domain], {
        fields: ['id', 'name', 'state', 'origin', 'scheduled_date', 'partner_id'],
        order:  'create_date desc',
        limit:  50,
      });

      const STATE_LABEL = {
        draft: 'Concept', confirmed: 'Wacht op magazijnier',
        assigned: 'Klaar voor controle', done: 'Verwerkt', cancel: 'Geannuleerd',
        waiting: 'Wachtend', partially_available: 'Gedeeltelijk',
      };

      // Moves ophalen voor alle retourpickings
      const pickingIds = (pickings || []).map(p => p.id);
      let movesByPicking = {};
      if (pickingIds.length > 0) {
        const moves = await odooCall('stock.move', 'search_read',
          [[['picking_id', 'in', pickingIds], ['state', 'not in', ['cancel']]]],
          { fields: ['id', 'picking_id', 'product_id', 'product_uom_qty', 'product_uom'] }
        );
        for (const m of (moves || [])) {
          const pid = Array.isArray(m.picking_id) ? m.picking_id[0] : m.picking_id;
          if (!movesByPicking[pid]) movesByPicking[pid] = [];
          movesByPicking[pid].push({
            productName: Array.isArray(m.product_id)  ? m.product_id[1]  : 'Onbekend',
            qty:         m.product_uom_qty || 0,
            unit:        Array.isArray(m.product_uom) ? m.product_uom[1] : 'stuk',
          });
        }
      }

      return cors({
        returns: (pickings || []).map(p => ({
          id:           p.id,
          name:         p.name,
          state:        p.state,
          stateLabel:   STATE_LABEL[p.state] || p.state,
          origin:       p.origin,
          scheduledDate: p.scheduled_date,
          items:        movesByPicking[p.id] || [],
        })),
      });
    }

    if (event.httpMethod === 'POST') {
      if (!RETURN_PICKING_TYPE_ID || !RETURN_DEST_LOCATION_ID) {
        return cors({
          error: 'ODOO_RETURN_PICKING_TYPE_ID en ODOO_RETURN_DEST_LOCATION_ID zijn niet ingesteld in de omgevingsvariabelen.',
        }, 500);
      }

      const { items } = JSON.parse(event.body || '{}');
      if (!items?.length)
        return cors({ error: 'Geen artikelen opgegeven.' }, 400);

      const locationId = parseInt(user.odooLocationId);
      const origin     = `RETOUR-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      // Retourpicking aanmaken
      const pickingId = await odooCall('stock.picking', 'create', [{
        picking_type_id:  RETURN_PICKING_TYPE_ID,
        location_id:      locationId,
        location_dest_id: RETURN_DEST_LOCATION_ID,
        origin,
        note: `Retour aangevraagd door ${user.name} via portaal`,
      }]);

      // Moves aanmaken per artikel
      for (const item of items) {
        const productId = parseInt(item.productId);
        const quantity  = parseFloat(item.quantity || 1);
        if (!productId || quantity <= 0) continue;

        // UoM ophalen
        const products = await odooCall('product.product', 'read', [[productId]], {
          fields: ['uom_id'],
        });
        const uomId = Array.isArray(products[0]?.uom_id) ? products[0].uom_id[0] : 1;

        const lotNames = item.lotNames || [];

        if (lotNames.length > 0) {
          // Serialized: één move per serienummer
          for (const lotName of lotNames) {
            const lots = await odooCall('stock.lot', 'search_read',
              [[['name', '=', lotName], ['product_id', '=', productId]]],
              { fields: ['id'], limit: 1 }
            );
            if (!lots?.length) continue;
            const lotId = lots[0].id;

            const moveId = await odooCall('stock.move', 'create', [{
              picking_id:      pickingId,
              product_id:      productId,
              product_uom_qty: 1,
              product_uom:     uomId,
              location_id:     locationId,
              location_dest_id: RETURN_DEST_LOCATION_ID,
            }]);
            await odooCall('stock.move.line', 'create', [{
              move_id:         moveId,
              picking_id:      pickingId,
              product_id:      productId,
              lot_id:          lotId,
              quantity:        1,
              location_id:     locationId,
              location_dest_id: RETURN_DEST_LOCATION_ID,
            }]);
          }
        } else {
          // Niet geserialiseerd: één move voor het totaal
          await odooCall('stock.move', 'create', [{
            picking_id:      pickingId,
            product_id:      productId,
            product_uom_qty: quantity,
            product_uom:     uomId,
            location_id:     locationId,
            location_dest_id: RETURN_DEST_LOCATION_ID,
          }]);
        }
      }

      // Bevestigen (naar "wacht op magazijnier" staat) — NIET valideren
      await odooCall('stock.picking', 'action_confirm', [[pickingId]]);
      try { await odooCall('stock.picking', 'action_assign', [[pickingId]]); } catch {}

      // Pickingsnaam ophalen
      const created = await odooCall('stock.picking', 'read', [[pickingId]], {
        fields: ['name'],
      });

      return cors({
        success:     true,
        pickingId,
        pickingName: created[0]?.name || String(pickingId),
        origin,
      });
    }

    return cors({ error: 'Method not allowed.' }, 405);
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Return create error:', err);
    return cors({ error: 'Fout bij aanmaken retour: ' + err.message }, 500);
  }
};
