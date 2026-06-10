// netlify/functions/lib/returns.js — Supabase versie
const { db } = require('./db');

function fromDb(row) {
  if (!row) return null;
  return {
    id:              row.id,
    userId:          row.user_id,
    origin:          row.origin,
    odooPickingId:   row.odoo_picking_id,
    odooPickingName: row.odoo_picking_name,
    note:            row.note || '',
    createdAt:       row.created_at,
  };
}

function toDb(obj) {
  const row = {};
  if (obj.id              !== undefined) row.id                = obj.id;
  if (obj.userId          !== undefined) row.user_id           = obj.userId;
  if (obj.origin          !== undefined) row.origin            = obj.origin;
  if (obj.odooPickingId   !== undefined) row.odoo_picking_id   = obj.odooPickingId;
  if (obj.odooPickingName !== undefined) row.odoo_picking_name = obj.odooPickingName;
  if (obj.note            !== undefined) row.note              = obj.note;
  return row;
}

module.exports = {
  getForUser: async (userId) => {
    const rows = await db('portal_returns', {
      filters: `?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
    });
    return (rows || []).map(fromDb);
  },

  create: async (ret) => {
    const rows = await db('portal_returns', { method: 'POST', body: toDb(ret) });
    return fromDb(Array.isArray(rows) ? rows[0] : rows);
  },

  // Verwijdert enkel de eigen record (user_id check als extra veiligheid)
  remove: async (id, userId) => {
    await db('portal_returns', {
      method:  'DELETE',
      filters: `?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
    });
  },
};
