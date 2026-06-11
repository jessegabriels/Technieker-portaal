// netlify/functions/lib/users.js — Supabase versie
const crypto = require('crypto');
const { db }  = require('./db');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'salt_tech_portal').digest('hex');
}

// DB rij (snake_case) → JS object (camelCase)
function fromDb(row) {
  if (!row) return null;
  return {
    id:             row.id,
    username:       row.username,
    passwordHash:   row.password_hash,
    name:           row.name,
    role:           row.role,
    department:     row.department,
    active:         row.active,
    odooLocationId:    row.odoo_location_id    || null,
    odooTechnicianId:  row.odoo_technieker_id  || null,
    createdAt:         row.created_at,
  };
}

// JS object → DB rij
function toDb(obj) {
  const row = {};
  if (obj.id             !== undefined) row.id               = obj.id;
  if (obj.username       !== undefined) row.username         = obj.username;
  if (obj.passwordHash   !== undefined) row.password_hash    = obj.passwordHash;
  if (obj.name           !== undefined) row.name             = obj.name;
  if (obj.role           !== undefined) row.role             = obj.role;
  if (obj.department     !== undefined) row.department       = obj.department;
  if (obj.active         !== undefined) row.active           = obj.active;
  if (obj.odooLocationId   !== undefined) row.odoo_location_id   = obj.odooLocationId   ? parseInt(obj.odooLocationId)   : null;
  if (obj.odooTechnicianId !== undefined) row.odoo_technieker_id = obj.odooTechnicianId ? parseInt(obj.odooTechnicianId) : null;
  return row;
}

module.exports = {
  hashPassword,

  findByUsername: async (username) => {
    const rows = await db('users', {
      filters: `?username=eq.${encodeURIComponent(username)}`
    });
    return fromDb(rows?.[0]);
  },

  findById: async (id) => {
    const rows = await db('users', { filters: `?id=eq.${encodeURIComponent(id)}` });
    return fromDb(rows?.[0]);
  },

  getAll: async () => {
    const rows = await db('users', { filters: '?order=created_at.asc' });
    return (rows || []).map(fromDb);
  },

  create: async (user) => {
    const rows = await db('users', { method: 'POST', body: toDb(user) });
    return fromDb(Array.isArray(rows) ? rows[0] : rows);
  },

  update: async (id, updates) => {
    const rows = await db('users', {
      method:  'PATCH',
      body:    toDb(updates),
      filters: `?id=eq.${encodeURIComponent(id)}`,
    });
    return fromDb(Array.isArray(rows) ? rows[0] : rows);
  },

  remove: async (id) => {
    await db('users', { method: 'DELETE', filters: `?id=eq.${encodeURIComponent(id)}` });
  },
};
