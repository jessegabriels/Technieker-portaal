// netlify/functions/orders-create.js
const { requireAuth, cors } = require('./lib/auth');
const { odooCall } = require('./lib/odoo');
const { create: createOrder } = require('./lib/orders');
const { findById: findArticle } = require('./lib/articles');
const crypto = require('crypto');

const PICKING_TYPE_ID = parseInt(process.env.ODOO_PICKING_TYPE_ID || '2');
const SOURCE_LOCATION_ID = parseInt(process.env.ODOO_SOURCE_LOCATION_ID || '8');
const DEST_LOCATION_ID = parseInt(process.env.ODOO_DEST_LOCATION_ID || '5');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  if (event.httpMethod !== 'POST') return cors({ error: 'Method not allowed' }, 405);

  try {
    const user = requireAuth(event);
    const { items, note } = JSON.parse(event.body || '{}');

    if (!items || !Array.isArray(items) || items.length === 0) {
      return cors({ error: 'Geen artikelen geselecteerd.' }, 400);
    }

    // Validate items + fetch article details
    const resolvedItems = [];
    for (const item of items) {
      if (!item.articleId || !item.quantity || item.quantity <= 0) continue;
      const article = findArticle(item.articleId);
      if (!article) continue;

      // Department access check
      if (
        user.role !== 'admin' &&
        user.department !== 'all' &&
        !article.departments.includes('all') &&
        !article.departments.includes(user.department)
      ) {
        return cors({ error: `Geen toegang tot artikel: ${article.name}` }, 403);
      }

      resolvedItems.push({ article, quantity: item.quantity });
    }

    if (resolvedItems.length === 0) {
      return cors({ error: 'Geen geldige artikelen.' }, 400);
    }

    const orderId = `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();
    const scheduledDate = now.slice(0, 19).replace('T', ' ');

    // --- Create Odoo Picking ---
    let odooPickingId = null;
    let odooPickingName = null;
    let odooError = null;

    try {
      // Create stock.picking
      odooPickingId = await odooCall('stock.picking', 'create', [{
        picking_type_id: PICKING_TYPE_ID,
        location_id: SOURCE_LOCATION_ID,
        location_dest_id: DEST_LOCATION_ID,
        origin: orderId,
        note: `Bestelling door ${user.name} (${user.department})\n${note || ''}`.trim(),
        scheduled_date: scheduledDate,
      }]);

      // Create stock.move lines for each item
      for (const { article, quantity } of resolvedItems) {
        await odooCall('stock.move', 'create', [{
          picking_id: odooPickingId,
          product_id: article.odooId,
          product_uom_qty: quantity,
          location_id: SOURCE_LOCATION_ID,
          location_dest_id: DEST_LOCATION_ID,
        }]);
      }

      // Confirm the picking (moves it to "Ready" state)
      await odooCall('stock.picking', 'action_confirm', [[odooPickingId]]);

      // Get the generated picking name (e.g. WH/INT/0001)
      const pickingData = await odooCall('stock.picking', 'read', [[odooPickingId]], {
        fields: ['name'],
      });
      odooPickingName = pickingData[0]?.name || String(odooPickingId);

    } catch (err) {
      console.error('Odoo picking error:', err);
      odooError = err.message;
      // We still save the order locally, but flag the Odoo error
    }

    // Save order locally
    const order = createOrder({
      id: orderId,
      userId: user.id,
      userName: user.name,
      userDepartment: user.department,
      items: resolvedItems.map(({ article, quantity }) => ({
        articleId: article.id,
        odooId: article.odooId,
        internalRef: article.internalRef,
        name: article.name,
        unit: article.unit,
        quantity,
      })),
      note: note || '',
      createdAt: now,
      odooPickingId,
      odooPickingName,
      odooError,
      status: odooError ? 'odoo_error' : 'confirmed',
    });

    return cors({
      success: true,
      order,
      odooPickingName,
      odooError,
    });

  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Order create error:', err);
    return cors({ error: 'Fout bij aanmaken bestelling.' }, 500);
  }
};
