// netlify/functions/articles-manage.js
const { requireAuth, cors } = require('./lib/auth');
const { getAll, findById, create, update, remove } = require('./lib/articles');
const crypto = require('crypto');

function validateArticle(data) {
  const errors = [];
  if (!data.name || !String(data.name).trim()) errors.push('Naam is verplicht.');
  if (!data.odooId || isNaN(parseInt(data.odooId))) errors.push('Odoo ID is verplicht en moet een getal zijn.');
  if (!data.internalRef || !String(data.internalRef).trim()) errors.push('Interne referentie is verplicht.');
  if (!data.departments || !Array.isArray(data.departments) || !data.departments.length)
    errors.push('Minstens één afdeling is verplicht.');
  return errors;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  try {
    const user = requireAuth(event);
    if (user.role !== 'admin') return cors({ error: 'Geen toegang.' }, 403);

    if (event.httpMethod === 'GET') {
      return cors({ articles: await getAll() });
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      const errors = validateArticle(data);
      if (errors.length) return cors({ error: errors.join(' ') }, 400);

      const all = await getAll();
      if (all.find(a => a.internalRef === String(data.internalRef).trim()))
        return cors({ error: `Interne referentie "${data.internalRef}" bestaat al.` }, 409);

      const article = {
        id:          `art-${crypto.randomBytes(4).toString('hex')}`,
        odooId:      parseInt(data.odooId),
        internalRef: String(data.internalRef).trim(),
        name:        String(data.name).trim(),
        unit:        String(data.unit || 'stuk').trim(),
        departments: data.departments.map(d => String(d).trim().toLowerCase()),
        category:    String(data.category || 'algemeen').trim().toLowerCase(),
        active:      data.active !== false,
      };
      const created = await create(article);
      return cors({ article: created });
    }

    if (event.httpMethod === 'PUT') {
      const data = JSON.parse(event.body || '{}');
      if (!data.id) return cors({ error: 'ID is verplicht.' }, 400);
      const errors = validateArticle(data);
      if (errors.length) return cors({ error: errors.join(' ') }, 400);

      const all = await getAll();
      const dup = all.find(a => a.internalRef === String(data.internalRef).trim() && a.id !== data.id);
      if (dup) return cors({ error: `Interne referentie "${data.internalRef}" is al in gebruik.` }, 409);

      const updated = await update(data.id, {
        odooId:      parseInt(data.odooId),
        internalRef: String(data.internalRef).trim(),
        name:        String(data.name).trim(),
        unit:        String(data.unit || 'stuk').trim(),
        departments: data.departments.map(d => String(d).trim().toLowerCase()),
        category:    String(data.category || 'algemeen').trim().toLowerCase(),
        active:      data.active !== false,
      });
      if (!updated) return cors({ error: 'Artikel niet gevonden.' }, 404);
      return cors({ article: updated });
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      if (!id) return cors({ error: 'ID is verplicht.' }, 400);
      const article = await findById(id);
      if (!article) return cors({ error: 'Artikel niet gevonden.' }, 404);
      await remove(id);
      return cors({ success: true });
    }

    return cors({ error: 'Method not allowed.' }, 405);
  } catch (err) {
    if (err.message === 'Unauthorized') return cors({ error: 'Niet geautoriseerd.' }, 401);
    console.error('Articles manage error:', err);
    return cors({ error: 'Interne fout: ' + err.message }, 500);
  }
};
