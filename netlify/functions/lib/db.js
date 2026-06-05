// netlify/functions/lib/db.js
// Supabase REST API client — geen npm package nodig, werkt met ingebouwde fetch.

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('⚠  SUPABASE_URL of SUPABASE_SERVICE_KEY niet ingesteld in omgevingsvariabelen');
}

/**
 * Voer een Supabase REST API aanvraag uit.
 * @param {string} table  - tabelnaam
 * @param {object} opts
 *   method   - GET | POST | PATCH | DELETE
 *   body     - JavaScript object (wordt JSON)
 *   filters  - querystring bijv. '?id=eq.abc&active=eq.true'
 *   upsert   - true voor POST als upsert (op conflict: update)
 */
async function db(table, opts = {}) {
  const { method = 'GET', body = null, filters = '', upsert = false } = opts;

  const headers = {
    'Content-Type':  'application/json',
    'apikey':        SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer':        upsert
      ? 'return=representation,resolution=merge-duplicates'
      : 'return=representation',
  };

  const url = `${SUPABASE_URL}/rest/v1/${table}${filters}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.message || data?.hint || data?.details || JSON.stringify(data);
    throw new Error(`Supabase [${table}]: ${msg}`);
  }
  return data;
}

module.exports = { db };
