// netlify/functions/pickings-get.js
const { requireAuth, cors } = require('./lib/auth');
const { findById }          = require('./lib/users');
const { odooCall }          = require('./lib/odoo');

const READABLE_STATE = {
  draft:               'Concept',
  waiting:             'Wachtend',
  confirmed:           'Bevestigd',
  assigned:            'Klaar voor ophalen',
  partially_available: 'Gedeeltelijk beschikbaar',
  done:                'Voltooid',
  cancel:              'Geannuleerd',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  if (event.httpMethod !== 'GET') return cors({ error: 'Method not allowed' }, 405);

  try {
    const authUser = requireAuth(event);
    const user     = await findById(authUser.id);

    if (!user) return cors({ error: 'Gebruiker niet gevonden.' }, 404);
    if (!user.odooLocationId) {
      return cors({
        pickings: [],
        warning: 'Geen buslocatie ingesteld voor dit account. Vraag de beheerder om je buslocatie ID in te stellen.',
      });
    }

    const locationId = parseInt(user.odooLocationId);

    // direction=in  → MAOP: pickings naar de bus (location_dest_id = bus)
    // direction=out → WH/OUT: pickings van de bus (location_id = bus)
    const direction = (event.queryStringParameters || {}).direction || 'in';

    // ── 1. Pickings ophalen ──────────────────────────────────────────────────
    const locationFilter = direction === 'out'
      ? ['location_id',      '=', locationId]
      : ['location_dest_id', '=', locationId];

    const domain = [
      locationFilter,
      ['state', 'in', ['assigned', 'confirmed', 'waiting', 'partially_available']],
    ];

    const rawPickings = await odooCall('stock.picking', 'search_read', [domain], {
      fields: ['id', 'name', 'state', 'scheduled_date', 'origin',
               'picking_type_id', 'location_id', 'location_dest_id', 'move_ids',
               'partner_id'],
      order:  'scheduled_date asc',
    });

    if (!rawPickings || rawPickings.length === 0) {
      return cors({ pickings: [] });
    }

    const pickingIds = rawPickings.map(p => p.id);

    // ── 2. Moves ophalen — inclusief description_picking voor portal-marker ────
    const allMoveIds = rawPickings.flatMap(p => p.move_ids || []);
    let movesById    = {};

    if (allMoveIds.length > 0) {
      const moves = await odooCall('stock.move', 'read', [allMoveIds], {
        fields: ['id', 'product_id', 'product_uom_qty', 'quantity', 'state',
                 'product_uom', 'description_picking'],
      });
      movesById = Object.fromEntries((moves || []).map(m => [m.id, m]));
    }

    // ── 3. Move lines + serienummers ophalen ─────────────────────────────────
    // lot_name is geen betrouwbaar veld in Odoo 17+ — gebruik enkel lot_id[1]
    const moveLines = await odooCall('stock.move.line', 'search_read',
      [[['picking_id', 'in', pickingIds]]],
      { fields: ['id', 'move_id', 'product_id', 'lot_id', 'quantity', 'qty_done'] }
    );

    // Groepeer move lines + serienummers per move_id
    const serialsByMoveId   = {};
    const moveLinesByMoveId = {};
    for (const ml of (moveLines || [])) {
      const moveId  = Array.isArray(ml.move_id) ? ml.move_id[0] : ml.move_id;
      const lotId   = Array.isArray(ml.lot_id) && ml.lot_id[0] ? ml.lot_id[0] : null;
      const lotName = Array.isArray(ml.lot_id) && ml.lot_id[0] ? ml.lot_id[1] : null;

      if (!moveId) continue;

      if (!serialsByMoveId[moveId])   serialsByMoveId[moveId]   = [];
      if (!moveLinesByMoveId[moveId]) moveLinesByMoveId[moveId] = [];

      // Move line detail (voor bewerken)
      moveLinesByMoveId[moveId].push({
        id:       ml.id,
        lotId,
        lotName,
        quantity: ml.quantity || 0,
        qtyDone:  ml.qty_done || 0,
      });

      if (lotName && !serialsByMoveId[moveId].includes(lotName)) {
        serialsByMoveId[moveId].push(lotName);
      }
    }

    // ── 4. Verwerk pickings ──────────────────────────────────────────────────
    // Filter retourpickings uit de uitkomst — die horen in ReturnPage, niet in PlacePage
    const filteredPickings = direction === 'out'
      ? rawPickings.filter(p => !String(p.origin || '').startsWith('RETOUR-'))
      : rawPickings;

    const pickings = filteredPickings.map(p => {
      const origin      = p.origin || '';
      // Bestellingen hebben een origin die begint met "ORD-" (portaalbestelling)
      const isOrder     = /^ORD-\d+/i.test(origin);

      return {
        id:           p.id,
        name:         p.name,
        state:        p.state,
        stateLabel:   READABLE_STATE[p.state] || p.state,
        scheduledDate: p.scheduled_date || null,
        origin,
        isOrder,
        partner:      Array.isArray(p.partner_id) && p.partner_id[0] ? p.partner_id[1] : null,
        pickingType:  Array.isArray(p.picking_type_id)  ? p.picking_type_id[1]  : '',
        fromLocation: Array.isArray(p.location_id)      ? p.location_id[1]      : '',
        toLocation:   Array.isArray(p.location_dest_id) ? p.location_dest_id[1] : '',
        items: (p.move_ids || []).map(id => {
          const m = movesById[id];
          if (!m) return null;
          const desc  = m.description_picking || '';
          const lines = moveLinesByMoveId[m.id] || [];
          return {
            id:              m.id,
            productName:     Array.isArray(m.product_id) ? m.product_id[1] : 'Onbekend product',
            productId:       Array.isArray(m.product_id) ? m.product_id[0] : m.product_id,
            qtyDemand:       m.product_uom_qty || 0,
            qtyAvailable:    m.quantity        || 0,
            unit:            Array.isArray(m.product_uom) ? m.product_uom[1] : '',
            uomId:           Array.isArray(m.product_uom) ? m.product_uom[0] : null,
            state:           m.state,
            serials:         lines.filter(l => l.lotName).map(l => l.lotName),
            moveLines:       lines,
            isSerialTracked: lines.length > 0 && lines.some(l => l.lotId !== null),
            isExtra:         desc.startsWith('[EXTRA]'),
            addedBy:         desc.startsWith('[EXTRA]') ? desc.replace('[EXTRA] ', '') : null,
          };
        }).filter(Boolean),
      };
    });

    return cors({ pickings });

  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Pickings get error:', err);
    return cors({ error: 'Fout bij ophalen pickings: ' + err.message }, 500);
  }
};
