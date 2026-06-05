// netlify/functions/orders-manage.js
const { requireAuth, cors } = require('./lib/auth');
const { findById, remove } = require('./lib/orders');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  try {
    const user = requireAuth(event);

    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      if (!id) return cors({ error: 'ID is verplicht.' }, 400);

      const order = await findById(id);
      if (!order) return cors({ error: 'Bestelling niet gevonden.' }, 404);
      if (user.role !== 'admin' && order.userId !== user.id)
        return cors({ error: 'Geen toegang.' }, 403);

      await remove(id);
      return cors({ success: true });
    }

    return cors({ error: 'Method not allowed.' }, 405);
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Orders manage error:', err);
    return cors({ error: 'Interne fout.' }, 500);
  }
};
