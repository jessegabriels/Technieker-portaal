// netlify/functions/lib/articles.js — Supabase versie
const { db } = require('./db');

function fromDb(row) {
  if (!row) return null;
  return {
    id:          row.id,
    odooId:      row.odoo_id,
    internalRef: row.internal_ref,
    name:        row.name,
    unit:        row.unit,
    departments: row.departments || ['all'],
    category:    row.category,
    active:      row.active,
  };
}

function toDb(obj) {
  const row = {};
  if (obj.id          !== undefined) row.id           = obj.id;
  if (obj.odooId      !== undefined) row.odoo_id      = obj.odooId;
  if (obj.internalRef !== undefined) row.internal_ref = obj.internalRef;
  if (obj.name        !== undefined) row.name         = obj.name;
  if (obj.unit        !== undefined) row.unit         = obj.unit;
  if (obj.departments !== undefined) row.departments  = obj.departments;
  if (obj.category    !== undefined) row.category     = obj.category;
  if (obj.active      !== undefined) row.active       = obj.active;
  return row;
}

module.exports = {
  getAll: async () => {
    const rows = await db('articles', { filters: '?order=name.asc' });
    return (rows || []).map(fromDb);
  },

  getForDepartment: async (dept) => {
    const rows = await db('articles', { filters: '?active=eq.true&order=name.asc' });
    if (dept === 'all') return (rows || []).map(fromDb);
    return (rows || [])
      .filter(r => (r.departments || []).includes(dept) || (r.departments || []).includes('all'))
      .map(fromDb);
  },

  findById: async (id) => {
    const rows = await db('articles', { filters: `?id=eq.${encodeURIComponent(id)}` });
    return fromDb(rows?.[0]);
  },

  create: async (article) => {
    const rows = await db('articles', { method: 'POST', body: toDb(article) });
    return fromDb(Array.isArray(rows) ? rows[0] : rows);
  },

  update: async (id, updates) => {
    const rows = await db('articles', {
      method:  'PATCH',
      body:    toDb(updates),
      filters: `?id=eq.${encodeURIComponent(id)}`,
    });
    return fromDb(Array.isArray(rows) ? rows[0] : rows);
  },

  remove: async (id) => {
    await db('articles', { method: 'DELETE', filters: `?id=eq.${encodeURIComponent(id)}` });
  },

  // Bulk import: upsert op internal_ref
  importBatch: async (articles, mode = 'replace') => {
    if (mode === 'replace') {
      // Alles verwijderen en opnieuw invoegen
      await db('articles', { method: 'DELETE', filters: '?id=neq.___none___' });
    }
    if (!articles.length) return [];
    const rows = await db('articles', {
      method: 'POST',
      body:   articles.map(toDb),
      upsert: true, // op conflict (internal_ref): bijwerken
    });
    return (rows || []).map(fromDb);
  },
};
