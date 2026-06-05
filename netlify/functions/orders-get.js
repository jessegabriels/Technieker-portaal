// netlify/functions/orders-get.js
const { requireAuth, cors } = require('./lib/auth');
const { getAll, getForUser } = require('./lib/orders');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});

  try {
    const user = requireAuth(event);
    const orders = user.role === 'admin' ? getAll() : getForUser(user.id);
    return cors({ orders });
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    return cors({ error: 'Fout bij ophalen bestellingen.' }, 500);
  }
};
