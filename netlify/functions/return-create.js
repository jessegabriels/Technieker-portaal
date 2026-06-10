// netlify/functions/return-create.js
// Maakt een retourbon aan (bus → magazijn) die NIET door de technieker bevestigd kan worden.
// De magazijnier valideert in Odoo.
//
// GET                       → retourbonnen voor deze gebruiker (via Supabase + Odoo staat)
// POST { items, note? }     → nieuwe retourbon aanmaken
// DELETE { id }             → retour verwijderen uit portaal (Odoo picking blijft intact)

const { requireAuth, cors } = require('./lib/auth');
const { findById }          = require('./lib/users');
const { odooCall }          = require('./lib/odoo');
const returnsLib            = require('./lib/returns');
const crypto                = require('crypto');

const RETURN_PICKING_TYPE_ID  = parseInt(process.env.ODOO_RETURN_PICKING_TYPE_ID  || '0');
const RETURN_DEST_LOCATION_ID = parseInt(process.env.ODOO_RETURN_DEST_LOCATION_ID || '0');

const STATE_LABEL = {
  draft:               'Concept',
  confirmed:           'Wacht op magazijnier',
  waiting:             'Wachtend',
  assigned:            'Klaar voor controle',
  partially_available: 'Gedeeltelijk',
  done:                'Verwerkt',
  cancel:              'Geannuleerd',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});

  try {
    const authUser = requireAuth(event);
    const user     = await findById(authUser.id);
    if (!user) return cors({ error: 'Gebruiker niet gevonden.' }, 404);

    // ── GET: Retourbonnen ophalen ─────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const portalReturns = await returnsLib.getForUser(user.id);
      if (!portalReturns.length) return cors({ returns: [] });

      const origins = portalReturns.map(r => r.origin);

      // Haal Odoo-staat op voor alle bekende origins
      const odooPickings = await odooCall('stock.picking', 'search_read',
        [[['origin', 'in', origins]]],
        {
          fields: ['id', 'name', 'state', 'origin', 'scheduled_date', 'move_ids'],
          order:  'create_date desc',
          limit:  200,
        }
      );

      const pickingByOrigin = Object.fromEntries((odooPickings || []).map(p => [p.origin, p]));

      // Moves ophalen voor aanwezige pickings
      const presentPickingIds = (odooPickings || []).map(p => p.id);
      let movesByPicking = {};
      if (presentPickingIds.length > 0) {
        const moves = await odooCall('stock.move', 'search_read',
          [[['picking_id', 'in', presentPickingIds], ['state', 'not in', ['cancel']]]],
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

      const returns = portalReturns.map(pr => {
        const picking = pickingByOrigin[pr.origin];
        if (!picking) {
          // Odoo picking niet gevonden (bv. manueel verwijderd in Odoo)
          return {
            id:            pr.id,
            odooPickingId: pr.odooPickingId,
            name:          pr.odooPickingName || pr.origin,
            state:         'unknown',
            stateLabel:    'Niet gevonden in Odoo',
            origin:        pr.origin,
            scheduledDate: null,
            note:          pr.note,
            items:         [],
            createdAt:     pr.createdAt,
          };
        }
        return {
          id:            pr.id,
          odooPickingId: picking.id,
          name:          picking.name,
          state:         picking.state,
          stateLabel:    STATE_LABEL[picking.state] || picking.state,
          origin:        picking.origin,
          scheduledDate: picking.scheduled_date || null,
          note:          pr.note,
          items:         movesByPicking[picking.id] || [],
          createdAt:     pr.createdAt,
        };
      });

      return cors({ returns });
    }

    // ── POST: Retourbon aanmaken ──────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      if (!user.odooLocationId)
        return cors({ error: 'Geen buslocatie ingesteld.' }, 403);
      if (!RETURN_PICKING_TYPE_ID || !RETURN_DEST_LOCATION_ID) {
        return cors({
          error: 'ODOO_RETURN_PICKING_TYPE_ID en ODOO_RETURN_DEST_LOCATION_ID zijn niet ingesteld in de omgevingsvariabelen.',
        }, 500);
      }

      const { items, note } = JSON.parse(event.body || '{}');
      if (!items?.length)
        return cors({ error: 'Geen artikelen opgegeven.' }, 400);

      const locationId = parseInt(user.odooLocationId);
      const origin     = `RETOUR-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      // Note voor in Odoo (naam + optionele opmerking)
      const odooNote = `Retour aangevraagd door ${user.name} via portaal${note ? `\n\nOpmerking: ${note}` : ''}`;

      // Retourpicking aanmaken in Odoo
      const pickingId = await odooCall('stock.picking', 'create', [{
        picking_type_id:  RETURN_PICKING_TYPE_ID,
        location_id:      locationId,
        location_dest_id: RETURN_DEST_LOCATION_ID,
        origin,
        note: odooNote,
      }]);

      // Moves aanmaken per artikel
      for (const item of items) {
        const productId = parseInt(item.productId);
        const quantity  = parseFloat(item.quantity || 1);
        if (!productId || quantity <= 0) continue;

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
              picking_id:       pickingId,
              product_id:       productId,
              product_uom_qty:  1,
              product_uom:      uomId,
              location_id:      locationId,
              location_dest_id: RETURN_DEST_LOCATION_ID,
            }]);
            await odooCall('stock.move.line', 'create', [{
              move_id:          moveId,
              picking_id:       pickingId,
              product_id:       productId,
              lot_id:           lotId,
              quantity:         1,
              location_id:      locationId,
              location_dest_id: RETURN_DEST_LOCATION_ID,
            }]);
          }
        } else {
          // Niet geserialiseerd: één move voor het totaal
          await odooCall('stock.move', 'create', [{
            picking_id:       pickingId,
            product_id:       productId,
            product_uom_qty:  quantity,
            product_uom:      uomId,
            location_id:      locationId,
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
      const pickingName = created[0]?.name || String(pickingId);

      // Opslaan in Supabase portal_returns
      const portalReturn = await returnsLib.create({
        id:              `RET-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        userId:          user.id,
        origin,
        odooPickingId:   pickingId,
        odooPickingName: pickingName,
        note:            note || '',
      });

      return cors({
        success:     true,
        id:          portalReturn?.id,
        pickingId,
        pickingName,
        origin,
      });
    }

    // ── DELETE: Retour verwijderen uit portaal ────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      if (!id) return cors({ error: 'Geen retour-ID opgegeven.' }, 400);

      // Verwijder uit Supabase — user_id check voorkomt verwijdering van andermans records
      await returnsLib.remove(id, user.id);

      return cors({ success: true });
    }

    return cors({ error: 'Method not allowed.' }, 405);
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Return handler error:', err);
    return cors({ error: 'Fout bij retour operatie: ' + err.message }, 500);
  }
};
