// netlify/functions/articles-import.js
const { requireAuth, cors } = require('./lib/auth');
const { importBatch } = require('./lib/articles');
const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  if (event.httpMethod !== 'POST') return cors({ error: 'Method not allowed' }, 405);

  try {
    const user = requireAuth(event);
    if (user.role !== 'admin') return cors({ error: 'Geen toegang.' }, 403);

    const { rows, mode } = JSON.parse(event.body || '{}');
    if (!rows || !Array.isArray(rows)) return cors({ error: 'Geen data ontvangen.' }, 400);

    const mapped = rows.map(row => {
      const departments = String(row.departments || row.Departments || row.Afdeling || 'all')
        .split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
      return {
        id:          `art-${crypto.randomBytes(4).toString('hex')}`,
        odooId:      parseInt(row.odooId || row.OdooId || row['Odoo ID'] || 0),
        internalRef: String(row.internalRef || row.InternalRef || row['Interne Ref'] || '').trim(),
        name:        String(row.name || row.Name || row.Naam || '').trim(),
        unit:        String(row.unit || row.Unit || row.Eenheid || 'stuk').trim(),
        departments,
        category:    String(row.category || row.Category || row.Categorie || 'algemeen').trim(),
        active:      true,
      };
    }).filter(a => a.name && a.odooId);

    const result = await importBatch(mapped, mode || 'replace');
    return cors({ success: true, count: result.length || mapped.length });
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Import error:', err);
    return cors({ error: 'Fout bij importeren: ' + err.message }, 500);
  }
};
