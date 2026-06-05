// netlify/functions/lib/orders.js — Supabase versie
const { db } = require('./db');

function fromDb(row) {
  if (!row) return null;
  return {
    id:               row.id,
    userId:           row.user_id,
    userName:         row.user_name,
    userDepartment:   row.user_department,
    items:            row.items || [],
    note:             row.note || '',
    odooPickingId:    row.odoo_picking_id,
    odooPickingName:  row.odoo_picking_name,
    odooError:        row.odoo_error,
    status:           row.status,
    createdAt:        row.created_at,
  };
}

function toDb(obj) {
  const row = {};
  if (obj.id             !== undefined) row.id               = obj.id;
  if (obj.userId         !== undefined) row.user_id          = obj.userId;
  if (obj.userName       !== undefined) row.user_name        = obj.userName;
  if (obj.userDepartment !== undefined) row.user_department  = obj.userDepartment;
  if (obj.items          !== undefined) row.items            = obj.items;
  if (obj.note           !== undefined) row.note             = obj.note;
  if (obj.odooPickingId  !== undefined) row.odoo_picking_id  = obj.odooPickingId;
  if (obj.odooPickingName!== undefined) row.odoo_picking_name= obj.odooPickingName;
  if (obj.odooError      !== undefined) row.odoo_error       = obj.odooError;
  if (obj.status         !== undefined) row.status           = obj.status;
  return row;
}

module.exports = {
  getAll: async () => {
    const rows = await db('orders', { filters: '?order=created_at.desc' });
    return (rows || []).map(fromDb);
  },

  getForUser: async (userId) => {
    const rows = await db('orders', {
      filters: `?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
    });
    return (rows || []).map(fromDb);
  },

  findById: async (id) => {
    const rows = await db('orders', { filters: `?id=eq.${encodeURIComponent(id)}` });
    return fromDb(rows?.[0]);
  },

  create: async (order) => {
    const rows = await db('orders', { method: 'POST', body: toDb(order) });
    return fromDb(Array.isArray(rows) ? rows[0] : rows);
  },

  update: async (id, updates) => {
    const rows = await db('orders', {
      method:  'PATCH',
      body:    toDb(updates),
      filters: `?id=eq.${encodeURIComponent(id)}`,
    });
    return fromDb(Array.isArray(rows) ? rows[0] : rows);
  },

  remove: async (id) => {
    await db('orders', { method: 'DELETE', filters: `?id=eq.${encodeURIComponent(id)}` });
  },
};
