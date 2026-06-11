// netlify/functions/warehouse-stock.js
// Haalt de volledige stock op van het magazijn (locatie ID 5).
// Inclusief lot- en serienummers per product.
// Admin-only endpoint.

const { requireAuth, cors } = require('./lib/auth');
const { odooCall }          = require('./lib/odoo');

const WAREHOUSE_LOCATION_ID = parseInt(process.env.ODOO_WAREHOUSE_LOCATION_ID || '5', 10);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  if (event.httpMethod !== 'GET')     return cors({ error: 'Method not allowed' }, 405);

  try {
    const authUser = requireAuth(event);
    if (authUser.role !== 'admin') return cors({ error: 'Alleen beheerders hebben toegang.' }, 403);

    // ── 1. Quants ophalen (inclusief lot_id) ──────────────────────────────
    const rawQuants = await odooCall('stock.quant', 'search_read',
      [[
        ['location_id', 'child_of', WAREHOUSE_LOCATION_ID],
        ['location_id.usage', '=', 'internal'],
        ['quantity', '>', 0],
      ]],
      {
        fields: ['product_id', 'lot_id', 'quantity', 'reserved_quantity'],
        limit: 10000,
      }
    );

    if (!rawQuants || rawQuants.length === 0) {
      return cors({ products: [], totalValue: 0, productCount: 0 });
    }

    // ── 2. Groeperen per product + lots bijhouden ──────────────────────────
    const byProduct = {};
    for (const q of rawQuants) {
      if (!q.product_id?.[0]) continue;
      const pid = q.product_id[0];

      if (!byProduct[pid]) {
        byProduct[pid] = {
          productId:   pid,
          name:        q.product_id[1],
          qty:         0,
          reservedQty: 0,
          lots:        {},
        };
      }

      byProduct[pid].qty         += q.quantity          || 0;
      byProduct[pid].reservedQty += q.reserved_quantity || 0;

      // Lot/serienummer bijhouden (lot_id = false als geen tracking)
      if (q.lot_id && q.lot_id[0]) {
        const lotId   = q.lot_id[0];
        const lotName = q.lot_id[1];
        if (!byProduct[pid].lots[lotId]) {
          byProduct[pid].lots[lotId] = { id: lotId, name: lotName, qty: 0, reservedQty: 0 };
        }
        byProduct[pid].lots[lotId].qty         += q.quantity          || 0;
        byProduct[pid].lots[lotId].reservedQty += q.reserved_quantity || 0;
      }
    }

    const productIds = Object.keys(byProduct).map(Number);

    // ── 3. Productdetails ophalen (inclusief tracking-type) ───────────────
    const BATCH = 200;
    const allDetails = [];
    for (let i = 0; i < productIds.length; i += BATCH) {
      const chunk = productIds.slice(i, i + BATCH);
      const details = await odooCall('product.product', 'read', [chunk], {
        fields: ['id', 'default_code', 'categ_id', 'uom_id', 'standard_price', 'tracking'],
      });
      allDetails.push(...(details || []));
    }

    const detailById = Object.fromEntries(allDetails.map(d => [d.id, d]));

    // ── 4. Samenvoegen en berekenen ────────────────────────────────────────
    const products = productIds
      .map(pid => {
        const base   = byProduct[pid];
        const detail = detailById[pid] || {};

        const qty       = Math.round(base.qty         * 1000) / 1000;
        const reserved  = Math.round(base.reservedQty * 1000) / 1000;
        const available = Math.max(0, Math.round((qty - reserved) * 1000) / 1000);
        const costPrice  = typeof detail.standard_price === 'number' ? detail.standard_price : 0;
        const totalValue = Math.round(qty * costPrice * 100) / 100;

        const category   = Array.isArray(detail.categ_id) ? detail.categ_id[1] : 'Zonder categorie';
        const categoryId = Array.isArray(detail.categ_id) ? detail.categ_id[0] : null;
        const unit       = Array.isArray(detail.uom_id)   ? detail.uom_id[1]   : '';
        // 'serial' | 'lot' | 'none' — Odoo retourneert soms false bij geen tracking
        const tracking   = detail.tracking || 'none';

        // Lots/serials gesorteerd op naam
        const lots = Object.values(base.lots)
          .map(l => ({
            id:           l.id,
            name:         l.name,
            qty:          Math.round(l.qty         * 1000) / 1000,
            reservedQty:  Math.round(l.reservedQty * 1000) / 1000,
            availableQty: Math.max(0, Math.round((l.qty - l.reservedQty) * 1000) / 1000),
          }))
          .filter(l => l.qty > 0)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        return {
          productId:    pid,
          name:         base.name,
          internalRef:  detail.default_code || '',
          category,
          categoryId,
          tracking,
          lots,          // leeg array als geen lot-tracking
          qty,
          reservedQty:  reserved,
          availableQty: available,
          unit,
          costPrice,
          totalValue,
        };
      })
      .filter(p => p.qty > 0)
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    const totalValue = Math.round(products.reduce((s, p) => s + p.totalValue, 0) * 100) / 100;

    return cors({
      products,
      totalValue,
      productCount: products.length,
      locationId:   WAREHOUSE_LOCATION_ID,
    });

  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Warehouse stock error:', err);
    return cors({ error: 'Fout bij ophalen magazijnstock: ' + err.message }, 500);
  }
};
