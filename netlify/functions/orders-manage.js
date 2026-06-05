// netlify/functions/orders-manage.js
// DELETE → bestelling verwijderen uit het portaal (niet uit Odoo)

const { requireAuth, cors } = require('./lib/auth');
const { getAll, update } = require('./lib/orders');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_FILE = path.join(os.tmpdir(), 'technician_orders.json');

function removeOrder(id) {
  const orders = getAll();
  const filtered = orders.filter(o => o.id !== id);
  fs.writeFileSync(DATA_FILE, JSON.stringify(filtered, null, 2));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});

  try {
    const user = requireAuth(event);

    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      if (!id) return cors({ error: 'ID is verplicht.' }, 400);

      const all = getAll();
      const order = all.find(o => o.id === id);
      if (!order) return cors({ error: 'Bestelling niet gevonden.' }, 404);

      // Techniekers mogen enkel eigen bestellingen verwijderen
      if (user.role !== 'admin' && order.userId !== user.id) {
        return cors({ error: 'Geen toegang.' }, 403);
      }

      removeOrder(id);
      return cors({ success: true });
    }

    return cors({ error: 'Method not allowed.' }, 405);
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Orders manage error:', err);
    return cors({ error: 'Interne fout.' }, 500);
  }
};
