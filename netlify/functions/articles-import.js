// netlify/functions/articles-import.js
// Receives parsed Excel data as JSON (parsing done in frontend with SheetJS)
const { requireAuth, cors } = require('./lib/auth');
const { importBatch, loadArticles } = require('./lib/articles');
const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  if (event.httpMethod !== 'POST') return cors({ error: 'Method not allowed' }, 405);

  try {
    const user = requireAuth(event);
    if (user.role !== 'admin') return cors({ error: 'Geen toegang.' }, 403);

    const { rows, mode } = JSON.parse(event.body || '{}');
    // mode: 'replace' (overwrite all) | 'merge' (add/update by internalRef)

    if (!rows || !Array.isArray(rows)) {
      return cors({ error: 'Geen data ontvangen.' }, 400);
    }

    // Expected columns (case-insensitive): 
    // odooId | internalRef | name | unit | departments | category
    const mapped = rows.map(row => {
      const departments = String(row.departments || row.Departments || row.Afdeling || 'all')
        .split(',').map(d => d.trim().toLowerCase()).filter(Boolean);

      return {
        id: `art-${crypto.randomBytes(4).toString('hex')}`,
        odooId: parseInt(row.odooId || row.OdooId || row['Odoo ID'] || 0),
        internalRef: String(row.internalRef || row.InternalRef || row['Interne Ref'] || '').trim(),
        name: String(row.name || row.Name || row.Naam || '').trim(),
        unit: String(row.unit || row.Unit || row.Eenheid || 'stuk').trim(),
        departments,
        category: String(row.category || row.Category || row.Categorie || 'algemeen').trim(),
        active: true,
      };
    }).filter(a => a.name && a.odooId);

    let final;
    if (mode === 'merge') {
      const existing = loadArticles();
      const existingByRef = Object.fromEntries(existing.map(a => [a.internalRef, a]));
      mapped.forEach(a => { existingByRef[a.internalRef] = { ...existingByRef[a.internalRef], ...a }; });
      final = Object.values(existingByRef);
    } else {
      final = mapped;
    }

    importBatch(final);
    return cors({ success: true, count: final.length });
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Import error:', err);
    return cors({ error: 'Fout bij importeren.' }, 500);
  }
};
